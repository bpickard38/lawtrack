import os

# Load .env if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Base API URL (no trailing slash). Agent posts to {API_URL}/api/agent/activities
API_URL = os.getenv("LAWTRACK_API_URL", "http://localhost:8000")

# API key from Profile → Auto-tracking agent (Create API key). Required for agent.
API_KEY = os.getenv("LAWTRACK_API_KEY", "").strip()

# Ignore app switches shorter than this many seconds (default 60)
try:
    MIN_SECONDS = int(os.getenv("LAWTRACK_MIN_SECONDS", "60"))
except ValueError:
    MIN_SECONDS = 60