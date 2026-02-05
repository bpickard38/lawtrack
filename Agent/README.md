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

After that, the agent runs in the background and sends time to LawTrack. Use **Quit** from the tray menu to stop it. From the website, **Open LawTrack Desktop** opens or controls the agent via `lawtrack://` links (open, pause, resume).

---

## Protocol registration (lawtrack://)

The website can launch or control the desktop app via custom URLs: `lawtrack://open`, `lawtrack://pause`, `lawtrack://resume`. Register the protocol so the OS passes these URLs to the agent.

### Windows

1. Install the agent first.
2. Run the registration script **as the user who will use the browser** (not necessarily admin):
   ```powershell
   cd Agent
   .\register_protocol.ps1
   ```
   If the agent is installed elsewhere, edit `register_protocol.ps1` and set `$exePath` to the full path to `LawTrackAgent.exe`.
3. Registry keys are created under `HKCU:\Software\Classes\lawtrack` with the command `"<path>\LawTrackAgent.exe" "%1"` so the full URL (e.g. `lawtrack://open`) is passed to the exe.

### macOS

1. Install the agent (e.g. .app bundle).
2. Register the protocol with the app’s **bundle identifier** and **bundle path**:
   - In the app’s `Info.plist`, add a **CFBundleURLTypes** entry:
     ```xml
     <key>CFBundleURLTypes</key>
     <array>
       <dict>
         <key>CFBundleURLName</key>
         <string>LawTrack Agent</string>
         <key>CFBundleURLSchemes</key>
         <array><string>lawtrack</string></array>
         <key>CFBundleRole</key>
         <string>Viewer</string>
       </dict>
     </array>
     ```
   - Rebuild/reinstall the app so the OS associates `lawtrack://` with your app. When the user clicks a `lawtrack://` link, macOS will pass the URL as an argument to the app (e.g. in `application:openURL:options:` or as a process argument).
3. In the desktop app, handle the URL (e.g. parse `open` / `pause` / `resume` and, if another instance is running, send the command via IPC; otherwise run the command in this process).

### Verification

**Windows**

1. Install the agent (or run `register_protocol.ps1` after install if the installer didn’t register the protocol).
2. In the browser, go to the LawTrack app and click **Open LawTrack Desktop**. The first time, Windows may ask “Open LawTrack Agent?” — choose **Open**.
3. If the agent is already running: the existing process receives the URL and opens the web app in your browser (no second window). If not running: the agent starts and shows the tray icon.
4. If nothing happens: run `reg query HKCU\Software\Classes\lawtrack\shell\open\command` and confirm the default value is `"C:\Program Files\LawTrack Agent\LawTrackAgent.exe" "%1"` (path may differ). If missing, run `.\register_protocol.ps1`.

**macOS**

1. Build the app with `CFBundleURLTypes` and scheme `lawtrack` in `Info.plist`.
2. In Safari (or another browser), click a link to `lawtrack://open`. The first time, you may be prompted to allow the app to open.
3. If nothing happens: in Terminal run `open "lawtrack://open"` and confirm the agent opens or receives the URL.

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
