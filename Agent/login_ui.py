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


def run_login_gui() -> bool:
    """
    Show a simple email/password dialog, get API key, write to .env.
    Returns True if login succeeded and .env was updated (caller should restart).
    Returns False on cancel or failure.
    """
    try:
        import tkinter as tk
        from tkinter import messagebox
    except ImportError:
        LOG.error("tkinter not available; cannot show login window")
        return False

    result: list[bool] = []  # [True] if success
    api_key_value: list[str] = []

    def do_login():
        email = email_var.get().strip()
        password = password_var.get()
        if not email or not password:
            messagebox.showerror("Error", "Please enter email and password.")
            return
        err_label.config(text="Signing in...")
        root.update()
        key = _login_request(email, password)
        if key:
            _write_env_file(key)
            api_key_value.append(key)
            result.append(True)
            root.quit()
        else:
            err_label.config(text="Invalid email or password, or not an attorney account.")

    root = tk.Tk()
    root.title("LawTrack — Sign in")
    root.resizable(False, False)
    root.geometry("340x180")

    f = tk.Frame(root, padx=16, pady=16)
    f.pack(fill=tk.BOTH, expand=True)

    tk.Label(f, text="Sign in with your LawTrack account", font=("Segoe UI", 10)).pack(anchor=tk.W)
    tk.Label(f, text="(same email and password as the website)").pack(anchor=tk.W)

    email_var = tk.StringVar()
    password_var = tk.StringVar()
    tk.Label(f, text="Email").pack(anchor=tk.W)
    tk.Entry(f, textvariable=email_var, width=40).pack(fill=tk.X, pady=(0, 8))
    tk.Label(f, text="Password").pack(anchor=tk.W)
    tk.Entry(f, textvariable=password_var, show="*", width=40).pack(fill=tk.X, pady=(0, 8))

    err_label = tk.Label(f, text="", fg="red", font=("Segoe UI", 9))
    err_label.pack(anchor=tk.W, pady=(0, 4))

    btn_frame = tk.Frame(f)
    btn_frame.pack(fill=tk.X)
    tk.Button(btn_frame, text="Sign in", command=do_login, width=12).pack(side=tk.LEFT, padx=(0, 8))
    tk.Button(btn_frame, text="Cancel", command=root.quit, width=12).pack(side=tk.LEFT)

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
