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


def _login_request(email: str, password: str) -> str | None:
    """POST to agent-key/from-login; returns api_key or None on failure."""
    url = f"{API_URL.rstrip('/')}/api/auth/agent-key/from-login"
    try:
        r = requests.post(
            url,
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if not r.ok:
            LOG.warning("Login failed: %s %s", r.status_code, r.text)
            return None
        data = r.json()
        return data.get("api_key")
    except requests.RequestException as e:
        LOG.warning("Request failed: %s", e)
        return None


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
        key = _login_request(email, password)
        if key:
            _write_env_file(key)
            result.append(True)
            root.quit()
        else:
            signin_btn.config(state=tk.NORMAL, text="Sign in")
            err_label.config(text="Invalid email or password, or not an attorney account.")

    root = tk.Tk()
    root.title("LawTrack")
    root.resizable(False, False)
    root.geometry("420x380")
    root.configure(bg=_BG)

    # Center window on screen
    root.update_idletasks()
    w, h = 420, 380
    x = (root.winfo_screenwidth() // 2) - (w // 2)
    y = (root.winfo_screenheight() // 2) - (h // 2)
    root.geometry(f"{w}x{h}+{x}+{y}")

    # Card container
    card = tk.Frame(root, bg=_CARD_BG, padx=40, pady=36)
    card.place(relx=0.5, rely=0.5, anchor=tk.CENTER, width=380, height=320)

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
    subtitle.pack(anchor=tk.W, pady=(4, 24))

    # Email
    email_var = tk.StringVar()
    tk.Label(card, text="Email", font=("Segoe UI", 10, "bold"), fg=_TEXT, bg=_CARD_BG).pack(anchor=tk.W, pady=(0, 6))
    email_entry = tk.Entry(
        card, textvariable=email_var, font=("Segoe UI", 11),
        width=36, relief=tk.FLAT, bg=_ENTRY_BG, fg=_TEXT,
        insertbackground=_TEXT,
    )
    email_entry.pack(fill=tk.X, ipady=10, ipadx=12, pady=(0, 16))
    email_entry.focus_set()

    # Password
    password_var = tk.StringVar()
    tk.Label(card, text="Password", font=("Segoe UI", 10, "bold"), fg=_TEXT, bg=_CARD_BG).pack(anchor=tk.W, pady=(0, 6))
    password_entry = tk.Entry(
        card, textvariable=password_var, show="*", font=("Segoe UI", 11),
        width=36, relief=tk.FLAT, bg=_ENTRY_BG, fg=_TEXT,
        insertbackground=_TEXT,
    )
    password_entry.pack(fill=tk.X, ipady=10, ipadx=12, pady=(0, 24))

    # Error message
    err_label = tk.Label(card, text="", font=("Segoe UI", 10), fg=_ERR, bg=_CARD_BG)
    err_label.pack(anchor=tk.W, pady=(0, 12))

    # Buttons
    btn_frame = tk.Frame(card, bg=_CARD_BG)
    btn_frame.pack(fill=tk.X)
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
    root.destroy()
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
    key = _login_request(email, password)
    if not key:
        print("Login failed. Check email, password, and that your account is an attorney.")
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
