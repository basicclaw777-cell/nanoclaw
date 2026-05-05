#!/usr/bin/env python3
"""
vault_reader.py — Direct filesystem vault access.
Matches mcpvault tool signatures: search_notes, read_note, list_directory.
Also callable as CLI for telegram-bot.js spawn.

Usage:
    python3 vault_reader.py search "laminar theft"
    python3 vault_reader.py read "04_Esoteric_Studies/Laminar-Theft.md"
    python3 vault_reader.py list "08_Project_Orchestrator/projects"
"""

import sys
from pathlib import Path

VAULT_PATH  = Path.home() / "cathedral-vault"
SKIP_DIRS   = {".obsidian", ".git", ".trash", "05_Archive_Graveyard"}
MAX_FILES   = 500
SNIPPET_LEN = 200
READ_CAP    = 8000


# ── search_notes ──────────────────────────────────────────────────────────────

def search_notes(query: str, vault_path: Path = VAULT_PATH, top_k: int = 3) -> list:
    """
    Search vault .md files for query terms.
    Returns list of {path, matches, title_match, snippet, domain, title, first_line} sorted by relevance.
    """
    terms = [t.lower() for t in query.strip().split() if t]
    if not terms:
        return []

    vault   = Path(vault_path).expanduser().resolve()
    results = []
    scanned = 0

    for md_file in vault.rglob("*.md"):
        if scanned >= MAX_FILES:
            break
        if any(part in SKIP_DIRS for part in md_file.parts):
            continue

        scanned += 1
        try:
            content = md_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        content_lower = content.lower()
        stem_lower    = md_file.stem.lower()

        term_hits   = sum(content_lower.count(t) for t in terms)
        title_match = sum(1 for t in terms if t in stem_lower)

        if term_hits == 0 and title_match == 0:
            continue

        snippet = ""
        first_line = ""
        for line in content.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("---") and not first_line:
                first_line = stripped[:SNIPPET_LEN]
            if any(t in line.lower() for t in terms):
                snippet = stripped[:SNIPPET_LEN]
                break

        # Extract domain from path (first directory component)
        rel = md_file.relative_to(vault)
        domain = rel.parts[0] if len(rel.parts) > 1 else "root"

        results.append({
            "path":        str(rel),
            "matches":     term_hits,
            "title_match": title_match,
            "snippet":     snippet,
            "domain":      domain,
            "title":       md_file.stem,
            "first_line":  first_line,
        })

    results.sort(key=lambda x: (x["title_match"] * 10 + x["matches"]), reverse=True)
    return results[:top_k]


# ── read_note ─────────────────────────────────────────────────────────────────

def read_note(path: str, vault_path: Path = VAULT_PATH, cap: int = None) -> str:
    """
    Read full content of a vault .md file.
    path is relative to vault root.
    """
    vault     = Path(vault_path).expanduser().resolve()
    note_path = (vault / path).resolve()

    if not str(note_path).startswith(str(vault)):
        raise ValueError(f"Path escapes vault: {path}")
    if not note_path.exists():
        raise FileNotFoundError(f"Note not found: {path}")

    content = note_path.read_text(encoding="utf-8", errors="ignore")
    if cap:
        content = content[:cap]
    return content


# ── list_directory ────────────────────────────────────────────────────────────

def list_directory(path: str = "", vault_path: Path = VAULT_PATH) -> dict:
    """
    List .md files and subdirectories in a vault folder.
    path is relative to vault root; empty string = vault root.
    """
    vault    = Path(vault_path).expanduser().resolve()
    dir_path = (vault / path).resolve() if path else vault

    if not str(dir_path).startswith(str(vault)):
        raise ValueError(f"Path escapes vault: {path}")
    if not dir_path.exists():
        raise FileNotFoundError(f"Directory not found: {path}")
    if not dir_path.is_dir():
        raise NotADirectoryError(f"Not a directory: {path}")

    entries = sorted(dir_path.iterdir())
    files   = [f.name for f in entries if f.is_file() and f.suffix == ".md"]
    subdirs = [d.name for d in entries if d.is_dir() and not d.name.startswith(".")]

    return {"files": files, "subdirectories": subdirs}


# ── inject format (for cath_api.py dynamic block) ────────────────────────────

def format_vault_search(results: list, query: str) -> str:
    """Format search results for injection into dynamic block."""
    if not results:
        return ""
    lines = [f"## VAULT NOTES — '{query}' (top {len(results)} matches)\n"]
    for r in results:
        lines.append(f"### {r['path']}")
        if r["snippet"]:
            lines.append(r["snippet"])
        lines.append("")
    return "\n".join(lines)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: vault_reader.py <search|read|list> [arg]")
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "search":
        # Parse optional flags from args
        args = sys.argv[2:]
        top_k = 3
        json_out = False
        query_parts = []
        i = 0
        while i < len(args):
            if args[i] == "--top_k" and i + 1 < len(args):
                top_k = int(args[i + 1])
                i += 2
            elif args[i] == "--json":
                json_out = True
                i += 1
            else:
                query_parts.append(args[i])
                i += 1
        query = " ".join(query_parts)
        if not query:
            print("Usage: vault_reader.py search <query> [--top_k N] [--json]")
            sys.exit(1)
        results = search_notes(query, top_k=top_k)
        if json_out:
            import json
            print(json.dumps(results))
        elif not results:
            print(f"No matches for: {query}")
        else:
            for r in results:
                print(f"[{r['matches']} hits] {r['path']}")
                if r["snippet"]:
                    print(f"  {r['snippet']}")
                print()

    elif cmd == "read":
        path = sys.argv[2] if len(sys.argv) > 2 else ""
        if not path:
            print("Usage: vault_reader.py read <path>")
            sys.exit(1)
        try:
            content = read_note(path, cap=READ_CAP)
            print(content)
        except (FileNotFoundError, ValueError) as e:
            print(f"Error: {e}")
            sys.exit(1)

    elif cmd == "list":
        path = sys.argv[2] if len(sys.argv) > 2 else ""
        try:
            result = list_directory(path)
            if result["subdirectories"]:
                print("Folders:")
                for d in result["subdirectories"]:
                    print(f"  {d}/")
            if result["files"]:
                print("Notes:")
                for f in result["files"]:
                    print(f"  {f}")
        except (FileNotFoundError, ValueError, NotADirectoryError) as e:
            print(f"Error: {e}")
            sys.exit(1)

    else:
        print(f"Unknown command: {cmd}. Use search, read, or list.")
        sys.exit(1)


if __name__ == "__main__":
    main()
