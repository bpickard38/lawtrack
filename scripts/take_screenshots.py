"""
Regenerate the README screenshots in docs/screenshots/.

Needs the app running locally (frontend + backend) and Playwright:
    pip install playwright && python -m playwright install chromium
    python scripts/take_screenshots.py --app http://localhost:5173

Signs in with the demo account, so the backend must have demo login enabled
(the default).
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", default="http://localhost:5173")
    parser.add_argument("--chrome", help="Use an installed Chrome instead of Playwright's Chromium", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome" if args.chrome else None)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)

        page.goto(args.app)
        page.wait_for_load_state("networkidle")
        page.screenshot(path=OUT / "landing.png")

        page.goto(f"{args.app}/#auth")
        page.get_by_role("button", name="Explore the demo account").click()
        page.get_by_role("button", name="Matters").wait_for()
        page.wait_for_load_state("networkidle")
        page.screenshot(path=OUT / "today.png")

        for nav, name in [("Matters", "matters"), ("Approved time", "approved"), ("Settings", "settings")]:
            page.get_by_role("button", name=nav, exact=True).first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(500)
            page.screenshot(path=OUT / f"{name}.png")

        page.get_by_text("Case rules", exact=True).click()
        page.wait_for_load_state("networkidle")
        page.screenshot(path=OUT / "rules.png")


        browser.close()
    print(f"Saved screenshots to {OUT}")


if __name__ == "__main__":
    main()
