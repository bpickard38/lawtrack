"""
LawTrack Agent — system tray app. Runs the tracker in the background and shows a tray icon.
Use this as the entry point for the installed app (e.g. PyInstaller .exe).
Supports lawtrack:// URL protocol: open, pause, resume (single-instance; second launch sends command to first).
"""
import logging
import os
import socket
import sys
import threading
from pathlib import Path

PROTOCOL_PORT = 41821

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
from sender import send_activity, fetch_tracking_enabled
from login_ui import ensure_api_key, restart_self, run_login_gui

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
LOG = logging.getLogger("lawtrack.app")


def on_activity_finished(app_name: str, document_name: str, seconds: float, window_title: str = "") -> None:
    if seconds < MIN_SECONDS:
        return
    # Use full window_title for classification (contains URL/site info), document_name for display
    activity_type = classify(app_name, window_title or document_name)
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


def _parse_protocol_url(url: str) -> str | None:
    """Parse lawtrack://open|pause|resume. Returns 'open', 'pause', 'resume', or None."""
    url = (url or "").strip().lower()
    if not url.startswith("lawtrack://"):
        return None
    path = url.split("://", 1)[1].split("/")[-1].split("?")[0].strip() or "open"
    return path if path in ("open", "pause", "resume") else "open"


def _send_protocol_command(cmd: str) -> bool:
    """Send command to existing agent instance. Returns True if sent (another instance is running)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            s.connect(("127.0.0.1", PROTOCOL_PORT))
            s.sendall((cmd + "\n").encode("utf-8"))
        return True
    except (OSError, socket.error):
        return False


def _run_settings_poller(stop_event: threading.Event, server_pause_event: threading.Event) -> None:
    """Poll server for tracking_enabled every 15s. Offline: keep last state (don't crash)."""
    import time
    while not stop_event.is_set():
        try:
            enabled = fetch_tracking_enabled()
            if enabled is False:
                server_pause_event.set()
                LOG.debug("Tracking disabled by server")
            elif enabled is True:
                server_pause_event.clear()
                LOG.debug("Tracking enabled by server")
            # None = request failed: leave server_pause_event unchanged
        except Exception as e:
            LOG.debug("Settings poll error: %s", e)
        for _ in range(30):
            if stop_event.is_set():
                return
            time.sleep(0.5)


def _run_protocol_server(stop_event: threading.Event, pause_event: threading.Event) -> None:
    """Listen for lawtrack:// commands from other processes (e.g. browser link click)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind(("127.0.0.1", PROTOCOL_PORT))
            server.listen(4)
            server.settimeout(0.5)
            while not stop_event.is_set():
                try:
                    conn, _ = server.accept()
                    with conn:
                        data = conn.recv(64).decode("utf-8", errors="ignore").strip().lower()
                        if data == "open":
                            open_lawtrack()
                        elif data == "pause":
                            pause_event.set()
                            LOG.info("Tracking paused via protocol")
                        elif data == "resume":
                            pause_event.clear()
                            LOG.info("Tracking resumed via protocol")
                except socket.timeout:
                    continue
                except Exception as e:
                    LOG.debug("Protocol server accept error: %s", e)
    except Exception as e:
        LOG.warning("Protocol server failed: %s", e)


_relogin_requested = False


def run_tray(stop_event: threading.Event, pause_event: threading.Event):
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

    def do_pause(icon, item):
        pause_event.set()
        LOG.info("Tracking paused from tray")

    def do_resume(icon, item):
        pause_event.clear()
        LOG.info("Tracking resumed from tray")

    icon_image = create_tray_icon()
    menu = pystray.Menu(
        pystray.MenuItem("LawTrack is running", lambda: None, enabled=False),
        pystray.MenuItem("Open LawTrack", lambda *a: open_lawtrack()),
        pystray.MenuItem("Pause tracking", do_pause),
        pystray.MenuItem("Resume tracking", do_resume),
        pystray.MenuItem("Sign in again", sign_in_again),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", lambda icon, item: (stop_event.set(), icon.stop())),
    )
    icon = pystray.Icon("lawtrack", icon_image, "LawTrack", menu)
    icon.run()


def _is_second_instance() -> bool:
    """Return True if another instance is already running (Windows single-instance mutex)."""
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        from ctypes import wintypes
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        mutex_name = "LawTrackAgentSingleInstance"
        mutex = kernel32.CreateMutexW(None, True, mutex_name)
        if mutex is None:
            return True
        err = kernel32.GetLastError()
        # ERROR_ALREADY_EXISTS = 183
        if err == 183:
            kernel32.CloseHandle(mutex)
            return True
        # Keep mutex handle open for app lifetime (never release)
        return False
    except Exception as e:
        LOG.debug("Single-instance check failed: %s", e)
        return False


def main():
    # If launched with lawtrack:// URL, try to send command to existing instance; if that succeeds, exit
    deferred_command: str | None = None
    argv = getattr(sys, "argv", [])
    if len(argv) > 1 and (argv[1] or "").strip().lower().startswith("lawtrack://"):
        cmd = _parse_protocol_url(argv[1])
        if cmd and _send_protocol_command(cmd):
            LOG.info("Sent %s to existing agent; exiting.", cmd)
            sys.exit(0)
        deferred_command = cmd

    # Single-instance: if another instance is already running, exit
    if _is_second_instance():
        LOG.info("LawTrack Agent already running; exiting.")
        sys.exit(0)

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
    pause_event = threading.Event()
    server_pause_event = threading.Event()
    # Protocol server: so a second process (e.g. lawtrack://open from browser) can send us commands
    server_thread = threading.Thread(
        target=_run_protocol_server,
        args=(stop_event, pause_event),
        daemon=True,
    )
    server_thread.start()
    # Poll server for tracking_enabled; when false, server_pause_event is set and tracker pauses
    settings_poller_thread = threading.Thread(
        target=_run_settings_poller,
        args=(stop_event, server_pause_event),
        daemon=True,
    )
    settings_poller_thread.start()

    tracker_thread = threading.Thread(
        target=track_activity,
        args=(on_activity_finished,),
        kwargs={"stop_event": stop_event, "pause_event": pause_event, "server_pause_event": server_pause_event},
        daemon=False,
    )
    tracker_thread.start()

    if deferred_command == "open":
        open_lawtrack()
    elif deferred_command == "pause":
        pause_event.set()
        LOG.info("Tracking paused (launch)")
    elif deferred_command == "resume":
        pause_event.clear()

    try:
        run_tray(stop_event, pause_event)
    finally:
        stop_event.set()
        tracker_thread.join(timeout=5)
    LOG.info("LawTrack Agent stopped.")

    # If user chose "Sign in again", show login and restart with new key
    if _relogin_requested and run_login_gui():
        restart_self()


if __name__ == "__main__":
    main()
