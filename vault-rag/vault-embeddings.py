#!/usr/bin/env python3
"""
Vault Embeddings — nomic-embed-text over 15K+ Obsidian vault notes.
Stores vectors in SQLite for semantic search.

Usage:
    python3 vault-embeddings.py          # Embed all new/changed notes
    python3 vault-embeddings.py --stats  # Show embedding stats
    python3 vault-embeddings.py --rebuild # Drop and re-embed everything
"""

import argparse
import json
import os
import sqlite3
import struct
import sys
import time
import urllib.request

VAULT_PATH = os.path.expanduser("~/cathedral-vault")
DB_PATH = os.path.join(os.path.dirname(__file__), "vault-vectors.db")
OLLAMA_URL = "http://localhost:11434"
MODEL = "nomic-embed-text"
MAX_CHARS = 8000
BATCH_SIZE = 10
EMBED_DIM = 768


def init_db(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE,
        title TEXT,
        folder TEXT,
        content TEXT,
        char_count INTEGER,
        mtime REAL,
        embedded_at TEXT
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS embeddings (
        note_id INTEGER PRIMARY KEY REFERENCES notes(id),
        vector BLOB
    )""")
    try:
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, content, folder)")
    except sqlite3.OperationalError:
        pass
    conn.commit()


def get_embed(text):
    payload = json.dumps({"model": MODEL, "prompt": text}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
    vec = result.get("embedding", [])
    if len(vec) != EMBED_DIM:
        return None
    return struct.pack(f"{EMBED_DIM}f", *vec)


def extract_title(content, filename):
    for line in content.split("\n")[:10]:
        line = line.strip()
        if line.startswith("# ") and len(line) > 2:
            return line[2:].strip()
    return os.path.splitext(filename)[0].replace("-", " ").replace("_", " ")


def scan_vault():
    notes = []
    for root, dirs, files in os.walk(VAULT_PATH):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if not f.endswith(".md"):
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, VAULT_PATH)
            parts = rel.split(os.sep)
            folder = parts[0] if len(parts) > 1 else "root"
            mtime = os.path.getmtime(full)
            notes.append((full, rel, folder, mtime))
    return notes


def needs_embedding(conn, rel_path, mtime):
    row = conn.execute(
        "SELECT id, mtime FROM notes WHERE path = ?", (rel_path,)
    ).fetchone()
    if row is None:
        return True
    if row[1] is None or mtime > row[1]:
        return True
    has_vec = conn.execute(
        "SELECT 1 FROM embeddings WHERE note_id = ?", (row[0],)
    ).fetchone()
    return has_vec is None


def embed_note(conn, full_path, rel_path, folder, mtime):
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception:
        return False

    title = extract_title(content, os.path.basename(full_path))
    truncated = content[:MAX_CHARS]
    embed_text = f"{title}\n\n{truncated}"

    vec = get_embed(embed_text)
    if vec is None:
        return False

    now = time.strftime("%Y-%m-%dT%H:%M:%S")

    existing = conn.execute("SELECT id FROM notes WHERE path = ?", (rel_path,)).fetchone()
    if existing:
        note_id = existing[0]
        conn.execute(
            "UPDATE notes SET title=?, folder=?, content=?, char_count=?, mtime=?, embedded_at=? WHERE id=?",
            (title, folder, content[:MAX_CHARS], len(content), mtime, now, note_id)
        )
        conn.execute("DELETE FROM embeddings WHERE note_id = ?", (note_id,))
        conn.execute(
            "DELETE FROM notes_fts WHERE rowid = ?", (note_id,)
        )
    else:
        cur = conn.execute(
            "INSERT INTO notes (path, title, folder, content, char_count, mtime, embedded_at) VALUES (?,?,?,?,?,?,?)",
            (rel_path, title, folder, content[:MAX_CHARS], len(content), mtime, now)
        )
        note_id = cur.lastrowid

    conn.execute("INSERT INTO embeddings (note_id, vector) VALUES (?,?)", (note_id, vec))
    conn.execute("INSERT INTO notes_fts (rowid, title, content, folder) VALUES (?,?,?,?)",
                 (note_id, title, content[:MAX_CHARS], folder))
    return True


def run_stats(conn):
    total_notes = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    total_embedded = conn.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0]
    folders = conn.execute(
        "SELECT folder, COUNT(*) FROM notes GROUP BY folder ORDER BY COUNT(*) DESC"
    ).fetchall()
    last = conn.execute(
        "SELECT embedded_at FROM notes ORDER BY embedded_at DESC LIMIT 1"
    ).fetchone()
    db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

    print(f"\n  VAULT EMBEDDINGS")
    print(f"  {'─'*40}")
    print(f"  Notes indexed:  {total_notes}")
    print(f"  Vectors stored: {total_embedded}")
    print(f"  Last embedded:  {last[0] if last else 'never'}")
    print(f"  DB size:        {db_size / 1024 / 1024:.1f} MB")
    print(f"\n  BY FOLDER:")
    for folder, count in folders:
        print(f"    {folder}: {count}")
    print()


def run_embed(rebuild=False):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    if rebuild:
        print("  Rebuilding — dropping existing data...")
        conn.execute("DELETE FROM embeddings")
        conn.execute("DELETE FROM notes_fts")
        conn.execute("DELETE FROM notes")
        conn.commit()

    init_db(conn)

    vault_notes = scan_vault()
    print(f"  Scanned vault: {len(vault_notes)} .md files")

    to_embed = []
    for full, rel, folder, mtime in vault_notes:
        if rebuild or needs_embedding(conn, rel, mtime):
            to_embed.append((full, rel, folder, mtime))

    if not to_embed:
        print("  All notes already embedded. Use --rebuild to force.")
        conn.close()
        return

    print(f"  Need to embed: {len(to_embed)} notes")
    print()

    done = 0
    failed = 0
    start = time.time()

    for i, (full, rel, folder, mtime) in enumerate(to_embed):
        try:
            ok = embed_note(conn, full, rel, folder, mtime)
            if ok:
                done += 1
            else:
                failed += 1
        except Exception as e:
            failed += 1
            if done < 5:
                print(f"  ERROR on {rel}: {e}")

        if (i + 1) % BATCH_SIZE == 0:
            conn.commit()
            time.sleep(0.05)

        if (i + 1) % 100 == 0 or i + 1 == len(to_embed):
            elapsed = time.time() - start
            rate = done / elapsed if elapsed > 0 else 0
            remaining = (len(to_embed) - i - 1) / rate if rate > 0 else 0
            print(f"  [{i+1}/{len(to_embed)}] embedded={done} failed={failed} "
                  f"rate={rate:.1f}/s eta={remaining:.0f}s")

    conn.commit()
    conn.close()

    elapsed = time.time() - start
    print(f"\n  Done. {done} embedded, {failed} failed in {elapsed:.0f}s")


def main():
    parser = argparse.ArgumentParser(description="Vault Embeddings")
    parser.add_argument("--stats", action="store_true", help="Show stats")
    parser.add_argument("--rebuild", action="store_true", help="Drop and re-embed everything")
    args = parser.parse_args()

    if args.stats:
        if not os.path.exists(DB_PATH):
            print("  No DB yet. Run without --stats first.")
            return
        conn = sqlite3.connect(DB_PATH)
        run_stats(conn)
        conn.close()
    else:
        run_embed(rebuild=args.rebuild)


if __name__ == "__main__":
    main()
