import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google_maps_law_firm_finder import discover_websites


class GoogleMapsFinderTests(unittest.TestCase):
    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_discovers_deduplicates_and_paginates_websites(self, client_class):
        first = Mock(status_code=200)
        first.json.return_value = {
            "places": [
                {"id": "one", "websiteUri": "https://firm.test/"},
                {"id": "duplicate", "websiteUri": "https://firm.test"},
            ],
            "nextPageToken": "next-token",
        }
        second = Mock(status_code=200)
        second.json.return_value = {
            "places": [{"id": "two", "websiteUri": "https://second.test/contact"}]
        }
        client = client_class.return_value.__enter__.return_value
        client.post.side_effect = [first, second]

        result = discover_websites("family law firms in Provo, Utah", "secret", 10, 5)

        self.assertEqual(result, ["https://firm.test/", "https://second.test/contact"])
        self.assertEqual(client.post.call_count, 2)
        self.assertEqual(client.post.call_args_list[1].kwargs["json"]["pageToken"], "next-token")
        self.assertEqual(client.post.call_args_list[1].kwargs["json"]["pageSize"], 20)

    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_stops_on_repeated_token(self, client_class):
        response = Mock(status_code=200)
        response.json.return_value = {"places": [], "nextPageToken": "same-token"}
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response

        self.assertEqual(discover_websites("law firms", "secret", 20, 5), [])
        self.assertEqual(client.post.call_count, 2)

    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_caps_search_at_three_pages(self, client_class):
        responses = []
        for token in ("two", "three", "four"):
            response = Mock(status_code=200)
            response.json.return_value = {"places": [], "nextPageToken": token}
            responses.append(response)
        client = client_class.return_value.__enter__.return_value
        client.post.side_effect = responses

        self.assertEqual(discover_websites("law firms", "secret", 60, 5), [])
        self.assertEqual(client.post.call_count, 3)

    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_deduplicates_different_paths_on_same_domain(self, client_class):
        response = Mock(status_code=200)
        response.json.return_value = {
            "places": [
                {"websiteUri": "https://firm.test/"},
                {"websiteUri": "https://www.firm.test/contact?utm_source=maps"},
            ]
        }
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response

        self.assertEqual(discover_websites("law firms", "secret", 20, 5), ["https://firm.test/"])

    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_reports_invalid_json_without_exposing_key(self, client_class):
        response = Mock(status_code=200)
        response.json.side_effect = ValueError("bad json")
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response
        with self.assertRaisesRegex(RuntimeError, "invalid JSON") as caught:
            discover_websites("law firms", "super-secret", 20, 5)
        self.assertNotIn("super-secret", str(caught.exception))

    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_ignores_null_website(self, client_class):
        response = Mock(status_code=200)
        response.json.return_value = {"places": [{"websiteUri": None}]}
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response
        self.assertEqual(discover_websites("law firms", "secret", 20, 5), [])

    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_rejects_non_object_payload(self, client_class):
        response = Mock(status_code=200)
        response.json.return_value = []
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response
        with self.assertRaisesRegex(RuntimeError, "invalid response object"):
            discover_websites("law firms", "secret", 20, 5)

    @patch("google_maps_law_firm_finder.httpx.Client")
    def test_http_error_does_not_echo_api_key(self, client_class):
        response = Mock(status_code=403, text="invalid key super-secret")
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response
        with self.assertRaises(RuntimeError) as caught:
            discover_websites("law firms", "super-secret", 20, 5)
        self.assertNotIn("super-secret", str(caught.exception))

    def test_validates_inputs(self):
        with self.assertRaises(ValueError):
            discover_websites("", "key", 10, 5)
        with self.assertRaises(ValueError):
            discover_websites("law firms", "", 10, 5)
        with self.assertRaises(ValueError):
            discover_websites("law firms", "key", 61, 5)


if __name__ == "__main__":
    unittest.main()
