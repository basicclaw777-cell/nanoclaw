/**
 * Linda Tuple Space — Cathedral Agent Coordination
 *
 * Decoupled agent communication via pattern-matching tuples.
 * Based on Gelernter (1985) "Generative communication in Linda."
 *
 * Operations:
 *   out(tuple, namespace)  — post a tuple
 *   rd(pattern, namespace) — read matching tuple (non-destructive)
 *   in(pattern, namespace) — read and consume matching tuple
 *   watch(pattern, namespace, callback) — fire callback on new matches
 *   scan(pattern, namespace) — return all matching tuples
 *
 * Storage: one JSONL file per namespace in vault linda/ directory.
 * Tuples are arrays of primitives. null in pattern = wildcard.
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import chokidar from 'chokidar';

const LINDA_DIR = process.env.LINDA_DIR || join(
  process.env.HOME, 'cathedral-vault', '09_Artifacts', 'linda'
);

// Ensure directory exists
if (!existsSync(LINDA_DIR)) {
  mkdirSync(LINDA_DIR, { recursive: true });
}

// In-memory watchers: Map<namespace, Array<{pattern, callback, consume}>>
const watchers = new Map();

// File watchers per namespace
const fileWatchers = new Map();

// Track file sizes to only read new lines
const fileSizes = new Map();

/**
 * Wrap a raw tuple array with metadata
 */
function makeTupleEntry(tuple, agentId = 'unknown') {
  return {
    tuple,
    agentId,
    timestamp: Date.now(),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    consumed: false
  };
}

/**
 * Get file path for a namespace
 */
function nsPath(namespace) {
  return join(LINDA_DIR, `${namespace}.jsonl`);
}

/**
 * Match a tuple against a pattern. null in pattern = wildcard.
 */
function matches(tuple, pattern) {
  if (!Array.isArray(tuple) || !Array.isArray(pattern)) return false;
  if (tuple.length < pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === null) continue;
    if (pattern[i] !== tuple[i]) return false;
  }
  return true;
}

/**
 * Read all entries from a namespace file
 */
function readAll(namespace) {
  const fp = nsPath(namespace);
  if (!existsSync(fp)) return [];
  const lines = readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/**
 * Read only new lines since last check
 */
function readNew(namespace) {
  const fp = nsPath(namespace);
  if (!existsSync(fp)) return [];
  const content = readFileSync(fp, 'utf-8');
  const prevSize = fileSizes.get(namespace) || 0;
  fileSizes.set(namespace, content.length);
  if (content.length <= prevSize) return [];
  const newContent = content.slice(prevSize);
  const lines = newContent.split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return entries;
}

/**
 * Rewrite file excluding consumed entries
 */
function rewriteWithout(namespace, consumedIds) {
  const entries = readAll(namespace);
  const remaining = entries.filter(e => !consumedIds.has(e.id));
  const fp = nsPath(namespace);
  writeFileSync(fp, remaining.map(e => JSON.stringify(e)).join('\n') + (remaining.length ? '\n' : ''));
  fileSizes.set(namespace, readFileSync(fp, 'utf-8').length);
}

/**
 * Ensure a file watcher exists for a namespace
 */
function ensureFileWatcher(namespace) {
  if (fileWatchers.has(namespace)) return;
  const fp = nsPath(namespace);
  // Touch file if it doesn't exist
  if (!existsSync(fp)) writeFileSync(fp, '');
  // Initialize file size tracker
  fileSizes.set(namespace, readFileSync(fp, 'utf-8').length);

  const watcher = chokidar.watch(fp, { persistent: true, awaitWriteFinish: { stabilityThreshold: 100 } });
  watcher.on('change', () => {
    const newEntries = readNew(namespace);
    const nsWatchers = watchers.get(namespace) || [];
    const toRemove = [];
    const consumedIds = new Set();

    for (const entry of newEntries) {
      if (entry.consumed) continue;
      for (let i = 0; i < nsWatchers.length; i++) {
        const w = nsWatchers[i];
        if (matches(entry.tuple, w.pattern)) {
          w.callback(entry);
          if (w.consume) {
            consumedIds.add(entry.id);
            toRemove.push(i);
            break; // consumed — only one consumer gets it
          }
        }
      }
    }

    // Remove one-shot consumed watchers
    for (const idx of toRemove.reverse()) {
      nsWatchers.splice(idx, 1);
    }

    // Mark consumed in file
    if (consumedIds.size > 0) {
      rewriteWithout(namespace, consumedIds);
    }
  });

  fileWatchers.set(namespace, watcher);
}

// ═══════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════

/**
 * out — post a tuple to the space
 * @param {Array} tuple - array of primitives
 * @param {string} namespace - namespace (default: 'default')
 * @param {string} agentId - posting agent identifier
 */
export function out(tuple, namespace = 'default', agentId = 'unknown') {
  if (!Array.isArray(tuple)) throw new Error('Tuple must be an array');
  const entry = makeTupleEntry(tuple, agentId);
  const fp = nsPath(namespace);
  if (!existsSync(fp)) writeFileSync(fp, '');
  appendFileSync(fp, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * rd — non-destructive read. Returns first matching tuple or null.
 * @param {Array} pattern - pattern with null wildcards
 * @param {string} namespace
 */
export function rd(pattern, namespace = 'default') {
  const entries = readAll(namespace);
  for (const entry of entries) {
    if (!entry.consumed && matches(entry.tuple, pattern)) {
      return entry;
    }
  }
  return null;
}

/**
 * inp — destructive read. Returns and consumes first matching tuple or null.
 * (Named inp to avoid collision with reserved word)
 * @param {Array} pattern
 * @param {string} namespace
 */
export function inp(pattern, namespace = 'default') {
  const entries = readAll(namespace);
  for (const entry of entries) {
    if (!entry.consumed && matches(entry.tuple, pattern)) {
      rewriteWithout(namespace, new Set([entry.id]));
      return entry;
    }
  }
  return null;
}

/**
 * scan — return all matching tuples (non-destructive)
 * @param {Array} pattern
 * @param {string} namespace
 */
export function scan(pattern, namespace = 'default') {
  const entries = readAll(namespace);
  return entries.filter(e => !e.consumed && matches(e.tuple, pattern));
}

/**
 * watch — register callback for future matching tuples
 * @param {Array} pattern
 * @param {string} namespace
 * @param {Function} callback - receives the full entry object
 * @param {Object} opts - { consume: false } set true for destructive watch (like blocking in())
 * @returns {Function} unwatch function
 */
export function watch(pattern, namespace = 'default', callback, opts = {}) {
  ensureFileWatcher(namespace);
  if (!watchers.has(namespace)) watchers.set(namespace, []);
  const entry = { pattern, callback, consume: !!opts.consume };
  watchers.get(namespace).push(entry);
  return () => {
    const arr = watchers.get(namespace);
    const idx = arr.indexOf(entry);
    if (idx !== -1) arr.splice(idx, 1);
  };
}

/**
 * cleanup — close all file watchers
 */
export function cleanup() {
  for (const [, w] of fileWatchers) {
    w.close();
  }
  fileWatchers.clear();
  watchers.clear();
}

/**
 * matches — exported for testing
 */
export { matches as matchPattern };

export default { out, rd, inp, scan, watch, cleanup, matchPattern: matches };
