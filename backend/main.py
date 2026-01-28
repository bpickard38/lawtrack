from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List, Optional
from datetime import datetime, timedelta

from database import get_db, engine
from models import Base, User, Attorney, Case, Activity, Firm, UserRole, CaseRule
from schemas import (
    UserCreate, UserLogin, UserResponse, Token, UserUpdate, PasswordChange, UserUpdateResponse,
    AttorneyCreate, AttorneyResponse,
    CaseCreate, CaseResponse,
    ActivityCreate, ActivityUpdate, ActivityResponse,
    CaseTimeSummary, ActivityType,
    BulkAssignRequest, MergeActivitiesRequest, SplitActivityRequest,
    CaseRuleCreate, CaseRuleUpdate, CaseRuleResponse
)
from auth_utils import (
    get_password_hash, verify_password, create_access_token,
    decode_access_token, oauth2_scheme
)

def _ensure_schema() -> None:
    """
    Lightweight, startup-time schema bootstrap for Postgres.
    This project currently uses create_all() (no Alembic), so we add a small
    safety net to create the new firms table and add new columns if missing.
    """
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
            conn.execute(text("ALTER TABLE cases ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id);"))
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id);"))

            # Timesheet/billing fields for activities
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS narrative TEXT;"))
            conn.execute(text("ALTER TABLE activities ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'captured';"))

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
    except Exception:
        # Don't crash startup if this is running on a non-Postgres/local setup.
        # The ORM create_all will still run below.
        pass

# Create/upgrade tables
_ensure_schema()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="LawTrack API", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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

# ============================================================================
# AUTH ENDPOINTS
# ============================================================================

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
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
    
    # Create attorney profile automatically for attorney users (keeps current UI working)
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
    
    return db_user

@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login and get access token"""
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
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()

    return {"message": "Password updated"}

@app.get("/api/auth/attorney", response_model=AttorneyResponse)
def get_my_attorney(attorney: Attorney = Depends(get_current_attorney)):
    """Get current user's attorney profile"""
    return attorney

# ============================================================================
# ATTORNEYS (Protected)
# ============================================================================

@app.get("/api/attorneys", response_model=List[AttorneyResponse])
def get_attorneys(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Attorney).all()

@app.get("/api/attorneys/{attorney_id}", response_model=AttorneyResponse)
def get_attorney(attorney_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attorney = db.query(Attorney).filter(Attorney.id == attorney_id).first()
    if not attorney:
        raise HTTPException(status_code=404, detail="Attorney not found")
    return attorney

# ============================================================================
# CASES (Protected)
# ============================================================================

@app.post("/api/cases", response_model=CaseResponse)
def create_case(case: CaseCreate, current_attorney: Attorney = Depends(get_current_attorney), db: Session = Depends(get_db)):
    db_case = Case(**case.dict())
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    return db_case

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
    update: dict,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Verify access
    if case.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update fields
    for key, value in update.items():
        if hasattr(case, key):
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

def _match_rule(rule: CaseRule, activity_data: dict) -> bool:
    """Check if an activity matches a case rule (case-insensitive)."""
    pattern = rule.pattern.lower()
    rule_type = rule.rule_type

    if rule_type == "document_contains":
        doc_name = (activity_data.get("document_name") or "").lower()
        return pattern in doc_name
    elif rule_type == "email_subject_contains":
        subject = (activity_data.get("email_subject") or "").lower()
        return pattern in subject
    elif rule_type == "email_from_contains":
        email_from = (activity_data.get("email_from") or "").lower()
        return pattern in email_from
    elif rule_type == "email_domain_equals":
        email_from = activity_data.get("email_from") or ""
        if "@" in email_from:
            domain = email_from.split("@")[1].lower()
            return domain == pattern
        return False
    elif rule_type == "contact_name_contains":
        contact = (activity_data.get("contact_name") or "").lower()
        return pattern in contact
    elif rule_type == "description_contains":
        desc = (activity_data.get("description") or "").lower()
        return pattern in desc
    return False

def _auto_assign_case(db: Session, attorney_id: int, activity_data: dict) -> Optional[int]:
    """Find the first matching rule and return the case_id, or None."""
    rules = db.query(CaseRule).filter(
        CaseRule.attorney_id == attorney_id,
        CaseRule.enabled == True
    ).order_by(CaseRule.priority.desc(), CaseRule.id).all()

    for rule in rules:
        if _match_rule(rule, activity_data):
            return rule.case_id
    return None

@app.post("/api/activities", response_model=ActivityResponse)
def create_activity(
    activity: ActivityCreate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    duration = int((activity.end_time - activity.start_time).total_seconds() / 60)
    
    activity_dict = activity.dict()
    
    # Auto-assign case based on rules (if no case already set)
    case_id = activity_dict.get("case_id")
    if not case_id:
        case_id = _auto_assign_case(db, current_attorney.id, activity_dict)
    
    db_activity = Activity(
        **activity_dict,
        case_id=case_id,
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
    update: dict,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    # Verify access
    if activity.attorney_id != current_attorney.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if 'start_time' in update and isinstance(update['start_time'], str):
        update['start_time'] = datetime.fromisoformat(update['start_time'].replace('Z', '+00:00'))
    if 'end_time' in update and isinstance(update['end_time'], str):
        update['end_time'] = datetime.fromisoformat(update['end_time'].replace('Z', '+00:00'))
    
    for key, value in update.items():
        if hasattr(activity, key):
            setattr(activity, key, value)
    
    if 'start_time' in update or 'end_time' in update:
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
# HEALTH CHECK (Public)
# ============================================================================

@app.get("/")
def root():
    return {"message": "LawTrack API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}