import logging
from datetime import datetime, timedelta

import requests

from config import BACKEND_URL, ATTORNEY_ID

LOG = logging.getLogger("lawtrack.agent")
LOG.setLevel(logging.INFO)

def send_activity(app_name: str, document_name: str, seconds: float, activity_type: str) -> bool:
    """
    Send activity payload to backend. Returns True if the POST succeeded (2xx),
    False otherwise. Network errors are caught and logged.
    """
    # Do not attempt to send obviously small durations
    if seconds < 1:
        LOG.debug("Skipping send: duration too short")
        return False

    # Calculate start and end times
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(seconds=seconds)

    # Create description with both app and document name
    if document_name and document_name != app_name:
        description = f"Auto-tracked: {document_name}"
        doc_name = document_name
    else:
        description = f"Auto-tracked: {app_name}"
        doc_name = app_name

    payload = {
        "attorney_id": ATTORNEY_ID,
        "type": activity_type,
        "start_time": start_time.isoformat() + "Z",
        "end_time": end_time.isoformat() + "Z",
        "description": description,
        "document_name": doc_name if activity_type == "document" else None,
        "source": "agent",
    }

    try:
        LOG.debug("Sending activity: %s", payload)
        resp = requests.post(BACKEND_URL, json=payload, timeout=6)
        if resp.ok:
            LOG.info("Activity sent: %s (%.1fs) -> %s", document_name or app_name, seconds, resp.status_code)
            return True
        else:
            LOG.warning("Failed to send activity: %s status=%s body=%s", BACKEND_URL, resp.status_code, resp.text)
            return False
    except requests.RequestException as e:
        LOG.error("Network error while sending activity: %s", e, exc_info=False)
        return False