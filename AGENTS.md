# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

## Subagents

Subagents are lightweight agents (Sonnet 4.5) with self-contained contexts, defined in `.Codex/agents/`. They're cheaper, unbiased (no parent context leakage), and keep the parent context clean.

### Available Subagents
- `code-reviewer` - Unbiased code review with zero context. Returns issues by severity with a PASS/FAIL verdict.
- `research` - Deep research via web search, file reads, and codebase exploration. Returns concise sourced findings.
- `qa` - Generates tests for a code snippet, runs them, and reports pass/fail results.
- `email-classifier` - Classifies Gmail emails into Action Required, Waiting On, Reference.

### Design & Build Workflow

When building or modifying any non-trivial code (scripts, features, refactors), follow this loop:

1. **Write/edit the code** — Make your changes.
2. **Code Review** — Spawn `code-reviewer` subagent with the changed file(s). It reports issues back — it does NOT fix anything itself.
3. **QA** — Spawn `qa` subagent with the code. It generates tests, runs them, and reports results back — it does NOT fix anything itself.
4. **Fix** — The parent agent (you) reads the review and QA reports and applies all fixes.
5. **Ship** — Only after review passes and tests pass.

**Important:** Subagents are read-only reporters. All code changes happen in the parent agent.

For research-heavy tasks, spawn `research` subagent first to gather context without polluting the main conversation.

**Parallel execution:** When reviewing + QA'ing independent files, spawn both subagents in parallel using `run_in_background: true`.

## Operating Principles

**1. Skills auto-activate**
Codex picks the right Skill based on your request. Each Skill's description tells Codex when to use it.

**2. Scripts are bundled**
Each Skill has its own `scripts/` folder. Run scripts from there:
```bash
python3 .Codex/skills/scrape-leads/scripts/scrape_apify.py ...
```

**3. Self-anneal when things break**
- Read error message and stack trace
- Fix the script and test it again
- Update SKILL.md with what you learned
- System is now stronger

**4. Update Skills as you learn**
Skills are living documents. When you discover API constraints, better approaches, or edge cases—update the SKILL.md. But don't create new Skills without asking.

## Self-annealing loop

Errors are learning opportunities. When something breaks:
1. Fix the script
2. Test it
3. Update SKILL.md with new flow
4. System is now stronger

## File Organization

**Deliverables vs Intermediates:**
- **Deliverables**: Google Sheets, Google Slides, or other cloud-based outputs
- **Intermediates**: Temporary files needed during processing

**Directory structure:**
- `.Codex/skills/` - Skills (SKILL.md + scripts/)
- `.tmp/` - Intermediate files (never commit)
- `execution/` - Shared utilities and infrastructure
- `.env` - Environment variables and API keys
- `credentials.json`, `token.json` - Google OAuth credentials

**Key principle:** Local files are only for processing. Deliverables live in cloud services where the user can access them.