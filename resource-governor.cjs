#!/usr/bin/env node
'use strict';

/**
 * Resource Governor — prevents OOM crashes on 16GB Mac Mini
 *
 * Usage:
 *   node resource-governor.js check          — show current state
 *   node resource-governor.js can-load <gb>  — returns 0 if safe, 1 if not
 *   node resource-governor.js guard          — run as watcher, kill Ollama models if pressure critical
 *
 * Telegram: /resources
 */

const { execSync } = require('child_process');
const os = require('os');

const TOTAL_GB = os.totalmem() / 1e9;
const SAFETY_FLOOR_GB = 3.0;  // always keep 3GB free
const WARNING_GB = 4.0;

function getMemoryState() {
  const vmstat = execSync('vm_stat').toString();
  const pageSize = 16384;
  const parse = (label) => {
    const m = vmstat.match(new RegExp(`${label}:\\s+(\\d+)`));
    return m ? parseInt(m[1]) * pageSize / 1e9 : 0;
  };

  const free = parse('Pages free') + parse('Pages purgeable');
  const inactive = parse('Pages inactive');
  const active = parse('Pages active');
  const wired = parse('Pages wired down');
  const speculative = parse('Pages speculative');

  // "available" = free + inactive (macOS reclaims inactive under pressure)
  const available = free + inactive;
  const used = active + wired;

  return { total: TOTAL_GB, available, free, inactive, used, wired };
}

function getOllamaModels() {
  try {
    const raw = execSync('curl -s http://localhost:11434/api/ps', { timeout: 5000 }).toString();
    const data = JSON.parse(raw);
    return (data.models || []).map(m => ({
      name: m.name,
      sizeGB: (m.size_vram || m.size || 0) / 1e9,
    }));
  } catch { return []; }
}

function getHeavyProcesses() {
  try {
    const lines = execSync("ps aux -m | head -20").toString().split('\n').slice(1);
    return lines
      .filter(l => l.trim())
      .map(l => {
        const cols = l.trim().split(/\s+/);
        return { user: cols[0], pid: cols[1], mem: parseFloat(cols[3]), cmd: cols.slice(10).join(' ').slice(0, 60) };
      })
      .filter(p => p.mem > 1.0);
  } catch { return []; }
}

function check() {
  const mem = getMemoryState();
  const models = getOllamaModels();
  const heavy = getHeavyProcesses();

  const status = mem.available < SAFETY_FLOOR_GB ? 'CRITICAL'
    : mem.available < WARNING_GB ? 'WARNING'
    : 'OK';

  console.log(`\n  RESOURCE GOVERNOR — ${TOTAL_GB.toFixed(0)}GB Mac Mini`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Available: ${mem.available.toFixed(1)}GB  (free ${mem.free.toFixed(1)} + inactive ${mem.inactive.toFixed(1)})`);
  console.log(`  Used:      ${mem.used.toFixed(1)}GB  (active ${(mem.used - mem.wired).toFixed(1)} + wired ${mem.wired.toFixed(1)})`);
  console.log(`  Status:    ${status}`);
  console.log(`  Safety floor: ${SAFETY_FLOOR_GB}GB`);
  console.log(`  Can load:  ${Math.max(0, mem.available - SAFETY_FLOOR_GB).toFixed(1)}GB of new models`);
  console.log();

  if (models.length) {
    console.log(`  Ollama loaded:`);
    models.forEach(m => console.log(`    ${m.name}: ${m.sizeGB.toFixed(1)}GB VRAM`));
    console.log();
  }

  if (heavy.length) {
    console.log(`  Heavy processes (>1% RAM):`);
    heavy.forEach(p => console.log(`    [${p.pid}] ${p.mem.toFixed(1)}% — ${p.cmd}`));
    console.log();
  }

  return { mem, models, heavy, status };
}

function canLoad(requestGB) {
  const mem = getMemoryState();
  const headroom = mem.available - SAFETY_FLOOR_GB;
  const safe = headroom >= requestGB;
  console.log(safe
    ? `OK: ${headroom.toFixed(1)}GB available, ${requestGB}GB requested`
    : `BLOCKED: only ${headroom.toFixed(1)}GB available, need ${requestGB}GB. Unload models or close Chrome tabs first.`
  );
  process.exit(safe ? 0 : 1);
}

function unloadOllama(modelName) {
  try {
    execSync(`curl -s http://localhost:11434/api/generate -d '{"model":"${modelName}","keep_alive":0}'`, { timeout: 10000 });
    console.log(`  Unloaded: ${modelName}`);
  } catch (e) {
    console.log(`  Failed to unload ${modelName}: ${e.message}`);
  }
}

// Export for Telegram integration
function getStatusText() {
  const mem = getMemoryState();
  const models = getOllamaModels();
  const status = mem.available < SAFETY_FLOOR_GB ? 'CRITICAL'
    : mem.available < WARNING_GB ? 'WARNING' : 'OK';

  let text = `Resource Governor [${status}]\n`;
  text += `Available: ${mem.available.toFixed(1)}GB / ${TOTAL_GB.toFixed(0)}GB\n`;
  text += `Can load: ${Math.max(0, mem.available - SAFETY_FLOOR_GB).toFixed(1)}GB\n`;
  if (models.length) {
    text += `Ollama: ${models.map(m => `${m.name} (${m.sizeGB.toFixed(1)}GB)`).join(', ')}\n`;
  }
  return text;
}

// Model size reference for common local image gen models
const MODEL_SIZES = {
  'stable-diffusion-xl': 7,
  'sdxl-turbo': 7,
  'flux-dev': 12,
  'flux-schnell': 12,
  'stable-diffusion-3': 8,
  'playground-v2.5': 7,
  'juggernaut-xl': 7,
};

function listModelSizes() {
  const mem = getMemoryState();
  const headroom = Math.max(0, mem.available - SAFETY_FLOOR_GB);
  console.log(`\n  Available headroom: ${headroom.toFixed(1)}GB\n`);
  console.log(`  Common image gen models:`);
  Object.entries(MODEL_SIZES).forEach(([name, gb]) => {
    const ok = headroom >= gb;
    console.log(`    ${ok ? 'OK' : 'NO'}  ${name}: ~${gb}GB ${ok ? '' : '(need to free ' + (gb - headroom).toFixed(1) + 'GB)'}`);
  });
  console.log(`\n  To free RAM: close Chrome tabs, unload Ollama models, stop PM2 processes`);
}

// CLI
const cmd = process.argv[2];
if (cmd === 'check') check();
else if (cmd === 'can-load') canLoad(parseFloat(process.argv[3]) || 4);
else if (cmd === 'models') listModelSizes();
else if (cmd === 'unload') {
  const model = process.argv[3];
  if (model) unloadOllama(model);
  else console.log('Usage: node resource-governor.js unload <model-name>');
} else {
  console.log('Usage: node resource-governor.js [check|can-load <gb>|models|unload <name>]');
}

module.exports = { getMemoryState, getOllamaModels, getStatusText, canLoad: (gb) => {
  const mem = getMemoryState();
  return (mem.available - SAFETY_FLOOR_GB) >= gb;
}, MODEL_SIZES };
