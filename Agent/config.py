import os
import sys
from pathlib import Path

# Where the agent stores its config (.env).
#
# For the installed exe:
# - Read defaults (like LAWTRACK_API_URL) from the install folder .env
# - Store per-user secrets (LAWTRACK_API_KEY) in %LOCALAPPDATA%\LawTrackAgent\.env
# Use real Local AppData path so read/write match even when LOCALAPPDATA env is unset (e.g. installer launch)
def _local_appdata() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local"))
    return Path(os.environ.get("LOCALAPPDATA") or str(Path.home()))

if getattr(sys, "frozen", False):
    _INSTALL_DIR = Path(sys.executable).parent
    _AGENT_DIR = _local_appdata() / "LawTrackAgent"
    _AGENT_DIR.mkdir(parents=True, exist_ok=True)
else:
    _INSTALL_DIR = Path(__file__).resolve().parent
    _AGENT_DIR = _INSTALL_DIR

try:
    from dotenv import load_dotenv
    # Load install-time defaults first (e.g. LAWTRACK_API_URL from installer .env)
    load_dotenv(_INSTALL_DIR / ".env")
    # Then load per-user overrides (e.g. LAWTRACK_API_KEY written by login)
    load_dotenv(_AGENT_DIR / ".env")
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