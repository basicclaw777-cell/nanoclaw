// taste-map-api.js — Query API for Taste Map
// Any Cathedral agent can import this to check Paul's preferences
// ESM module

import fs from 'fs';
import path from 'path';

const TASTE_MAP_PATH = path.join(process.env.HOME, 'nanoclaw', 'taste-map.json');

/**
 * Load the current taste map from disk
 */
function loadMap() {
  return JSON.parse(fs.readFileSync(TASTE_MAP_PATH, 'utf8'));
}

/**
 * Save the taste map to disk
 */
function saveMap(map) {
  map.lastUpdated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(TASTE_MAP_PATH, JSON.stringify(map, null, 2));
}

/**
 * Get taste profile for a domain + optional context
 * @param {string} domain - 'music', 'visual_style', 'writing_voice', 'teaching_tone', 'class_energy'
 * @param {string} [context] - optional context filter e.g. 'boxing_class', 'cooldown', 'personal'
 * @returns {object} profile with qualities, rejections, anchors
 */
export function getTasteProfile(domain, context) {
  const map = loadMap();
  const domainData = map.domains[domain];
  if (!domainData) return null;

  const profile = {
    domain,
    context: context || 'general',
    confirmed_qualities: domainData.confirmed_qualities || [],
    rejections: domainData.rejections || [],
    dimensions: domainData.dimensions || []
  };

  // For music, filter anchors by context
  if (domain === 'music') {
    if (context === 'boxing_class' || context === 'class_energy' || context === 'war_mode') {
      profile.anchors = domainData.anchors_class_energy || [];
      profile.energy_range = [0.7, 1.0];
      profile.bpm_range = [120, 160];
    } else if (context === 'cooldown' || context === 'vibe') {
      profile.anchors = domainData.anchors_vibe_cooldown || [];
      profile.energy_range = [0.4, 0.7];
      profile.bpm_range = [85, 120];
    } else {
      // All anchors
      profile.anchors = [
        ...(domainData.anchors_class_energy || []),
        ...(domainData.anchors_vibe_cooldown || []),
        ...(domainData.anchors_broader || []),
        ...(domainData.anchors_wildcard || [])
      ];
    }
    profile.taste_rule = domainData.taste_rule;
    profile.taste_breadth = domainData.taste_breadth;
  } else {
    profile.anchors = domainData.anchors || [];
  }

  return profile;
}

/**
 * Check if something matches Paul's preferences
 * @param {string} domain - domain to check against
 * @param {object} candidate - item to evaluate { genre, energy, mood, style, etc }
 * @returns {object} { score: 0-1, reasons: string[], matches: string[] }
 */
export function matchPreference(domain, candidate) {
  const map = loadMap();
  const domainData = map.domains[domain];
  if (!domainData) return { score: 0, reasons: ['unknown domain'], matches: [] };

  const matches = [];
  const flags = [];
  let score = 0.5; // neutral start

  const qualities = domainData.confirmed_qualities || [];
  const rejections = domainData.rejections || [];

  // Check rejections first
  for (const rejection of rejections) {
    const rejLower = rejection.toLowerCase();
    const candStr = JSON.stringify(candidate).toLowerCase();
    if (candStr.includes(rejLower.split(' ')[0])) {
      flags.push(`matches rejection: "${rejection}"`);
      score -= 0.3;
    }
  }

  // Check anchor matches for music
  if (domain === 'music' && candidate.artist) {
    const allAnchors = [
      ...(domainData.anchors_class_energy || []),
      ...(domainData.anchors_vibe_cooldown || []),
      ...(domainData.anchors_broader || [])
    ];
    const artistMatch = allAnchors.find(a =>
      a.artist && a.artist.toLowerCase().includes(candidate.artist.toLowerCase())
    );
    if (artistMatch) {
      matches.push(`known anchor artist: ${artistMatch.artist}`);
      score += 0.3;
    }
  }

  // Check energy match for music
  if (domain === 'music' && typeof candidate.energy === 'number') {
    if (candidate.energy >= 0.7) {
      matches.push('high energy — fits class peaks');
      score += 0.1;
    }
    if (candidate.energy >= 0.4 && candidate.energy <= 0.7) {
      matches.push('mid energy — fits cooldown/vibe');
      score += 0.1;
    }
  }

  // Check visual style anchors
  if (domain === 'visual_style') {
    const anchors = domainData.anchors || [];
    for (const anchor of anchors) {
      if (candidate.style && anchor.item.toLowerCase().includes(candidate.style.toLowerCase())) {
        if (anchor.status === 'YES') {
          matches.push(`matches approved style: ${anchor.item}`);
          score += 0.3;
        } else if (anchor.status === 'CONDITIONAL') {
          matches.push(`matches conditional style: ${anchor.item} (${anchor.reason})`);
          score += 0.15;
        }
      }
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    matches,
    flags,
    passed: score >= 0.5 && flags.length === 0
  };
}

/**
 * Check if something is rejected
 * @param {string} domain
 * @param {string|object} item - string to check or object with properties
 * @returns {object} { rejected: boolean, reasons: string[] }
 */
export function checkRejection(domain, item) {
  const map = loadMap();
  const domainData = map.domains[domain];
  if (!domainData) return { rejected: false, reasons: [] };

  const rejections = domainData.rejections || [];
  const reasons = [];
  const itemStr = typeof item === 'string' ? item.toLowerCase() : JSON.stringify(item).toLowerCase();

  for (const rejection of rejections) {
    const words = rejection.toLowerCase().split(/\s+/);
    // Check if key words from rejection appear in item
    const keyWord = words[0];
    if (keyWord.length > 3 && itemStr.includes(keyWord)) {
      reasons.push(rejection);
    }
  }

  return {
    rejected: reasons.length > 0,
    reasons
  };
}

/**
 * Get voice references (for content generation tone matching)
 * @returns {object[]} array of voice reference anchors
 */
export function getVoiceReferences() {
  const map = loadMap();
  return map.voice_references || [];
}

/**
 * Get the meta pattern (Paul's voice in one sentence)
 * @returns {string}
 */
export function getVoicePattern() {
  const map = loadMap();
  return map.meta_pattern || '';
}

/**
 * Add a new anchor to a domain
 * @param {string} domain
 * @param {string} anchorGroup - e.g. 'anchors_class_energy', 'anchors_wildcard', 'anchors'
 * @param {object} anchor - the anchor data
 */
export function addAnchor(domain, anchorGroup, anchor) {
  const map = loadMap();
  if (!map.domains[domain]) return false;
  if (!map.domains[domain][anchorGroup]) {
    map.domains[domain][anchorGroup] = [];
  }
  anchor.added = new Date().toISOString().split('T')[0];
  map.domains[domain][anchorGroup].push(anchor);
  saveMap(map);
  return true;
}

/**
 * Add a rejection to a domain
 * @param {string} domain
 * @param {string} rejection
 */
export function addRejection(domain, rejection) {
  const map = loadMap();
  if (!map.domains[domain]) return false;
  if (!map.domains[domain].rejections) map.domains[domain].rejections = [];
  if (!map.domains[domain].rejections.includes(rejection)) {
    map.domains[domain].rejections.push(rejection);
    saveMap(map);
  }
  return true;
}

/**
 * Get stats about taste map coverage
 * @returns {object} domain coverage stats
 */
export function getStats() {
  const map = loadMap();
  const stats = { domains: {}, totalAnchors: 0, totalRejections: 0, voiceReferences: (map.voice_references || []).length };

  for (const [name, domain] of Object.entries(map.domains)) {
    let anchorCount = 0;
    for (const [key, val] of Object.entries(domain)) {
      if (key.startsWith('anchors') && Array.isArray(val)) anchorCount += val.length;
    }
    const rejCount = (domain.rejections || []).length;
    const qualCount = (domain.confirmed_qualities || []).length;
    stats.domains[name] = { anchors: anchorCount, rejections: rejCount, qualities: qualCount };
    stats.totalAnchors += anchorCount;
    stats.totalRejections += rejCount;
  }

  return stats;
}

export default {
  getTasteProfile,
  matchPreference,
  checkRejection,
  getVoiceReferences,
  getVoicePattern,
  addAnchor,
  addRejection,
  getStats
};
