# LawTrack Auto-Tracking Agent

Desktop agent that tracks active windows (Word, Outlook, browsers, etc.) and sends activities to LawTrack. Runs on Windows.

## Setup

1. **Create an API key**  
   Sign in to LawTrack → Profile → **Auto-tracking agent** → **Create API key**. Copy the key; it’s shown only once.

2. **Install dependencies**
   ```bash
   cd Agent
   pip install -r requirements.txt
   ```

3. **Configure**
   - **Option A:** `.env` in the `Agent` folder:
     ```
     LAWTRACK_API_URL=https://your-backend.up.railway.app
     LAWTRACK_API_KEY=lt_your_key_here
     LAWTRACK_MIN_SECONDS=60
     ```
   - **Option B:** Environment variables `LAWTRACK_API_URL`, `LAWTRACK_API_KEY`, `LAWTRACK_MIN_SECONDS`.

   - `LAWTRACK_API_URL`: Backend base URL (no trailing slash). Default: `http://localhost:8000`.
   - `LAWTRACK_API_KEY`: Required. Create in Profile → Auto-tracking agent.
   - `LAWTRACK_MIN_SECONDS`: Ignore app switches shorter than this (default 60).

## Run

```bash
cd Agent
python main.py
```

Press Ctrl+C to stop. Activities are posted to `{API_URL}/api/agent/activities` and auto-assigned via your **Rules** when they match.

## What it tracks

- **Documents:** Word, Excel, PowerPoint, Acrobat, Notepad, VS Code, etc.
- **Email:** Outlook, Thunderbird; Gmail/Outlook in Chrome/Edge/Firefox (filtered sites only).
- **Calls/meetings:** Zoom, Teams, Skype, WebEx (reported as “call”).
- **Browsers:** Only tracked sites (Gmail, Westlaw, Lexis, Drive, etc.). Other tabs are ignored.

## Revoking or replacing your key

Profile → Auto-tracking agent → **Revoke key** or **Create new key**. Update `.env` / env with the new key and restart the agent.
