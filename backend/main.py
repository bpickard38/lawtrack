import hashlib
import logging
import os
import secrets
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import OAuth2PasswordRequestForm, APIKeyHeader
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.sessions import SessionMiddleware
from authlib.integrations.starlette_client import OAuth, OAuthError
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Optional
from datetime import datetime, timedelta

from database import get_db, engine
from models import Base, User, Attorney, Case, Activity, Firm, UserRole, CaseRule, AgentApiKey
from schemas import (
    UserCreate, UserLogin, UserResponse, Token, UserUpdate, PasswordChange, UserUpdateResponse,
    RegisterResponse, AgentKeyLoginRequest, AgentKeyCreateRequest, AgentHeartbeat,
    AttorneyCreate, AttorneyResponse, AttorneyUpdate,
    SettingsResponse, TrackingSettingUpdate, ReminderSettingUpdate, ExcludedKeywordsUpdate,
    CaseCreate, CaseUpdate, CaseResponse, CaseImportRequest, CaseImportResult,
    ActivityCreate, ActivityUpdate, ActivityResponse, AgentActivityCreate,
    CaseTimeSummary, ActivityType,
    BulkAssignRequest, BulkApproveRequest, MergeActivitiesRequest, SplitActivityRequest,
    CaseRuleCreate, CaseRuleUpdate, CaseRuleResponse
)
from rules import first_matching_case
from demo import DEMO_EMAIL, DEMO_PASSWORD, demo_enabled, ensure_fresh_demo, is_demo_user
from auth_utils import (
    get_password_hash, verify_password, create_access_token,
    decode_access_token, oauth2_scheme, SECRET_KEY
)

LOG = logging.getLogger("lawtrack.main")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def _ensure_schema() -> None:
    """
    Lightweight, startup-time schema bootstrap for Postgres.
    This project currently uses create_all() (no Alembic), so we add a small
    safety net to create the new firms table and add new columns if missing.
    """
    if engine.dialect.name != "postgresql":
        # e.g. the SQLite test database - create_all() below builds a fresh schema.
        return
    try:
        with engine.begin() as conn:
            # Create new table(s) if missing
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS firms (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT now()
                    );
                    """
                )
            )

            # Add new columns if missing (Postgres only)
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'attorney';"))

            conn.execute(text("ALTER TABLE attorneys ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id);"))
            conn.execute(text("ALTER TABLE attorneys ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE attorneys ADD COLUMN IF NOT EXISTS reminder_time VARCHAR(5);"))
            conn.execute(text("ALTER TABLE attorneys ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE attorneys ADD COLUMN IF NOT EXISTS excluded_keywords TEXT;"))
            conn.execute(text("ALTER TABLE cases ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id);"))
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id);"))

            # Timesheet/billing fields for activities
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS narrative TEXT;"))
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'captured';"))
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS confidence VARCHAR(20);"))

            # Case rules table for auto-assignment
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS case_rules (
                        id SERIAL PRIMARY KEY,
                        firm_id INTEGER REFERENCES firms(id),
                        attorney_id INTEGER NOT NULL REFERENCES attorneys(id),
                        case_id INTEGER NOT NULL REFERENCES cases(id),
                        rule_type VARCHAR(50) NOT NULL,
                        pattern VARCHAR(500) NOT NULL,
                        enabled BOOLEAN DEFAULT TRUE,
                        priority INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT now()
                    );
                    """
                )
            )

            # Agent API keys for auto-tracking
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS agent_api_keys (
                        id SERIAL PRIMARY KEY,
                        attorney_id INTEGER NOT NULL UNIQUE REFERENCES attorneys(id),
                        key_hash VARCHAR(64) NOT NULL,
                        key_prefix VARCHAR(20) NOT NULL UNIQUE,
                        created_at TIMESTAMP DEFAULT now()
                    );
                    """
                )
            )
            conn.execute(text("ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);"))
            conn.execute(text("ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS current_activity_type VARCHAR(50);"))
            conn.execute(text("ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS current_activity_label VARCHAR(500);"))
            conn.execute(text("ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS current_activity_started_at TIMESTAMP;"))
            conn.execute(text("ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP;"))
    except Exception:
        # Don't crash startup on a failed migration step - the ORM create_all
        # still runs below. Log it so a real failure doesn't silently vanish.
        LOG.exception("_ensure_schema() failed; falling back to Base.metadata.create_all()")

# Create missing tables first (fresh databases get the full current schema),
# then patch columns onto tables created by older versions.
Base.metadata.create_all(bind=engine)
_ensure_schema()

app = FastAPI(title="LawTrack API", version="1.0.0")

# Rate limiting (per-IP) for brute-force-prone auth endpoints
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration
# CORS_ORIGINS: comma-separated list of allowed origins (e.g. "https://app.example.com,http://localhost:5173").
# Falls back to "*" (all origins) if unset, matching prior behavior for local dev.
_cors_origins_env = os.getenv("CORS_ORIGINS", "*").strip()
_cors_origins = ["*"] if _cors_origins_env == "*" else [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Google Sign-In (OAuth2 / OIDC). Optional — the app runs fine without it;
# the /api/auth/google* endpoints just return 503 until both env vars are set.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_OAUTH_CONFIGURED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

# Needed by Authlib to stash the OAuth state/nonce between the redirect to
# Google and the callback. Both hops are plain browser navigations to this
# backend's own domain, so a same-site session cookie is sufficient.
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, same_site="lax")

oauth = OAuth()
if GOOGLE_OAUTH_CONFIGURED:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

# ============================================================================
# AUTHENTICATION DEPENDENCY
# ============================================================================

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Get current user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    email: str = payload.get("sub")
    if email is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    
    return user

async def get_current_attorney(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get attorney profile for current user"""
    attorney = db.query(Attorney).filter(Attorney.user_id == current_user.id).first()
    if not attorney:
        raise HTTPException(status_code=404, detail="Attorney profile not found")
    return attorney

def _hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()

def _api_key_prefix(key: str, n: int = 12) -> str:
    return key[:n] if len(key) >= n else key

async def get_attorney_from_api_key(
    api_key: Optional[str] = Depends(api_key_header),
    db: Session = Depends(get_db),
):
    """Validate X-API-Key and return the associated attorney. Used by the auto-tracking agent."""
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    key = api_key.strip()
    prefix = _api_key_prefix(key)
    key_hash = _hash_api_key(key)
    row = db.query(AgentApiKey).filter(AgentApiKey.key_prefix == prefix).first()
    if not row or row.key_hash != key_hash:
        raise HTTPException(status_code=401, detail="Invalid API key")
    attorney = db.query(Attorney).filter(Attorney.id == row.attorney_id).first()
    if not attorney:
        raise HTTPException(status_code=401, detail="Attorney not found")
    return attorney

# ============================================================================
# AUTH ENDPOINTS
# ============================================================================

@app.post("/api/auth/register", response_model=RegisterResponse)
@limiter.limit("10/hour")
def register(request: Request, user: UserCreate, db: Session = Depends(get_db)):
    """Register a new user. For attorneys, an agent API key is created and returned once."""
    if user.email.lower() == DEMO_EMAIL:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create firm if needed
    firm = None
    firm_name = (user.firm_name or "").strip()
    if firm_name:
        firm = Firm(name=firm_name)
        db.add(firm)
        db.commit()
        db.refresh(firm)

    # Create user
    hashed_password = get_password_hash(user.password)
    role = (user.role.value if user.role else UserRole.ATTORNEY.value)
    db_user = User(
        firm_id=firm.id if firm else None,
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=role,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    agent_api_key: Optional[str] = None

    # Create attorney profile and agent API key for attorney users
    if role == UserRole.ATTORNEY.value:
        attorney = Attorney(
            firm_id=firm.id if firm else None,
            user_id=db_user.id,
            name=user.full_name,
            email=user.email,
            billable_rate=300.00
        )
        db.add(attorney)
        db.commit()
        db.refresh(attorney)
        # Create agent API key so they can use the desktop app without manually creating one
        raw = "lt_" + secrets.token_urlsafe(24)
        key_hash = _hash_api_key(raw)
        key_prefix = _api_key_prefix(raw)
        db.add(AgentApiKey(attorney_id=attorney.id, key_hash=key_hash, key_prefix=key_prefix))
        db.commit()
        agent_api_key = raw

    return RegisterResponse(user=UserResponse.model_validate(db_user), agent_api_key=agent_api_key)

@app.get("/api/auth/google", name="google_login")
async def google_login(request: Request, agent_callback: Optional[str] = None):
    """Kick off Google's OAuth consent screen.

    agent_callback: optional loopback URL (http://127.0.0.1:<port>/callback or
    http://localhost:<port>/callback) that the desktop Agent listens on. When
    present, the callback below hands the token to that local server instead
    of redirecting to the website — the standard "loopback redirect" pattern
    for native/desktop apps (RFC 8252). Restricted to loopback addresses only
    so this can't be abused as an open redirect.
    """
    if not GOOGLE_OAUTH_CONFIGURED:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    if agent_callback:
        parsed = urlparse(agent_callback)
        if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost"):
            raise HTTPException(status_code=400, detail="agent_callback must be a http://127.0.0.1(:port)/... URL")
        request.session["agent_callback"] = agent_callback
    redirect_uri = f"{BACKEND_URL}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/api/auth/google/callback", name="google_callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """Handle Google's redirect back after the user approves/denies access.

    Finds or creates a matching User/Attorney by verified email (mirroring
    /api/auth/register), then hands off a LawTrack-issued JWT (never
    anything from Google itself) either to the website or, for the desktop
    Agent, to the loopback callback stashed by google_login above.
    """
    if not GOOGLE_OAUTH_CONFIGURED:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")

    agent_callback = request.session.pop("agent_callback", None)

    def redirect_error(code: str) -> RedirectResponse:
        if agent_callback:
            return RedirectResponse(f"{agent_callback}?error={code}")
        return RedirectResponse(f"{FRONTEND_URL}/#auth_error={code}")

    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return redirect_error("google_failed")

    userinfo = token.get("userinfo") or {}
    email = userinfo.get("email")
    if not email or not userinfo.get("email_verified"):
        return redirect_error("google_failed")

    db_user = db.query(User).filter(User.email == email).first()

    if db_user is None:
        full_name = userinfo.get("name") or email.split("@")[0]
        db_user = User(
            firm_id=None,
            email=email,
            # Google-authenticated accounts never use a password; store an
            # unusable random hash so hashed_password's NOT NULL constraint
            # is satisfied without weakening password-login for anyone else.
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),
            full_name=full_name,
            role=UserRole.ATTORNEY.value,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        attorney = Attorney(
            firm_id=None,
            user_id=db_user.id,
            name=full_name,
            email=email,
            billable_rate=300.00,
        )
        db.add(attorney)
        db.commit()
        db.refresh(attorney)

        raw = "lt_" + secrets.token_urlsafe(24)
        db.add(AgentApiKey(attorney_id=attorney.id, key_hash=_hash_api_key(raw), key_prefix=_api_key_prefix(raw)))
        db.commit()
    elif not db_user.is_active:
        return redirect_error("account_inactive")

    access_token = create_access_token(data={"sub": db_user.email})
    if agent_callback:
        return RedirectResponse(f"{agent_callback}?token={access_token}")
    return RedirectResponse(f"{FRONTEND_URL}/#google_token={access_token}")

@app.post("/api/auth/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login and get access token"""
    if form_data.username == DEMO_EMAIL:
        if not demo_enabled():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="The demo account is disabled")
        if form_data.password == DEMO_PASSWORD:
            try:
                ensure_fresh_demo(db)
            except SQLAlchemyError:
                # Wipe + reseed is one transaction, so a failure leaves the previous
                # demo data in place and the visitor still signs in to it.
                db.rollback()
                LOG.exception("Demo reseed failed")
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User account is inactive")
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

@app.patch("/api/auth/me", response_model=UserUpdateResponse)
def update_me(update: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update current user's profile (name/email)."""
    if is_demo_user(current_user):
        raise HTTPException(status_code=403, detail="The demo account can't be changed. Create your own account to try this.")
    email_changed = False

    if update.email and update.email != current_user.email:
        # ensure unique email
        existing = db.query(User).filter(User.email == update.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = update.email
        email_changed = True

    if update.full_name and update.full_name != current_user.full_name:
        current_user.full_name = update.full_name

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    # Keep attorney profile in sync for attorney users (best-effort)
    if current_user.role == UserRole.ATTORNEY.value:
        attorney = db.query(Attorney).filter(Attorney.user_id == current_user.id).first()
        if attorney:
            if update.full_name:
                attorney.name = current_user.full_name
            if update.email:
                attorney.email = current_user.email
            db.add(attorney)
            db.commit()

    new_token = None
    if email_changed:
        new_token = create_access_token(data={"sub": current_user.email})

    return {"user": current_user, "access_token": new_token, "token_type": "bearer"}

@app.post("/api/auth/change-password")
def change_password(payload: PasswordChange, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change current user's password."""
    if is_demo_user(current_user):
        raise HTTPException(status_code=403, detail="The demo account can't be changed. Create your own account to try this.")
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()

    return {"message": "Password updated"}

@app.delete("/api/auth/me")
def delete_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete the current user's account and all associated data."""
    if is_demo_user(current_user):
        raise HTTPException(status_code=403, detail="The demo account can't be changed. Create your own account to try this.")
    # Delete attorney profile if exists (cascades to activities, cases, rules, agent keys)
    if current_user.role == UserRole.ATTORNEY.value:
        attorney = db.query(Attorney).filter(Attorney.user_id == current_user.id).first()
        if attorney:
            # Unassign activities from cases (don't delete activities, just unassign)
            db.query(Activity).filter(Activity.attorney_id == attorney.id).update({"case_id": None})
            # Delete cases (activities already unassigned)
            db.query(Case).filter(Case.attorney_id == attorney.id).delete()
            # Delete rules
            db.query(CaseRule).filter(CaseRule.attorney_id == attorney.id).delete()
            # Delete agent keys
            db.query(AgentApiKey).filter(AgentApiKey.attorney_id == attorney.id).delete()
            # Delete activities
            db.query(Activity).filter(Activity.attorney_id == attorney.id).delete()
            # Delete attorney
            db.delete(attorney)
    
    # Delete user (this will cascade to any other foreign keys)
    db.delete(current_user)
    db.commit()
    
    return {"message": "Account deleted"}

@app.get("/api/auth/attorney", response_model=AttorneyResponse)
def get_my_attorney(attorney: Attorney = Depends(get_current_attorney)):
    """Get current user's attorney profile"""
    return attorney

@app.patch("/api/auth/attorney", response_model=AttorneyResponse)
def update_my_attorney(
    update: AttorneyUpdate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Update current user's attorney profile (currently: billable_rate)."""
    for key, value in update.dict(exclude_unset=True).items():
        setattr(current_attorney, key, value)
    db.add(current_attorney)
    db.commit()
    db.refresh(current_attorney)
    return current_attorney

@app.post("/api/auth/agent-key")
def create_agent_key(
    payload: AgentKeyCreateRequest = AgentKeyCreateRequest(),
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Create or replace agent API key for auto-tracking. Returns raw key once; store it securely."""
    if current_attorney.email == DEMO_EMAIL:
        raise HTTPException(status_code=403, detail="The desktop agent can't be connected to the demo account. Create your own account to try it.")
    raw = "lt_" + secrets.token_urlsafe(24)
    key_hash = _hash_api_key(raw)
    key_prefix = _api_key_prefix(raw)

    existing = db.query(AgentApiKey).filter(AgentApiKey.attorney_id == current_attorney.id).first()
    if existing:
        db.delete(existing)
        db.commit()

    row = AgentApiKey(
        attorney_id=current_attorney.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        device_name=(payload.device_name or "").strip()[:255] or None,
    )
    db.add(row)
    db.commit()

    return {"api_key": raw, "key_prefix": key_prefix, "message": "Store this key securely; it won't be shown again."}

@app.delete("/api/auth/agent-key")
def revoke_agent_key(
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Revoke the current agent API key."""
    row = db.query(AgentApiKey).filter(AgentApiKey.attorney_id == current_attorney.id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"message": "Agent key revoked"}

@app.post("/api/auth/agent-key/from-login")
@limiter.limit("10/minute")
def agent_key_from_login(request: Request, payload: AgentKeyLoginRequest, db: Session = Depends(get_db)):
    """
    Desktop agent: sign in with LawTrack email and password to get an API key.
    Creates a key if the attorney doesn't have one. The agent stores it locally; user never sees it.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if is_demo_user(user):
        raise HTTPException(status_code=403, detail="The desktop agent can't be connected to the demo account. Create your own account to try it.")
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is inactive")
    if user.role != UserRole.ATTORNEY.value:
        raise HTTPException(status_code=400, detail=f"Only attorney accounts can use the desktop agent. Your account role is: {user.role}")
    attorney = db.query(Attorney).filter(Attorney.user_id == user.id).first()
    if not attorney:
        raise HTTPException(status_code=400, detail="Attorney profile not found. Please contact support.")

    # Get or replace key (we only store hash, so if they already have one we issue a new one)
    row = db.query(AgentApiKey).filter(AgentApiKey.attorney_id == attorney.id).first()
    if row:
        db.delete(row)
        db.commit()
    raw = "lt_" + secrets.token_urlsafe(24)
    key_hash = _hash_api_key(raw)
    key_prefix = _api_key_prefix(raw)
    device_name = (payload.device_name or "").strip()[:255] or None
    db.add(AgentApiKey(attorney_id=attorney.id, key_hash=key_hash, key_prefix=key_prefix, device_name=device_name))
    db.commit()
    return {"api_key": raw}


@app.get("/api/auth/agent-key")
def get_agent_key_status(
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Return the status of this attorney's one desktop-agent connection:
    whether a key exists, its masked prefix, when it was created, and when
    the agent last actually sent something (derived from the most recent
    agent-sourced activity - real proof of activity, not just a stored key).
    Only one device can be connected at a time (agent_api_keys.attorney_id
    is unique) - this reports on that single connection, not a list."""
    row = db.query(AgentApiKey).filter(AgentApiKey.attorney_id == current_attorney.id).first()
    last_activity = db.query(Activity).filter(
        Activity.attorney_id == current_attorney.id,
        Activity.source == "agent",
    ).order_by(Activity.created_at.desc()).first()
    last_activity_at = last_activity.created_at if last_activity else None
    if not row:
        return {
            "has_key": False, "key_prefix": None, "device_name": None, "created_at": None,
            "last_activity_at": last_activity_at,
            "current_activity_type": None, "current_activity_label": None, "current_activity_started_at": None,
        }

    # Only report "currently doing X" while the heartbeat is fresh (agent
    # sends one roughly every 15s while active) - otherwise a closed or
    # crashed agent would show a frozen, increasingly-wrong live status.
    HEARTBEAT_FRESHNESS = timedelta(seconds=45)
    is_fresh = row.last_heartbeat_at is not None and (datetime.utcnow() - row.last_heartbeat_at) < HEARTBEAT_FRESHNESS

    return {
        "has_key": True,
        "key_prefix": row.key_prefix,
        "device_name": row.device_name,
        "created_at": row.created_at,
        "last_activity_at": last_activity_at,
        "current_activity_type": row.current_activity_type if is_fresh else None,
        "current_activity_label": row.current_activity_label if is_fresh else None,
        "current_activity_started_at": row.current_activity_started_at if is_fresh else None,
    }


# ============================================================================
# SETTINGS (JWT-protected for web; agent uses /api/agent/settings with API key)
# ============================================================================

def _settings_response(attorney: Attorney) -> SettingsResponse:
    return SettingsResponse(
        tracking_enabled=attorney.tracking_enabled,
        billable_rate=float(attorney.billable_rate) if attorney.billable_rate is not None else 0.0,
        reminder_time=attorney.reminder_time,
        excluded_keywords=attorney.excluded_keywords,
        onboarding_completed=bool(attorney.onboarding_completed),
    )


@app.get("/api/settings", response_model=SettingsResponse)
def get_settings(current_attorney: Attorney = Depends(get_current_attorney)):
    """Get current user's settings. Auth: Bearer JWT."""
    return _settings_response(current_attorney)


@app.post("/api/settings/tracking", response_model=SettingsResponse)
def update_tracking_setting(
    payload: TrackingSettingUpdate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Set tracking_enabled. Auth: Bearer JWT."""
    current_attorney.tracking_enabled = payload.enabled
    db.add(current_attorney)
    db.commit()
    db.refresh(current_attorney)
    return _settings_response(current_attorney)


@app.post("/api/settings/reminder", response_model=SettingsResponse)
def update_reminder_setting(
    payload: ReminderSettingUpdate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Set the daily review reminder time ("HH:MM" local, or null to turn off). Auth: Bearer JWT."""
    current_attorney.reminder_time = payload.reminder_time
    db.add(current_attorney)
    db.commit()
    db.refresh(current_attorney)
    return _settings_response(current_attorney)


@app.post("/api/settings/excluded-keywords", response_model=SettingsResponse)
def update_excluded_keywords(
    payload: ExcludedKeywordsUpdate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Set newline-separated substrings; matching activity from the desktop agent is dropped, not captured. Auth: Bearer JWT."""
    current_attorney.excluded_keywords = payload.excluded_keywords
    db.add(current_attorney)
    db.commit()
    db.refresh(current_attorney)
    return _settings_response(current_attorney)


@app.post("/api/settings/onboarding-complete", response_model=SettingsResponse)
def complete_onboarding(
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Mark the onboarding wizard as done so it isn't shown again. Auth: Bearer JWT."""
    current_attorney.onboarding_completed = True
    db.add(current_attorney)
    db.commit()
    db.refresh(current_attorney)
    return _settings_response(current_attorney)


@app.get("/api/agent/settings", response_model=SettingsResponse)
def get_agent_settings(attorney: Attorney = Depends(get_attorney_from_api_key)):
    """Get settings for the desktop agent. Auth: X-API-Key."""
    return _settings_response(attorney)


# ============================================================================
# ATTORNEYS (Protected)
# ============================================================================

def _visible_attorneys(current_user: User, db: Session):
    """Attorneys in the caller's firm. Users without a firm only see themselves."""
    query = db.query(Attorney)
    if current_user.firm_id is None:
        return query.filter(Attorney.user_id == current_user.id)
    return query.filter(Attorney.firm_id == current_user.firm_id)

@app.get("/api/attorneys", response_model=List[AttorneyResponse])
def get_attorneys(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _visible_attorneys(current_user, db).all()

@app.get("/api/attorneys/{attorney_id}", response_model=AttorneyResponse)
def get_attorney(attorney_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attorney = _visible_attorneys(current_user, db).filter(Attorney.id == attorney_id).first()
    if not attorney:
        raise HTTPException(status_code=404, detail="Attorney not found")
    return attorney

# ============================================================================
# CASES (Protected)
# ============================================================================

@app.post("/api/cases", response_model=CaseResponse)
def create_case(case: CaseCreate, current_attorney: Attorney = Depends(get_current_attorney), db: Session = Depends(get_db)):
    case_dict = case.dict()
    case_dict["attorney_id"] = current_attorney.id
    db_case = Case(**case_dict, firm_id=current_attorney.firm_id)
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    return db_case

@app.post("/api/cases/import", response_model=CaseImportResult)
def import_cases(
    request: CaseImportRequest,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db),
):
    """Bulk-create matters, e.g. from a CSV of name/client_name rows. Skips rows whose
    name (case-insensitive) already exists as an active matter for this attorney."""
    existing_names = {
        c.name.strip().lower()
        for c in db.query(Case).filter(Case.attorney_id == current_attorney.id, Case.status == "active").all()
    }
    created_cases: List[Case] = []
    skipped = 0
    seen_this_batch = set()
    for row in request.rows:
        name = (row.name or "").strip()
        if not name:
            skipped += 1
            continue
        key = name.lower()
        if key in existing_names or key in seen_this_batch:
            skipped += 1
            continue
        seen_this_batch.add(key)
        db_case = Case(
            name=name,
            client_name=(row.client_name or "").strip() or None,
            attorney_id=current_attorney.id,
            firm_id=current_attorney.firm_id,
        )
        db.add(db_case)
        created_cases.append(db_case)
    db.commit()
    for c in created_cases:
        db.refresh(c)
    return CaseImportResult(created=len(created_cases), skipped=skipped, cases=created_cases)

@app.get("/api/cases", response_model=List[CaseResponse])
def get_cases(
    attorney_id: int = None,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    query = db.query(Case)
    
    # Users can only see their own cases
    if attorney_id and attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Default to current attorney's cases
    if not attorney_id:
        attorney_id = current_attorney.id
    
    query = query.filter(Case.attorney_id == attorney_id)
    return query.filter(Case.status == "active").all()

@app.get("/api/cases/{case_id}", response_model=CaseResponse)
def get_case(case_id: int, current_attorney: Attorney = Depends(get_current_attorney), db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Verify access
    if case.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return case

# Add these endpoints to your backend/main.py in the CASES section (after get_case)

@app.patch("/api/cases/{case_id}", response_model=CaseResponse)
def update_case(
    case_id: int,
    update: CaseUpdate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Verify access
    if case.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Update only the fields the client actually sent
    for key, value in update.dict(exclude_unset=True).items():
        setattr(case, key, value)

    db.commit()
    db.refresh(case)
    return case

@app.delete("/api/cases/{case_id}")
def delete_case(
    case_id: int,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Verify access
    if case.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Optional: Check if case has activities
    activity_count = db.query(Activity).filter(Activity.case_id == case_id).count()
    if activity_count > 0:
        # Unassign activities instead of deleting them
        db.query(Activity).filter(Activity.case_id == case_id).update({"case_id": None})
    
    db.delete(case)
    db.commit()
    return {"message": "Case deleted"}

# ============================================================================
# ACTIVITIES (Protected)
# ============================================================================

def _auto_assign_case(db: Session, attorney_id: int, activity_data: dict) -> Optional[int]:
    """Find the first matching rule and return the case_id, or None."""
    rules = db.query(CaseRule).filter(
        CaseRule.attorney_id == attorney_id,
        CaseRule.enabled == True
    ).order_by(CaseRule.priority.desc(), CaseRule.id).all()

    return first_matching_case(rules, activity_data)

def _is_excluded(attorney: Attorney, activity_data: dict) -> bool:
    """Check the attorney's excluded-keywords list (newline-separated, case-insensitive
    substrings) against the fields a user would recognize an app/site/contact by. Used only
    at agent-capture time, so passive tracking never records what someone has excluded."""
    raw = (attorney.excluded_keywords or "").strip()
    if not raw:
        return False
    keywords = [k.strip().lower() for k in raw.splitlines() if k.strip()]
    if not keywords:
        return False
    haystacks = [
        (activity_data.get("document_name") or ""),
        (activity_data.get("email_from") or ""),
        (activity_data.get("email_subject") or ""),
        (activity_data.get("contact_name") or ""),
        (activity_data.get("description") or ""),
    ]
    haystack = " ".join(haystacks).lower()
    return any(kw in haystack for kw in keywords)

@app.post("/api/activities", response_model=ActivityResponse)
def create_activity(
    activity: ActivityCreate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    duration = int((activity.end_time - activity.start_time).total_seconds() / 60)

    activity_dict = activity.dict()
    activity_dict["attorney_id"] = current_attorney.id

    # Auto-assign case based on rules (if no case already set)
    case_id = activity_dict.get("case_id")
    confidence = None
    if not case_id:
        case_id = _auto_assign_case(db, current_attorney.id, activity_dict)
        if case_id:
            confidence = "high"

    db_activity = Activity(
        **activity_dict,
        case_id=case_id,
        confidence=confidence,
        firm_id=current_attorney.firm_id,
        duration_minutes=duration
    )
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    return db_activity

@app.get("/api/activities", response_model=List[ActivityResponse])
def get_activities(
    attorney_id: int = None,
    case_id: int = None,
    unassigned: bool = None,
    date: str = None,
    start_date: str = None,
    end_date: str = None,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    query = db.query(Activity)
    
    # Users can only see their own activities
    if attorney_id and attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Default to current attorney's activities
    if not attorney_id:
        attorney_id = current_attorney.id
    
    query = query.filter(Activity.attorney_id == attorney_id)
    
    if case_id:
        query = query.filter(Activity.case_id == case_id)
    
    if unassigned is True:
        query = query.filter(Activity.case_id == None)
    
    if date:
        date_obj = datetime.fromisoformat(date)
        start_of_day = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
        query = query.filter(Activity.start_time >= start_of_day)
        query = query.filter(Activity.start_time <= end_of_day)
    
    if start_date and not date:
        start_date_obj = datetime.fromisoformat(start_date)
        start_of_day = start_date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Activity.start_time >= start_of_day)
    
    if end_date and not date:
        end_date_obj = datetime.fromisoformat(end_date)
        end_of_day = end_date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
        query = query.filter(Activity.start_time <= end_of_day)
    
    return query.order_by(Activity.start_time.desc()).all()

@app.get("/api/activities/{activity_id}", response_model=ActivityResponse)
def get_activity(
    activity_id: int,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    # Verify access
    if activity.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return activity

@app.patch("/api/activities/{activity_id}", response_model=ActivityResponse)
def update_activity(
    activity_id: int,
    update: ActivityUpdate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Verify access
    if activity.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")

    update_fields = update.dict(exclude_unset=True)

    # If reassigning to a case, verify the attorney has access to it
    if "case_id" in update_fields and update_fields["case_id"] is not None:
        case = db.query(Case).filter(Case.id == update_fields["case_id"]).first()
        if not case or case.attorney_id != current_attorney.id:
            raise HTTPException(status_code=403, detail="Access denied to case")

    for key, value in update_fields.items():
        setattr(activity, key, value)

    if "start_time" in update_fields or "end_time" in update_fields:
        duration = int((activity.end_time - activity.start_time).total_seconds() / 60)
        activity.duration_minutes = duration

    db.commit()
    db.refresh(activity)
    return activity

@app.delete("/api/activities/{activity_id}")
def delete_activity(
    activity_id: int,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    # Verify access
    if activity.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db.delete(activity)
    db.commit()
    return {"message": "Activity deleted"}

# ============================================================================
# BULK ACTIVITY OPERATIONS (Protected)
# ============================================================================

@app.post("/api/activities/bulk-assign")
def bulk_assign_activities(
    request: BulkAssignRequest,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Assign multiple activities to a case at once."""
    # Verify case access
    case = db.query(Case).filter(Case.id == request.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied to case")

    activities = db.query(Activity).filter(
        Activity.id.in_(request.activity_ids),
        Activity.attorney_id == current_attorney.id
    ).all()

    if len(activities) != len(request.activity_ids):
        raise HTTPException(status_code=400, detail="Some activities not found or not accessible")

    for activity in activities:
        activity.case_id = request.case_id

    db.commit()
    return {"message": f"Assigned {len(activities)} activities to case", "count": len(activities)}

@app.post("/api/activities/bulk-approve")
def bulk_approve_activities(
    request: BulkApproveRequest,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Approve multiple activities at once. Entries without a matter assigned are skipped -
    nothing is approved without both a matter and explicit user action."""
    activities = db.query(Activity).filter(
        Activity.id.in_(request.activity_ids),
        Activity.attorney_id == current_attorney.id
    ).all()

    approved = 0
    skipped = 0
    for activity in activities:
        if activity.case_id is None:
            skipped += 1
            continue
        activity.status = "approved"
        approved += 1

    db.commit()
    return {"approved": approved, "skipped": skipped}

@app.post("/api/activities/merge", response_model=ActivityResponse)
def merge_activities(
    request: MergeActivitiesRequest,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Merge multiple activities into one (uses earliest start, latest end)."""
    if len(request.activity_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 activities to merge")

    activities = db.query(Activity).filter(
        Activity.id.in_(request.activity_ids),
        Activity.attorney_id == current_attorney.id
    ).order_by(Activity.start_time).all()

    if len(activities) != len(request.activity_ids):
        raise HTTPException(status_code=400, detail="Some activities not found or not accessible")

    # All must be same type
    types = set(a.type for a in activities)
    if len(types) > 1:
        raise HTTPException(status_code=400, detail="Can only merge activities of the same type")

    # Use the first activity as the base
    base = activities[0]
    start_time = min(a.start_time for a in activities)
    end_time = max(a.end_time for a in activities)
    duration = int((end_time - start_time).total_seconds() / 60)

    # Combine descriptions
    descriptions = [a.description for a in activities if a.description]
    combined_desc = request.description or "; ".join(descriptions) or None

    # Update base activity
    base.start_time = start_time
    base.end_time = end_time
    base.duration_minutes = duration
    base.description = combined_desc
    base.narrative = request.narrative or base.narrative
    base.status = "edited"

    # Delete the other activities
    for activity in activities[1:]:
        db.delete(activity)

    db.commit()
    db.refresh(base)
    return base

@app.post("/api/activities/{activity_id}/split")
def split_activity(
    activity_id: int,
    request: SplitActivityRequest,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Split an activity into two at a given point (minutes from start)."""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if request.split_at_minutes <= 0 or request.split_at_minutes >= activity.duration_minutes:
        raise HTTPException(status_code=400, detail="Split point must be within activity duration")

    # Calculate split point
    split_time = activity.start_time + timedelta(minutes=request.split_at_minutes)

    # Create second activity
    second_activity = Activity(
        firm_id=activity.firm_id,
        attorney_id=activity.attorney_id,
        case_id=activity.case_id,
        type=activity.type,
        start_time=split_time,
        end_time=activity.end_time,
        duration_minutes=activity.duration_minutes - request.split_at_minutes,
        description=activity.description,
        document_name=activity.document_name,
        email_from=activity.email_from,
        email_to=activity.email_to,
        email_subject=activity.email_subject,
        contact_name=activity.contact_name,
        phone_number=activity.phone_number,
        source=activity.source,
        is_billable=activity.is_billable,
        narrative=activity.narrative,
        status="edited",
    )
    db.add(second_activity)

    # Update first activity
    activity.end_time = split_time
    activity.duration_minutes = request.split_at_minutes
    activity.status = "edited"

    db.commit()
    db.refresh(activity)
    db.refresh(second_activity)

    return {
        "message": "Activity split",
        "first": {"id": activity.id, "duration_minutes": activity.duration_minutes},
        "second": {"id": second_activity.id, "duration_minutes": second_activity.duration_minutes},
    }

# ============================================================================
# CASE TIME SUMMARY (Protected)
# ============================================================================

@app.get("/api/cases/{case_id}/time-summary", response_model=CaseTimeSummary)
def get_case_time_summary(
    case_id: int,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Verify access
    if case.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    activities = db.query(Activity).filter(Activity.case_id == case_id).all()
    
    total_minutes = sum(a.duration_minutes for a in activities)
    document_minutes = sum(a.duration_minutes for a in activities if a.type == "document")
    email_minutes = sum(a.duration_minutes for a in activities if a.type == "email")
    call_minutes = sum(a.duration_minutes for a in activities if a.type == "call")
    
    return CaseTimeSummary(
        case_id=case.id,
        case_name=case.name,
        client_name=case.client_name,
        total_minutes=total_minutes,
        total_hours=round(total_minutes / 60, 2),
        document_minutes=document_minutes,
        email_minutes=email_minutes,
        call_minutes=call_minutes,
        activity_count=len(activities)
    )

# ============================================================================
# CASE RULES (Auto-assignment)
# ============================================================================

@app.get("/api/case-rules", response_model=List[CaseRuleResponse])
def get_case_rules(
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Get all case rules for the current attorney."""
    return db.query(CaseRule).filter(
        CaseRule.attorney_id == current_attorney.id
    ).order_by(CaseRule.priority.desc(), CaseRule.id).all()

@app.post("/api/case-rules", response_model=CaseRuleResponse)
def create_case_rule(
    rule: CaseRuleCreate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Create a new case rule."""
    # Verify case access
    case = db.query(Case).filter(Case.id == rule.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied to case")

    db_rule = CaseRule(
        firm_id=current_attorney.firm_id,
        attorney_id=current_attorney.id,
        case_id=rule.case_id,
        rule_type=rule.rule_type.value,
        pattern=rule.pattern,
        enabled=rule.enabled,
        priority=rule.priority,
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@app.patch("/api/case-rules/{rule_id}", response_model=CaseRuleResponse)
def update_case_rule(
    rule_id: int,
    update: CaseRuleUpdate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Update a case rule."""
    rule = db.query(CaseRule).filter(CaseRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # If changing case, verify access
    if update.case_id and update.case_id != rule.case_id:
        case = db.query(Case).filter(Case.id == update.case_id).first()
        if not case or case.attorney_id != current_attorney.id:
            raise HTTPException(status_code=403, detail="Access denied to case")
        rule.case_id = update.case_id

    if update.rule_type is not None:
        rule.rule_type = update.rule_type.value
    if update.pattern is not None:
        rule.pattern = update.pattern
    if update.enabled is not None:
        rule.enabled = update.enabled
    if update.priority is not None:
        rule.priority = update.priority

    db.commit()
    db.refresh(rule)
    return rule

@app.delete("/api/case-rules/{rule_id}")
def delete_case_rule(
    rule_id: int,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Delete a case rule."""
    rule = db.query(CaseRule).filter(CaseRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(rule)
    db.commit()
    return {"message": "Rule deleted"}

@app.post("/api/case-rules/test")
def test_case_rules(
    activity_data: dict,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    """Test which rule would match for given activity data (dry run)."""
    case_id = _auto_assign_case(db, current_attorney.id, activity_data)
    if case_id:
        case = db.query(Case).filter(Case.id == case_id).first()
        return {"matched": True, "case_id": case_id, "case_name": case.name if case else None}
    return {"matched": False, "case_id": None, "case_name": None}

# ============================================================================
# AGENT (API Key) – auto-tracking desktop agent
# ============================================================================

@app.post("/api/agent/activities", response_model=ActivityResponse)
def agent_create_activity(
    payload: AgentActivityCreate,
    attorney: Attorney = Depends(get_attorney_from_api_key),
    db: Session = Depends(get_db),
):
    """Create activity from the auto-tracking agent. Auth via X-API-Key."""
    if not attorney.tracking_enabled:
        raise HTTPException(status_code=403, detail="Tracking is disabled for this account")

    duration = int((payload.end_time - payload.start_time).total_seconds() / 60)
    data = payload.dict()

    if _is_excluded(attorney, data):
        # Excluded apps/contacts are never captured, not just hidden after the fact.
        return JSONResponse(status_code=200, content={"skipped": True, "reason": "excluded"})

    data["attorney_id"] = attorney.id
    data["firm_id"] = attorney.firm_id
    data["source"] = "agent"

    case_id = _auto_assign_case(db, attorney.id, data)

    db_activity = Activity(
        **data,
        case_id=case_id,
        confidence=("high" if case_id else None),
        duration_minutes=duration,
    )
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    return db_activity

@app.post("/api/agent/heartbeat")
def agent_heartbeat(
    payload: AgentHeartbeat,
    attorney: Attorney = Depends(get_attorney_from_api_key),
    db: Session = Depends(get_db),
):
    """Periodic 'here's what I'm doing right now' ping from the agent while
    it's on a trackable window - lets the website show live status, separate
    from the finalized Activity rows written on window switch. Auth via
    X-API-Key, same as /api/agent/activities."""
    row = db.query(AgentApiKey).filter(AgentApiKey.attorney_id == attorney.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No agent key found for this account")
    row.current_activity_type = payload.activity_type
    row.current_activity_label = payload.label[:500]
    row.current_activity_started_at = payload.started_at
    row.last_heartbeat_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

# ============================================================================
# HEALTH CHECK (Public)
# ============================================================================

@app.get("/")
def root():
    return {"message": "LawTrack API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}