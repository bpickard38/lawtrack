import re

# Websites we want to track in browsers
TRACKED_WEBSITES = [
    # Email sites
    'gmail', 'mail.google.com', 'outlook', 'mail.yahoo.com', 
    'protonmail', 'mail', 'inbox',
    
    # Legal research sites (add any you use)
    'westlaw', 'lexisnexis', 'fastcase', 'casetext',
    
    # Document sites
    'docs.google.com', 'drive.google.com', 'onedrive', 'dropbox',
    
    # Add more sites here as needed
]

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
        # Only track specific websites
        if not should_track_website(window_title):
            return None  # Skip this activity
        
        # Classify based on site type
        title_lower = window_title.lower()
        
        # Email sites
        if any(mail in title_lower for mail in ['gmail', 'inbox', 'outlook', 'mail']):
            return "email"
        
        # Document sites
        if any(doc in title_lower for doc in ['docs.google', 'drive.google', 'onedrive', 'dropbox']):
            return "document"
        
        # Default for tracked sites
        return "document"

    # Desktop email clients
    if any(k in name_no_ext for k in ("outlook", "thunderbird")):
        return "email"

    # Desktop document apps
    if any(k in name_no_ext for k in ("word", "excel", "powerpoint", "acrobat", "notepad", "sublime", "code", "pages", "writer")):
        return "document"

    # Meeting apps
    if any(k in name_no_ext for k in ("zoom", "teams", "skype", "webex", "meet")):
        return "meeting"

    # Default fallback - track it
    return "document"