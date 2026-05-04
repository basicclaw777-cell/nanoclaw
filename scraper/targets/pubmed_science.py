#!/usr/bin/env python3
"""
PubMed + Citation Tracker — Exercise science papers for boxing
Scrapes PubMed for new papers. Tracks citations of Paul's existing evidence base.
Feeds into epistemic triage.
"""

import json
import re
from datetime import datetime, timedelta
from pathlib import Path
import urllib.request

from scrapling.fetchers import Fetcher

VAULT_DIR = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "science"
OUTPUT_FILE = Path.home() / "nanoclaw" / "scraper" / "outputs" / "science-latest.json"
CONFIG_PATH = Path.home() / "nanoclaw" / "scraper" / "config.json"

PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_FETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
PUBMED_SUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)["targets"]["pubmed_science"]

def search_pubmed(query, max_results=20):
    """Search PubMed via E-utilities API (free, no key needed for <3 req/sec)."""
    results = []
    try:
        # Search for IDs — use urllib directly (PubMed API is clean JSON, no anti-bot)
        min_date = (datetime.now() - timedelta(days=90)).strftime('%Y/%m/%d')
        search_url = f"{PUBMED_SEARCH}?db=pubmed&term={query.replace(' ', '+')}&retmax={max_results}&sort=date&retmode=json&datetype=pdat&mindate={min_date}"
        with urllib.request.urlopen(search_url, timeout=10) as resp:
            data = json.loads(resp.read())

        id_list = data.get("esearchresult", {}).get("idlist", [])
        if not id_list:
            return results

        # Fetch summaries
        ids = ",".join(id_list)
        summary_url = f"{PUBMED_SUMMARY}?db=pubmed&id={ids}&retmode=json"
        with urllib.request.urlopen(summary_url, timeout=10) as resp:
            summary_data = json.loads(resp.read())

        for pmid in id_list:
            article = summary_data.get("result", {}).get(pmid, {})
            if not article or pmid == "uids":
                continue

            authors = article.get("authors", [])
            author_str = ", ".join([a.get("name", "") for a in authors[:3]])
            if len(authors) > 3:
                author_str += " et al."

            results.append({
                "pmid": pmid,
                "title": article.get("title", ""),
                "authors": author_str,
                "journal": article.get("fulljournalname", article.get("source", "")),
                "pub_date": article.get("pubdate", ""),
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "search_term": query,
            })

    except Exception as e:
        print(f"  PubMed search error for '{query}': {e}")

    return results

def search_citations(query):
    """Search Google Scholar for papers citing key terms (proxy for citation tracking)."""
    results = []
    try:
        url = f"https://scholar.google.com/scholar?q={query.replace(' ', '+')}&as_ylo={datetime.now().year - 1}&hl=en"
        page = Fetcher.get(url, stealthy_headers=True)

        for item in page.css(".gs_ri"):
            title_el = item.css("h3 a")
            if not title_el:
                continue
            title = title_el[0].text or ""
            href = title_el[0].attrib.get("href", "")

            snippet_el = item.css(".gs_rs")
            snippet = snippet_el[0].text[:300] if snippet_el else ""

            info_el = item.css(".gs_a")
            info = info_el[0].text if info_el else ""

            cited_el = item.css("a")
            cited_count = 0
            for a in cited_el:
                text = a.text or ""
                match = re.search(r'Cited by (\d+)', text)
                if match:
                    cited_count = int(match.group(1))
                    break

            results.append({
                "title": title,
                "url": href,
                "authors_info": info,
                "snippet": snippet,
                "cited_by": cited_count,
                "search_term": query,
                "source": "google_scholar",
            })

    except Exception as e:
        print(f"  Scholar search error: {e}")

    return results

def deposit_to_vault(pubmed_results, citation_results):
    """Write science findings to vault."""
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR / f"science-scan-{date}.md"

    lines = [
        "---",
        f"title: Boxing Science Scan — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: PubMed + Google Scholar",
        f"new_papers: {len(pubmed_results)}",
        f"citation_hits: {len(citation_results)}",
        "grade: B",
        "---",
        "",
        f"# Boxing Science Scan — {date}",
        "",
    ]

    if pubmed_results:
        lines.append(f"## New Papers ({len(pubmed_results)})")
        lines.append("")
        for p in pubmed_results:
            lines.append(f"### {p['title']}")
            lines.append(f"*{p['authors']}* — {p['journal']} ({p['pub_date']})")
            lines.append(f"[PubMed]({p['url']}) | Search: {p['search_term']}")
            lines.append("")

    if citation_results:
        lines.append(f"## Citation Tracking ({len(citation_results)})")
        lines.append("")
        for c in citation_results:
            lines.append(f"### {c['title']}")
            lines.append(f"*{c['authors_info']}*")
            if c['cited_by']:
                lines.append(f"Cited by: {c['cited_by']}")
            if c['snippet']:
                lines.append(f"> {c['snippet'][:200]}")
            lines.append(f"[Link]({c['url']})")
            lines.append("")

    lines.append("## TRIAGE NOTES")
    lines.append("Run `/triage <claim>` on any finding above to score against vault evidence.")
    lines.append("")

    filepath.write_text("\n".join(lines))

def run():
    config = load_config()

    print("[pubmed-science] Scanning PubMed + Scholar...")
    all_pubmed = []
    for term in config["search_terms"]:
        print(f"  PubMed: {term}")
        results = search_pubmed(term)
        print(f"    {len(results)} papers")
        all_pubmed.extend(results)

    # Dedup by PMID
    seen = set()
    pubmed_deduped = []
    for r in all_pubmed:
        if r["pmid"] not in seen:
            seen.add(r["pmid"])
            pubmed_deduped.append(r)

    citation_results = []
    for term in config.get("track_citations_for", []):
        print(f"  Scholar citations: {term}")
        results = search_citations(term)
        print(f"    {len(results)} results")
        citation_results.extend(results)

    # Save raw
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({
            "date": datetime.now().isoformat(),
            "pubmed": pubmed_deduped,
            "citations": citation_results
        }, f, indent=2)

    deposit_to_vault(pubmed_deduped, citation_results)
    print(f"[pubmed-science] Done. {len(pubmed_deduped)} papers, {len(citation_results)} citations.")
    return {"papers": len(pubmed_deduped), "citations": len(citation_results)}

if __name__ == "__main__":
    run()
