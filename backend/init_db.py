"""
Database initialization script - creates tables and seeds one sample login.
Run after setting up PostgreSQL and backend/.env: python init_db.py
"""
from database import engine, SessionLocal
from models import Base, Firm, User, Attorney, Case, UserRole
from auth_utils import get_password_hash

SEED_EMAIL = "demo@lawtrack.local"
SEED_PASSWORD = "demopassword123"

def init_db():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully")

def add_sample_data():
    """Add one sample attorney (with a real login) and a few cases for testing"""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == SEED_EMAIL).first()
        if existing:
            print(f"Sample data already exists (login: {SEED_EMAIL})")
            return

        firm = Firm(name="Doe & Associates")
        db.add(firm)
        db.commit()
        db.refresh(firm)

        user = User(
            firm_id=firm.id,
            email=SEED_EMAIL,
            hashed_password=get_password_hash(SEED_PASSWORD),
            full_name="John Doe",
            role=UserRole.ATTORNEY.value,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        attorney = Attorney(
            firm_id=firm.id,
            user_id=user.id,
            name="John Doe",
            email=SEED_EMAIL,
            billable_rate=350.00,
        )
        db.add(attorney)
        db.commit()
        db.refresh(attorney)
        print(f"Created attorney: {attorney.name} (ID: {attorney.id})")

        cases = [
            Case(firm_id=firm.id, name="Smith v. Jones", client_name="Robert Smith", attorney_id=attorney.id),
            Case(firm_id=firm.id, name="Johnson Estate", client_name="Mary Johnson", attorney_id=attorney.id),
            Case(firm_id=firm.id, name="ABC Corp Merger", client_name="ABC Corporation", attorney_id=attorney.id),
        ]
        for case in cases:
            db.add(case)
        db.commit()
        print(f"Created {len(cases)} cases")

        print("\nSample data added successfully!")
        print(f"\nLog in at the app with:")
        print(f"  Email:    {SEED_EMAIL}")
        print(f"  Password: {SEED_PASSWORD}")

    except Exception as e:
        print(f"Error adding sample data: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("LawTrack Database Initialization")
    print("=" * 50)
    init_db()
    print()
    add_sample_data()
    print("\nDone! You can now start the server with: uvicorn main:app --reload")