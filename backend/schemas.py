from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class ActivityType(str, Enum):
    DOCUMENT = "document"
    EMAIL = "email"
    CALL = "call"

class UserRole(str, Enum):
    admin = "admin"
    billing = "billing"
    attorney = "attorney"

# ============================================================================
# USER / AUTH SCHEMAS
# ============================================================================

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    firm_name: Optional[str] = None
    role: Optional[UserRole] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    firm_id: Optional[int] = None
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class UserUpdateResponse(BaseModel):
    user: UserResponse
    # If email changes, backend may return a fresh token for the new subject.
    access_token: Optional[str] = None
    token_type: str = "bearer"

class RegisterResponse(BaseModel):
    """Returned from register; includes optional agent API key (attorney only, shown once)."""
    user: UserResponse
    agent_api_key: Optional[str] = None

class AgentKeyLoginRequest(BaseModel):
    """Email + password for desktop agent to obtain API key (no key copy needed)."""
    email: EmailStr
    password: str
    device_name: Optional[str] = None

class AgentKeyCreateRequest(BaseModel):
    """Optional body for manually (re)creating an agent key. device_name is
    only ever populated when the agent itself is the caller."""
    device_name: Optional[str] = None

class AgentHeartbeat(BaseModel):
    """Sent periodically by the agent while it's actively on a trackable
    window - lets the website show 'what's happening right now', separate
    from the finalized Activity rows that only get written on window switch."""
    activity_type: str
    label: str
    started_at: datetime

# ============================================================================
# FIRM SCHEMAS
# ============================================================================

class FirmCreate(BaseModel):
    name: str

class FirmResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# ============================================================================
# ATTORNEY SCHEMAS
# ============================================================================

class AttorneyCreate(BaseModel):
    name: str
    email: str
    billable_rate: Optional[float] = 300.00

class AttorneyResponse(BaseModel):
    id: int
    user_id: int
    name: str
    email: str
    billable_rate: float
    onboarding_completed: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class AttorneyUpdate(BaseModel):
    billable_rate: Optional[float] = None


class SettingsResponse(BaseModel):
    tracking_enabled: bool
    billable_rate: float
    reminder_time: Optional[str] = None
    excluded_keywords: Optional[str] = None
    onboarding_completed: bool = False


class TrackingSettingUpdate(BaseModel):
    enabled: bool


class ReminderSettingUpdate(BaseModel):
    reminder_time: Optional[str] = None  # "HH:MM", or None to turn off


class ExcludedKeywordsUpdate(BaseModel):
    excluded_keywords: Optional[str] = None  # newline-separated substrings


# ============================================================================
# CASE SCHEMAS
# ============================================================================

class CaseCreate(BaseModel):
    name: str
    client_name: Optional[str] = None
    attorney_id: int

class CaseUpdate(BaseModel):
    name: Optional[str] = None
    client_name: Optional[str] = None
    status: Optional[str] = None

class CaseImportRow(BaseModel):
    name: str
    client_name: Optional[str] = None

class CaseImportRequest(BaseModel):
    rows: list[CaseImportRow]

class CaseResponse(BaseModel):
    id: int
    name: str
    client_name: Optional[str]
    attorney_id: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class CaseImportResult(BaseModel):
    created: int
    skipped: int
    cases: list[CaseResponse]

# ============================================================================
# ACTIVITY SCHEMAS
# ============================================================================

class ActivityCreate(BaseModel):
    attorney_id: int
    type: ActivityType
    start_time: datetime
    end_time: datetime
    description: Optional[str] = None
    
    # Type-specific fields (optional)
    document_name: Optional[str] = None
    email_from: Optional[str] = None
    email_to: Optional[str] = None
    email_subject: Optional[str] = None
    contact_name: Optional[str] = None
    phone_number: Optional[str] = None


class AgentActivityCreate(BaseModel):
    """Payload from auto-tracking agent; attorney_id derived from API key."""
    type: ActivityType
    start_time: datetime
    end_time: datetime
    description: Optional[str] = None
    document_name: Optional[str] = None
    email_from: Optional[str] = None
    email_to: Optional[str] = None
    email_subject: Optional[str] = None
    contact_name: Optional[str] = None
    phone_number: Optional[str] = None

class ActivityUpdate(BaseModel):
    type: Optional[ActivityType] = None
    case_id: Optional[int] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    document_name: Optional[str] = None
    email_from: Optional[str] = None
    email_to: Optional[str] = None
    email_subject: Optional[str] = None
    contact_name: Optional[str] = None
    phone_number: Optional[str] = None
    is_billable: Optional[bool] = None
    narrative: Optional[str] = None
    status: Optional[str] = None  # captured/edited/approved/invoiced

class ActivityResponse(BaseModel):
    id: int
    attorney_id: int
    case_id: Optional[int]
    type: ActivityType
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    description: Optional[str]
    
    # Type-specific fields
    document_name: Optional[str]
    email_from: Optional[str]
    email_to: Optional[str]
    email_subject: Optional[str]
    contact_name: Optional[str]
    phone_number: Optional[str]
    
    source: str
    is_billable: Optional[bool] = True
    narrative: Optional[str] = None
    status: Optional[str] = "captured"
    confidence: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# BULK OPERATIONS
# ============================================================================

class BulkAssignRequest(BaseModel):
    activity_ids: list[int]
    case_id: int

class BulkApproveRequest(BaseModel):
    activity_ids: list[int]

class MergeActivitiesRequest(BaseModel):
    activity_ids: list[int]  # min 2
    description: Optional[str] = None
    narrative: Optional[str] = None

class SplitActivityRequest(BaseModel):
    split_at_minutes: int  # minutes from start where to split

# ============================================================================
# CASE TIME SUMMARY
# ============================================================================

class CaseTimeSummary(BaseModel):
    case_id: int
    case_name: str
    client_name: Optional[str]
    total_minutes: int
    total_hours: float
    document_minutes: int
    email_minutes: int
    call_minutes: int
    activity_count: int

# ============================================================================
# CASE RULES (Auto-assignment)
# ============================================================================

class RuleType(str, Enum):
    document_contains = "document_contains"
    email_subject_contains = "email_subject_contains"
    email_from_contains = "email_from_contains"
    email_domain_equals = "email_domain_equals"
    contact_name_contains = "contact_name_contains"
    description_contains = "description_contains"

class CaseRuleCreate(BaseModel):
    case_id: int
    rule_type: RuleType
    pattern: str
    enabled: bool = True
    priority: int = 0

class CaseRuleUpdate(BaseModel):
    case_id: Optional[int] = None
    rule_type: Optional[RuleType] = None
    pattern: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None

class CaseRuleResponse(BaseModel):
    id: int
    firm_id: Optional[int]
    attorney_id: int
    case_id: int
    rule_type: str
    pattern: str
    enabled: bool
    priority: int
    created_at: datetime

    class Config:
        from_attributes = True