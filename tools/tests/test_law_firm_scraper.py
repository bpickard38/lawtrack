import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from law_firm_scraper import normalize_phone, normalize_url, parse_page, read_seeds, size_band, summarize


class ScraperTests(unittest.TestCase):
    def test_extracts_public_contact_and_json_ld_name(self):
        html = """
        <html><head><title>Fallback Law</title>
        <script type="application/ld+json">{"@type":"LegalService","name":"Wasatch Legal"}</script>
        </head><body>
        <a href="mailto:info@wasatch.test">Email</a>
        <a href="tel:+18015551234">Call</a>
        <a href="/attorneys/jane-doe">Jane Doe, Partner</a>
        </body></html>
        """
        page = parse_page("https://wasatch.test/attorneys", html)
        row = summarize("https://wasatch.test", [page])
        self.assertEqual(row["firm_name"], "Wasatch Legal")
        self.assertEqual(row["business_emails"], "info@wasatch.test")
        self.assertEqual(row["phones"], "(801) 555-1234")
        self.assertEqual(row["estimated_lawyers"], "1")
        self.assertEqual(row["firm_size"], "small (1-10 lawyers)")

    def test_phone_and_size_boundaries(self):
        self.assertEqual(normalize_phone("801.555.1234"), "(801) 555-1234")
        self.assertEqual(normalize_phone("123"), "")
        self.assertEqual(size_band(10), "small (1-10 lawyers)")
        self.assertEqual(size_band(11), "midsize (11-50 lawyers)")
        self.assertEqual(size_band(51), "large (51+ lawyers)")
        self.assertEqual(size_band(None), "unknown")

    def test_does_not_treat_assets_as_contacts(self):
        page = parse_page(
            "https://firm.test/",
            '<img src="logo@example.com.png"><p>Fax ref 12345</p><a href="/contact">Contact</a>',
        )
        self.assertEqual(page.emails, set())
        self.assertEqual(page.phones, set())

    def test_ignores_contacts_inside_scripts_and_styles(self):
        page = parse_page(
            "https://firm.test/",
            "<script>const email='outsider@example.com'</script>"
            "<style>.x{content:'801-555-9999'}</style><p>Welcome</p>",
        )
        self.assertEqual(page.emails, set())
        self.assertEqual(page.phones, set())

    def test_uppercase_scheme_and_query_are_preserved(self):
        self.assertEqual(
            normalize_url("HTTPS://WWW.Example.COM/search?page=2#team"),
            "https://www.example.com/search?page=2",
        )

    def test_profile_links_take_precedence_over_visible_name_fallback(self):
        html = """
        <title>Firm</title><body>
        <a href="/team/jane-doe">Jane Doe</a><p>Jane Doe Partner</p>
        <a href="/team/john-roe">John Roe</a><p>John Roe Associate</p>
        </body>
        """
        row = summarize("https://firm.test", [parse_page("https://firm.test/team", html)])
        self.assertEqual(row["estimated_lawyers"], "2")

    def test_header_only_seed_csv_is_valid(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "seeds.csv"
            path.write_text("website\n", encoding="utf-8")
            self.assertEqual(read_seeds(path), [])


if __name__ == "__main__":
    unittest.main()
