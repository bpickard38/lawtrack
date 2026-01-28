from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta

from database import get_db, engine
from models import Base, User, Attorney, Case, Activity
from schemas import (
    UserCreate, UserLogin, UserResponse, Token,
    AttorneyCreate, AttorneyResponse,
    CaseCreate, CaseResponse,
    ActivityCreate, ActivityUpdate, ActivityResponse,
    CaseTimeSummary, ActivityType
)
from auth_utils import (
    get_password_hash, verify_password, create_access_token,
    decode_access_token, oauth2_scheme
)

# Create tables
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
    
    # Create user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Create attorney profile automatically
    attorney = Attorney(
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

@app.post("/api/activities", response_model=ActivityResponse)
def create_activity(
    activity: ActivityCreate,
    current_attorney: Attorney = Depends(get_current_attorney),
    db: Session = Depends(get_db)
):
    duration = int((activity.end_time - activity.start_time).total_seconds() / 60)
    
    db_activity = Activity(
        **activity.dict(),
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
# HEALTH CHECK (Public)
# ============================================================================

@app.get("/")
def root():
    return {"message": "LawTrack API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}