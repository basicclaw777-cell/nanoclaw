'use strict';
/**
 * generation-guard.cjs — GLOBAL GENERATION KILL-SWITCH for the Cathedral.
 *
 * One flag stops ALL autonomous paid image/video generation. pm2 stop is NOT a
 * real pause (cron_restart re-fires, manifest-watcher reconciles back online).
 * This is a code-level flag every generator checks BEFORE spending.
 *
 * Origin: 2026-06-03 — a "paused" Reed generator kept firing and drained
 * Higgsfield 48 -> 0.58 credits. pm2 stop is theater; this is the real pause.
 *
 * CommonJS on purpose: require-able from both CJS (reed/) and the ESM root
 * (via createRequire). Use the .cjs extension everywhere.
 *
 * Flag:
 *   - File: ~/.cathedral-generation-paused (presence = paused)
 *   - Env:  GENERATION_PAUSED=1 (also pauses)
 *
 * API:
 *   isPaused()                 -> boolean
 *   assertGenAllowed(opts)     -> throws if paused AND not opts.manual
 *   pause(reason)              -> create flag file (writes reason + timestamp)
 *   resume()                   -> remove flag file
 *   status()                   -> { paused, reason, since }
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const FLAG_PATH = path.join(os.homedir(), '.cathedral-generation-paused');
const LOG_PATH = path.join(__dirname, 'generation-guard.log');

function envPaused() {
  const v = process.env.GENERATION_PAUSED;
  return v === '1' || v === 'true' || v === 'yes';
}

function isPaused() {
  if (envPaused()) return true;
  try {
    return fs.existsSync(FLAG_PATH);
  } catch (_e) {
    // If we can't tell, fail SAFE: treat as paused.
    return true;
  }
}

function status() {
  const paused = isPaused();
  let reason = null;
  let since = null;
  if (envPaused() && !fs.existsSync(FLAG_PATH)) {
    reason = 'GENERATION_PAUSED env var set';
  }
  try {
    if (fs.existsSync(FLAG_PATH)) {
      const raw = fs.readFileSync(FLAG_PATH, 'utf8');
      const reasonMatch = raw.match(/reason:\s*(.*)/i);
      const sinceMatch = raw.match(/since:\s*(.*)/i);
      if (reasonMatch) reason = reasonMatch[1].trim();
      if (sinceMatch) since = sinceMatch[1].trim();
      if (!since) {
        try { since = fs.statSync(FLAG_PATH).mtime.toISOString(); } catch (_e) {}
      }
    }
  } catch (_e) {}
  return { paused, reason, since };
}

function pause(reason) {
  const ts = new Date().toISOString();
  const body =
    `CATHEDRAL GENERATION PAUSED\n` +
    `since: ${ts}\n` +
    `reason: ${reason || 'no reason given'}\n` +
    `\nRemove this file (or call resume()) to allow autonomous paid generation again.\n` +
    `Human-triggered generation (manual:true) is still allowed while paused.\n`;
  fs.writeFileSync(FLAG_PATH, body, 'utf8');
  logLine(`PAUSE  reason="${reason || ''}"`);
  return status();
}

function resume() {
  try {
    if (fs.existsSync(FLAG_PATH)) fs.unlinkSync(FLAG_PATH);
  } catch (_e) {}
  logLine('RESUME');
  return status();
}

function logLine(msg) {
  try {
    const ts = new Date().toISOString();
    const caller = callerTag();
    fs.appendFileSync(LOG_PATH, `${ts} [${caller}] ${msg}\n`, 'utf8');
  } catch (_e) {
    // logging must never break a generator
  }
}

function callerTag() {
  // Best-effort: the script that invoked us, + pm2 name if present.
  const argv1 = process.argv && process.argv[1] ? path.basename(process.argv[1]) : 'node';
  const pm2 = process.env.name || process.env.pm_id ? `pm2:${process.env.name || process.env.pm_id}` : '';
  return pm2 ? `${argv1} ${pm2}` : argv1;
}

/**
 * Throw if generation is not allowed.
 * @param {{manual?: boolean}} opts - manual:true = human-triggered, allowed even when paused.
 *                                    Autonomous callers omit it (defaults to false) -> blocked when paused.
 */
function assertGenAllowed(opts) {
  opts = opts || {};
  const manual = opts.manual === true;
  if (isPaused() && !manual) {
    logLine('BLOCK  autonomous generation blocked by kill-switch');
    throw new Error('GENERATION PAUSED — global kill-switch is on');
  }
  return true;
}

module.exports = {
  FLAG_PATH,
  LOG_PATH,
  isPaused,
  assertGenAllowed,
  pause,
  resume,
  status,
};
