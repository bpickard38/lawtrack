"""Find law-firm websites through Google Places, then research each firm site.

Google Places data is used transiently for discovery. The saved CSV contains
information independently collected from the firms' own public websites.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import httpx

from law_firm_scraper import crawl_site, normalize_url, registered_host, summarize
from spreadsheet_export import write_leads


PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = "places.id,places.websiteUri,nextPageToken"


def discover_websites(query: str, api_key: str, max_results: int, timeout: float) -> list[str]:
    """Return unique firm websites from Places Text Search (New)."""
    if not query.strip():
        raise ValueError("Google Maps query cannot be empty")
    if not api_key.strip():
        raise ValueError("Google Maps API key cannot be empty")
    if not 1 <= max_results <= 60:
        raise ValueError("max_results must be between 1 and 60")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    websites: list[str] = []
    seen_hosts: set[str] = set()
    seen_tokens: set[str] = set()
    page_token: str | None = None
    pages_requested = 0

    with httpx.Client(timeout=timeout) as client:
        while len(websites) < max_results and pages_requested < 3:
            body: dict[str, str | int] = {
                "textQuery": query.strip(),
                "pageSize": 20,
            }
            if page_token:
                if page_token in seen_tokens:
                    break
                seen_tokens.add(page_token)
                body["pageToken"] = page_token
            try:
                response = client.post(PLACES_URL, headers=headers, json=body)
            except httpx.HTTPError as exc:
                raise RuntimeError(f"Google Places request failed: {type(exc).__name__}") from exc
            pages_requested += 1
            if response.status_code != 200:
                raise RuntimeError(f"Google Places returned HTTP {response.status_code}")
            try:
                payload = response.json()
            except ValueError as exc:
                raise RuntimeError("Google Places returned an invalid JSON response") from exc
            if not isinstance(payload, dict):
                raise RuntimeError("Google Places returned an invalid response object")
            places = payload.get("places", [])
            if not isinstance(places, list):
                raise RuntimeError("Google Places returned an invalid places list")
            for place in places:
                if not isinstance(place, dict):
                    continue
                website_value = place.get("websiteUri")
                if not isinstance(website_value, str) or not website_value.strip():
                    continue
                website = normalize_url(website_value)
                website_host = registered_host(website)
                if website and website_host and website_host not in seen_hosts:
                    seen_hosts.add(website_host)
                    websites.append(website)
                    if len(websites) >= max_results:
                        break
            page_token = payload.get("nextPageToken")
            if not page_token:
                break
    return websites


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", help='Maps query, e.g. "family law firms in Provo, Utah"')
    parser.add_argument("output", type=Path, help="Destination .xlsx or .csv for website-verified leads")
    parser.add_argument("--max-results", type=int, default=20, help="Maximum candidate websites (1-60)")
    parser.add_argument("--max-pages", type=int, default=15, help="Maximum pages crawled per firm")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between firm-site requests")
    parser.add_argument("--timeout", type=float, default=15.0, help="Request timeout in seconds")
    parser.add_argument(
        "--api-key-env",
        default="GOOGLE_MAPS_API_KEY",
        help="Environment variable containing the Places API key",
    )
    args = parser.parse_args()
    if args.max_pages < 1 or args.delay < 0 or args.timeout <= 0:
        parser.error("max-pages and timeout must be positive; delay cannot be negative")

    api_key = os.environ.get(args.api_key_env, "")
    if not api_key:
        parser.error(f"Set the {args.api_key_env} environment variable to your Google Maps API key")

    websites = discover_websites(args.query, api_key, args.max_results, args.timeout)
    print(f"Google Maps found {len(websites)} candidate websites")
    rows: list[dict[str, str]] = []
    for index, website in enumerate(websites, start=1):
        print(f"[{index}/{len(websites)}] Researching {website}")
        pages = crawl_site(website, args.max_pages, args.delay, args.timeout)
        if pages:
            # Save the independently resolved destination from the firm's own
            # server, not Google's transient websiteUri discovery value.
            rows.append(summarize(pages[0].url, pages))

    empty_template = summarize("https://example.com", [])
    fieldnames = list(rows[0].keys()) if rows else list(empty_template.keys())
    try:
        write_leads(rows, args.output, fieldnames, args.query)
    except ValueError as exc:
        parser.error(str(exc))
    print(f"Wrote {len(rows)} website-verified firms to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
