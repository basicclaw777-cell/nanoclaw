'use strict';
const fs = require('fs');
const path = require('path');

const CATH = path.join(require('os').homedir(), 'Cathedral');
const AGENTS = path.join(CATH, 'agents');
const BATTERY_DIR = path.join(AGENTS, 'stress-battery');

const PROBE_AGENTS = ['boxing', 'br', 'muse', 'orc', 'forge'];

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function extractPhysicianWindow(startDate, endDate) {
  const phy = loadJSON(path.join(CATH, 'physician-state.json'));
  if (!phy || !phy.history) return [];
  return phy.history
    .filter(h => h.date >= startDate && h.date <= endDate)
    .map(h => {
      const senses = {};
      for (const d of h.diagnoses || []) {
        senses[d.sense] = {
          status: d.status,
          drift_score: d.drift_score,
          drift_status: d.drift_status,
          waste_score: d.waste_score,
          fading_pct: d.fading_pct,
          quality_density: d.quality_density,
          avg_bloat: d.avg_bloat,
          age_hours: d.age_hours,
          flags: d.flags
        };
      }
      return {
        date: h.date,
        senses,
        processHealth: h.processHealth
      };
    });
}

function extractAgentHealth() {
  const ah = loadJSON(path.join(AGENTS, 'agent-health.json'));
  if (!ah) return {};
  const result = {};
  for (const a of PROBE_AGENTS) {
    if (!ah[a]) continue;
    result[a] = {
      score: ah[a].score || 0,
      stewardGrade: ah[a].stewardGrade || 'F',
      intelligenceClass: ah[a].intelligenceClass || 'STRUCTURED',
      intelligenceHistory: ah[a].intelligenceHistory || [],
      graduated: ah[a].graduated || 0,
      decayed: ah[a].decayed || 0,
      findingsRemaining: ah[a].findingsRemaining || 0
    };
  }
  return result;
}

function extractEmergenceScores(startDate, endDate) {
  const es = loadJSON(path.join(AGENTS, 'emergence-scores.json'));
  if (!es) return {};
  const result = {};
  for (const a of PROBE_AGENTS) {
    if (!es[a]) continue;
    const windowHistory = (es[a].history || []).filter(h => {
      const ts = (h.ts || '').slice(0, 10);
      return ts >= startDate && ts <= endDate;
    });
    result[a] = {
      tier: es[a].tier,
      level: es[a].level,
      xp: es[a].xp,
      totalClimbed: es[a].totalClimbed,
      history: windowHistory
    };
  }
  return result;
}

function extractBottlenecks() {
  const bs = loadJSON(path.join(AGENTS, 'bottleneck-state.json'));
  if (!bs || !bs.bottlenecks) return {};
  const result = {};
  for (const a of PROBE_AGENTS) {
    if (!bs.bottlenecks[a]) continue;
    const b = bs.bottlenecks[a];
    result[a] = {
      type: b.bottleneck,
      evidence: b.evidence,
      workshopedAt: b.workshopedAt
    };
  }
  return result;
}

function extractStressBattery(startDate, endDate) {
  const results = [];
  try {
    const files = fs.readdirSync(BATTERY_DIR).filter(f => f.endsWith('.json')).sort();
    for (const f of files) {
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1];
      if (date < startDate || date > endDate) continue;
      const data = loadJSON(path.join(BATTERY_DIR, f));
      if (!data) continue;
      results.push({
        date,
        testNumber: data.testNumber,
        overall: data.overall,
        compression: data.compression?.score ?? data.compression,
        contradiction: data.contradiction?.survival ?? data.contradiction,
        identity: data.identity?.similarity ?? data.identity
      });
    }
  } catch {}
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

function extractLiveness() {
  return loadJSON(path.join(CATH, 'liveness-state.json')) || {};
}

function extractAll(startDate = '2026-10-14', endDate = '2026-10-22') {
  return {
    window: { start: startDate, end: endDate },
    probeAgents: PROBE_AGENTS,
    physician: extractPhysicianWindow(startDate, endDate),
    agentHealth: extractAgentHealth(),
    emergence: extractEmergenceScores(startDate, endDate),
    bottlenecks: extractBottlenecks(),
    stressBattery: extractStressBattery(startDate, endDate),
    liveness: extractLiveness(),
    extractedAt: new Date().toISOString()
  };
}

if (require.main === module) {
  const data = extractAll();
  const outPath = path.join(__dirname, 'backtest-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Extracted: ${data.physician.length} physician snapshots, ${Object.keys(data.agentHealth).length} agents, ${data.stressBattery.length} battery tests`);
  console.log(`Written to ${outPath}`);
}

module.exports = { extractAll, PROBE_AGENTS };
