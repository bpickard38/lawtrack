"""Crawl public law-firm websites and create a qualified lead CSV.

The crawler stays on the supplied firm's domain, respects robots.txt, and records
source pages so every extracted business contact can be traced.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import socket
import time
import urllib.robotparser
from collections import deque
from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import httpx

from spreadsheet_export import write_leads


USER_AGENT = "LawTrackFirmResearch/1.0 (+website research; respects robots.txt)"
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\+?1[\s.()-]*)?(?:\(?\d{3}\)?[\s.()-]*)\d{3}[\s.-]*\d{4}")
LAWYER_WORDS = re.compile(
    r"\b(attorneys?|lawyers?|counsel|partners?|associates?|shareholders?|of counsel)\b", re.I
)
TEAM_HINTS = ("attorney", "lawyer", "people", "professional", "team", "our-firm", "about")
CONTACT_HINTS = ("contact", "about", "location")
EXCLUDED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".zip", ".doc", ".docx")
GENERIC_EMAIL_PREFIXES = {"info", "hello", "contact", "office", "admin", "reception", "intake", "support"}
PRACTICE_KEYWORDS = {
    "family law": ("family law", "divorce", "child custody"),
    "civil litigation": ("civil litigation", "commercial litigation", "business litigation"),
    "business law": ("business law", "corporate law", "general counsel"),
    "employment law": ("employment law", "labor law"),
    "real estate": ("real estate", "land use", "zoning"),
    "estate/trust": ("estate planning", "probate", "trust administration"),
    "criminal defense": ("criminal defense", "dui defense"),
    "personal injury": ("personal injury", "car accident"),
    "immigration": ("immigration law", "immigration attorney"),
    "bankruptcy": ("bankruptcy",),
}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.mailtos: list[str] = []
        self.tels: list[str] = []
        self.text_parts: list[str] = []
        self.title_parts: list[str] = []
        self.json_ld_parts: list[str] = []
        self._in_title = False
        self._in_script_ld = False
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag in {"style", "noscript"} or (tag == "script" and "ld+json" not in (values.get("type") or "").lower()):
            self._ignored_depth += 1
            return
        if tag == "a" and values.get("href"):
            href = values["href"] or ""
            self.links.append(href)
            if href.lower().startswith("mailto:"):
                self.mailtos.append(href[7:].split("?", 1)[0])
            if href.lower().startswith("tel:"):
                self.tels.append(href[4:].split("?", 1)[0])
        elif tag == "title":
            self._in_title = True
        elif tag == "script" and "ld+json" in (values.get("type") or "").lower():
            self._in_script_ld = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"style", "noscript"} or (tag == "script" and not self._in_script_ld):
            self._ignored_depth = max(0, self._ignored_depth - 1)
            return
        if tag == "title":
            self._in_title = False
        elif tag == "script":
            self._in_script_ld = False

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        cleaned = " ".join(data.split())
        if not cleaned:
            return
        if self._in_script_ld:
            self.json_ld_parts.append(data)
        else:
            self.text_parts.append(cleaned)
            if self._in_title:
                self.title_parts.append(cleaned)


@dataclass
class Page:
    url: str
    title: str
    text: str
    links: list[str]
    emails: set[str] = field(default_factory=set)
    phones: set[str] = field(default_factory=set)
    organization_names: list[str] = field(default_factory=list)


def normalize_url(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if "://" not in value:
        value = "https://" + value
    parsed = urlparse(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        return ""
    path = parsed.path or "/"
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path.rstrip("/") or "/", "", parsed.query, ""))


def registered_host(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def origin(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def is_public_url(url: str) -> bool:
    """Reject credentials and addresses that resolve to non-public networks."""
    normalized = normalize_url(url)
    parsed = urlparse(normalized)
    if not normalized or parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443)}
    except socket.gaierror:
        return False
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            return False
    return True


class RequestPacer:
    def __init__(self, delay: float) -> None:
        self.delay = delay
        self.last_request = 0.0

    def wait(self) -> None:
        remaining = self.delay - (time.monotonic() - self.last_request)
        if remaining > 0:
            time.sleep(remaining)
        self.last_request = time.monotonic()


@dataclass
class FetchResult:
    status_code: int
    url: str
    headers: dict[str, str]
    content: bytes
    oversized: bool = False


def fetch_limited(
    client: httpx.Client, url: str, pacer: RequestPacer, max_bytes: int
) -> FetchResult:
    """Fetch without buffering an unbounded response body in memory."""
    pacer.wait()
    with client.stream("GET", url) as response:
        length = response.headers.get("content-length", "")
        if length.isdigit() and int(length) > max_bytes:
            return FetchResult(response.status_code, str(response.url), dict(response.headers), b"", True)
        chunks: list[bytes] = []
        total = 0
        for chunk in response.iter_bytes():
            total += len(chunk)
            if total > max_bytes:
                return FetchResult(response.status_code, str(response.url), dict(response.headers), b"", True)
            chunks.append(chunk)
        return FetchResult(response.status_code, str(response.url), dict(response.headers), b"".join(chunks))


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return ""
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def json_ld_names(chunks: list[str]) -> list[str]:
    names: list[str] = []
    for chunk in chunks:
        try:
            value = json.loads(chunk)
        except (json.JSONDecodeError, TypeError):
            continue
        items = value if isinstance(value, list) else [value]
        for item in items:
            if not isinstance(item, dict):
                continue
            candidates = item.get("@graph", []) if isinstance(item.get("@graph"), list) else [item]
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                kind = candidate.get("@type", "")
                kinds = kind if isinstance(kind, list) else [kind]
                if any(str(k).lower() in {"legalservice", "organization", "localbusiness"} for k in kinds):
                    name = candidate.get("name")
                    if isinstance(name, str) and name.strip():
                        names.append(" ".join(name.split()))
    return names


def parse_page(url: str, html: str) -> Page:
    parser = PageParser()
    parser.feed(html)
    text = " ".join(parser.text_parts)
    emails = {email.lower().rstrip(".,;:") for email in EMAIL_RE.findall(text)}
    emails.update(email.lower() for email in parser.mailtos if EMAIL_RE.fullmatch(email))
    phones = {phone for raw in PHONE_RE.findall(text) for phone in [normalize_phone(raw)] if phone}
    phones.update(phone for raw in parser.tels for phone in [normalize_phone(raw)] if phone)
    return Page(
        url=url,
        title=" ".join(parser.title_parts),
        text=text,
        links=parser.links,
        emails=emails,
        phones=phones,
        organization_names=json_ld_names(parser.json_ld_parts),
    )


def robots_for(
    client: httpx.Client, root_url: str, pacer: RequestPacer
) -> urllib.robotparser.RobotFileParser | None:
    robots_url = urljoin(root_url, "/robots.txt")
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    try:
        response = fetch_limited(client, robots_url, pacer, 1_000_000)
        if response.oversized:
            return None
        if response.status_code == 200:
            parser.parse(response.content.decode("utf-8", errors="replace").splitlines())
        elif 400 <= response.status_code < 500 and response.status_code != 429:
            parser.parse([])
        else:
            return None
    except httpx.HTTPError:
        return None
    return parser


def link_priority(url: str) -> tuple[int, int]:
    lowered = url.lower()
    if any(hint in lowered for hint in TEAM_HINTS):
        return (0, len(url))
    if any(hint in lowered for hint in CONTACT_HINTS):
        return (1, len(url))
    return (2, len(url))


def crawl_site(start_url: str, max_pages: int, delay: float, timeout: float) -> list[Page]:
    start_url = normalize_url(start_url)
    if not start_url or not is_public_url(start_url):
        return []
    host = registered_host(start_url)
    pages: list[Page] = []
    seen: set[str] = set()
    queued: set[str] = {start_url}
    queue: deque[str] = deque([start_url])
    pacer = RequestPacer(delay)
    with httpx.Client(headers={"User-Agent": USER_AGENT}, follow_redirects=False, timeout=timeout) as client:
        robots_cache: dict[str, urllib.robotparser.RobotFileParser | None] = {}

        def rules_for(target: str) -> urllib.robotparser.RobotFileParser | None:
            target_origin = origin(target)
            if target_origin not in robots_cache:
                robots_cache[target_origin] = robots_for(client, target_origin, pacer)
            return robots_cache[target_origin]

        while queue and len(pages) < max_pages:
            url = queue.popleft()
            if url in seen:
                continue
            seen.add(url)
            try:
                current = url
                response: FetchResult | None = None
                for _ in range(6):
                    if not is_public_url(current) or registered_host(current) != host:
                        response = None
                        break
                    robots = rules_for(current)
                    if robots is None or not robots.can_fetch(USER_AGENT, current):
                        response = None
                        break
                    response = fetch_limited(client, current, pacer, 5_000_000)
                    if response.oversized:
                        response = None
                        break
                    if response.status_code not in {301, 302, 303, 307, 308}:
                        break
                    redirected = normalize_url(urljoin(current, response.headers.get("location", "")))
                    if not redirected or registered_host(redirected) != host:
                        response = None
                        break
                    current = redirected
            except httpx.HTTPError:
                continue
            if response is None:
                continue
            if response.status_code == 429:
                retry_after = response.headers.get("retry-after", "")
                if retry_after.isdigit():
                    time.sleep(min(int(retry_after), 60))
                continue
            if response.status_code != 200 or "text/html" not in response.headers.get("content-type", ""):
                continue
            charset_match = re.search(r"charset=([\w.-]+)", response.headers.get("content-type", ""), re.I)
            encoding = charset_match.group(1) if charset_match else "utf-8"
            try:
                html = response.content.decode(encoding, errors="replace")
            except LookupError:
                html = response.content.decode("utf-8", errors="replace")
            page = parse_page(response.url, html)
            pages.append(page)
            candidates: list[str] = []
            for href in page.links:
                absolute = normalize_url(urljoin(page.url, href))
                if not absolute or registered_host(absolute) != host:
                    continue
                if urlparse(absolute).path.lower().endswith(EXCLUDED_EXTENSIONS):
                    continue
                if absolute not in seen and absolute not in queued:
                    candidates.append(absolute)
                    queued.add(absolute)
            for candidate in sorted(candidates, key=link_priority):
                queue.append(candidate)
    return pages


def firm_name(pages: list[Page], fallback_url: str) -> str:
    for page in pages:
        if page.organization_names:
            return page.organization_names[0]
    if pages and pages[0].title:
        return re.split(r"\s+[|–—-]\s+", pages[0].title, maxsplit=1)[0].strip()
    return registered_host(fallback_url).split(".")[0].replace("-", " ").title()


def lawyer_count(pages: list[Page]) -> tuple[int | None, str, list[str]]:
    """Estimate unique lawyer profile URLs, falling back to visible bio-card names."""
    profile_urls: set[str] = set()
    fallback_names: set[str] = set()
    evidence: set[str] = set()
    host = registered_host(pages[0].url) if pages else ""
    for page in pages:
        page_is_team = any(hint in urlparse(page.url).path.lower() for hint in TEAM_HINTS)
        for href in page.links:
            absolute = normalize_url(urljoin(page.url, href))
            path = urlparse(absolute).path.lower()
            path_words = path.replace("-", " ").replace("_", " ")
            is_people_path = LAWYER_WORDS.search(path_words) or any(
                f"/{hint}/" in path for hint in ("team", "people", "professionals")
            )
            if registered_host(absolute) == host and is_people_path:
                if path.strip("/").count("/") >= 1 and not path.rstrip("/").endswith(("attorneys", "lawyers", "team", "people", "professionals")):
                    profile_urls.add(absolute)
                    evidence.add(page.url)
        if page_is_team:
            # Conservative fallback: names adjacent to a professional title.
            matches = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})\s+(?:Partner|Associate|Attorney|Counsel|Shareholder)\b", page.text)
            for name in matches:
                fallback_names.add(name.lower())
                evidence.add(page.url)
    count = max(len(profile_urls), len(fallback_names))
    if count:
        # Website structures are inconsistent, so even profile-derived counts
        # remain estimates until a person verifies the team page.
        return count, "medium", sorted(evidence)
    return None, "low", []


def size_band(count: int | None) -> str:
    if count is None:
        return "unknown"
    if count <= 10:
        return "small (1-10 lawyers)"
    if count <= 50:
        return "midsize (11-50 lawyers)"
    return "large (51+ lawyers)"


def practice_areas(pages: list[Page]) -> list[str]:
    text = " ".join(page.text.lower() for page in pages)
    return [area for area, phrases in PRACTICE_KEYWORDS.items() if any(phrase in text for phrase in phrases)]


def summarize(url: str, pages: list[Page]) -> dict[str, str]:
    count, count_confidence, count_sources = lawyer_count(pages)
    emails = sorted({email for page in pages for email in page.emails})
    business_emails = sorted(email for email in emails if email.split("@", 1)[0] in GENERIC_EMAIL_PREFIXES)
    review_emails = sorted(email for email in emails if email.split("@", 1)[0] not in GENERIC_EMAIL_PREFIXES)
    phones = sorted({phone for page in pages for phone in page.phones})
    contact_sources = sorted({page.url for page in pages if page.emails or page.phones})
    return {
        "firm_name": firm_name(pages, url),
        "website": normalize_url(url),
        "business_emails": "; ".join(business_emails),
        "other_public_emails_review": "; ".join(review_emails),
        "phones": "; ".join(phones),
        "estimated_lawyers": "" if count is None else str(count),
        "firm_size": size_band(count),
        "lawyer_count_confidence": count_confidence,
        "practice_areas": "; ".join(practice_areas(pages)),
        "pages_crawled": str(len(pages)),
        "contact_source_urls": "; ".join(contact_sources),
        "lawyer_count_source_urls": "; ".join(count_sources),
        "verified_date": date.today().isoformat(),
        "notes": "Lawyer count is an estimate from public team/profile pages; verify before outreach.",
    }


def read_seeds(path: Path) -> list[str]:
    import csv

    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or "website" not in reader.fieldnames:
            raise ValueError("Input CSV must contain a 'website' column")
        rows = list(reader)
    return [row["website"].strip() for row in rows if row.get("website", "").strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="CSV containing a website column")
    parser.add_argument("output", type=Path, help="Destination .xlsx or .csv")
    parser.add_argument("--max-pages", type=int, default=15, help="Maximum pages per firm (default: 15)")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between page requests (default: 1)")
    parser.add_argument("--timeout", type=float, default=15.0, help="Request timeout in seconds")
    args = parser.parse_args()
    if args.max_pages < 1 or args.delay < 0 or args.timeout <= 0:
        parser.error("max-pages and timeout must be positive; delay cannot be negative")

    seeds = read_seeds(args.input)
    rows: list[dict[str, str]] = []
    for index, seed in enumerate(seeds, start=1):
        print(f"[{index}/{len(seeds)}] Researching {seed}")
        pages = crawl_site(seed, args.max_pages, args.delay, args.timeout)
        rows.append(summarize(seed, pages))

    fieldnames = list(rows[0].keys()) if rows else list(summarize("https://example.com", []).keys())
    try:
        write_leads(rows, args.output, fieldnames)
    except ValueError as exc:
        parser.error(str(exc))
    print(f"Wrote {len(rows)} firms to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
