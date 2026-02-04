import logging
import sys
from tracker import track_activity
from classifier import classify
from sender import send_activity
from config import MIN_SECONDS, API_URL, API_KEY

# Configure basic logging to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
LOG = logging.getLogger("lawtrack.main")

def on_activity_finished(app_name: str, document_name: str, seconds: float, window_title: str = "") -> None:
    if seconds < MIN_SECONDS:
        LOG.debug("Ignoring short activity for %s: %.1fs", app_name, seconds)
        return

    # Use full window_title for classification (contains URL/site info), document_name for display
    activity_type = classify(app_name, window_title or document_name)
    if activity_type is None:
        LOG.info("Skipping filtered activity: %s - %s", app_name, document_name)
        return

    sent = send_activity(app_name, document_name, seconds, activity_type)
    if not sent:
        LOG.warning("Failed to send activity for %s - %s (%.1fs)", app_name, document_name, seconds)

def main() -> None:
    LOG.info("LawTrack Agent Starting...")
    LOG.info("Tracking activities for apps used %s+ seconds", MIN_SECONDS)
    LOG.info("Filtering browser activity to specific websites only")
    if API_KEY:
        LOG.info("API key configured; posting to %s", API_URL)
    else:
        LOG.warning("LAWTRACK_API_KEY not set. Set it in .env or env. Create a key in Profile → Auto-tracking agent.")
    LOG.info("Press Ctrl+C to stop")
    try:
        track_activity(on_activity_finished)
    except Exception:
        LOG.exception("Agent crashed unexpectedly")

if __name__ == "__main__":
    main()