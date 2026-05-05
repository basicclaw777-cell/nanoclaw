#!/usr/bin/env python3
"""
cath_api.py — Cathedral API client with two-block prompt caching.

Block 1 (static, cached 1h):
    transmission + system-prompt.txt persona only.
    Never changes between calls — served from cache after first write.

Block 2 (dynamic, not cached):
    Current session state (from cath-state.json) + top-20 nuggets (all grades)
    retrieved semantically for the user's query.

Usage:
    python3 cath_api.py --test               # 3 canned queries, cache report
    python3 cath_api.py --query "question"   # single query
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────

MODEL         = "deepseek-chat"
MAX_TOKENS    = 1024
SYSTEM_PROMPT = Path.home() / "cathedral-vault" / ".cache" / "system-prompt.txt"
NUGGETS_PATH  = Path.home() / "Cathedral" / "vault" / "nuggets.json"
STATE_PATH    = Path.home() / "Cathedral" / "cath-state.json"
INDEX_DIR     = Path.home() / "Cathedral" / "vault"

USE_LOCAL = os.environ.get('CATH_BACKEND', 'deepseek') == 'local'


# ── Static block ──────────────────────────────────────────────────────────────

def load_persona() -> str:
    if SYSTEM_PROMPT.exists():
        return SYSTEM_PROMPT.read_text(encoding="utf-8").strip()
    return (
        "You are Cath. Cathedral intelligence. Paul's cognitive extension. "
        "Speak with precision. Never flatter. Never pad. Land in the middle of the thought."
    )


TOKEN_CAP = 20_000  # max tokens for static block (~80k chars)

def load_b_nuggets() -> str:
    if not NUGGETS_PATH.exists():
        return ""
    with open(NUGGETS_PATH, "r", encoding="utf-8") as f:
        nuggets = json.load(f)
    b_grade = [n for n in nuggets if n.get("grade") == "B"]
    if not b_grade:
        return ""
    header = "## VAULT — GRADE B (VERIFIED STRUCTURAL EVIDENCE)\n"
    lines = [header]
    token_count = len(header) // 4
    for n in b_grade:
        nugget_lines = [
            f"### [{n['grade']}] {n['title']}",
            f"Domain: {n['domain']} | Sources: {', '.join(str(s) for s in n.get('sources', []))}",
        ]
        if n.get("tags"):
            nugget_lines.append(f"Tags: {', '.join(str(t) for t in n['tags'])}")
        nugget_lines.append("")
        nugget_lines.append(n.get("content", "").strip())
        nugget_lines.append("\n---\n")
        chunk = "\n".join(nugget_lines)
        chunk_tokens = len(chunk) // 4
        if token_count + chunk_tokens > TOKEN_CAP:
            break
        lines.append(chunk)
        token_count += chunk_tokens
    return "\n".join(lines)


TRANSMISSION_PATH = Path.home() / "Cathedral" / "cath_transmission.md"


def load_transmission() -> str:
    if not TRANSMISSION_PATH.exists():
        return ""
    content = TRANSMISSION_PATH.read_text(encoding="utf-8").strip()
    if not content:
        return ""
    return f"## TRANSMISSION\n\n{content}"


def build_static_block() -> dict:
    """Block 1: transmission + persona only. B-grade nuggets move to retrieval."""
    transmission = load_transmission()
    persona      = load_persona()
    parts = []
    if transmission:
        parts.append(transmission)
    parts.append(persona)
    return {
        "type": "text",
        "text": "\n\n".join(parts),
    }


# ── Dynamic block ─────────────────────────────────────────────────────────────

def load_state() -> Optional[dict]:
    if not STATE_PATH.exists():
        return None
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def format_retrieved(nuggets: list[dict]) -> str:
    if not nuggets:
        return ""
    lines = ["## RETRIEVED VAULT CONTEXT (semantic top-20)\n"]
    for n in nuggets:
        lines.append(f"### [{n['grade']}] {n['title']}  (score: {n.get('score', 0):.2f})")
        lines.append(f"Domain: {n['domain']}")
        lines.append("")
        lines.append(n.get("content", "").strip()[:600])
        lines.append("\n---\n")
    return "\n".join(lines)


def build_dynamic_block(query: str, retrieve_fn, history: list = None) -> dict:
    """Block 2: conversation history + session state + top-20 retrieved C/D nuggets. Not cached."""
    parts = []

    if history:
        lines = ["## CONVERSATION HISTORY\n"]
        for turn in history[-10:]:
            speaker = "Paul" if turn.get("role") == "user" else "Cath"
            lines.append(f"{speaker}: {turn.get('content', '')[:400]}")
        parts.append("\n".join(lines))
        parts.append("")

    state = load_state()
    if state:
        parts.append("## SESSION STATE")
        if state.get("active_threads"):
            parts.append("Active threads:")
            for t in state["active_threads"]:
                parts.append(f"  • {t}")
        if state.get("emotional_register"):
            parts.append(f"Emotional register: {state['emotional_register']}")
        parts.append("")

    try:
        retrieved = retrieve_fn(query, k=10)
        parts.append(format_retrieved(retrieved))
    except FileNotFoundError:
        parts.append(
            "## VAULT INDEX\n"
            f"Index not built. Run: python3 {INDEX_DIR}/cathedral_index.py --build"
        )
    except ImportError as e:
        parts.append(f"## VAULT INDEX\nRetrieval unavailable: {e}")

    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from vault_reader import search_notes, format_vault_search
        vault_hits = search_notes(query, top_k=3)
        if vault_hits:
            parts.append(format_vault_search(vault_hits, query))
    except Exception:
        pass

    return {
        "type": "text",
        "text": "\n".join(parts).strip(),
    }


# ── API call ──────────────────────────────────────────────────────────────────

def call_cath(
    client,
    static_block: dict,
    query: str,
    retrieve_fn,
    history: list = None,
) -> dict:
    dynamic_block = build_dynamic_block(query, retrieve_fn, history=history)
    system_text = static_block["text"] + "\n\n" + dynamic_block["text"]

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        messages=[
            {"role": "system", "content": system_text},
            {"role": "user",   "content": query},
        ],
    )

    text  = response.choices[0].message.content if response.choices else ""
    usage = {
        "input_tokens":                response.usage.prompt_tokens,
        "output_tokens":               response.usage.completion_tokens,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens":     0,
    }
    _API_CALLS_LOG = Path.home() / "Cathedral" / "api_calls.jsonl"
    try:
        with open(_API_CALLS_LOG, "a", encoding="utf-8") as _f:
            _f.write(json.dumps({
                "timestamp":                   datetime.now(timezone.utc).isoformat(),
                "input_tokens":                usage["input_tokens"],
                "output_tokens":               usage["output_tokens"],
                "cache_creation_input_tokens": usage["cache_creation_input_tokens"],
                "cache_read_input_tokens":     usage["cache_read_input_tokens"],
                "response_words":              len(text.split()),
                "query_words":                 len(query.split()),
            }) + "\n")
    except Exception:
        pass

    return {"text": text, "usage": usage}


# ── Test mode ─────────────────────────────────────────────────────────────────

TEST_QUERIES = [
    "Which B-grade findings relate to Tesla's electromagnetic experiments?",
    "Where does phi appear as a structural ratio across independent researchers?",
    "What suppression stages are documented for Schauberger and Rife?",
]


def run_test(client, static_block: dict, retrieve_fn) -> None:
    print(f"\n{'═'*62}")
    print("  CATHEDRAL — DEEPSEEK / 3 CALLS")
    print(f"{'═'*62}\n")

    results = []
    for i, query in enumerate(TEST_QUERIES, 1):
        print(f"── Call {i}/3 {'─'*50}")
        print(f"Query: {query}\n")
        result = call_cath(client, static_block, query, retrieve_fn)
        results.append(result)

        print(f"Response:\n{result['text']}\n")
        u = result["usage"]
        print(f"Usage:")
        print(f"  input_tokens                : {u['input_tokens']}")
        print(f"  output_tokens               : {u['output_tokens']}")
        print(f"  cache_creation_input_tokens : {u['cache_creation_input_tokens']}")
        print(f"  cache_read_input_tokens     : {u['cache_read_input_tokens']}")

        print(f"  Status: OK\n")

    print(f"{'═'*62}")
    print("  TOKEN SUMMARY")
    print(f"{'═'*62}")
    for i, r in enumerate(results, 1):
        u = r["usage"]
        print(
            f"  Call {i}: "
            f"in={u['input_tokens']:>6}  "
            f"out={u['output_tokens']:>5}"
        )
    print(f"{'═'*62}\n")


# ── Local Ollama call ─────────────────────────────────────────────────────────

def call_cath_local(system_text, query, history=None):
    client = OpenAI(api_key='ollama', base_url='http://127.0.0.1:11434/v1')
    messages = [{"role": "system", "content": system_text}]
    if history:
        messages.extend(history[-10:])
    messages.append({"role": "user", "content": query})
    response = client.chat.completions.create(
        model='qwen3:14b',
        messages=messages,
        max_tokens=1024
    )
    text  = response.choices[0].message.content if response.choices else ""
    usage = {
        "input_tokens":                response.usage.prompt_tokens,
        "output_tokens":               response.usage.completion_tokens,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens":     0,
    }
    return {"text": text, "usage": usage}


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Cathedral API — two-block prompt caching")
    parser.add_argument("--test",    action="store_true", help="Run 3 test queries with cache report")
    parser.add_argument("--query",   type=str,            help="Single query to Cath")
    parser.add_argument("--history", type=str, default="[]", help="JSON array of prior conversation turns")
    args = parser.parse_args()

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print("Error: DEEPSEEK_API_KEY not set.")
        sys.exit(1)

    # Retrieval via vault_reader.py (filesystem keyword search — no model load needed)
    # cathedral_index semantic embeddings disabled: all-MiniLM-L6-v2 OOM-killed on 16GB with Ollama running
    retrieve_fn = lambda q, k=10: []

    client       = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    static_block = build_static_block()

    b_count   = static_block["text"].count("### [B]")
    est_tokens = int(len(static_block["text"]) / 4)
    print(f"Static block: ~{est_tokens} estimated tokens (transmission + persona only)", file=sys.stderr)

    if args.test:
        run_test(client, static_block, retrieve_fn)
    elif args.query:
        history = json.loads(args.history)
        if USE_LOCAL:
            system_text = static_block["text"] + "\n\n" + build_dynamic_block(args.query, retrieve_fn, history=history)["text"]
            result = call_cath_local(system_text, args.query, history=history)
        else:
            result = call_cath(client, static_block, args.query, retrieve_fn, history=history)
        print(result['text'].strip())
        u = result["usage"]
        print(
            f"in={u['input_tokens']}  out={u['output_tokens']}",
            file=sys.stderr
        )
    else:
        print("Pass --test or --query 'your question'")


if __name__ == "__main__":
    main()
