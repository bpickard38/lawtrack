"""
Public demo account.

Anyone can sign in with DEMO_EMAIL / DEMO_PASSWORD. The account lives in its
own firm, is rebuilt from scratch on login once it's older than
DEMO_REFRESH_AFTER (so timestamps stay current and visitor edits get wiped),
and is protected from password/email changes and deletion in main.py.

Set DEMO_ACCOUNT_ENABLED=false to turn it off on a deployment.
"""
import os
import random
from datetime import datetime, timedelta, timezone, date, time
from types import SimpleNamespace
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from models import Firm, User, Attorney, Case, Activity, CaseRule, AgentApiKey, UserRole
from auth_utils import get_password_hash
from rules import first_matching_case

DEMO_EMAIL = "demo@lawtrack.app"
DEMO_PASSWORD = "demo1234"
DEMO_REFRESH_AFTER = timedelta(hours=1)
_RESEED_LOCK_ID = 7_412_001  # arbitrary constant for pg_advisory_xact_lock


def demo_enabled() -> bool:
    return os.getenv("DEMO_ACCOUNT_ENABLED", "true").strip().lower() not in ("0", "false", "no")


def is_demo_user(user: Optional[User]) -> bool:
    # Not gated on demo_enabled(): registration rejects DEMO_EMAIL, so this can
    # only ever be the seeded account, whose password is public either way.
    return user is not None and user.email == DEMO_EMAIL


def _demo_tz():
    """Working hours are generated in this zone, then stored as naive UTC like
    everything else the API writes."""
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(os.getenv("DEMO_TZ", "America/New_York"))
    except Exception:
        return timezone(timedelta(hours=-5))


# (name, client) - index is referenced by RULES and TEMPLATES below
CASES = [
    ("Smith v. Jones", "Robert Smith"),
    ("Johnson Estate Administration", "Mary Johnson"),
    ("Acme Corp - Series B Financing", "Acme Corporation"),
    ("Martinez Custody Modification", "Elena Martinez"),
    ("Riverside Plaza Lease Dispute", "Riverside Holdings LLC"),
    ("Chen Patent Application", "David Chen"),
]

# (case index, rule_type, pattern, priority)
RULES = [
    (0, "document_contains", "smith v jones", 10),
    (0, "email_subject_contains", "smith v. jones", 10),
    (1, "email_subject_contains", "johnson estate", 5),
    (1, "document_contains", "johnson_estate", 5),
    (2, "email_domain_equals", "acmecorp.com", 8),
    (2, "document_contains", "acme", 8),
    (3, "contact_name_contains", "martinez", 5),
    (4, "document_contains", "riverside", 5),
    (5, "email_from_contains", "dchen", 3),
]

# Activity templates. `case` is the matter a lawyer would assign it to when the
# rules don't catch it (None = genuinely non-billable / admin).
TEMPLATES = [
    {"type": "document", "document_name": "Smith v Jones - Motion to Compel.docx", "case": 0,
     "narrative": "Draft motion to compel discovery responses"},
    {"type": "document", "document_name": "Smith v Jones - Deposition Outline (R. Smith).docx", "case": 0,
     "narrative": "Prepare deposition outline for client"},
    {"type": "email", "email_from": "opposing.counsel@kesslerlaw.com", "email_subject": "RE: Smith v. Jones - discovery schedule", "case": 0,
     "narrative": "Correspondence with opposing counsel re discovery schedule"},
    {"type": "call", "contact_name": "Robert Smith", "phone_number": "(555) 201-4410", "case": 0,
     "narrative": "Call with client re deposition preparation"},
    {"type": "document", "document_name": "Johnson_Estate - Inventory of Assets.xlsx", "case": 1,
     "narrative": "Update estate asset inventory"},
    {"type": "email", "email_from": "mary.johnson@gmail.com", "email_subject": "Johnson Estate - appraisal received", "case": 1,
     "narrative": "Review appraisal and respond to executor"},
    {"type": "document", "document_name": "Acme Series B - Stock Purchase Agreement v4.docx", "case": 2,
     "narrative": "Revise stock purchase agreement"},
    {"type": "email", "email_from": "cfo@acmecorp.com", "email_subject": "Cap table questions", "case": 2,
     "narrative": "Respond to CFO re capitalization table"},
    {"type": "email", "email_from": "legal@acmecorp.com", "email_subject": "Disclosure schedule comments", "case": 2,
     "narrative": "Review client comments on disclosure schedules"},
    {"type": "call", "contact_name": "Elena Martinez", "phone_number": "(555) 830-1172", "case": 3,
     "narrative": "Call with client re custody schedule proposal"},
    {"type": "document", "document_name": "Parenting Plan - Proposed Modifications.docx", "case": 3,
     "narrative": "Draft proposed parenting plan modifications"},
    {"type": "document", "document_name": "Riverside Plaza - Lease Amendment Redline.pdf", "case": 4,
     "narrative": "Review landlord's lease amendment redline"},
    {"type": "call", "contact_name": "Tom Alvarez (Riverside Holdings)", "phone_number": "(555) 664-0098", "case": 4,
     "narrative": "Strategy call with client re lease default notice"},
    {"type": "email", "email_from": "dchen@chenlabs.io", "email_subject": "Updated claims draft", "case": 5,
     "narrative": "Review inventor's comments on claim set"},
    {"type": "document", "document_name": "Provisional Application - Claims Draft.docx", "case": 5,
     "narrative": "Draft independent claims"},
    # Not caught by any rule - shows up in the review queue as unassigned
    {"type": "document", "document_name": "Research memo - statute of limitations.docx", "case": 0,
     "narrative": "Research statute of limitations defenses"},
    {"type": "email", "email_from": "paralegal@harpervale.com", "email_subject": "Filing deadlines this week", "case": None},
    {"type": "document", "document_name": "Bar Association CLE Materials.pdf", "case": None},
]

DESCRIPTIONS = {"document": "Working on {document_name}", "email": "Email: {email_subject}", "call": "Call with {contact_name}"}


def _status_for_day(days_ago: int) -> str:
    if days_ago >= 9:
        return "invoiced"
    if days_ago >= 4:
        return "approved"
    if days_ago >= 2:
        return "edited"
    return "captured"


def _workdays(today: date, count: int):
    d = today
    out = []
    while len(out) < count:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return out


def wipe_demo(db: Session) -> None:
    """Delete the demo firm's rows, children first. Does not commit - the caller
    commits the wipe and the reseed together so there's never a moment with no
    demo account."""
    user = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if not user:
        return
    user_id, firm_id = user.id, user.firm_id
    attorney = db.query(Attorney).filter(Attorney.user_id == user_id).first()
    if attorney:
        attorney_id = attorney.id
        db.query(Activity).filter(Activity.attorney_id == attorney_id).delete()
        db.query(CaseRule).filter(CaseRule.attorney_id == attorney_id).delete()
        db.query(AgentApiKey).filter(AgentApiKey.attorney_id == attorney_id).delete()
        db.query(Case).filter(Case.attorney_id == attorney_id).delete()
        db.query(Attorney).filter(Attorney.id == attorney_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    if firm_id:
        db.query(Firm).filter(Firm.id == firm_id).delete()
    db.expunge_all()


def seed_demo(db: Session, now: Optional[datetime] = None) -> User:
    """(Re)create the demo firm, attorney, matters, rules and ~2 weeks of activity."""
    wipe_demo(db)
    now_utc = now or datetime.now(timezone.utc)
    now_utc = now_utc.replace(tzinfo=timezone.utc) if now_utc.tzinfo is None else now_utc.astimezone(timezone.utc)
    tz = _demo_tz()
    local_now = now_utc.astimezone(tz)

    firm = Firm(name="Harper & Vale LLP", created_at=now_utc.replace(tzinfo=None))
    db.add(firm)
    db.flush()

    user = User(
        firm_id=firm.id,
        email=DEMO_EMAIL,
        hashed_password=get_password_hash(DEMO_PASSWORD),
        full_name="Jordan Harper",
        role=UserRole.ATTORNEY.value,
    )
    db.add(user)
    db.flush()

    attorney = Attorney(
        firm_id=firm.id,
        user_id=user.id,
        name="Jordan Harper",
        email=DEMO_EMAIL,
        billable_rate=375.00,
        onboarding_completed=True,
    )
    db.add(attorney)
    db.flush()

    cases = []
    for name, client in CASES:
        case = Case(firm_id=firm.id, name=name, client_name=client, attorney_id=attorney.id)
        db.add(case)
        cases.append(case)
    db.flush()

    rules = []
    for case_idx, rule_type, pattern, priority in RULES:
        rule = CaseRule(
            firm_id=firm.id, attorney_id=attorney.id, case_id=cases[case_idx].id,
            rule_type=rule_type, pattern=pattern, priority=priority, enabled=True,
        )
        db.add(rule)
        rules.append(rule)
    db.flush()
    rules.sort(key=lambda r: (-r.priority, r.id))

    rng = random.Random(local_now.date().toordinal())
    for day in _workdays(local_now.date(), 10):
        days_ago = (local_now.date() - day).days
        status = _status_for_day(days_ago)
        cursor = datetime.combine(day, time(8, 45), tzinfo=tz) + timedelta(minutes=rng.randint(0, 25))
        day_end = datetime.combine(day, time(18, 0), tzinfo=tz)
        if day == local_now.date():
            day_end = min(day_end, local_now)

        while True:
            tpl = rng.choice(TEMPLATES)
            minutes = {"document": rng.choice([24, 36, 48, 54, 72, 90]),
                       "email": rng.choice([6, 12, 12, 18]),
                       "call": rng.choice([12, 18, 24, 30])}[tpl["type"]]
            start, end = cursor, cursor + timedelta(minutes=minutes)
            if end > day_end:
                break

            fields = {k: v for k, v in tpl.items() if k not in ("case", "narrative")}
            fields["description"] = DESCRIPTIONS[tpl["type"]].format(**{**dict.fromkeys(["document_name", "email_subject", "contact_name"], ""), **fields})
            rule_case = first_matching_case(rules, fields)
            case_id = rule_case
            if case_id is None and status != "captured" and tpl["case"] is not None:
                case_id = cases[tpl["case"]].id  # reviewed and assigned by hand

            db.add(Activity(
                firm_id=firm.id,
                attorney_id=attorney.id,
                case_id=case_id,
                start_time=start.astimezone(timezone.utc).replace(tzinfo=None),
                end_time=end.astimezone(timezone.utc).replace(tzinfo=None),
                duration_minutes=minutes,
                source="manual" if tpl["type"] == "call" and rng.random() < 0.3 else "agent",
                is_billable=tpl["case"] is not None,
                narrative=tpl.get("narrative") if status != "captured" else None,
                status=status,
                confidence="high" if rule_case else None,
                **fields,
            ))
            cursor = end + timedelta(minutes=rng.choice([0, 0, 3, 6, 10, 20, 45]))

    db.commit()
    db.refresh(user)
    return user


def _is_fresh(db: Session) -> bool:
    user = db.query(User).filter(User.email == DEMO_EMAIL).first()
    firm = db.query(Firm).filter(Firm.id == user.firm_id).first() if user and user.firm_id else None
    if not firm or not firm.created_at:
        return False
    return datetime.now(timezone.utc).replace(tzinfo=None) - firm.created_at < DEMO_REFRESH_AFTER


def ensure_fresh_demo(db: Session) -> None:
    """Called on demo login: create the account if missing, rebuild it if stale.

    On Postgres, concurrent logins serialize on an advisory lock and re-check
    freshness once they hold it, so only the first one reseeds and the rest
    sign into what it built. The wipe and reseed commit as one transaction.
    """
    if not demo_enabled() or _is_fresh(db):
        return
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _RESEED_LOCK_ID})
        if _is_fresh(db):
            db.commit()  # releases the lock
            return
    seed_demo(db)
