#!/usr/bin/env python3
"""
mem0-bridge.py — Mem0 memory layer for Cathedral
Local-only: Qdrant (Docker) + Ollama embeddings (nomic-embed-text)

Three memory types:
  - rejected: Ideas Paul said no to (don't suggest again)
  - rationale: WHY something was built a certain way
  - pattern: Working patterns, session structures, preferences

Usage:
  python3 mem0-bridge.py add "Paul rejected affiliate content machine — not his strength"
  python3 mem0-bridge.py search "what has Paul rejected"
  python3 mem0-bridge.py list
  python3 mem0-bridge.py forget <memory_id>
  python3 mem0-bridge.py context  (pre-session summary)
  python3 mem0-bridge.py server   (start JSON-RPC server for MCP)
"""

import json
import sys
import os
from datetime import datetime

from mem0 import Memory

# Configure Mem0 with local Qdrant + Ollama
config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "localhost",
            "port": 6333,
            "collection_name": "cathedral_memory",
            "embedding_model_dims": 768,
        },
    },
    "embedder": {
        "provider": "ollama",
        "config": {
            "model": "nomic-embed-text",
            "ollama_base_url": "http://localhost:11434",
        },
    },
    "llm": {
        "provider": "ollama",
        "config": {
            "model": "hermes3",
            "ollama_base_url": "http://localhost:11434",
            "temperature": 0.1,
            "max_tokens": 200,
        },
    },
}

USER_ID = "paul"

def get_memory():
    return Memory.from_config(config)

def add_memory(text, metadata=None):
    """Add a memory with optional metadata (type, domain, session_date)."""
    m = get_memory()
    meta = metadata or {}
    meta.setdefault("session_date", datetime.now().strftime("%Y-%m-%d"))
    meta.setdefault("type", "general")

    result = m.add(text, user_id=USER_ID, metadata=meta)
    return result

def search_memory(query, limit=10):
    """Search memories by semantic similarity."""
    m = get_memory()
    results = m.search(query, filters={"user_id": USER_ID}, limit=limit)
    return results

def list_memories(limit=50):
    """List all memories for Paul."""
    m = get_memory()
    results = m.get_all(filters={"user_id": USER_ID}, limit=limit)
    return results

def forget_memory(memory_id):
    """Delete a specific memory. Sovereignty = deletion rights."""
    m = get_memory()
    m.delete(memory_id)
    return {"deleted": memory_id}

def get_context():
    """Pre-session context: recent memories, rejections, focus areas."""
    m = get_memory()

    # Recent memories (last 10)
    all_mem = m.get_all(filters={"user_id": USER_ID}, limit=50)
    memories = all_mem.get("results", []) if isinstance(all_mem, dict) else all_mem

    # Categorize
    rejections = [mem for mem in memories if mem.get("metadata", {}).get("type") == "rejected"]
    rationale = [mem for mem in memories if mem.get("metadata", {}).get("type") == "rationale"]
    patterns = [mem for mem in memories if mem.get("metadata", {}).get("type") == "pattern"]
    recent = sorted(memories, key=lambda x: x.get("metadata", {}).get("session_date", ""), reverse=True)[:5]

    context = {
        "generated": datetime.now().isoformat(),
        "total_memories": len(memories),
        "recent": [{"memory": m.get("memory", ""), "date": m.get("metadata", {}).get("session_date", "")} for m in recent],
        "standing_rejections": [m.get("memory", "") for m in rejections],
        "key_rationale": [m.get("memory", "") for m in rationale[:5]],
        "working_patterns": [m.get("memory", "") for m in patterns[:5]],
    }

    return context


# ── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 mem0-bridge.py <command> [args]")
        print("Commands: add, search, list, forget, context")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "add":
        text = sys.argv[2] if len(sys.argv) > 2 else ""
        mem_type = sys.argv[3] if len(sys.argv) > 3 else "general"
        if not text:
            print("Usage: python3 mem0-bridge.py add 'memory text' [type]")
            sys.exit(1)
        result = add_memory(text, {"type": mem_type})
        print(json.dumps(result, indent=2, default=str))

    elif cmd == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        if not query:
            print("Usage: python3 mem0-bridge.py search 'query'")
            sys.exit(1)
        results = search_memory(query)
        if isinstance(results, dict):
            results = results.get("results", results)
        for r in (results if isinstance(results, list) else []):
            mem = r.get("memory", r) if isinstance(r, dict) else r
            score = r.get("score", "") if isinstance(r, dict) else ""
            print(f"  [{score:.2f}] {mem}" if score else f"  {mem}")

    elif cmd == "list":
        results = list_memories()
        memories = results.get("results", results) if isinstance(results, dict) else results
        for mem in (memories if isinstance(memories, list) else []):
            mid = mem.get("id", "?")[:8] if isinstance(mem, dict) else "?"
            text = mem.get("memory", mem) if isinstance(mem, dict) else mem
            mtype = mem.get("metadata", {}).get("type", "general") if isinstance(mem, dict) else "?"
            print(f"  [{mid}] ({mtype}) {text}")

    elif cmd == "forget":
        mid = sys.argv[2] if len(sys.argv) > 2 else ""
        if not mid:
            print("Usage: python3 mem0-bridge.py forget <memory_id>")
            sys.exit(1)
        result = forget_memory(mid)
        print(json.dumps(result))

    elif cmd == "context":
        ctx = get_context()
        print(json.dumps(ctx, indent=2))

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
