import re

# Websites we explicitly want to track in browsers (work-related)
TRACKED_WEBSITES = [
    # Email sites
    'gmail', 'mail.google.com', 'outlook', 'office365', 'mail.yahoo.com',
    'protonmail', 'inbox',

    # Legal research / dockets
    'westlaw', 'lexisnexis', 'fastcase', 'casetext', 'bloomberglaw',
    'pacer', 'courtlistener',

    # Document / file storage
    'docs.google.com', 'drive.google.com', 'onedrive', 'sharepoint',
    'dropbox', 'box.com',

    # Practice management (if you open client files in a browser)
    'clio', 'mycase',
]

# Websites we never want to track (clear non-work noise)
DO_NOT_TRACK_WEBSITES = [
    'facebook', 'instagram', 'twitter', 'x.com', 'tiktok', 'snapchat',
    'youtube', 'netflix', 'hulu', 'disneyplus', 'primevideo',
    'espn', 'reddit', 'pinterest', 'spotify', 'pandora',
]

# Desktop apps we DO want to track.
# Keep this list tight so random apps are ignored.
ALLOWED_EMAIL_APPS = ("outlook",)  # add others like 'thunderbird' if you want
ALLOWED_DOC_APPS = (
    "winword", "word",          # Microsoft Word
    "excel",                    # Excel (if you want to track spreadsheets)
    "powerpnt", "powerpoint",   # PowerPoint
    "acrobat", "acrord32",      # Adobe Acrobat / Reader
)
ALLOWED_MEETING_APPS = ("zoom", "teams", "skype", "webex", "meet")

def should_track_website(window_title: str) -> bool:
    """
    Check if a browser window title indicates a site we want to track.
    Returns True if we should track this website.
    """
    if not window_title:
        return False
    
    title_lower = window_title.lower()
    
    # Check if any tracked website is in the title
    for site in TRACKED_WEBSITES:
        if site in title_lower:
            return True
    
    # Also check for common email page titles that might not include the site name
    # Gmail often shows "Inbox", "Sent", "Drafts", etc. without "gmail" in title
    # Outlook often shows "Mail", "Inbox", etc. without "outlook" in title
    # But we need to be careful - only match if it's clearly an email interface
    email_page_indicators = ['inbox', 'sent mail', 'drafts', 'compose mail', 'new message']
    # Check if it looks like an email page AND doesn't match blocked sites
    if any(indicator in title_lower for indicator in email_page_indicators):
        # Check if it's NOT a blocked site (to avoid false positives)
        for blocked in DO_NOT_TRACK_WEBSITES:
            if blocked in title_lower:
                return False
        # If it has email page indicators and isn't blocked, it's likely an email site
        # This handles cases like "Inbox - Gmail" where "gmail" might be cut off
        return True
    
    return False

def classify(app_name: str, window_title: str = "") -> str:
    """
    Classify a foreground application name into an activity type.
    
    - app_name: process/executable name (e.g., "chrome.exe", "OUTLOOK.EXE")
    - window_title: window title (for filtering browser sites)
    - Returns: "email", "document", "meeting", or None (to skip tracking)
    """
    if not app_name:
        return None

    name = app_name.lower()
    name_no_ext = re.sub(r'\.exe$', '', name)

    # Check if it's a browser
    is_browser = any(browser in name_no_ext for browser in ['chrome', 'msedge', 'firefox', 'safari', 'brave'])

    if is_browser:
        title_lower = (window_title or "").lower()

        # 1) Never track obvious non-work / personal sites
        for bad in DO_NOT_TRACK_WEBSITES:
            if bad in title_lower:
                return None

        # 2) Only track specific work-related websites
        if not should_track_website(window_title):
            return None  # Skip this activity

        # 3) Classify based on site type
        # Email sites - check for email-related keywords and sites
        email_sites = ['gmail', 'mail.google.com', 'outlook', 'office365', 'mail.yahoo.com', 'protonmail', 'outlook.live.com', 'outlook.office.com']
        email_keywords_strong = ['gmail', 'outlook', 'office365', 'protonmail']  # Strong indicators
        email_keywords_weak = ['inbox', 'mail']  # Weak indicators - need context
        
        # First check if this is explicitly an email site from TRACKED_WEBSITES
        for site in email_sites:
            if site in title_lower:
                return "email"
        
        # Then check for strong email keywords
        if any(keyword in title_lower for keyword in email_keywords_strong):
            return "email"
        
        # For weak keywords like "inbox" or "mail", check if it's in TRACKED_WEBSITES
        # (which means we explicitly want to track this email site)
        if any(keyword in title_lower for keyword in email_keywords_weak):
            # Check if any email site from TRACKED_WEBSITES is present
            tracked_email_sites = ['gmail', 'mail.google.com', 'outlook', 'office365', 'mail.yahoo.com', 'protonmail', 'inbox']
            if any(site in title_lower for site in tracked_email_sites):
                # Double-check it's not a document site
                if not any(doc in title_lower for doc in ['docs.google', 'drive.google', 'onedrive', 'sharepoint', 'dropbox', 'box.com']):
                    return "email"

        # Document / file sites
        if any(doc in title_lower for doc in ['docs.google', 'drive.google', 'onedrive', 'sharepoint', 'dropbox', 'box.com']):
            return "document"

        # Default for tracked sites
        return "document"

    # Desktop email clients – only track explicit allowed apps
    if any(k in name_no_ext for k in ALLOWED_EMAIL_APPS):
        return "email"

    # Desktop document apps – Word, Excel, PowerPoint, Acrobat, etc.
    if any(k in name_no_ext for k in ALLOWED_DOC_APPS):
        return "document"

    # Meeting apps – Zoom/Teams/etc.
    if any(k in name_no_ext for k in ALLOWED_MEETING_APPS):
        return "meeting"

    # Anything else (editors, random apps, etc.) is ignored
    return None