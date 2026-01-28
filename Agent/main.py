import logging
import sys
from tracker import track_activity
from classifier import classify
from sender import send_activity
from config import MIN_SECONDS

# Configure basic logging to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
LOG = logging.getLogger("lawtrack.main")

def on_activity_finished(app_name: str, document_name: str, seconds: float) -> None:
    # Filter short durations centrally as well
    if seconds < MIN_SECONDS:
        LOG.debug("Ignoring short activity for %s: %.1fs", app_name, seconds)
        return

    # Pass document_name to classifier for website filtering
    activity_type = classify(app_name, document_name)
    
    # If classifier returns None, skip this activity (filtered out)
    if activity_type is None:
        LOG.info("Skipping filtered activity: %s - %s", app_name, document_name)
        return
    
    sent = send_activity(app_name, document_name, seconds, activity_type)
    if not sent:
        LOG.warning("Failed to send activity for %s - %s (%.1fs)", app_name, document_name, seconds)

def main() -> None:
    LOG.info("LawTrack Agent Starting...")
    LOG.info("Tracking activities for apps used 60+ seconds")
    LOG.info("Filtering browser activity to specific websites only")
    LOG.info("Press Ctrl+C to stop")
    try:
        track_activity(on_activity_finished)
    except Exception:
        LOG.exception("Agent crashed unexpectedly")

if __name__ == "__main__":
    main()