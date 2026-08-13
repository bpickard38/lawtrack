import logging
from datetime import datetime, timedelta

import requests

import config

LOG = logging.getLogger("lawtrack.agent")
LOG.setLevel(logging.INFO)

# Backend activity types: document, email, call. Map "meeting" -> call.
def _normalize_type(t: str) -> str:
    if t == "meeting":
        return "call"
    return t if t in ("document", "email", "call") else "document"

def send_activity(app_name: str, document_name: str, seconds: float, activity_type: str) -> bool:
    """
    Send activity payload to backend via X-API-Key. Returns True if POST succeeded (2xx),
    False otherwise. Network errors are caught and logged.
    """
    if seconds < 1:
        LOG.debug("Skipping send: duration too short")
        return False

    if not config.API_KEY:
        LOG.warning("LAWTRACK_API_KEY not set; skipping send. Create a key in Profile → Auto-tracking agent.")
        return False

    end_time = datetime.utcnow()
    start_time = end_time - timedelta(seconds=seconds)
    norm_type = _normalize_type(activity_type)

    if document_name and document_name != app_name:
        description = f"Auto-tracked: {document_name}"
        doc_name = document_name
    else:
        description = f"Auto-tracked: {app_name}"
        doc_name = app_name

    payload = {
        "type": norm_type,
        "start_time": start_time.isoformat() + "Z",
        "end_time": end_time.isoformat() + "Z",
        "description": description,
        "document_name": doc_name if norm_type == "document" else None,
    }

    url = f"{config.API_URL.rstrip('/')}/api/agent/activities"
    headers = {"X-API-Key": config.API_KEY, "Content-Type": "application/json"}

    try:
        LOG.debug("Sending activity: %s", payload)
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.ok:
            LOG.info("Activity sent: %s (%.1fs) -> %s", document_name or app_name, seconds, resp.status_code)
            return True
        if resp.status_code == 401:
            LOG.warning("Invalid API key. Create a new key in Profile → Auto-tracking agent.")
        else:
            LOG.warning("Failed to send activity: %s status=%s body=%s", url, resp.status_code, resp.text)
        return False
    except requests.RequestException as e:
        LOG.error("Network error while sending activity: %s", e, exc_info=False)
        return False


def send_heartbeat(app_name: str, document_name: str, activity_type: str, elapsed_seconds: float) -> bool:
    """
    Tell the backend "here's what I'm doing right now" - lets the website
    show live status. Separate from send_activity: this fires repeatedly
    while still on the same window, well before MIN_SECONDS would ever
    qualify it as a finalized Activity. Best-effort; failures are logged,
    not retried (the next heartbeat a few seconds later supersedes it).
    """
    if not config.API_KEY:
        return False

    norm_type = _normalize_type(activity_type)
    label = document_name if document_name and document_name != app_name else app_name
    started_at = datetime.utcnow() - timedelta(seconds=elapsed_seconds)

    payload = {
        "activity_type": norm_type,
        "label": label,
        "started_at": started_at.isoformat() + "Z",
    }
    url = f"{config.API_URL.rstrip('/')}/api/agent/heartbeat"
    headers = {"X-API-Key": config.API_KEY, "Content-Type": "application/json"}

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=8)
        if not resp.ok:
            LOG.debug("Heartbeat failed: status=%s body=%s", resp.status_code, resp.text)
        return resp.ok
    except requests.RequestException as e:
        LOG.debug("Heartbeat network error (non-fatal): %s", e)
        return False


def fetch_tracking_enabled() -> bool | None:
    """
    GET /api/agent/settings (X-API-Key). Returns tracking_enabled (True/False) or None if request failed.
    Safe when offline: returns None so caller keeps last known state.
    """
    if not config.API_KEY:
        return True
    url = f"{config.API_URL.rstrip('/')}/api/agent/settings"
    headers = {"X-API-Key": config.API_KEY}
    try:
        resp = requests.get(url, headers=headers, timeout=8)
        if resp.ok:
            data = resp.json()
            return bool(data.get("tracking_enabled", True))
        return None
    except requests.RequestException as e:
        LOG.debug("Settings fetch failed (offline?): %s", e)
        return None