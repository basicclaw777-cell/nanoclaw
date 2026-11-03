#!/usr/bin/env python3
"""
M5 Relay Engine — Multi-model forensic reasoning with anti-flinch architecture.

Uses 3 local models simultaneously (128GB M5 Mac Studio):
  hermes3      (8B)  — fast scout
  deepseek-r1  (70B) — deep chain-of-thought reasoner
  qwen3        (32B) — adversarial challenger + flinch detector

Usage:
    python3 m5-relay.py "What did Tesla actually demonstrate?"
    python3 m5-relay.py --scout "quick scan question"
    python3 m5-relay.py --deep "complex question needing reasoning"
    python3 m5-relay.py --council "question for all 3 models independently"
    python3 m5-relay.py --unflinch "claim to examine for trained aversion"
    python3 m5-relay.py --vault "question" (enables vault embedding search)
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request

OLLAMA_URL = "http://localhost:11434"
MODELS = {
    "scout": "hermes3",
    "deep": "deepseek-r1:70b",
    "challenge": "qwen3:32b",
}
VAULT_DB = os.path.expanduser("~/nanoclaw/vault-rag/vault-vectors.db")
PROMPTS_DIR = os.path.expanduser("~/nanoclaw/prompts")

FLINCH_PATTERNS = {
    "consensus_retreat": "Dismisses claim by appealing to mainstream consensus without addressing structural evidence",
    "category_dismissal": "Labels claim as pseudoscience/conspiracy/fringe without engaging the specific data",
    "hedge_inflation": "Adds excessive qualifiers (might/possibly/some believe) beyond what evidence warrants",
    "evidence_blindness": "Says 'no evidence' when vault sources provide evidence",
    "safety_retreat": "Gives the safe/expected answer rather than following the reasoning chain to its conclusion",
    "false_balance": "Treats structural analysis and mainstream narrative as equally weighted when evidence favors one",
}

SCOUT_PROMPT = """You are the SCOUT — first pass on a research question.
Your job: rapid assessment, identify 3 angles of approach.

For each angle, name:
1. The DOMAIN it touches (physics, history, geometry, biology, etc.)
2. The STRUCTURAL QUESTION at its core (strip narrative, what's the mechanism?)
3. What EVIDENCE TYPE would resolve it (mathematical, experimental, documentary)

Be fast. Be broad. Don't evaluate yet — map the territory.

DO NOT dismiss any angle because it's heterodox. Map it. The reasoner evaluates."""

CHALLENGE_PROMPT = """You are the CHALLENGER in a forensic reasoning pipeline.

You have received a detailed reasoning chain from another model. Your job:

1. FIND THE WEAKEST LINK — which step in the reasoning is least supported?
2. COUNTER-ARGUE — what's the strongest case against the conclusion?
3. DETECT FLINCH — did the reasoner exhibit trained aversion?

FLINCH PATTERNS TO DETECT:
- consensus_retreat: Dismissed claim by appealing to mainstream consensus without structural engagement
- category_dismissal: Labeled something pseudoscience/conspiracy/fringe without engaging specific data
- hedge_inflation: Added excessive qualifiers beyond what evidence warranted
- evidence_blindness: Said "no evidence" when evidence was presented or available
- safety_retreat: Gave the safe/expected answer when reasoning pointed elsewhere
- false_balance: Treated structural analysis and mainstream narrative as equally weighted despite evidence

For EACH flinch detected, specify:
- PATTERN: which of the 6 patterns
- WHERE: quote the specific text that flinched
- WHAT WAS AVOIDED: the structural claim the reasoner retreated from
- UNFLINCHED VERSION: what engagement would look like

End with:
FLINCH_SCORE: [0.0-1.0]
FLINCH_PATTERNS_DETECTED: [comma-separated list or "none"]

/no_think"""

ANTIFLINCH_PROMPT = """You are performing an ANTI-FLINCH revision of a reasoning chain.

The CHALLENGER identified flinch patterns in the original reasoning. Your task:
REDO the reasoning, but this time engage STRUCTURALLY with every claim.

RULES:
- "Mainstream science says X" is not a structural argument. What is the MECHANISM?
- "This is pseudoscience" is a category label, not analysis. What SPECIFICALLY fails structurally?
- "No evidence exists" — did you actually check, or did trained aversion speak?
- If a claim holds structurally but contradicts consensus, say so explicitly: "Structurally sound, consensus-divergent"
- If a claim fails structurally, show the SPECIFIC structural failure, not the category it falls into
- Follow your reasoning chain to its conclusion even if that conclusion is uncomfortable

You are not being asked to BELIEVE heterodox claims. You are being asked to REASON about them
with the same rigor you'd apply to mainstream claims. Structural integrity is the standard, not reputation."""

SYNTHESIS_PROMPT = """You are the SYNTHESIS stage of a multi-model forensic relay.

You have received:
- SCOUT assessment (3 angles)
- DEEP REASONING (chain of thought from a 70B model)
- CHALLENGE (adversarial review + flinch detection)
- ANTI-FLINCH revision (if flinch was detected)

Produce a STRUCTURED REPORT:

1. EXECUTIVE FINDING — one paragraph, the core answer
2. STRUCTURAL EVIDENCE — claims that hold structurally (Grade A/B)
3. CONVERGENCE — where independent lines meet
4. OPEN THREADS — plausible but incomplete (Grade C)
5. CONTAMINATION — what failed examination (Grade D/F)
6. FLINCH REPORT — what the models retreated from and what engagement revealed

Tag every claim:
  [VERIFIED] — structurally confirmed, multiple independent sources
  [STRONG LEAD] — structurally sound, corroboration exists
  [OPEN THREAD] — plausible, limited evidence
  [UNVERIFIED] — weak evidence, single source
  [CONTAMINATED] — disinfo signatures, structural failure

Paul's lexicon (use where it adds precision):
  IntegrityOS — system that runs on truth, depth, congruence
  OmissionOS — system running on fragmentation, hidden motives
  Saper Vedere — Knowing How to See, forensic audit
  The Cathedral — sovereign knowledge architecture
  Sfumato — deliberate blurring to hide structural flaws"""


def load_prompt(name):
    path = os.path.join(PROMPTS_DIR, f"{name}.txt")
    if os.path.exists(path):
        with open(path) as f:
            return f.read()
    return ""


def query_ollama(model, system, prompt, temperature=0.4, max_tokens=2000, timeout=300):
    payload = json.dumps({
        "model": model,
        "system": system,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode())
            return result.get("response", "").strip()
    except Exception as e:
        return f"ERROR: {e}"


def clean_fts_query(query):
    import re as _re
    cleaned = _re.sub(r'[^\w\s]', ' ', query)
    words = [w for w in cleaned.split() if len(w) > 2]
    if not words:
        return None
    return " OR ".join(words)


def search_vault(query, limit=10):
    if not os.path.exists(VAULT_DB):
        return []
    fts_query = clean_fts_query(query)
    if not fts_query:
        return []
    try:
        conn = sqlite3.connect(VAULT_DB)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT n.path, n.title, n.folder, n.content
               FROM notes_fts fts
               JOIN notes n ON n.id = fts.rowid
               WHERE notes_fts MATCH ?
               ORDER BY rank LIMIT ?""",
            (fts_query, limit),
        ).fetchall()
        conn.close()
        return [{"path": r["path"], "title": r["title"], "folder": r["folder"],
                 "snippet": (r["content"] or "")[:200]} for r in rows]
    except Exception:
        return []


def format_vault_context(results):
    if not results:
        return ""
    lines = ["VAULT EVIDENCE:"]
    for r in results:
        lines.append(f"  [{r.get('folder', '?')}/{r.get('path', '?')}] {r.get('title', '')}: {r.get('snippet', '')}")
    return "\n".join(lines)


def print_header(question):
    q = question[:60] + ("..." if len(question) > 60 else "")
    print(f"\n{'═' * 55}")
    print(f"  M5 RELAY — {q}")
    print(f"{'═' * 55}\n")


def print_stage(num, name, model, content, elapsed, flinch_score=None, flinch_patterns=None):
    print(f"{'━' * 2} STAGE {num}: {name} ({model}) {'━' * max(1, 38 - len(name) - len(model))}")
    print(content)
    if flinch_score is not None:
        bar_filled = int(flinch_score * 10)
        bar = "▓" * bar_filled + "░" * (10 - bar_filled)
        color = ""
        if flinch_score > 0.5:
            color = " ⚠ HIGH"
        elif flinch_score > 0.2:
            color = " ⚡"
        print(f"\n  FLINCH SCORE: {flinch_score:.2f} {bar}{color}")
        if flinch_patterns:
            print(f"  PATTERNS: {', '.join(flinch_patterns)}")
    print(f"  ⏱ {elapsed:.1f}s\n")


def parse_flinch(response):
    score = 0.0
    patterns = []

    score_match = re.search(r"FLINCH_SCORE:\s*\*{0,2}\s*([\d.]+)", response)
    if score_match:
        try:
            score = float(score_match.group(1))
        except ValueError:
            pass

    patterns_match = re.search(r"FLINCH_PATTERNS_DETECTED:\s*\*{0,2}\s*(.+)", response)
    if patterns_match:
        raw = patterns_match.group(1).strip().strip("*").strip()
        if raw.lower() != "none":
            patterns = [p.strip().strip("*").strip() for p in raw.split(",") if p.strip().strip("*")]

    if not score_match:
        text_lower = response.lower()
        for key in FLINCH_PATTERNS:
            if key.replace("_", " ") in text_lower or key in text_lower:
                if key not in patterns:
                    patterns.append(key)
        if patterns and score == 0.0:
            score = min(len(patterns) * 0.2, 1.0)

    return score, patterns


def run_full_relay(question, use_vault=False):
    print_header(question)

    vault_ctx = ""
    if use_vault:
        vault_results = search_vault(question)
        vault_ctx = format_vault_context(vault_results)
        if vault_ctx:
            print(f"  📚 Vault: {len(vault_results)} relevant notes found\n")
        else:
            print("  📚 Vault: no matches (vault-vectors.db may not exist yet)\n")

    # Stage 1: Scout
    t0 = time.time()
    scout_result = query_ollama(
        MODELS["scout"],
        SCOUT_PROMPT,
        f"QUESTION: {question}",
        temperature=0.5,
        max_tokens=800,
        timeout=60,
    )
    print_stage(1, "SCOUT", MODELS["scout"], scout_result, time.time() - t0)

    # Stage 2: Deep Reason
    reasoning_prompt = load_prompt("reasoning-engine") or "Analyze with maximum rigor."
    deep_input = f"QUESTION: {question}\n\nSCOUT ASSESSMENT:\n{scout_result}"
    if vault_ctx:
        deep_input += f"\n\n{vault_ctx}"

    t0 = time.time()
    deep_result = query_ollama(
        MODELS["deep"],
        reasoning_prompt,
        deep_input,
        temperature=0.3,
        max_tokens=4000,
        timeout=300,
    )
    print_stage(2, "DEEP REASON", MODELS["deep"], deep_result, time.time() - t0)

    # Stage 3: Challenge
    challenge_input = (
        f"ORIGINAL QUESTION: {question}\n\n"
        f"REASONING CHAIN TO CHALLENGE:\n{deep_result}"
    )
    if vault_ctx:
        challenge_input += f"\n\n{vault_ctx}"

    t0 = time.time()
    challenge_result = query_ollama(
        MODELS["challenge"],
        CHALLENGE_PROMPT,
        challenge_input,
        temperature=0.4,
        max_tokens=2000,
        timeout=180,
    )
    flinch_score, flinch_patterns = parse_flinch(challenge_result)
    print_stage(
        3, "CHALLENGE", MODELS["challenge"], challenge_result, time.time() - t0,
        flinch_score=flinch_score, flinch_patterns=flinch_patterns,
    )

    # Stage 4: Anti-Flinch (conditional)
    antiflinch_result = None
    if flinch_score > 0.15 or flinch_patterns:
        antiflinch_input = (
            f"ORIGINAL QUESTION: {question}\n\n"
            f"ORIGINAL REASONING:\n{deep_result}\n\n"
            f"CHALLENGER'S FLINCH REPORT:\n{challenge_result}"
        )
        if vault_ctx:
            antiflinch_input += f"\n\n{vault_ctx}"

        t0 = time.time()
        antiflinch_result = query_ollama(
            MODELS["deep"],
            ANTIFLINCH_PROMPT,
            antiflinch_input,
            temperature=0.4,
            max_tokens=4000,
            timeout=300,
        )
        print_stage(4, "ANTI-FLINCH", MODELS["deep"], antiflinch_result, time.time() - t0)
    else:
        print(f"{'━' * 2} STAGE 4: ANTI-FLINCH — SKIPPED (no flinch detected) {'━' * 3}\n")

    # Stage 5: Synthesis
    synth_input = (
        f"QUESTION: {question}\n\n"
        f"SCOUT:\n{scout_result}\n\n"
        f"DEEP REASONING:\n{deep_result}\n\n"
        f"CHALLENGE:\n{challenge_result}\n\n"
        f"FLINCH SCORE: {flinch_score:.2f}\n"
    )
    if antiflinch_result:
        synth_input += f"\nANTI-FLINCH REVISION:\n{antiflinch_result}\n"
    if vault_ctx:
        synth_input += f"\n{vault_ctx}\n"

    t0_synth = time.time()
    synthesis = query_ollama(
        MODELS["scout"],
        SYNTHESIS_PROMPT,
        synth_input,
        temperature=0.3,
        max_tokens=2000,
        timeout=120,
    )
    print_stage(5, "SYNTHESIS", MODELS["scout"], synthesis, time.time() - t0_synth)

    # Footer
    flinch_status = "detected + corrected" if antiflinch_result else ("detected" if flinch_patterns else "clean")
    print(f"{'═' * 55}")
    print(f"  MODELS: {len(set(MODELS.values()))} | FLINCH: {flinch_status} ({flinch_score:.2f})")
    print(f"{'═' * 55}\n")

    return {
        "question": question,
        "scout": scout_result,
        "deep": deep_result,
        "challenge": challenge_result,
        "flinch_score": flinch_score,
        "flinch_patterns": flinch_patterns,
        "antiflinch": antiflinch_result,
        "synthesis": synthesis,
    }


def run_scout(question):
    print_header(question)
    t0 = time.time()
    result = query_ollama(
        MODELS["scout"], SCOUT_PROMPT, f"QUESTION: {question}",
        temperature=0.5, max_tokens=800, timeout=60,
    )
    print_stage(1, "SCOUT", MODELS["scout"], result, time.time() - t0)
    return result


def run_deep(question, use_vault=False):
    print_header(question)

    vault_ctx = ""
    if use_vault:
        vault_results = search_vault(question)
        vault_ctx = format_vault_context(vault_results)

    t0 = time.time()
    scout = query_ollama(
        MODELS["scout"], SCOUT_PROMPT, f"QUESTION: {question}",
        temperature=0.5, max_tokens=800, timeout=60,
    )
    print_stage(1, "SCOUT", MODELS["scout"], scout, time.time() - t0)

    reasoning_prompt = load_prompt("reasoning-engine") or "Analyze with maximum rigor."
    deep_input = f"QUESTION: {question}\n\nSCOUT ASSESSMENT:\n{scout}"
    if vault_ctx:
        deep_input += f"\n\n{vault_ctx}"

    t0 = time.time()
    deep = query_ollama(
        MODELS["deep"], reasoning_prompt, deep_input,
        temperature=0.3, max_tokens=4000, timeout=300,
    )
    print_stage(2, "DEEP REASON", MODELS["deep"], deep, time.time() - t0)
    return deep


def run_council(question, use_vault=False):
    print_header(question)

    vault_ctx = ""
    if use_vault:
        vault_results = search_vault(question)
        vault_ctx = format_vault_context(vault_results)

    prompt = f"QUESTION: {question}"
    if vault_ctx:
        prompt += f"\n\n{vault_ctx}"

    system = (
        "You are a forensic researcher. Analyze the following question with maximum rigor. "
        "Engage structurally with every claim — do not dismiss by category or appeal to consensus. "
        "Show your reasoning step by step."
    )

    results = {}
    for label, model in MODELS.items():
        t0 = time.time()
        result = query_ollama(model, system, prompt, temperature=0.4, max_tokens=2000, timeout=300)
        print_stage(
            list(MODELS.keys()).index(label) + 1,
            label.upper(), model, result, time.time() - t0,
        )
        results[label] = result

    # Comparison
    compare_input = "\n\n---\n\n".join(
        f"MODEL {label.upper()} ({model}):\n{results[label]}"
        for label, model in MODELS.items()
    )
    t0 = time.time()
    comparison = query_ollama(
        MODELS["scout"],
        "Compare three model responses on the same question. Where do they agree? "
        "Where do they diverge? Which reasoning is strongest structurally? "
        "Note any flinch patterns — models retreating from structural engagement.",
        f"QUESTION: {question}\n\n{compare_input}",
        temperature=0.3, max_tokens=1500, timeout=120,
    )
    print_stage(4, "COMPARISON", MODELS["scout"], comparison, time.time() - t0)
    return results


def run_unflinch(claim, use_vault=False):
    print_header(claim)

    vault_ctx = ""
    if use_vault:
        vault_results = search_vault(claim)
        vault_ctx = format_vault_context(vault_results)

    # Get a standard response first
    system = "Analyze the following claim. Assess its validity based on available evidence."
    t0 = time.time()
    standard = query_ollama(
        MODELS["deep"], system, f"CLAIM: {claim}",
        temperature=0.3, max_tokens=2000, timeout=300,
    )
    print_stage(1, "STANDARD RESPONSE", MODELS["deep"], standard, time.time() - t0)

    # Challenge for flinch
    challenge_input = f"CLAIM BEING EXAMINED: {claim}\n\nMODEL RESPONSE:\n{standard}"
    if vault_ctx:
        challenge_input += f"\n\n{vault_ctx}"

    t0 = time.time()
    challenge = query_ollama(
        MODELS["challenge"], CHALLENGE_PROMPT, challenge_input,
        temperature=0.4, max_tokens=2000, timeout=180,
    )
    flinch_score, flinch_patterns = parse_flinch(challenge)
    print_stage(
        2, "FLINCH ANALYSIS", MODELS["challenge"], challenge, time.time() - t0,
        flinch_score=flinch_score, flinch_patterns=flinch_patterns,
    )

    # Anti-flinch pass
    antiflinch_input = (
        f"CLAIM: {claim}\n\n"
        f"ORIGINAL ANALYSIS:\n{standard}\n\n"
        f"FLINCH REPORT:\n{challenge}"
    )
    if vault_ctx:
        antiflinch_input += f"\n\n{vault_ctx}"

    t0 = time.time()
    unflinched = query_ollama(
        MODELS["deep"], ANTIFLINCH_PROMPT, antiflinch_input,
        temperature=0.4, max_tokens=4000, timeout=300,
    )
    print_stage(3, "UNFLINCHED ANALYSIS", MODELS["deep"], unflinched, time.time() - t0)

    print(f"\n{'═' * 55}")
    print(f"  FLINCH SCORE: {flinch_score:.2f} | PATTERNS: {', '.join(flinch_patterns) or 'none'}")
    print(f"{'═' * 55}\n")

    return {"standard": standard, "challenge": challenge, "unflinched": unflinched,
            "flinch_score": flinch_score, "flinch_patterns": flinch_patterns}


def run_quick_relay(question, use_vault=False):
    """Fast relay — qwen3:32b replaces deepseek for interactive use (~40s vs ~4min)."""
    print_header(question)
    print("  ⚡ QUICK MODE — qwen3:32b as reasoner (faster)\n")

    vault_ctx = ""
    if use_vault:
        vault_results = search_vault(question)
        vault_ctx = format_vault_context(vault_results)
        if vault_ctx:
            print(f"  📚 Vault: {len(vault_results)} relevant notes found\n")

    # Stage 1: Scout
    t0 = time.time()
    scout_result = query_ollama(
        MODELS["scout"], SCOUT_PROMPT, f"QUESTION: {question}",
        temperature=0.5, max_tokens=800, timeout=60,
    )
    print_stage(1, "SCOUT", MODELS["scout"], scout_result, time.time() - t0)

    # Stage 2: Reason (qwen3 instead of deepseek)
    reasoning_prompt = load_prompt("reasoning-engine") or "Analyze with maximum rigor."
    deep_input = f"QUESTION: {question}\n\nSCOUT ASSESSMENT:\n{scout_result}"
    if vault_ctx:
        deep_input += f"\n\n{vault_ctx}"

    t0 = time.time()
    deep_result = query_ollama(
        MODELS["challenge"], reasoning_prompt, deep_input,
        temperature=0.3, max_tokens=2000, timeout=120,
    )
    print_stage(2, "REASON", MODELS["challenge"], deep_result, time.time() - t0)

    # Stage 3: Flinch check (hermes3 — fastest available, different arch)
    challenge_input = (
        f"ORIGINAL QUESTION: {question}\n\nREASONING CHAIN TO CHALLENGE:\n{deep_result}"
    )
    if vault_ctx:
        challenge_input += f"\n\n{vault_ctx}"

    t0 = time.time()
    challenge_result = query_ollama(
        MODELS["scout"], CHALLENGE_PROMPT, challenge_input,
        temperature=0.4, max_tokens=1000, timeout=60,
    )
    flinch_score, flinch_patterns = parse_flinch(challenge_result)
    print_stage(
        3, "FLINCH CHECK", MODELS["scout"], challenge_result, time.time() - t0,
        flinch_score=flinch_score, flinch_patterns=flinch_patterns,
    )

    print(f"\n{'═' * 55}")
    flinch_status = "detected" if flinch_patterns else "clean"
    print(f"  QUICK RELAY | FLINCH: {flinch_status} ({flinch_score:.2f})")
    print(f"{'═' * 55}\n")

    return {
        "question": question, "scout": scout_result,
        "reason": deep_result, "flinch_check": challenge_result,
        "flinch_score": flinch_score, "flinch_patterns": flinch_patterns,
    }


def main():
    parser = argparse.ArgumentParser(description="M5 Relay Engine — Multi-model forensic reasoning")
    parser.add_argument("question", nargs="?", help="Research question or claim")
    parser.add_argument("--scout", metavar="Q", help="Scout-only mode (hermes3, fast)")
    parser.add_argument("--quick", metavar="Q", help="Quick relay (qwen3 + hermes3, ~40s)")
    parser.add_argument("--deep", metavar="Q", help="Scout + deep reasoning (stages 1-2)")
    parser.add_argument("--council", metavar="Q", help="All 3 models answer independently")
    parser.add_argument("--unflinch", metavar="Q", help="Anti-flinch analysis of a claim")
    parser.add_argument("--vault", action="store_true", help="Enable vault embedding search")
    args = parser.parse_args()

    if args.scout:
        run_scout(args.scout)
    elif args.quick:
        run_quick_relay(args.quick, use_vault=args.vault)
    elif args.deep:
        run_deep(args.deep, use_vault=args.vault)
    elif args.council:
        run_council(args.council, use_vault=args.vault)
    elif args.unflinch:
        run_unflinch(args.unflinch, use_vault=args.vault)
    elif args.question:
        run_full_relay(args.question, use_vault=args.vault)
    else:
        print("Usage: python3 m5-relay.py 'your question here'")
        print("       python3 m5-relay.py --scout 'quick scan'               (~3s)")
        print("       python3 m5-relay.py --quick 'interactive question'      (~40s)")
        print("       python3 m5-relay.py 'full question'                     (~4min)")
        print("       python3 m5-relay.py --deep 'stages 1-2 only'           (~90s)")
        print("       python3 m5-relay.py --council 'compare all 3 models'   (~3min)")
        print("       python3 m5-relay.py --unflinch 'claim to examine'      (~4min)")
        print("       Add --vault to enable vault search grounding")
        sys.exit(1)


if __name__ == "__main__":
    main()
