#!/usr/bin/env python3
"""
Vault Search — hybrid semantic + FTS5 search over Cathedral vault.

Usage:
    python3 vault-search.py "sacred geometry tesla"
    python3 vault-search.py --semantic "energy vortex patterns"
    python3 vault-search.py --keyword "Schauberger water"
    python3 vault-search.py --ask "What did Tesla demonstrate about wireless power?"
    python3 vault-search.py --deep-ask "What are the structural parallels between vortex math and sacred geometry?"
"""

import argparse
import json
import math
import os
import sqlite3
import struct
import sys
import time
import urllib.request

DB_PATH = os.path.join(os.path.dirname(__file__), "vault-vectors.db")
OLLAMA_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
REASON_MODEL = "hermes3"
DEEP_MODEL = "deepseek-r1:70b"
EMBED_DIM = 768
REASONING_PROMPT_PATH = os.path.expanduser("~/nanoclaw/prompts/reasoning-engine.txt")

FOLDER_COLORS = {
    "04_Esoteric_Studies": "purple",
    "06_Methods": "blue",
    "06_Basic_Reflex_Syllabus": "gold",
    "03_Projects": "green",
    "02_Refined_Gold": "amber",
    "09_Artifacts": "cyan",
    "01_Raw_Transcripts": "dim",
    "00_Staging": "dim",
    "05_Archive_Graveyard": "dim",
    "05_Sessions": "teal",
    "05_Universes": "magenta",
    "07_Design_Vault": "pink",
    "07_Social_Content": "orange",
    "08_Project_Orchestrator": "green",
    "03_The_Sages": "violet",
}


def get_db():
    if not os.path.exists(DB_PATH):
        print("  No vault-vectors.db. Run vault-embeddings.py first.")
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_query_embedding(query):
    payload = json.dumps({"model": EMBED_MODEL, "prompt": query}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
    return result.get("embedding", [])


def load_all_vectors(conn):
    rows = conn.execute(
        "SELECT e.note_id, e.vector FROM embeddings e"
    ).fetchall()
    vectors = {}
    for row in rows:
        vec = struct.unpack(f"{EMBED_DIM}f", row["vector"])
        vectors[row["note_id"]] = vec
    return vectors


def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def semantic_search(conn, query, limit=20):
    q_vec = get_query_embedding(query)
    if not q_vec:
        return []

    all_vecs = load_all_vectors(conn)
    scores = []
    for note_id, vec in all_vecs.items():
        sim = cosine_similarity(q_vec, vec)
        scores.append((note_id, sim))

    scores.sort(key=lambda x: x[1], reverse=True)
    top = scores[:limit]

    results = []
    for note_id, score in top:
        row = conn.execute(
            "SELECT path, title, folder, content FROM notes WHERE id = ?",
            (note_id,)
        ).fetchone()
        if row:
            results.append({
                "note_id": note_id,
                "path": row["path"],
                "title": row["title"],
                "folder": row["folder"],
                "snippet": (row["content"] or "")[:200],
                "score": score,
                "source": "semantic"
            })
    return results


def keyword_search(conn, query, limit=20):
    terms = query.replace("'", "").replace('"', "")
    try:
        rows = conn.execute(
            """SELECT n.id, n.path, n.title, n.folder, n.content,
                      rank
               FROM notes_fts fts
               JOIN notes n ON n.id = fts.rowid
               WHERE notes_fts MATCH ?
               ORDER BY rank
               LIMIT ?""",
            (terms, limit)
        ).fetchall()
    except Exception:
        words = terms.split()
        if len(words) > 1:
            or_query = " OR ".join(w for w in words if len(w) > 2)
            try:
                rows = conn.execute(
                    """SELECT n.id, n.path, n.title, n.folder, n.content, rank
                       FROM notes_fts fts
                       JOIN notes n ON n.id = fts.rowid
                       WHERE notes_fts MATCH ?
                       ORDER BY rank LIMIT ?""",
                    (or_query, limit)
                ).fetchall()
            except Exception:
                return []
        else:
            return []

    results = []
    for row in rows:
        results.append({
            "note_id": row["id"],
            "path": row["path"],
            "title": row["title"],
            "folder": row["folder"],
            "snippet": (row["content"] or "")[:200],
            "score": -row["rank"],
            "source": "keyword"
        })
    return results


def hybrid_search(conn, query, limit=20):
    sem = semantic_search(conn, query, limit=limit * 2)
    kw = keyword_search(conn, query, limit=limit * 2)

    if sem:
        max_sem = max(r["score"] for r in sem) or 1.0
        for r in sem:
            r["norm_score"] = r["score"] / max_sem
    if kw:
        max_kw = max(r["score"] for r in kw) or 1.0
        for r in kw:
            r["norm_score"] = r["score"] / max_kw

    merged = {}
    for r in sem:
        merged[r["note_id"]] = {
            **r,
            "combined": r["norm_score"] * 0.6
        }
    for r in kw:
        nid = r["note_id"]
        if nid in merged:
            merged[nid]["combined"] += r["norm_score"] * 0.4
            merged[nid]["source"] = "hybrid"
        else:
            merged[nid] = {
                **r,
                "combined": r["norm_score"] * 0.4
            }

    ranked = sorted(merged.values(), key=lambda x: x["combined"], reverse=True)
    return ranked[:limit]


def search(conn, query, mode="hybrid", limit=20):
    if mode == "semantic":
        return semantic_search(conn, query, limit)
    elif mode == "keyword":
        return keyword_search(conn, query, limit)
    else:
        return hybrid_search(conn, query, limit)


def format_context(results):
    parts = []
    for i, r in enumerate(results[:20]):
        parts.append(
            f"[{i+1}] {r['title']} ({r['folder']}/{r['path']})\n{r['snippet']}"
        )
    return "\n\n---\n\n".join(parts)


def load_reasoning_prompt():
    try:
        with open(REASONING_PROMPT_PATH, "r") as f:
            return f.read()
    except Exception:
        return "You are a forensic research assistant. Analyze evidence rigorously."


def query_model(prompt, context, model):
    system = load_reasoning_prompt()
    system += f"\n\nVAULT EVIDENCE (from {len(context)} sources):\n"
    system += context

    payload = json.dumps({
        "model": model,
        "system": system,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.4, "num_predict": 2000}
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"}
    )

    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read().decode())
    return result.get("response", "").strip()


def print_results(results, query):
    print(f"\n  VAULT SEARCH: \"{query}\"")
    print(f"  {'─'*50}")
    if not results:
        print("  No results found.")
        return

    for i, r in enumerate(results[:20]):
        score = r.get("combined", r.get("norm_score", r.get("score", 0)))
        bar_len = int(score * 20) if score <= 1.0 else int(min(score / 5, 1.0) * 20)
        bar = "█" * bar_len + "░" * (20 - bar_len)
        src = r.get("source", "?")[0].upper()
        print(f"\n  {i+1}. [{src}] {r['title']}")
        print(f"     {r['folder']}/{r['path']}")
        print(f"     {bar} {score:.3f}")
        snippet = r["snippet"].replace("\n", " ").strip()
        if snippet:
            print(f"     {snippet[:120]}...")
    print()


def cmd_ask(query, model=REASON_MODEL):
    conn = get_db()
    print(f"  Searching vault...")
    results = hybrid_search(conn, query, limit=20)
    if not results:
        print("  No vault evidence found.")
        conn.close()
        return

    print(f"  Found {len(results)} relevant notes. Reasoning with {model}...")
    context = format_context(results)

    t0 = time.time()
    answer = query_model(query, context, model)
    elapsed = time.time() - t0

    print(f"\n  {'═'*50}")
    print(f"  VAULT RAG — {model} ({elapsed:.0f}s)")
    print(f"  {'═'*50}\n")
    print(f"  {answer}\n")
    print(f"  {'─'*50}")
    print(f"  Sources ({len(results)} notes):")
    for i, r in enumerate(results[:10]):
        print(f"    {i+1}. {r['title']} ({r['folder']})")
    print()
    conn.close()


def get_stats():
    if not os.path.exists(DB_PATH):
        return {"total_notes": 0, "total_embedded": 0, "last_embedded": None, "db_size_mb": 0, "folders": {}}
    conn = sqlite3.connect(DB_PATH)
    total_notes = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    total_embedded = conn.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0]
    folders = dict(conn.execute(
        "SELECT folder, COUNT(*) FROM notes GROUP BY folder ORDER BY COUNT(*) DESC"
    ).fetchall())
    last = conn.execute(
        "SELECT embedded_at FROM notes ORDER BY embedded_at DESC LIMIT 1"
    ).fetchone()
    db_size = os.path.getsize(DB_PATH) / 1024 / 1024
    conn.close()
    return {
        "total_notes": total_notes,
        "total_embedded": total_embedded,
        "last_embedded": last[0] if last else None,
        "db_size_mb": round(db_size, 1),
        "folders": folders
    }


def main():
    parser = argparse.ArgumentParser(description="Vault Search")
    parser.add_argument("query", nargs="?", help="Search query")
    parser.add_argument("--semantic", metavar="Q", help="Semantic search only")
    parser.add_argument("--keyword", metavar="Q", help="Keyword FTS5 search only")
    parser.add_argument("--ask", metavar="Q", help="RAG answer via hermes3")
    parser.add_argument("--deep-ask", metavar="Q", help="RAG answer via deepseek-r1:70b")
    parser.add_argument("--limit", type=int, default=20, help="Max results")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    if args.ask:
        cmd_ask(args.ask, REASON_MODEL)
    elif args.deep_ask:
        cmd_ask(args.deep_ask, DEEP_MODEL)
    elif args.semantic:
        conn = get_db()
        results = semantic_search(conn, args.semantic, args.limit)
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print_results(results, args.semantic)
        conn.close()
    elif args.keyword:
        conn = get_db()
        results = keyword_search(conn, args.keyword, args.limit)
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print_results(results, args.keyword)
        conn.close()
    elif args.query:
        conn = get_db()
        results = hybrid_search(conn, args.query, args.limit)
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print_results(results, args.query)
        conn.close()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
