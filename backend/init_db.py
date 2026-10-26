"""
Database initialization script - creates tables and seeds the demo account.
Run after setting up PostgreSQL and backend/.env: python init_db.py

The demo account (see demo.py) is rebuilt with fresh data on every run.
"""
from database import engine, SessionLocal
from models import Base
from demo import DEMO_EMAIL, DEMO_PASSWORD, seed_demo


def init_db():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully")


def add_sample_data():
    """Create (or rebuild) the demo firm with matters, rules and two weeks of activity."""
    db = SessionLocal()
    try:
        seed_demo(db)
        print("Demo data seeded.")
        print("\nLog in at the app with:")
        print(f"  Email:    {DEMO_EMAIL}")
        print(f"  Password: {DEMO_PASSWORD}")
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
