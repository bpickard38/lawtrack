"""
LawTrack Agent — system tray app. Runs the tracker in the background and shows a tray icon.
Use this as the entry point for the installed app (e.g. PyInstaller .exe).
"""
import logging
import sys
import threading
from pathlib import Path

# Ensure .env is loaded from the app directory (important when running as frozen exe)
_APP_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(_APP_DIR / ".env")
except ImportError:
    pass

from config import API_URL, API_KEY, MIN_SECONDS
from tracker import track_activity
from classifier import classify
from sender import send_activity

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
    """Open LawTrack in the default browser."""
    import webbrowser
    url = API_URL.rstrip("/") if API_URL else "https://lawtrack.vercel.app"
    if not url.startswith("http"):
        url = "https://lawtrack.vercel.app"
    webbrowser.open(url)


def run_tray(stop_event: threading.Event):
    try:
        import pystray
    except ImportError:
        LOG.error("pystray not installed. Run: pip install pystray Pillow")
        return

    icon_image = create_tray_icon()
    menu = pystray.Menu(
        pystray.MenuItem("LawTrack is running", lambda: None, enabled=False),
        pystray.MenuItem("Open LawTrack", lambda *a: open_lawtrack()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", lambda icon, item: (stop_event.set(), icon.stop())),
    )
    icon = pystray.Icon("lawtrack", icon_image, "LawTrack", menu)

    def on_quit():
        stop_event.set()
        icon.stop()

    # Replace Quit handler so it sets stop_event then stops the icon
    icon.run()


def main():
    LOG.info("LawTrack Agent starting (tray mode)...")
    if API_KEY:
        LOG.info("API key configured; posting to %s", API_URL)
    else:
        LOG.warning("LAWTRACK_API_KEY not set. Set it in .env next to this app or in Profile → Auto-tracking agent.")

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


if __name__ == "__main__":
    main()
