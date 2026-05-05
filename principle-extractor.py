#!/usr/bin/env python3
"""
Principle Extraction Engine

Reads every nugget in ~/cathedral-vault/02_Refined_Gold/
Extracts the transferable, universal principle from each.
Groups cross-domain principles. Outputs principle-library.md.

Uses Ollama qwen3:14b for extraction — local, free, no API costs.
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from collections import defaultdict

VAULT_GOLD = Path.home() / "cathedral-vault" / "02_Refined_Gold"
OUTPUT_MD = Path.home() / "cathedral-vault" / "06_Methods" / "principle-library.md"
OUTPUT_JSON = Path.home() / "nanoclaw" / "scraper" / "outputs" / "principles-raw.json"
OLLAMA_URL = "http://localhost:11434/api/chat"

EXTRACTION_PROMPT = """You are a principle extractor. Read this knowledge nugget and extract the ONE universal, transferable principle underneath it.

Rules:
- The principle must be ONE sentence
- It must be PORTABLE — true beyond the specific domain
- Not a summary of the content — the LESSON underneath
- If no clear principle exists, say "NO_PRINCIPLE"
- Also identify the source domain and 2-3 other domains where this principle applies

NUGGET TITLE: {title}
DOMAIN: {domain}
CONTENT:
{content}

Respond in EXACTLY this JSON format, nothing else:
{{"principle": "one sentence principle", "domain": "source domain", "applies_to": ["domain1", "domain2"], "confidence": "high/medium/low"}}"""


def detect_domain(title, content):
    """Detect domain from title and content keywords."""
    text = (title + " " + content[:500]).lower()

    domain_keywords = {
        "boxing": ["boxing", "punch", "jab", "cross", "hook", "uppercut", "footwork", "sparring", "combo", "guard", "stance", "sagarra", "cuban", "ring", "bout", "fighter"],
        "aether": ["aether", "ether", "vortex", "field", "vacuum", "zero point", "scalar", "torsion"],
        "consciousness": ["consciousness", "awareness", "observer", "perception", "meditation", "mind", "sentient", "cogniti"],
        "frequency": ["frequency", "resonance", "vibration", "cymatics", "hertz", "harmonic", "standing wave", "schumann"],
        "mathematics": ["tesla", "fibonacci", "geometry", "sacred geometry", "3-6-9", "golden ratio", "fractal", "vortex math"],
        "business": ["business", "revenue", "client", "marketing", "brand", "sales", "gym", "member", "pricing", "crm"],
        "ai_systems": ["ai", "llm", "agent", "model", "prompt", "neural", "machine learning", "cognitive architecture"],
        "epistemology": ["truth", "evidence", "claim", "suppression", "epistemic", "verify", "falsif", "proof"],
        "philosophy": ["stoic", "sovereignty", "virtue", "wisdom", "integrity", "mastery", "meaning", "purpose"],
        "water_science": ["water", "schauberger", "ez water", "vortex water", "living water", "implosion"],
        "suppression": ["suppressed", "hidden", "censored", "gatekeep", "classified", "cover-up", "silenced"],
        "healing": ["healing", "chi", "ki", "energy work", "chakra", "meridian", "reiki", "therapeutic"],
        "music_rhythm": ["rhythm", "drumming", "beat", "tempo", "rudiment", "subdivision", "polyrhythm"],
        "identity": ["identity", "character", "archetype", "persona", "avatar", "self", "ego"],
        "technology": ["technology", "software", "hardware", "code", "system", "architect", "engineer"],
    }

    scores = {}
    for domain, keywords in domain_keywords.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scores[domain] = score

    if scores:
        return max(scores, key=scores.get)
    return "general"


def extract_principle(title, content, domain):
    """Use Ollama to extract principle from a nugget."""
    import urllib.request

    # Truncate content to avoid context overflow
    truncated = content[:2000]

    prompt = EXTRACTION_PROMPT.format(
        title=title,
        domain=domain,
        content=truncated
    )

    payload = json.dumps({
        "model": "hermes3",
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 200}
    })

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=payload.encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            response_text = data.get("message", {}).get("content", "")

            # Strip thinking tags if qwen3 adds them
            response_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL).strip()

            # Extract JSON from response
            json_match = re.search(r'\{[^{}]*"principle"[^{}]*\}', response_text)
            if json_match:
                return json.loads(json_match.group())

            return None
    except Exception as e:
        return None


def read_nugget(filepath):
    """Read a nugget file, extract title and content."""
    text = filepath.read_text(errors='replace')

    # Extract title from frontmatter or filename
    title = filepath.stem.replace("_gold", "").replace("_", " ").strip()
    fm_match = re.search(r'^---\n.*?title:\s*["\']?(.+?)["\']?\s*\n.*?---', text, re.DOTALL)
    if fm_match:
        title = fm_match.group(1).strip()

    # Remove frontmatter for content
    content = re.sub(r'^---\n.*?---\n?', '', text, flags=re.DOTALL).strip()

    return title, content


def group_principles(extractions):
    """Group similar principles across domains."""
    # Simple approach: group by keyword overlap in principle text
    groups = []
    used = set()

    for i, ext in enumerate(extractions):
        if i in used:
            continue

        principle_words = set(ext["principle"].lower().split())
        group = [ext]
        used.add(i)

        for j, other in enumerate(extractions):
            if j in used:
                continue
            other_words = set(other["principle"].lower().split())
            # If >30% word overlap and different domains
            overlap = len(principle_words & other_words) / max(len(principle_words), 1)
            if overlap > 0.3 and other["domain"] != ext["domain"]:
                group.append(other)
                used.add(j)

        if len(group) > 1:
            groups.append(group)

    return groups


def write_principle_library(extractions, groups):
    """Write the principle library markdown."""
    # Sort by domain
    by_domain = defaultdict(list)
    for ext in extractions:
        by_domain[ext["domain"]].append(ext)

    lines = [
        "---",
        "title: Principle Library — Cathedral Universal Principles",
        f"date: {datetime.now().strftime('%Y-%m-%d')}",
        "type: principle-library",
        f"total_principles: {len(extractions)}",
        f"cross_domain_groups: {len(groups)}",
        f"domains: {len(by_domain)}",
        "version: 1.0.0",
        "---",
        "",
        "# PRINCIPLE LIBRARY",
        "",
        f"**{len(extractions)} principles extracted from {len(by_domain)} domains.**",
        f"**{len(groups)} principles appear across multiple domains — the bridges.**",
        "",
        "These are the immortal layer. They survive any technology change.",
        "They work on paper. They work in boxing. They work in business. They work in life.",
        "",
    ]

    # Cross-domain principles first — these are the gold
    if groups:
        lines.append("---")
        lines.append("")
        lines.append(f"## CROSS-DOMAIN PRINCIPLES ({len(groups)} bridges)")
        lines.append("")
        lines.append("These principles appear independently in multiple domains.")
        lines.append("They weren't designed to connect. They connected themselves.")
        lines.append("")

        for i, group in enumerate(sorted(groups, key=len, reverse=True), 1):
            domains = sorted(set(ext["domain"] for ext in group))
            lines.append(f"### Bridge {i}: {' + '.join(domains)}")
            lines.append("")
            for ext in group:
                lines.append(f"- **[{ext['domain']}]** {ext['principle']}")
                lines.append(f"  *Source: {ext['title'][:60]}*")
            lines.append("")

    # Per-domain principles
    lines.append("---")
    lines.append("")
    lines.append("## PRINCIPLES BY DOMAIN")
    lines.append("")

    for domain in sorted(by_domain.keys()):
        items = by_domain[domain]
        lines.append(f"### {domain.replace('_', ' ').title()} ({len(items)} principles)")
        lines.append("")

        # Sort by confidence
        confidence_order = {"high": 0, "medium": 1, "low": 2}
        items.sort(key=lambda x: confidence_order.get(x.get("confidence", "low"), 2))

        for ext in items:
            conf = ext.get("confidence", "")
            conf_marker = "★" if conf == "high" else "◆" if conf == "medium" else "○"
            applies = ", ".join(ext.get("applies_to", []))
            lines.append(f"{conf_marker} **{ext['principle']}**")
            lines.append(f"  *Source: {ext['title'][:80]}*")
            if applies:
                lines.append(f"  *Also applies to: {applies}*")
            lines.append("")

    # Stats
    lines.append("---")
    lines.append("")
    lines.append("## STATS")
    lines.append("")
    lines.append(f"- Total principles extracted: {len(extractions)}")
    lines.append(f"- Cross-domain bridges: {len(groups)}")
    lines.append(f"- Domains represented: {len(by_domain)}")
    high = sum(1 for e in extractions if e.get("confidence") == "high")
    lines.append(f"- High confidence: {high}")
    lines.append(f"- Generated: {datetime.now().isoformat()}")
    lines.append("")
    lines.append("*Generated by the Principle Extraction Engine. The vault collects. This distils.*")

    OUTPUT_MD.write_text("\n".join(lines))


def run(batch_size=None, resume_from=0):
    """Run extraction on all nuggets."""
    nugget_files = sorted(VAULT_GOLD.rglob("*.md"))
    total = len(nugget_files)

    if batch_size:
        nugget_files = nugget_files[resume_from:resume_from + batch_size]

    print(f"[principle-extractor] Processing {len(nugget_files)} of {total} nuggets...")

    # Load existing extractions if resuming
    existing = []
    if OUTPUT_JSON.exists() and resume_from > 0:
        existing = json.loads(OUTPUT_JSON.read_text()).get("extractions", [])
        print(f"  Loaded {len(existing)} existing extractions")

    extractions = list(existing)
    failures = 0

    for i, filepath in enumerate(nugget_files):
        title, content = read_nugget(filepath)

        if not content or len(content) < 50:
            continue

        domain = detect_domain(title, content)

        print(f"  [{resume_from + i + 1}/{total}] {domain}: {title[:50]}...", end=" ", flush=True)

        result = extract_principle(title, content, domain)

        if result and result.get("principle") and result["principle"] != "NO_PRINCIPLE":
            result["title"] = title
            result["file"] = str(filepath.relative_to(VAULT_GOLD))
            extractions.append(result)
            print(f"✓")
        else:
            failures += 1
            print(f"✗")

    # Save raw JSON
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps({
        "date": datetime.now().isoformat(),
        "total_processed": resume_from + len(nugget_files),
        "total_extracted": len(extractions),
        "failures": failures,
        "extractions": extractions,
    }, indent=2))

    # Group and write library
    groups = group_principles(extractions)
    write_principle_library(extractions, groups)

    print(f"\n[principle-extractor] Done.")
    print(f"  Processed: {len(nugget_files)}")
    print(f"  Extracted: {len(extractions)} principles")
    print(f"  Cross-domain bridges: {len(groups)}")
    print(f"  Failures: {failures}")
    print(f"  Library: {OUTPUT_MD}")

    return extractions, groups


if __name__ == "__main__":
    batch = int(sys.argv[1]) if len(sys.argv) > 1 else None
    resume = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    run(batch_size=batch, resume_from=resume)
