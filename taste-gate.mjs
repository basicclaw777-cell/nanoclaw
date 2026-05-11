// Taste Gate — shared module for all Cathedral agents
// Reads taste-map.json and returns Paul's preferences in a format
// any agent can inject into prompts or use for filtering.
//
// Usage:
//   import { getTasteContext, checkRejection, getAnchors } from './taste-gate.mjs';
//   const context = getTasteContext(); // string for LLM prompt injection
//   const rejected = checkRejection(text); // returns rejection reason or null

import { readFileSync } from 'fs';
import { join } from 'path';

const TASTE_PATH = join(process.env.HOME || '/Users/basicclaw777', 'nanoclaw', 'taste-map.json');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 300000; // 5 min

function load() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;
  try {
    _cache = JSON.parse(readFileSync(TASTE_PATH, 'utf-8'));
    _cacheTime = Date.now();
  } catch {
    _cache = { anchors: [], rejections: [] };
  }
  return _cache;
}

// Get all anchors, optionally filtered by domain
export function getAnchors(domain = null) {
  const tm = load();
  const anchors = tm.anchors || [];
  return domain ? anchors.filter(a => a.domain === domain) : anchors;
}

// Get rejections
export function getRejections() {
  return (load().rejections || []);
}

// Check if text triggers a rejection pattern
export function checkRejection(text) {
  const lower = text.toLowerCase();
  for (const r of getRejections()) {
    const pattern = r.pattern?.toLowerCase() || '';
    // Match singular/plural and partial
    if (pattern && (lower.includes(pattern) || lower.includes(pattern.replace(/s$/, '')) || pattern.includes(lower.split(' ').find(w => w.length > 4) || '---'))) {
      return r;
    }
  }
  return null;
}

// Check output length — Paul skips walls of text
export function checkLength(text, maxWords = 150) {
  const words = text.split(/\s+/).length;
  return words > maxWords ? { rejected: true, words, max: maxWords } : { rejected: false, words };
}

// Generate a compact context string for LLM prompt injection
// This is what agents inject into their system prompts
export function getTasteContext() {
  const tm = load();
  const anchors = tm.anchors || [];
  const rejections = tm.rejections || [];

  const sections = [];

  // Worldview (highest signal for content agents)
  const worldview = anchors.filter(a => a.domain === 'worldview');
  if (worldview.length) {
    sections.push('PAUL BELIEVES: ' + worldview.map(a => a.value).join('. ') + '.');
  }

  // Aesthetic (highest signal for visual agents)
  const aesthetic = anchors.filter(a => a.domain === 'aesthetic');
  if (aesthetic.length) {
    sections.push('PAUL\'S AESTHETIC: ' + aesthetic.map(a => a.value).join('. ') + '.');
  }

  // Communication (highest signal for all output)
  const comms = anchors.filter(a => a.domain === 'communication');
  if (comms.length) {
    sections.push('PAUL WANTS: ' + comms.map(a => a.value).join('. ') + '.');
  }

  // Rejections
  if (rejections.length) {
    sections.push('PAUL REJECTS: ' + rejections.map(r => r.pattern + ' (' + r.reason + ')').join('. ') + '.');
  }

  return sections.join('\n');
}

// Compact version for tight prompt budgets (< 200 tokens)
export function getTasteCompact() {
  const tm = load();
  const aesthetic = (tm.anchors || []).filter(a => a.domain === 'aesthetic').map(a => a.value);
  const comms = (tm.anchors || []).filter(a => a.domain === 'communication').map(a => a.value);
  const rejects = (tm.rejections || []).map(r => r.pattern);

  return `Aesthetic: ${aesthetic.join('; ')}. Communication: ${comms.join('; ')}. Rejects: ${rejects.join(', ')}.`;
}
