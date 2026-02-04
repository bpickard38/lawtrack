"""
Sign-in flow for the desktop agent when no API key is configured.
User enters LawTrack email and password; we get an API key and save it to .env.
"""
import logging
import os
import sys
from pathlib import Path

import requests

from config import API_URL, _AGENT_DIR

LOG = logging.getLogger("lawtrack.login")


def _write_env_file(api_key: str) -> None:
    """Write or update .env so LAWTRACK_API_KEY is set. Preserves other vars."""
    env_path = _AGENT_DIR / ".env"
    lines: list[str] = []
    key_line = f'LAWTRACK_API_KEY={api_key}\n'
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("LAWTRACK_API_KEY="):
                lines.append(key_line.strip())
            else:
                lines.append(line)
    if not any(l.strip().startswith("LAWTRACK_API_KEY=") for l in lines):
        lines.append(key_line.strip())
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    LOG.info("Saved API key to %s", env_path)


def _login_request(email: str, password: str) -> tuple[str | None, str | None]:
    """
    POST to agent-key/from-login; returns (api_key, error_message).
    If api_key is None, error_message contains the reason.
    """
    url = f"{API_URL.rstrip('/')}/api/auth/agent-key/from-login"
    LOG.info("Attempting login to: %s", url)
    try:
        r = requests.post(
            url,
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if not r.ok:
            try:
                error_data = r.json()
                error_msg = error_data.get("detail", f"Login failed ({r.status_code})")
            except:
                error_msg = f"Login failed ({r.status_code})"
            
            # Add helpful context if connecting to localhost
            if "localhost" in API_URL.lower() or "127.0.0.1" in API_URL:
                error_msg += f"\n\nNote: Connecting to {API_URL}. If your backend is deployed (e.g. Railway), set LAWTRACK_API_URL in .env to your backend URL."
            
            LOG.warning("Login failed: %s %s", r.status_code, error_msg)
            return None, error_msg
        data = r.json()
        return data.get("api_key"), None
    except requests.exceptions.ConnectionError as e:
        error_msg = f"Cannot connect to {API_URL}.\n\n"
        if "localhost" in API_URL.lower() or "127.0.0.1" in API_URL:
            error_msg += "The agent is trying to connect to localhost. If your backend is deployed (e.g. Railway), edit the .env file in the agent folder and set:\nLAWTRACK_API_URL=https://your-backend.up.railway.app"
        else:
            error_msg += f"Check that {API_URL} is correct and the backend is running."
        LOG.warning("Connection failed: %s", e)
        return None, error_msg
    except requests.RequestException as e:
        error_msg = f"Network error: {str(e)}"
        LOG.warning("Request failed: %s", e)
        return None, error_msg


# UI colors (match LawTrack branding)
_BG = "#f8fafc"
_CARD_BG = "#ffffff"
_TEXT = "#1e293b"
_TEXT_MUTED = "#64748b"
_ACCENT = "#2563eb"
_ACCENT_HOVER = "#1d4ed8"
_ERR = "#dc2626"
_ENTRY_BG = "#f1f5f9"
_ENTRY_BORDER = "#e2e8f0"


def run_login_gui() -> bool:
    """
    Show a polished sign-in window. Returns True if login succeeded and .env was updated.
    """
    try:
        import tkinter as tk
        from tkinter import messagebox
    except ImportError:
        LOG.error("tkinter not available; cannot show login window")
        return False

    result: list[bool] = []

    def do_login():
        email = email_var.get().strip()
        password = password_var.get()
        if not email or not password:
            err_label.config(text="Please enter your email and password.")
            return
        err_label.config(text="")
        signin_btn.config(state=tk.DISABLED, text="Signing in…")
        root.update()
        key, error_msg = _login_request(email, password)
        if key:
            _write_env_file(key)
            result.append(True)
            root.quit()
        else:
            signin_btn.config(state=tk.NORMAL, text="Sign in")
            err_label.config(text=error_msg or "Invalid email or password, or not an attorney account.")

    root = tk.Tk()
    root.title("LawTrack")
    root.resizable(True, True)
    root.minsize(420, 480)
    root.configure(bg=_BG)

    # Center window on screen; tall enough for all content including buttons
    w, h = 420, 550
    root.geometry(f"{w}x{h}")
    root.update_idletasks()
    x = (root.winfo_screenwidth() // 2) - (w // 2)
    y = max(0, (root.winfo_screenheight() // 2) - (h // 2))
    root.geometry(f"{w}x{h}+{x}+{y}")

    # Card container - fixed size but tall enough for all content
    card = tk.Frame(root, bg=_CARD_BG, padx=40, pady=32)
    card.place(relx=0.5, rely=0.5, anchor=tk.CENTER, width=380, height=480)

    # Header
    title = tk.Label(
        card, text="LawTrack",
        font=("Segoe UI", 24, "bold"),
        fg=_TEXT, bg=_CARD_BG,
    )
    title.pack(anchor=tk.W)
    subtitle = tk.Label(
        card, text="Sign in with your account to start tracking",
        font=("Segoe UI", 11),
        fg=_TEXT_MUTED, bg=_CARD_BG,
    )
    subtitle.pack(anchor=tk.W, pady=(4, 8))
    
    # Show API URL being used (helpful for debugging)
    # Check if it's the placeholder/default
    api_url_display = API_URL
    if "your-backend" in API_URL.lower() or API_URL == "http://localhost:8000":
        api_url_display = f"{API_URL} (⚠️ Edit .env file!)"
    api_url_label = tk.Label(
        card, text=f"Connecting to: {api_url_display}",
        font=("Segoe UI", 9),
        fg="#dc2626" if "⚠️" in api_url_display else _TEXT_MUTED,
        bg=_CARD_BG,
        wraplength=300,
    )
    api_url_label.pack(anchor=tk.W, pady=(0, 24))

    # Email
    email_var = tk.StringVar()
    tk.Label(card, text="Email", font=("Segoe UI", 10, "bold"), fg=_TEXT, bg=_CARD_BG).pack(anchor=tk.W, pady=(0, 6))
    email_entry = tk.Entry(
        card, textvariable=email_var, font=("Segoe UI", 11),
        width=38, relief=tk.FLAT, bg=_ENTRY_BG, fg=_TEXT,
        insertbackground=_TEXT,
    )
    email_entry.pack(fill=tk.X, ipady=12, ipadx=14, pady=(0, 20))
    email_entry.focus_set()

    # Password - same visible size as email so it doesn't look truncated
    password_var = tk.StringVar()
    tk.Label(card, text="Password", font=("Segoe UI", 10, "bold"), fg=_TEXT, bg=_CARD_BG).pack(anchor=tk.W, pady=(0, 6))
    password_entry = tk.Entry(
        card, textvariable=password_var, show="*", font=("Segoe UI", 11),
        width=38, relief=tk.FLAT, bg=_ENTRY_BG, fg=_TEXT,
        insertbackground=_TEXT,
    )
    password_entry.pack(fill=tk.X, ipady=12, ipadx=14, pady=(0, 28))

    # Error message
    err_label = tk.Label(card, text="", font=("Segoe UI", 10), fg=_ERR, bg=_CARD_BG)
    err_label.pack(anchor=tk.W, pady=(0, 16))

    # Buttons - ensure they're always visible
    btn_frame = tk.Frame(card, bg=_CARD_BG)
    btn_frame.pack(fill=tk.X, pady=(16, 0))
    signin_btn = tk.Button(
        btn_frame,
        text="Sign in",
        command=do_login,
        font=("Segoe UI", 11, "bold"),
        fg="white",
        bg=_ACCENT,
        activeforeground="white",
        activebackground=_ACCENT_HOVER,
        relief=tk.FLAT,
        cursor="hand2",
        padx=24,
        pady=10,
    )
    signin_btn.pack(side=tk.LEFT, padx=(0, 12))
    tk.Button(
        btn_frame,
        text="Cancel",
        command=root.quit,
        font=("Segoe UI", 11),
        fg=_TEXT_MUTED,
        bg=_CARD_BG,
        activeforeground=_TEXT,
        activebackground=_ENTRY_BG,
        relief=tk.FLAT,
        cursor="hand2",
        padx=24,
        pady=10,
    ).pack(side=tk.LEFT)

    # Bind Enter to sign in
    root.bind("<Return>", lambda e: do_login())

    root.mainloop()
    # Safely destroy window (may already be destroyed if user closed it)
    try:
        root.destroy()
    except tk.TclError:
        pass  # Window already destroyed, ignore
    return bool(result)


def run_login_console() -> bool:
    """Console fallback when no GUI: prompt for email/password and get key."""
    print("LawTrack Agent — Sign in (same email and password as the website)")
    try:
        email = input("Email: ").strip()
        password = input("Password: ")
    except (EOFError, KeyboardInterrupt):
        return False
    if not email or not password:
        return False
    key, error_msg = _login_request(email, password)
    if not key:
        print(f"Login failed: {error_msg or 'Check email, password, and that your account is an attorney.'}")
        return False
    _write_env_file(key)
    print("Signed in. Restart the agent to start tracking.")
    return True


def ensure_api_key() -> bool:
    """
    If no API key is configured, run sign-in (GUI or console), write .env, and return True
    so the caller can restart. If key already set, return False (no restart needed).
    If user cancels or login fails, return False and caller should exit.
    """
    from config import API_KEY
    if API_KEY:
        return False
    if sys.stdin and sys.stdin.isatty():
        ok = run_login_console()
    else:
        ok = run_login_gui()
    return ok


def restart_self() -> None:
    """Restart this process so the new run loads .env with the saved API key."""
    executable = sys.executable
    argv = [executable] + sys.argv
    if getattr(sys, "frozen", False):
        executable = sys.executable
        argv = [sys.executable] + sys.argv
    os.execv(executable, argv)
