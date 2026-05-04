#!/usr/bin/env python3
"""
Corporate Leads + Grant Portal Scrapers
- JobsDB HK: wellness/HR/team building roles = companies with budgets NOW
- HK government grant portals: funding rounds, deadlines, eligibility
"""

import json
import re
from datetime import datetime
from pathlib import Path
from scrapling.fetchers import Fetcher

VAULT_DIR_LEADS = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "corporate-leads"
VAULT_DIR_GRANTS = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "grants"
OUTPUT_FILE = Path.home() / "nanoclaw" / "scraper" / "outputs" / "leads-grants-latest.json"
CONFIG_PATH = Path.home() / "nanoclaw" / "scraper" / "config.json"

def load_config():
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    return cfg["targets"]["corporate_leads"], cfg["targets"]["grants"]

def scrape_job_listings(keywords, region="Hong Kong"):
    """Scrape job boards for wellness/HR roles — these companies have budgets."""
    results = []

    for kw in keywords:
        try:
            # Google Jobs search as proxy
            query = f"{kw} {region} job"
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}&ibp=htl;jobs"
            page = Fetcher.get(url, stealthy_headers=True)
            text = page.text or ""

            # Extract company names and titles from search results
            # Google Jobs embeds structured data
            companies = re.findall(r'"companyName":"([^"]+)"', text)
            titles = re.findall(r'"title":"([^"]+)"', text)
            locations = re.findall(r'"location":"([^"]+)"', text)

            for i in range(min(len(companies), len(titles), 10)):
                results.append({
                    "company": companies[i] if i < len(companies) else "",
                    "title": titles[i] if i < len(titles) else "",
                    "location": locations[i] if i < len(locations) else region,
                    "keyword": kw,
                    "source": "google_jobs",
                    "date": datetime.now().isoformat()[:10],
                })

        except Exception as e:
            print(f"  Job search '{kw}' error: {e}")

    # Also try Indeed HK
    for kw in keywords[:2]:
        try:
            url = f"https://hk.indeed.com/jobs?q={kw.replace(' ', '+')}&l=Hong+Kong"
            page = Fetcher.get(url, stealthy_headers=True, timeout=15)

            for card in page.css(".job_seen_beacon, .jobsearch-ResultsList li"):
                title_el = card.css("h2 a, .jobTitle a")
                company_el = card.css(".companyName, [data-testid='company-name']")

                if title_el:
                    results.append({
                        "company": company_el[0].text.strip() if company_el else "",
                        "title": title_el[0].text.strip() if title_el else "",
                        "location": region,
                        "keyword": kw,
                        "source": "indeed_hk",
                        "url": title_el[0].attrib.get("href", ""),
                        "date": datetime.now().isoformat()[:10],
                    })

        except Exception as e:
            print(f"  Indeed '{kw}' error: {e}")

    return results

def scrape_grant_portals(portals):
    """Scrape HK government grant portals for funding opportunities."""
    results = []

    for portal in portals:
        try:
            page = Fetcher.get(portal["url"], stealthy_headers=True, timeout=15)
            text = " ".join([el.text for el in page.css("p, li, h2, h3, td, span, div") if el.text])
            text_lower = text.lower()

            # Look for funding keywords
            funding_keywords = ["application", "deadline", "funding", "subsidy", "grant",
                              "programme", "scheme", "eligible", "apply", "open for"]
            mentions = []
            for kw in funding_keywords:
                if kw in text_lower:
                    # Get surrounding context
                    idx = text_lower.index(kw)
                    context = text[max(0, idx-100):idx+200].strip()
                    mentions.append(context)

            # Extract dates
            dates = re.findall(r'\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}', text)
            dates += re.findall(r'\d{4}-\d{2}-\d{2}', text)

            # Extract amounts
            amounts = re.findall(r'HK\$[\d,]+(?:\s*million)?', text, re.IGNORECASE)
            amounts += re.findall(r'\$[\d,]+(?:\s*million)?', text)

            results.append({
                "portal": portal["name"],
                "url": portal["url"],
                "funding_mentions": mentions[:5],
                "dates_found": dates[:10],
                "amounts_found": amounts[:10],
                "date_scraped": datetime.now().isoformat()[:10],
            })

        except Exception as e:
            print(f"  Grant portal {portal['name']} error: {e}")
            results.append({
                "portal": portal["name"],
                "url": portal["url"],
                "error": str(e),
                "date_scraped": datetime.now().isoformat()[:10],
            })

    return results

def deposit_leads_to_vault(leads):
    """Write corporate leads to vault."""
    VAULT_DIR_LEADS.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR_LEADS / f"corporate-leads-{date}.md"

    # Deduplicate by company name
    seen = set()
    unique_companies = []
    for lead in leads:
        company = lead.get("company", "").strip().lower()
        if company and company not in seen:
            seen.add(company)
            unique_companies.append(lead)

    lines = [
        "---",
        f"title: Corporate Leads — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: job boards",
        f"companies_found: {len(unique_companies)}",
        "grade: B",
        "---",
        "",
        f"# Corporate Leads — {date}",
        f"**{len(unique_companies)} HK companies with active wellness/HR hiring**",
        "",
        "These companies are spending money on employee wellness RIGHT NOW.",
        "",
        "| Company | Role | Source | Keyword |",
        "|---------|------|--------|---------|",
    ]

    for lead in unique_companies:
        lines.append(f"| {lead['company']} | {lead['title'][:50]} | {lead['source']} | {lead['keyword']} |")

    lines.append("")
    lines.append("## ACTION: Kit can draft outreach for corporate boxing workshops.")

    filepath.write_text("\n".join(lines))

def deposit_grants_to_vault(grants):
    """Write grant intelligence to vault."""
    VAULT_DIR_GRANTS.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR_GRANTS / f"grant-scan-{date}.md"

    lines = [
        "---",
        f"title: HK Grant Portal Scan — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: government portals",
        f"portals_scanned: {len(grants)}",
        "grade: B",
        "---",
        "",
        f"# HK Grant Portal Scan — {date}",
        "",
    ]

    for g in grants:
        lines.append(f"## {g['portal']}")
        lines.append(f"URL: {g['url']}")
        if g.get("error"):
            lines.append(f"**Error:** {g['error']}")
        else:
            if g.get("amounts_found"):
                lines.append(f"Amounts mentioned: {', '.join(g['amounts_found'][:5])}")
            if g.get("dates_found"):
                lines.append(f"Dates found: {', '.join(g['dates_found'][:5])}")
            if g.get("funding_mentions"):
                lines.append("Key mentions:")
                for m in g["funding_mentions"][:3]:
                    lines.append(f"> {m[:200]}")
        lines.append("")

    lines.append("## REMINDER: EMF Special Measures expire June 30 2026")

    filepath.write_text("\n".join(lines))

def run():
    leads_config, grants_config = load_config()

    print("[corporate-leads] Scanning job boards...")
    leads = scrape_job_listings(leads_config["job_keywords"], leads_config["region"])
    print(f"  {len(leads)} job listings found")
    deposit_leads_to_vault(leads)

    print("[grants] Scanning government portals...")
    grants = scrape_grant_portals(grants_config["portals"])
    print(f"  {len(grants)} portals scanned")
    deposit_grants_to_vault(grants)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({"date": datetime.now().isoformat(), "leads": leads, "grants": grants}, f, indent=2)

    print(f"[leads+grants] Done.")
    return {"leads": len(leads), "grants": len(grants)}

if __name__ == "__main__":
    run()
