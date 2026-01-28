import os

# Backend endpoint where the agent posts activity records.
BACKEND_URL = os.getenv("LAWTRACK_BACKEND_URL", "http://localhost:8000/api/activities")

# Which attorney id to report as (change this to your attorney ID)
try:
    ATTORNEY_ID = int(os.getenv("LAWTRACK_ATTORNEY_ID", "2"))
except ValueError:
    ATTORNEY_ID = 1

# Ignore app switches shorter than this many seconds (default 60)
try:
    MIN_SECONDS = int(os.getenv("LAWTRACK_MIN_SECONDS", "60"))
except ValueError:
    MIN_SECONDS = 60