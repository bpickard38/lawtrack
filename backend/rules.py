"""
Case auto-assignment rule matching.

Kept free of FastAPI/DB imports so it can be reused by the API, the demo
seeder, and unit tests.
"""
from typing import Any, Iterable, Optional


def match_rule(rule: Any, activity_data: dict) -> bool:
    """Check if an activity matches a case rule (case-insensitive).

    `rule` is anything with `rule_type` and `pattern` attributes (a CaseRule row
    or a lightweight stand-in).
    """
    pattern = rule.pattern.lower()
    rule_type = rule.rule_type

    if rule_type == "document_contains":
        doc_name = (activity_data.get("document_name") or "").lower()
        return pattern in doc_name
    elif rule_type == "email_subject_contains":
        subject = (activity_data.get("email_subject") or "").lower()
        return pattern in subject
    elif rule_type == "email_from_contains":
        email_from = (activity_data.get("email_from") or "").lower()
        return pattern in email_from
    elif rule_type == "email_domain_equals":
        email_from = activity_data.get("email_from") or ""
        if "@" in email_from:
            domain = email_from.split("@")[1].lower()
            return domain == pattern
        return False
    elif rule_type == "contact_name_contains":
        contact = (activity_data.get("contact_name") or "").lower()
        return pattern in contact
    elif rule_type == "description_contains":
        desc = (activity_data.get("description") or "").lower()
        return pattern in desc
    return False


def first_matching_case(rules: Iterable[Any], activity_data: dict) -> Optional[int]:
    """Return the case_id of the first matching rule. Callers pass rules already
    filtered to enabled ones and sorted by priority (highest first)."""
    for rule in rules:
        if match_rule(rule, activity_data):
            return rule.case_id
    return None
