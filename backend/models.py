from sqlalchemy import Column, Integer, String, DECIMAL, TIMESTAMP, ForeignKey, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime
import enum

Base = declarative_base()

class UserRole(enum.Enum):
    ADMIN = "admin"
    BILLING = "billing"
    ATTORNEY = "attorney"

class ActivityType(enum.Enum):
    DOCUMENT = "document"
    EMAIL = "email"
    CALL = "call"

class ActivityStatus(enum.Enum):
    CAPTURED = "captured"      # auto-tracked, not yet reviewed
    EDITED = "edited"          # manually reviewed/adjusted
    APPROVED = "approved"      # ready for billing
    INVOICED = "invoiced"      # billed to client

class Firm(Base):
    __tablename__ = "firms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

class User(Base):
    """User accounts for authentication"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    firm_id = Column(Integer, ForeignKey("firms.id"), nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default=UserRole.ATTORNEY.value, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

class Attorney(Base):
    __tablename__ = "attorneys"
    
    id = Column(Integer, primary_key=True, index=True)
    firm_id = Column(Integer, ForeignKey("firms.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)  # Link to user account
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    billable_rate = Column(DECIMAL(10, 2), default=300.00)
    created_at = Column(TIMESTAMP, server_default=func.now())

class Case(Base):
    __tablename__ = "cases"
    
    id = Column(Integer, primary_key=True, index=True)
    firm_id = Column(Integer, ForeignKey("firms.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    client_name = Column(String(255))
    attorney_id = Column(Integer, ForeignKey("attorneys.id"))
    status = Column(String(50), default="active")
    created_at = Column(TIMESTAMP, server_default=func.now())

class Activity(Base):
    __tablename__ = "activities"
    
    id = Column(Integer, primary_key=True, index=True)
    firm_id = Column(Integer, ForeignKey("firms.id"), nullable=True, index=True)
    attorney_id = Column(Integer, ForeignKey("attorneys.id"), nullable=False)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    type = Column(String(50), nullable=False)
    start_time = Column(TIMESTAMP, nullable=False)
    end_time = Column(TIMESTAMP, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    
    description = Column(Text)
    
    # Type-specific fields
    document_name = Column(String(500))
    email_from = Column(String(255))
    email_to = Column(String(255))
    email_subject = Column(String(500))
    contact_name = Column(String(255))
    phone_number = Column(String(50))
    
    source = Column(String(50), default="manual")
    
    # Billing/review fields
    is_billable = Column(Boolean, default=True)
    narrative = Column(Text)  # Billing-friendly description
    status = Column(String(50), default="captured")  # captured/edited/approved/invoiced
    
    created_at = Column(TIMESTAMP, server_default=func.now())