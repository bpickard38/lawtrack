# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

The app is deployed on **Vercel** (frontend) connected to the **GitHub repo `bpickard38/lawtrack`** on the `main` branch. After making any code changes, always commit and push to `main` so Vercel picks up the update automatically. A git hook auto-commits and pushes on save, so verify with `git log --oneline origin/main` that changes are pushed.

## Project Overview

LawTrack is a time tracking and billing system for legal professionals with three components:
- **Frontend**: React/TypeScript SPA (Vite, port 5173)
- **Backend**: FastAPI REST API (PostgreSQL, port 8000)
- **Agent**: Windows desktop tray app for automatic activity tracking

## Development Commands

### Backend
```bash
cd backend
.\venv\Scripts\Activate.ps1   # Windows: activate virtual environment
uvicorn main:app --reload      # Start dev server on port 8000
python init_db.py              # Initialize database with sample data
```

### Frontend
```bash
cd frontend
npm run dev     # Start Vite dev server on port 5173
npm run build   # Production build
```

### Agent (Windows only)
```bash
cd Agent
pip install -r requirements.txt
python main.py   # CLI version
python app.py    # System tray version
```

## Architecture

### Frontend (`frontend/src/`)
- **App.tsx** — Router; wraps all routes in `AuthContext` provider
- **AuthContext.tsx** — Global auth state (user, attorney, JWT token stored in `localStorage` as `auth_token`)
- **api.ts** — All fetch calls to backend; all calls pass `Authorization: Bearer <token>`
- **types.ts** — Shared TypeScript interfaces (Activity, Case, Attorney, etc.)
- **components/Timesheet.tsx** — Main activity entry and timeline view
- **components/CaseReports.tsx** — Billing reports and time summaries (largest component)
- **components/CaseRules.tsx** — Auto-assignment rule management
- **components/Profile.tsx** — User settings and agent API key management
- **utils/invoicePdf.ts** — PDF invoice generation via jsPDF

### Backend (`backend/`)
- **main.py** — All FastAPI routes (~1,063 lines, 47+ endpoints)
- **models.py** — SQLAlchemy ORM: `users`, `firms`, `attorneys`, `cases`, `activities`, `case_rules`, `agent_api_keys`
- **schemas.py** — Pydantic request/response validation
- **auth_utils.py** — JWT creation/verification, password hashing (bcrypt)
- **database.py** — PostgreSQL connection via `DATABASE_URL` env var

### Agent (`Agent/`)
- **tracker.py** — Win32 API: monitors foreground window every ~1 second
- **classifier.py** — Categorizes apps as document/email/call/browser
- **sender.py** — POSTs time blocks to `/api/agent/activities`
- **app.py** — System tray entry point (PyInstaller build target)

## Key Patterns

**Multi-tenancy**: All data is scoped by `firm_id`; attorneys belong to firms.

**Roles**: Three roles — `attorney` (standard), `billing` (reports-only), `admin`.

**Auto-assignment**: When the Agent logs an activity, the backend matches it against `case_rules` (regex patterns on document name, email subject/from/domain, contact name) in priority order to auto-assign a case.

**Agent auth**: Desktop agent authenticates with a per-attorney API key (generated in Profile), not the regular JWT. The key is stored locally in `%LOCALAPPDATA%\LawTrackAgent\.env`.

**Activity types**: `document`, `email`, `call` — used for billing breakdowns in reports.

## Database

PostgreSQL. Connection string set via `DATABASE_URL` environment variable in `backend/.env`. Run `python init_db.py` to create tables and seed sample data.
