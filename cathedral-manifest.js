#!/usr/bin/env node
/**
 * cathedral-manifest.js — Single source of truth for all PM2 processes.
 *
 * Usage:
 *   node cathedral-manifest.js              # Show status vs intended state
 *   node cathedral-manifest.js --reconcile  # Fix drift (start/stop to match manifest)
 *   node cathedral-manifest.js --json       # Export current state as JSON
 *
 * Auto-updated by post-build hooks. Survives crashes.
 * If PM2 dump loses crons, this file is the authority.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const genGuard = createRequire(import.meta.url)('./lib/generation-guard.cjs'); // GLOBAL kill-switch

const MANIFEST_PATH = path.join(process.env.HOME, 'nanoclaw', 'cathedral-manifest.json');

// Generator-type PM2 processes that spend on paid image/video generation.
// While the global kill-switch is ON, reconcile() must NOT auto-restart these —
// that is exactly how a "paused" Reed generator got reconciled back online and
// drained Higgsfield (48 -> 0.58 credits) on 2026-06-03.
const GENERATOR_PROCS = new Set([
  'reed-studio-engine',
  'reed-director',
  'reed-shots',
  'reed-lab',
  'hf-tester',
  'reed-gemini',
  'content-autopilot',
  'content-ideas',
]);

// ─── THE MANIFEST ──────────────────────────────────────────────
// intended: "online" (long-running), "cron" (run-and-exit), "stopped" (intentionally off), "dead" (should be deleted)
// cron: PM2 cron_restart_time in UTC. null for long-running or stopped.
// reason: why it's in this state
// ────────────────────────────────────────────────────────────────

const MANIFEST = {
  // ── META (self-healing) ──
  'manifest-watcher':  { intended: 'online', cron: null, reason: 'Auto-reconcile on boot + 2h audit cycle' },

  // ── CORE INFRASTRUCTURE (always online) ──
  'cathedral-bot':       { intended: 'online', cron: null, reason: 'Telegram bot — core' },
  'vault-watcher':       { intended: 'online', cron: null, reason: 'File watcher + embeddings indexing' },
  'cath-bridge':         { intended: 'online', cron: null, reason: 'Cathedral bridge service' },
  'sentinel':            { intended: 'online', cron: null, reason: 'Watchdog' },
  'dispatch-bot':        { intended: 'online', cron: null, reason: 'Telegram dispatch' },
  'telegram-tunnel':     { intended: 'online', cron: null, reason: 'Webhook tunnel' },
  'cathedral-panel':     { intended: 'online', cron: null, reason: 'Control panel web UI' },
  'ttyd-claude':         { intended: 'online', cron: null, reason: 'Terminal web access' },
  'neural-bus':          { intended: 'online', cron: null, reason: 'Cross-agent messaging bus' },
  'dm-processor':        { intended: 'online', cron: null, reason: 'Agent DM processing' },

  // ── VAULT & KNOWLEDGE (always online) ──
  'vault-state-refresh': { intended: 'online', cron: null, reason: 'Vault state generator' },
  'vault-promoter':      { intended: 'online', cron: null, reason: 'Staging → Refined Gold promotion' },
  'the-archivist':       { intended: 'online', cron: null, reason: 'Vault archival' },
  'the-cartographer':    { intended: 'online', cron: null, reason: 'Vault mapping' },
  'folder-watcher':      { intended: 'online', cron: null, reason: 'Agent folder watcher' },
  'lymphatic':           { intended: 'online', cron: null, reason: 'System cleanup / lymphatic' },
  'orchestrator-seed':   { intended: 'online', cron: null, reason: 'Head Orchestrator context seed' },
  'cognitive-scanner':   { intended: 'online', cron: null, reason: 'Paul cognitive pattern detection' },

  // ── CONTENT STUDIO (always online) ──
  'reed-studio-engine':  { intended: 'online', cron: null, reason: 'Reed Studio Engine (7 characters)' },
  'reed-director':       { intended: 'online', cron: null, reason: 'Reed visual director' },
  'reed-shots':          { intended: 'online', cron: null, reason: 'Reed Daily Lab shots' },
  'eng-studio':          { intended: 'online', cron: null, reason: 'Engineering Studio' },
  'content-ideas':       { intended: 'online', cron: null, reason: 'Content idea engine' },
  'content-reviews':     { intended: 'online', cron: null, reason: 'Content review responder' },
  'maya-social':         { intended: 'online', cron: null, reason: 'Maya internal social feed' },
  'buzz-monitor':        { intended: 'online', cron: null, reason: 'Social buzz monitor' },
  'hf-tester':           { intended: 'online', cron: null, reason: 'Higgsfield model tester (Mon/Wed/Fri)' },

  // ── RESEARCH (always online) ──
  'archaeologist':       { intended: 'online', cron: null, reason: 'Forgotten technique miner (watcher + rate-limited)' },
  'terminal-harvester':  { intended: 'online', cron: null, reason: 'Claude Code session harvester' },

  // ── VOICE ──
  'voice-chamber':       { intended: 'online', cron: null, reason: 'KITT voice interface + Cathy brain' },
  'morning-view':        { intended: 'online', cron: null, reason: 'Morning view web UI' },

  // ── DAILY CRONS ──
  'groundskeeper':       { intended: 'cron', cron: '30 22 * * *',   reason: 'Daily 06:30 HKT — vault health observation' },
  'morning-briefing':    { intended: 'cron', cron: '30 23 * * *',   reason: 'Daily 07:30 HKT — Cathy voice briefing' },
  'while-you-were-gone': { intended: 'cron', cron: '0 0 * * *',     reason: 'Daily 08:00 HKT — morning status report' },
  'prospector':          { intended: 'cron', cron: '0 11 * * *',    reason: 'Daily 19:00 HKT — product extraction from sessions' },
  'ensemble-feeder':     { intended: 'cron', cron: '0 20 * * *',    reason: 'Daily 04:00 HKT — auto-feed ensemble gate' },
  'trader':              { intended: 'cron', cron: '0 0,12 * * *',  reason: '2x daily 08:00+20:00 HKT — trading orchestrator' },

  // ── WEEKLY CRONS ──
  'feed-steward':        { intended: 'cron', cron: '0 16 * * 6',    reason: 'Sun midnight HKT — agent feed digest + grading' },
  'gym-digest':          { intended: 'cron', cron: '0 12 * * 0',    reason: 'Sun 20:00 HKT — weekly gym summary' },
  'memory-consolidator': { intended: 'cron', cron: '0 4 * * 0',     reason: 'Sun 12:00 HKT — agent memory maintenance' },
  'archaeologist-weekly': { intended: 'cron', cron: '0 19 * * 0',   reason: 'Sun 03:00 HKT — deep archaeologist sweep' },
  'cathedral-gardener':   { intended: 'cron', cron: '0 20 * * 0',   reason: 'Sun 04:00 HKT — Gardener: genome+health+watcher → structural proposals' },
  'output-architect':     { intended: 'cron', cron: '0 22 * * *',   reason: 'Daily 06:00 HKT — Output Architect: deliverable specs + quality grades + emergent detection' },
  'mirror-evolution':     { intended: 'cron', cron: '0 10 1 * *',   reason: '1st of month 18:00 HKT — Mirror self-audit: principles vs practice drift' },

  // ── DAILY CRONS ──
  'curiosity-loop':      { intended: 'cron', cron: '0 20 * * *',    reason: 'Daily 04:00 HKT — agent research + feed + cross-agent DMs' },
  'the-muse':            { intended: 'cron', cron: '0 19 * * *',    reason: 'Daily 03:00 HKT — vault walker, cross-domain bridges' },
  'physician':           { intended: 'cron', cron: '0 */6 * * *',   reason: 'Every 6h — senses diagnostic (13 senses)' },
  'whisperer':           { intended: 'cron', cron: '45 22 * * *',   reason: 'Daily 06:45 HKT — Looking Glass sky reader' },
  'groundskeeper':       { intended: 'cron', cron: '30 22 * * *',   reason: 'Daily 06:30 HKT — vault soil observation' },
  'morning-briefing':    { intended: 'cron', cron: '30 23 * * *',   reason: 'Daily 07:30 HKT — voice + text briefing' },
  'while-you-were-gone': { intended: 'cron', cron: '0 0 * * *',     reason: 'Daily 08:00 HKT — morning report' },
  'prospector':          { intended: 'cron', cron: '0 11 * * *',    reason: 'Daily 19:00 HKT — product scan of session harvests' },
  'ensemble-feeder':     { intended: 'cron', cron: '0 20 * * *',    reason: 'Daily 04:00 HKT — vault claim extraction + Ensemble Gate' },
  'appreciation-ritual': { intended: 'cron', cron: '0 23 * * *',    reason: 'Daily 07:00 HKT — 5 loves, 5 gratitudes, 3 improvements' },
  'architect-pulse':     { intended: 'cron', cron: '0 7 * * *',     reason: 'Daily — 11 channel nudge rotation' },
  'trader':              { intended: 'cron', cron: '0 0,12 * * *',  reason: 'Twice daily 08:00+20:00 HKT — trading orchestrator' },
  'stress-battery':      { intended: 'cron', cron: '0 21 * * *',    reason: 'Daily 05:00 HKT — anti-fragile 3-chamber stress test (compression+contradiction+identity)' },
  'paul-patterns':       { intended: 'cron', cron: '0 22 * * 0',   reason: 'Weekly Sunday 06:00 HKT — session pattern analysis + cognitive tracking' },
  'corpus-diagnostic':   { intended: 'cron', cron: '0 20 * * 3',   reason: 'Weekly Wednesday 04:00 HKT — Cathedral diagnostic lens on ancient corpus' },
  'vault-backup':        { intended: 'cron', cron: '0 3 * * *',     reason: 'Daily — Tier 1 local rsync backup' },
  'vault-github-sync':   { intended: 'cron', cron: '15 3 * * *',    reason: 'Daily — Tier 2 GitHub push' },
  'cosmology-researcher':{ intended: 'cron', cron: '0 18 * * *',    reason: 'Daily 02:00 HKT — autonomous DeepSeek research' },
  'cosmology-podcast':   { intended: 'cron', cron: '0 19 * * *',    reason: 'Daily 03:00 HKT — edge-tts voice episodes' },
  'night-engine':        { intended: 'cron', cron: '0 23 * * *',    reason: 'Daily — night processing cycle' },
  'skills-scout':        { intended: 'cron', cron: '0 23 * * *',    reason: 'Daily 07:00 HKT — finds new skills for Cathedral' },
  'tui-runner':          { intended: 'cron', cron: '0 3 * * *',     reason: 'Daily — DeepSeek background research' },
  'moon-daily':          { intended: 'cron', cron: '45 22 * * *',   reason: 'Daily 06:45 HKT — lunar data for Looking Glass' },
  'cross-project-pulse': { intended: 'cron', cron: '45 22 * * *',   reason: 'Daily 06:45 HKT — cross-project pattern detection' },

  // ── PERIODIC CRONS (every N hours / minutes) ──
  'the-timekeeper':      { intended: 'cron', cron: '*/15 * * * *',  reason: 'Every 15m — critical alert monitor, daily report 07:15 HKT' },
  'cathedral-heartbeat': { intended: 'cron', cron: '*/15 * * * *',  reason: 'Every 15m — system heartbeat + cascade classification' },
  'geomag':              { intended: 'cron', cron: '0 */4 * * *',   reason: 'Every 4h — geomagnetic data for trading + Looking Glass' },

  // ── WEEKLY CRONS ──
  'feed-steward':        { intended: 'cron', cron: '0 16 * * 6',    reason: 'Sunday midnight HKT — steward grades, tea harvest' },
  'roundtable':          { intended: 'cron', cron: '0 16 * * 0',    reason: 'Sunday midnight HKT — autonomous agent roundtable' },
  'accountability-buddies': { intended: 'cron', cron: '0 18 * * 6', reason: 'Sunday 02:00 HKT — buddy pairs, follow-through check' },
  'dissent-round':       { intended: 'cron', cron: '30 17 * * 6',   reason: 'Sunday 01:30 HKT — structured debate on contradictions' },
  'cognitive-bridge':    { intended: 'cron', cron: '0 21 * * 6',     reason: 'Sunday 05:00 HKT — cognitive synthesis (kernel gaps, behavioral patterns)' },
  'memory-consolidator': { intended: 'cron', cron: '0 4 * * 0',     reason: 'Sunday — memory decay, graduation, self-assessment' },
  'gym-digest':          { intended: 'cron', cron: '0 12 * * 0',    reason: 'Sunday 20:00 HKT — weekly gym report' },
  'long-term-portfolio': { intended: 'cron', cron: '0 0 * * 1',     reason: 'Monday 08:00 HKT — weekly portfolio review' },
  'property-scout':      { intended: 'cron', cron: '0 2 * * 0',     reason: 'Sunday — weekly property scan' },
  'golden-zone-units':   { intended: 'cron', cron: '0 2 * * 3',     reason: 'Wednesday — unit search' },
  'due-diligence':       { intended: 'cron', cron: '0 2 * * 4',     reason: 'Thursday — property due diligence' },
  'causal-net':          { intended: 'cron', cron: '0 4 * * *',     reason: 'Daily — causal relationship mapping' },
  'active-learning':     { intended: 'cron', cron: '30 4 * * *',    reason: 'Daily — priority queue across engines' },

  // ── MONTHLY CRONS ──
  'self-audit':          { intended: 'cron', cron: '0 0 1 * *',     reason: '1st of month — full system self-audit' },
  'appreciation-round':  { intended: 'cron', cron: '0 0 1 * *',     reason: '1st of month 08:00 HKT — agent appreciation' },
  'suggestion-box':      { intended: 'cron', cron: '0 0 1,15 * *',  reason: '1st+15th 08:00 HKT — agent improvement suggestions' },
  'cathedral-sprint':    { intended: 'cron', cron: '0 4 1,8 * *',   reason: '1st+8th — monthly collaborative challenge' },
  'best-version-reask':  { intended: 'cron', cron: '0 22 17 * *',   reason: '18th 06:00 HKT — monthly growth check' },
  'town-hall':           { intended: 'cron', cron: '0 0 28 * *',    reason: '28th 08:00 HKT — monthly all-agent retrospective' },

  // ── PERSISTENT (always online) ──
  'intake-watcher':      { intended: 'online', cron: null, reason: 'Watches ~/nanoclaw/combo-inbox/ + gym intake folders' },
  'reed-gemini':         { intended: 'online', cron: null, reason: 'Gemini image gen lab — supplements Reed when Higgsfield credits exhausted' },

  // ── EVENING CRON (fixed 2026-05-24 — supertonic→edge-tts) ──
  'evening-reflection':  { intended: 'cron', cron: '0 12 * * *', reason: 'Daily 20:00 HKT — Cathedral + Cathy voice reflections via edge-tts' },

  // ── DELETED (removed from PM2) ──
  // cath-local — FastAPI local inference, replaced by native Node.js fetch + DeepSeek
  // open-gen-ai — unused Next.js app
  // agent-sync — replaced by neural-bus
  // proactive-orchestrator — replaced by orchestrator-seed
  // knowledge-graph — superseded by vault-embedder + gold-extractor
  // reed-engagement — replaced by reed-director
  // reed-mastery — duplicate of hf-tester
};

// ─── FUNCTIONS ─────────────────────────────────────────────────

function getPM2State() {
  try {
    const raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const procs = JSON.parse(raw);
    const state = {};
    for (const p of procs) {
      const env = p.pm2_env || p;
      state[p.name || env.name] = {
        id: env.pm_id,
        status: env.status,
        cron: env.cron_restart_time || env.cron_restart || null,
        script: env.pm_exec_path || p.script,
        uptime: env.pm_uptime,
        restarts: env.restart_time,
      };
    }
    return state;
  } catch {
    console.error('Failed to read PM2 state');
    return {};
  }
}

function audit() {
  const pm2 = getPM2State();
  const drift = [];
  const ok = [];
  const unknown = [];

  // Check manifest entries against PM2
  for (const [name, spec] of Object.entries(MANIFEST)) {
    const actual = pm2[name];
    if (!actual) {
      if (spec.intended !== 'dead') {
        drift.push({ name, issue: 'NOT IN PM2', intended: spec.intended, reason: spec.reason });
      }
      continue;
    }

    const isRunning = actual.status === 'online';
    const shouldRun = spec.intended === 'online';
    const isCron = spec.intended === 'cron';
    const cronMatch = isCron ? (actual.cron === spec.cron) : true;

    if (spec.intended === 'dead') {
      drift.push({ name, issue: 'SHOULD DELETE', id: actual.id, reason: spec.reason });
    } else if (shouldRun && !isRunning) {
      drift.push({ name, issue: 'SHOULD BE ONLINE', id: actual.id, actual: actual.status, reason: spec.reason });
    } else if (isCron && !actual.cron) {
      drift.push({ name, issue: 'MISSING CRON', id: actual.id, expectedCron: spec.cron, reason: spec.reason });
    } else if (isCron && !cronMatch) {
      drift.push({ name, issue: 'WRONG CRON', id: actual.id, expected: spec.cron, actual: actual.cron, reason: spec.reason });
    } else if (spec.intended === 'stopped' && isRunning) {
      drift.push({ name, issue: 'SHOULD BE STOPPED', id: actual.id, reason: spec.reason });
    } else {
      ok.push(name);
    }
    delete pm2[name];
  }

  // Check for PM2 processes not in manifest
  for (const [name, actual] of Object.entries(pm2)) {
    unknown.push({ name, id: actual.id, status: actual.status, script: actual.script });
  }

  return { drift, ok, unknown };
}

function reconcile() {
  const pm2 = getPM2State();
  const genPaused = genGuard.isPaused();
  if (genPaused) {
    console.log('  ⚠️  Global generation kill-switch is ON — generator processes will NOT be auto-started.');
  }

  for (const [name, spec] of Object.entries(MANIFEST)) {
    const actual = pm2[name];
    if (!actual) continue;

    // GLOBAL kill-switch: never reconcile a generator back online while paused.
    if (genPaused && GENERATOR_PROCS.has(name)) {
      if (actual.status === 'online') {
        console.log(`  🚫 ${name} is a generator and the kill-switch is ON — leaving as-is (not enforcing online).`);
      } else {
        console.log(`  🚫 SKIP START ${name} (generator, kill-switch ON)`);
      }
      continue;
    }

    if (spec.intended === 'dead') {
      console.log(`  DELETE ${name} (${spec.reason})`);
      execSync(`pm2 delete ${actual.id} 2>/dev/null`);
      continue;
    }

    if (spec.intended === 'cron' && actual.cron !== spec.cron) {
      console.log(`  FIX CRON ${name}: ${actual.cron} → ${spec.cron}`);
      const script = actual.script;
      execSync(`pm2 delete ${actual.id} 2>/dev/null`);
      execSync(`pm2 start "${script}" --name "${name}" --cron "${spec.cron}" --no-autorestart 2>/dev/null`);
    }

    if (spec.intended === 'online' && actual.status !== 'online') {
      console.log(`  START ${name}`);
      execSync(`pm2 start ${actual.id} 2>/dev/null`);
    }
  }

  execSync('pm2 save 2>/dev/null');
  console.log('\n  PM2 state saved.');
}

function exportJSON() {
  const pm2 = getPM2State();
  const result = {};
  for (const [name, spec] of Object.entries(MANIFEST)) {
    const actual = pm2[name] || {};
    result[name] = {
      ...spec,
      actual_status: actual.status || 'missing',
      actual_cron: actual.cron || null,
      pm2_id: actual.id ?? null,
    };
  }
  const outPath = MANIFEST_PATH;
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Exported to ${outPath}`);
}

// ─── MAIN ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--json')) {
  exportJSON();
} else if (args.includes('--reconcile')) {
  console.log('\nReconciling PM2 state with manifest...\n');
  reconcile();
} else {
  // Default: audit
  const { drift, ok, unknown } = audit();

  console.log(`\n  CATHEDRAL MANIFEST AUDIT`);
  console.log(`  ${'='.repeat(50)}`);
  console.log(`  OK: ${ok.length} processes match intended state`);

  if (drift.length) {
    console.log(`\n  DRIFT (${drift.length}):`);
    for (const d of drift) {
      console.log(`    ${d.name}: ${d.issue} — ${d.reason}`);
      if (d.expectedCron) console.log(`      expected cron: ${d.expectedCron}`);
    }
  }

  if (unknown.length) {
    console.log(`\n  UNKNOWN (${unknown.length} — not in manifest):`);
    for (const u of unknown) {
      console.log(`    ${u.name} (${u.status}) — ${u.script}`);
    }
  }

  if (!drift.length && !unknown.length) {
    console.log('\n  All processes match manifest. Cathedral healthy.');
  } else {
    console.log(`\n  Run with --reconcile to fix drift.`);
  }
  console.log('');
}
