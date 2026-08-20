# Law-firm lead scraper

These tools can discover firm websites through Google's official Places API and then research public business information from each firm's own website. They do not scrape the Google Maps webpage, LinkedIn, Avvo, or search-result pages.

## Find the websites automatically with Google Maps

1. In Google Cloud, enable **Places API (New)** and create an API key. Restrict the key to the Places API and to the computer/server that will run this tool. Google requires billing for Places API usage.
2. Put the key in an environment variable for the current PowerShell session:

```powershell
$env:GOOGLE_MAPS_API_KEY = "your-key-here"
```

3. Search and create a formatted Excel workbook:

```powershell
backend\venv\Scripts\python.exe tools\google_maps_law_firm_finder.py "family law firms in Provo, Utah" provo_family_law_leads.xlsx --max-results 20
```

Useful searches for LawTrack include:

```text
family law firms in Provo, Utah
civil litigation law firms in Orem, Utah
business law firms in Lehi, Utah
employment law firms in Utah County, Utah
```

The Places results are used transiently to discover websites. The saved output is rebuilt from the firms' public websites rather than storing Google Maps business details. Review Google's Places API terms and attribution requirements for your specific use.

The `.xlsx` workbook includes an Overview tab and a filterable Leads tab with frozen headers, readable widths, and clickable firm websites. Upload the file to Google Drive and open it with Google Sheets if you prefer working there. Use an output ending in `.csv` for a plain CSV instead.

## Alternative: supply websites yourself

### 1. Create a seed file

Create `firms.csv` with one required column:

```csv
website
https://examplefirm.com
https://anotherfirm.com
```

Find the initial websites manually through ordinary searches such as “family law firm Provo” and “business litigation firm Orem.” This keeps discovery compliant with directory and search-platform terms.

### 2. Run it

From the project folder, use the backend virtual environment (it already has the required libraries):

```powershell
backend\venv\Scripts\python.exe tools\law_firm_scraper.py firms.csv law_firm_leads.csv
```

For a quick trial with fewer pages:

```powershell
backend\venv\Scripts\python.exe tools\law_firm_scraper.py firms.csv law_firm_leads.csv --max-pages 5
```

The crawler waits one second between requests, stays on the firm's domain, and honors `robots.txt`. Use `--delay 2` to crawl more gently.

## Output

The output includes:

- firm name and website
- publicly displayed business emails and phone numbers
- estimated lawyer count and size band
- likely practice areas
- confidence and source URLs
- verification date

Size bands are **small: 1–10 lawyers**, **midsize: 11–50**, and **large: 51+**. Lawyer counts are estimates from public team/profile pages and should be checked before outreach. Some JavaScript-heavy sites will return incomplete results.

Only use public business contact information, retain the source URLs, honor opt-outs, and follow applicable calling and email rules.
