"""
LawTrack Agent — system tray app. Runs the tracker in the background and shows a tray icon.
Use this as the entry point for the installed app (e.g. PyInstaller .exe).
"""
import logging
import os
import sys
import threading
from pathlib import Path

# Load .env before any config import so API key is always found when present
_APP_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(_APP_DIR / ".env")
    # When frozen, also load user's .env (where login saves the key) so it overrides install .env
    if getattr(sys, "frozen", False):
        if sys.platform == "win32":
            _user_env = Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")) / "LawTrackAgent" / ".env"
        else:
            _user_env = Path(os.environ.get("LOCALAPPDATA") or str(Path.home())) / "LawTrackAgent" / ".env"
        load_dotenv(_user_env)
except ImportError:
    pass

import config
from config import API_URL, API_KEY, MIN_SECONDS
from tracker import track_activity
from classifier import classify
from sender import send_activity
from login_ui import ensure_api_key, restart_self, run_login_gui

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
LOG = logging.getLogger("lawtrack.app")


def on_activity_finished(app_name: str, document_name: str, seconds: float) -> None:
    if seconds < MIN_SECONDS:
        return
    activity_type = classify(app_name, document_name)
    if activity_type is None:
        LOG.debug("Skipping filtered: %s - %s", app_name, document_name)
        return
    send_activity(app_name, document_name, seconds, activity_type)


def create_tray_icon():
    """Create a simple 64x64 tray icon (indigo square with white L)."""
    try:
        from PIL import Image, ImageDraw
        size = 64
        img = Image.new("RGBA", (size, size), (99, 102, 241, 255))  # indigo
        d = ImageDraw.Draw(img)
        # White "L" shape
        d.rectangle([16, 12, 28, 52], fill=(255, 255, 255, 255))
        d.rectangle([16, 44, 48, 52], fill=(255, 255, 255, 255))
        return img
    except Exception:
        # Fallback: solid color
        from PIL import Image
        return Image.new("RGB", (64, 64), (99, 102, 241))


def open_lawtrack():
    """Open the LawTrack web app (frontend) in the default browser."""
    import webbrowser
    # Open the frontend app, not the backend API
    url = "https://lawtrack.vercel.app"
    webbrowser.open(url)


_relogin_requested = False


def run_tray(stop_event: threading.Event):
    try:
        import pystray
    except ImportError:
        LOG.error("pystray not installed. Run: pip install pystray Pillow")
        return

    global _relogin_requested
    _relogin_requested = False

    def sign_in_again(icon, item):
        global _relogin_requested
        _relogin_requested = True
        stop_event.set()
        icon.stop()

    icon_image = create_tray_icon()
    menu = pystray.Menu(
        pystray.MenuItem("LawTrack is running", lambda: None, enabled=False),
        pystray.MenuItem("Open LawTrack", lambda *a: open_lawtrack()),
        pystray.MenuItem("Sign in again", sign_in_again),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", lambda icon, item: (stop_event.set(), icon.stop())),
    )
    icon = pystray.Icon("lawtrack", icon_image, "LawTrack", menu)
    icon.run()


def main():
    LOG.info("LawTrack Agent starting (tray mode)...")
    # Fallback: if still no key (e.g. dotenv path quirk), read once from user .env when frozen
    key = API_KEY
    if not key and getattr(sys, "frozen", False):
        try:
            if sys.platform == "win32":
                p = Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")) / "LawTrackAgent" / ".env"
            else:
                p = Path(os.environ.get("LOCALAPPDATA") or str(Path.home())) / "LawTrackAgent" / ".env"
            if p.exists():
                for line in p.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("LAWTRACK_API_KEY=") and len(line) > 17:
                        key = line[17:].strip().strip('"').strip("'")
                        config.API_KEY = key
                        break
        except Exception as e:
            LOG.debug("Fallback key read failed: %s", e)
    if not config.API_KEY:
        LOG.info("No API key — opening sign-in so you can use your LawTrack email and password.")
        if ensure_api_key():
            restart_self()
            return
        LOG.warning("Sign-in cancelled or failed. Restart the agent and sign in to start tracking.")
        return
    LOG.info("Signed in; posting to %s", API_URL)

    stop_event = threading.Event()
    tracker_thread = threading.Thread(
        target=track_activity,
        args=(on_activity_finished,),
        kwargs={"stop_event": stop_event},
        daemon=False,
    )
    tracker_thread.start()

    try:
        run_tray(stop_event)
    finally:
        stop_event.set()
        tracker_thread.join(timeout=5)
    LOG.info("LawTrack Agent stopped.")

    # If user chose "Sign in again", show login and restart with new key
    if _relogin_requested and run_login_gui():
        restart_self()


if __name__ == "__main__":
    main()
