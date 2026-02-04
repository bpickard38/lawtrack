import os
import threading
import time
import logging
from typing import Callable, Optional, Tuple

import psutil

# win32 modules are only available on Windows
try:
    import win32gui
    import win32process
except Exception:
    win32gui = None  # type: ignore
    win32process = None  # type: ignore

from config import MIN_SECONDS

LOG = logging.getLogger("lawtrack.tracker")
LOG.setLevel(logging.INFO)

def get_active_app() -> Optional[Tuple[str, str]]:
    """
    Return the foreground process name and window title.
    Returns (process_name, window_title) or None if unavailable.
    """
    if not win32gui or not win32process:
        LOG.debug("win32gui/win32process unavailable on this platform")
        return None

    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return None
        
        # Get window title
        window_title = win32gui.GetWindowText(hwnd)
        
        # Get process name
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process = psutil.Process(pid)
        process_name = process.name()
        
        return (process_name, window_title)
    except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
        LOG.debug("Could not resolve active process: %s", e)
        return None
    except Exception as e:
        LOG.exception("Unexpected error in get_active_app: %s", e)
        return None

def extract_filename_from_title(window_title: str, process_name: str) -> str:
    """
    Extract meaningful filename from window title.
    """
    if not window_title:
        return process_name
    
    # Common patterns to extract filename
    process_lower = process_name.lower()
    
    # Word, Excel, PowerPoint: "filename.docx - Word" or "filename.docx - Microsoft Word"
    if any(app in process_lower for app in ['winword', 'excel', 'powerpnt']):
        # Split by common delimiters
        if ' - ' in window_title:
            filename = window_title.split(' - ')[0].strip()
            if filename and filename.lower() not in ['document1', 'book1', 'presentation1']:
                return filename
    
    # Adobe Acrobat: "filename.pdf - Adobe Acrobat"
    if 'acrobat' in process_lower or 'reader' in process_lower:
        if ' - ' in window_title:
            filename = window_title.split(' - ')[0].strip()
            if filename:
                return filename
    
    # Notepad: "filename.txt - Notepad"
    if 'notepad' in process_lower:
        if ' - Notepad' in window_title:
            filename = window_title.replace(' - Notepad', '').strip()
            if filename and filename != '*Untitled':
                return filename
    
    # VS Code: "filename.py - Visual Studio Code"
    if 'code' in process_lower:
        if ' - Visual Studio Code' in window_title:
            parts = window_title.split(' - ')
            if len(parts) > 0:
                filename = parts[0].strip()
                if filename:
                    return filename
    
    # Chrome/Edge: Extract page title (first part before dashes)
    if any(browser in process_lower for browser in ['chrome', 'msedge', 'firefox']):
        # Browsers often have "Page Title - Google Chrome"
        if ' - ' in window_title:
            page_title = window_title.split(' - ')[0].strip()
            if page_title and len(page_title) > 0:
                # Truncate long titles
                return page_title[:100] if len(page_title) > 100 else page_title
    
    # Default: use window title if it's meaningful, otherwise process name
    if window_title and len(window_title.strip()) > 0:
        # Clean up window title (remove common suffixes)
        clean_title = window_title
        for suffix in [' - Microsoft Word', ' - Microsoft Excel', ' - Microsoft PowerPoint', 
                      ' - Adobe Acrobat', ' - Google Chrome', ' - Mozilla Firefox']:
            clean_title = clean_title.replace(suffix, '')
        
        clean_title = clean_title.strip()
        if clean_title:
            return clean_title[:100]  # Limit length
    
    return process_name

def track_activity(
    on_activity_finished: Callable[[str, str, float], None],
    stop_event: Optional[threading.Event] = None,
) -> None:
    """
    Poll the active window and call on_activity_finished(app_name, document_name, seconds)
    when the foreground application changes and the elapsed time >= MIN_SECONDS.

    The function runs indefinitely until interrupted (KeyboardInterrupt) or stop_event is set.
    """
    current_pid = os.getpid()
    last_app: Optional[Tuple[str, str]] = None
    start_time = time.time()

    LOG.info("Starting tracker (min seconds = %s)", MIN_SECONDS)

    try:
        while stop_event is None or not stop_event.is_set():
            try:
                app_data = get_active_app()

                # If the active app is the agent itself, ignore it.
                if app_data:
                    process_name, window_title = app_data
                    try:
                        # normalize process name case
                        if process_name.lower().endswith(".exe"):
                            agent_name = psutil.Process(current_pid).name().lower()
                            if process_name.lower() == agent_name:
                                # skip reporting our own process
                                app_data = last_app
                    except Exception:
                        # ignore any problem determining our own process name
                        pass

                if app_data != last_app:
                    now = time.time()
                    elapsed = now - start_time

                    # If there is a last_app, report it (only if it lasted long enough)
                    if last_app and elapsed >= MIN_SECONDS:
                        process_name, window_title = last_app
                        document_name = extract_filename_from_title(window_title, process_name)
                        LOG.info("Activity finished: %s - %s (%.1fs)", process_name, document_name, elapsed)
                        try:
                            # Pass both document_name and window_title for classification
                            on_activity_finished(process_name, document_name, elapsed, window_title)
                        except TypeError:
                            # Fallback for old callback signature
                            try:
                                on_activity_finished(process_name, document_name, elapsed)
                            except Exception:
                                LOG.exception("Error in on_activity_finished callback")
                        except Exception:
                            LOG.exception("Error in on_activity_finished callback")

                    # update trackers
                    last_app = app_data
                    start_time = now

                # Sleep in small steps so we can check stop_event
                for _ in range(10):
                    if stop_event and stop_event.is_set():
                        break
                    time.sleep(0.2)
            except Exception as e:
                LOG.exception("Tracker loop error: %s", e)
                time.sleep(5)
        LOG.info("Tracker stopped.")
    except KeyboardInterrupt:
        LOG.info("Tracker interrupted by user, exiting.")