from types import SimpleNamespace

import pytest

from rules import match_rule, first_matching_case


def rule(rule_type, pattern, case_id=1):
    return SimpleNamespace(rule_type=rule_type, pattern=pattern, case_id=case_id)


@pytest.mark.parametrize("rule_type,pattern,activity,expected", [
    ("document_contains", "smith v jones", {"document_name": "SMITH V JONES - Motion.docx"}, True),
    ("document_contains", "smith", {"document_name": None}, False),
    ("email_subject_contains", "estate", {"email_subject": "Johnson Estate update"}, True),
    ("email_from_contains", "dchen", {"email_from": "dchen@chenlabs.io"}, True),
    ("email_domain_equals", "acmecorp.com", {"email_from": "cfo@AcmeCorp.com"}, True),
    ("email_domain_equals", "acmecorp.com", {"email_from": "cfo@notacmecorp.com"}, False),
    ("email_domain_equals", "acmecorp.com", {"email_from": "no-at-sign"}, False),
    ("contact_name_contains", "martinez", {"contact_name": "Elena Martinez"}, True),
    ("description_contains", "deposition", {"description": "Prep for deposition"}, True),
    ("unknown_rule_type", "x", {"description": "x"}, False),
])
def test_match_rule(rule_type, pattern, activity, expected):
    assert match_rule(rule(rule_type, pattern), activity) is expected


def test_first_matching_case_respects_order():
    rules = [rule("document_contains", "motion", case_id=7), rule("document_contains", "smith", case_id=3)]
    assert first_matching_case(rules, {"document_name": "Smith motion.docx"}) == 7


def test_first_matching_case_none_when_no_match():
    assert first_matching_case([rule("document_contains", "zzz")], {"document_name": "abc"}) is None
