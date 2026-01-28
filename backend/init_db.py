"""
Database initialization script - Creates tables and sample data
Run this after setting up PostgreSQL: python init_db.py
"""
from database import engine, SessionLocal
from models import Base, Attorney, Case

def init_db():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created successfully")

def add_sample_data():
    """Add sample attorney and cases for testing"""
    db = SessionLocal()
    try:
        # Check if data already exists
        existing = db.query(Attorney).first()
        if existing:
            print("Sample data already exists")
            return

        # Create attorney
        attorney = Attorney(
            name="John Doe",
            email="john.doe@lawfirm.com",
            billable_rate=350.00
        )
        db.add(attorney)
        db.commit()
        db.refresh(attorney)
        print(f"✓ Created attorney: {attorney.name} (ID: {attorney.id})")

        # Create cases
        cases = [
            Case(
                name="Smith v. Jones",
                client_name="Robert Smith",
                attorney_id=attorney.id
            ),
            Case(
                name="Johnson Estate",
                client_name="Mary Johnson",
                attorney_id=attorney.id
            ),
            Case(
                name="ABC Corp Merger",
                client_name="ABC Corporation",
                attorney_id=attorney.id
            )
        ]

        for case in cases:
            db.add(case)
        
        db.commit()
        print(f"✓ Created {len(cases)} cases")
        print("\nSample data added successfully!")
        print(f"\nYou can now log in as:")
        print(f"  Attorney ID: {attorney.id}")
        print(f"  Name: {attorney.name}")
        
    except Exception as e:
        print(f"Error adding sample data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("LawTrack Database Initialization")
    print("=" * 50)
    init_db()
    print()
    add_sample_data()
    print("\nDone! You can now start the server with: uvicorn main:app --reload")