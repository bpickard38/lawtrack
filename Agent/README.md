# LawTrack Auto-Tracking Agent

Desktop agent that tracks active windows (Word, Outlook, browsers, etc.) and sends activities to LawTrack. Runs on Windows with a **system tray icon** (no console window).

---

## For your brother (or anyone at the firm) — install and use

### 1. Get the installer

- You (or your brother) need the file **`LawTrackAgent-Setup.exe`** (see “Building the installer” below for how to create it).

### 2. Install

- Double‑click **LawTrackAgent-Setup.exe** and follow the wizard.
- Optional: check **“Run LawTrack Agent when I sign in”** so tracking starts automatically after each login.
- Finish and, if you chose to, **Launch LawTrack Agent** when the installer asks.

### 3. Sign in once

- The app runs in the **system tray** (near the clock). On first run, a **Sign in** window opens.
- Enter your **LawTrack email and password** (same as the website). The app gets an API key and saves it for you — you never see or copy a key.
- If your server is not the default, edit **`.env`** in the install folder (e.g. `C:\Program Files\LawTrack Agent`) and set `LAWTRACK_API_URL=` to your backend URL (no trailing slash).
- **Right‑click the tray icon** → **Open LawTrack** to open the web app in your browser.

After that, the agent runs in the background and sends time to LawTrack. Use **Quit** from the tray menu to stop it.

---

## Building the installer (for you)

Build the single `.exe`, then build the Inno Setup installer.

### 1. One-time setup (Python + deps)

```bash
cd Agent
pip install -r requirements.txt
pip install pyinstaller
```

### 2. Build the executable

```bash
pyinstaller lawtrack_agent.spec
```

This creates **`dist/LawTrackAgent.exe`** (single file, no console window; tray only).

### 3. Build the installer (optional)

- Install [Inno Setup 6](https://jrsoftware.org/isinfo.php).
- From the `Agent` folder, run:

```bash
iscc installer.iss
```

- The installer will be **`installer_output/LawTrackAgent-Setup.exe`**. Send that file to your brother (or your firm); they run it once to install and optionally “Run when I sign in”.

### 4. Run without building an installer

- You can also ship **only** `dist/LawTrackAgent.exe` plus a **`.env`** file (same folder as the exe).  
- They run `LawTrackAgent.exe`; it will appear in the tray.  
- For “start with Windows”, they can put a shortcut to `LawTrackAgent.exe` in their **Startup** folder.

---

## Developer / scripted run

### Run from source (console)

```bash
cd Agent
pip install -r requirements.txt
# Create .env with LAWTRACK_API_URL and LAWTRACK_API_KEY
python main.py
```

Press Ctrl+C to stop.

### Run tray app from source

```bash
python app.py
```

Same as the installed app: tray icon, **Open LawTrack**, **Quit**. No console window when run as the built `.exe`.

---

## Config reference

| Variable | Description |
|----------|-------------|
| `LAWTRACK_API_URL` | Backend base URL (no trailing slash). |
| `LAWTRACK_API_KEY` | Required. From Profile → Auto-tracking agent → Create API key. |
| `LAWTRACK_MIN_SECONDS` | Ignore app switches shorter than this (default 60). |

---

## What it tracks

- **Documents:** Word, Excel, PowerPoint, Acrobat, Notepad, VS Code, etc.
- **Email:** Outlook, Thunderbird; Gmail/Outlook in Chrome/Edge/Firefox (filtered sites only).
- **Calls/meetings:** Zoom, Teams, Skype, WebEx (reported as “call”).
- **Browsers:** Only tracked sites (Gmail, Westlaw, Lexis, Drive, etc.). Other tabs are ignored.

Activities are posted to `{API_URL}/api/agent/activities` and can be auto-assigned via **Rules** when they match.

## Revoking or replacing your key

Profile → Auto-tracking agent → **Revoke key** or **Create new key**. Update `.env` with the new key and restart the agent (Quit from tray, then start again).
