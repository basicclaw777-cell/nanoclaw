// The Physician — Court Member #19
// Doctor, trainer, therapist for the Cathedral's senses.
// Also absorbs Maintenance Manager role (process health).
//
// PM2 cron: every 6 hours (0 */6 * * *)
// Telegram: /physician (on-demand diagnosis)
//
// Three modes:
//   DOCTOR — is this sense working? Is output calibrated?
//   TRAINER — is output improving or degrading? Adjust.
//   THERAPIST — are senses talking to each other? Restore broken pathways.
//
// Governance: calibrates, never controls. Reports, never fixes autonomously.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = join(HOME, 'cathedral-vault');
const CATHEDRAL = join(HOME, 'Cathedral');
const NANOCLAW = join(HOME, 'nanoclaw');
const STATE_PATH = join(CATHEDRAL, 'physician-state.json');
const REPORT_DIR = join(VAULT, '00_Staging', 'physician');

// ── State ───────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); }
  catch { return { lastRun: null, history: [], alerts: [] }; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── DOCTOR: Diagnose each sense ─────────────────────────────────────────────

async function diagnoseSenses() {
  const diagnoses = [];

  // 1. Sight (cath-state.json)
  try {
    const state = JSON.parse(readFileSync(join(CATHEDRAL, 'cath-state.json'), 'utf-8'));
    const sight = state.sight || {};
    const lastScan = sight.last_scan ? new Date(sight.last_scan) : null;
    const age = lastScan ? (Date.now() - lastScan.getTime()) / 3600000 : Infinity;
    diagnoses.push({
      sense: 'sight',
      status: age < 48 ? 'healthy' : age < 168 ? 'stale' : 'dead',
      age_hours: Math.round(age),
      flags: sight.flags || [],
      finding: sight.mirror_voice?.slice(0, 150) || 'no voice',
      prescription: age > 48 ? 'Sight scan overdue. Run /sight on Telegram.' : null,
    });
  } catch { diagnoses.push({ sense: 'sight', status: 'unreachable', prescription: 'cath-state.json missing or corrupt' }); }

  // 2. Smell
  try {
    const state = JSON.parse(readFileSync(join(CATHEDRAL, 'cath-state.json'), 'utf-8'));
    const smell = state.smell || {};
    const lastScan = smell.last_scan ? new Date(smell.last_scan) : null;
    const age = lastScan ? (Date.now() - lastScan.getTime()) / 3600000 : Infinity;
    diagnoses.push({
      sense: 'smell',
      status: age < 48 ? 'healthy' : age < 168 ? 'stale' : 'dead',
      age_hours: Math.round(age),
      flags: smell.flags || [],
      waste_score: smell.waste_score,
      prescription: smell.waste_score > 0.8 ? 'High waste. Cathy over-explaining.' : null,
    });
  } catch { diagnoses.push({ sense: 'smell', status: 'unreachable' }); }

  // 3. Proprioception
  try {
    const state = JSON.parse(readFileSync(join(CATHEDRAL, 'cath-state.json'), 'utf-8'));
    const prop = state.proprioception || {};
    diagnoses.push({
      sense: 'proprioception',
      status: prop.drift_score < 0.3 ? 'healthy' : prop.drift_score < 0.6 ? 'drifting' : 'misaligned',
      drift_score: prop.drift_score,
      drift_status: prop.drift_status,
      flags: prop.flags || [],
      prescription: prop.drift_score > 0.3 ? 'Drift detected. Review Cathy conversations for character slip.' : null,
    });
  } catch { diagnoses.push({ sense: 'proprioception', status: 'unreachable' }); }

  // 4. Lymphatic
  try {
    const ls = JSON.parse(readFileSync(join(CATHEDRAL, 'lymphatic-state.json'), 'utf-8'));
    const recent = (ls.bloatFlags || []).slice(-20);
    const avgBloat = recent.length ? recent.reduce((s, b) => s + b.score, 0) / recent.length : 0;
    const ratings = ls.ratings || [];
    diagnoses.push({
      sense: 'lymphatic',
      status: recent.length > 0 ? 'active' : 'dormant',
      messages_scanned: recent.length,
      avg_bloat: Math.round(avgBloat * 100),
      ratings_count: ratings.length,
      prescription: ratings.length === 0 ? 'No ratings collected. Paul hasn\'t used /rate yet.' : null,
    });
  } catch { diagnoses.push({ sense: 'lymphatic', status: 'no state file' }); }

  // 5. Looking Glass (Whisperer)
  try {
    const ws = JSON.parse(readFileSync(join(CATHEDRAL, 'whisperer-state.json'), 'utf-8'));
    const lastRun = ws.lastRun ? new Date(ws.lastRun) : null;
    const age = lastRun ? (Date.now() - lastRun.getTime()) / 3600000 : Infinity;
    diagnoses.push({
      sense: 'looking_glass',
      status: age < 36 ? 'healthy' : age < 72 ? 'stale' : 'dead',
      age_hours: Math.round(age),
      last_frontier: ws.previousFrontier?.toFixed(1) + '°',
      last_signal: ws.previousSignal,
      prescription: age > 36 ? 'Whisperer hasn\'t run. Check PM2 whisperer process.' : null,
    });
  } catch { diagnoses.push({ sense: 'looking_glass', status: 'no state file' }); }

  // 6. Cognitive Bridge
  try {
    const report = readFileSync(join(CATHEDRAL, 'cognitive-bridge-report.md'), 'utf-8');
    const { statSync } = await import('fs');
    const age = (Date.now() - (existsSync(join(CATHEDRAL, 'cognitive-bridge-report.md'))
      ? statSync(join(CATHEDRAL, 'cognitive-bridge-report.md')).mtimeMs : 0)) / 3600000;
    const patternCount = (report.match(/sessions\)/g) || []).length;
    diagnoses.push({
      sense: 'cognitive_bridge',
      status: age < 168 ? 'healthy' : 'stale',
      age_hours: Math.round(age),
      patterns_found: patternCount,
      prescription: age > 168 ? 'Cognitive bridge hasn\'t run in over a week.' : null,
    });
  } catch { diagnoses.push({ sense: 'cognitive_bridge', status: 'no report' }); }

  // 7. Belief Tracker
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(join(NANOCLAW, 'vortex_data/metrics.db'), { readonly: true });
    const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='belief_trajectory'").all();
    const count = has.length ? db.prepare('SELECT COUNT(*) as c FROM belief_trajectory').get().c : 0;
    db.close();
    diagnoses.push({
      sense: 'belief_tracker',
      status: count > 10 ? 'healthy' : count > 0 ? 'underfed' : 'empty',
      entries: count,
      prescription: count < 10 ? `Only ${count} entries. Passive scanning may need tuning.` : null,
    });
  } catch { diagnoses.push({ sense: 'belief_tracker', status: 'db error' }); }

  // 8. Ledger
  try {
    const state = JSON.parse(readFileSync(join(CATHEDRAL, 'cath-state.json'), 'utf-8'));
    const ledger = state.ledger || {};
    diagnoses.push({
      sense: 'ledger',
      status: ledger.total_claims > 0 ? 'active' : 'empty',
      total_claims: ledger.total_claims,
      unverified: ledger.unverified,
      quality_density: ledger.quality_density,
      prescription: ledger.unverified > 20 ? `${ledger.unverified} unverified claims. Schedule verification pass.` : null,
    });
  } catch { diagnoses.push({ sense: 'ledger', status: 'unreachable' }); }

  return diagnoses;
}

// ── DOCTOR: Process health (Maintenance Manager) ────────────────────────────

function diagnoseProcesses() {
  try {
    const raw = execSync('pm2 jlist', { timeout: 15000 }).toString();
    const procs = JSON.parse(raw);

    const critical = ['cathedral-bot', 'cath-bridge', 'vault-watcher', 'sentinel'];
    const morning = ['vault-state-refresh', 'groundskeeper', 'whisperer', 'the-timekeeper', 'morning-briefing'];
    const crons = procs.filter(p => p.pm2_env?.cron_restart);

    const alerts = [];

    // Critical processes
    for (const name of critical) {
      const proc = procs.find(p => p.name === name);
      if (!proc || proc.pm2_env?.status !== 'online') {
        alerts.push({ severity: 'CRITICAL', message: `${name} is DOWN`, action: `pm2 start ${name}` });
      }
    }

    // Morning sequence — check if they ran today
    const today = new Date().toISOString().slice(0, 10);
    for (const name of morning) {
      const proc = procs.find(p => p.name === name);
      if (proc && proc.pm2_env?.status === 'stopped') {
        // Cron processes stop after running — check restart count
        const restarts = proc.pm2_env?.restart_time || 0;
        if (restarts === 0) {
          alerts.push({ severity: 'WARN', message: `${name} has never run (0 restarts)`, action: `pm2 start ${name}` });
        }
      }
    }

    // High restart count (crash loop detection)
    for (const proc of procs) {
      const restarts = proc.pm2_env?.restart_time || 0;
      if (restarts > 50 && proc.pm2_env?.status === 'online') {
        alerts.push({ severity: 'WARN', message: `${proc.name} has ${restarts} restarts — possible crash loop` });
      }
    }

    const online = procs.filter(p => p.pm2_env?.status === 'online').length;
    const stopped = procs.filter(p => p.pm2_env?.status === 'stopped').length;

    return { online, stopped, total: procs.length, alerts, criticalOk: alerts.filter(a => a.severity === 'CRITICAL').length === 0 };
  } catch (e) {
    return { online: 0, stopped: 0, total: 0, alerts: [{ severity: 'CRITICAL', message: 'PM2 unreachable: ' + e.message }], criticalOk: false };
  }
}

// ── TRAINER: Compare with previous run ──────────────────────────────────────

function trainingScan(currentDiagnoses, prevState) {
  const insights = [];
  const prevDiagnoses = prevState.history?.[0]?.diagnoses || [];

  for (const curr of currentDiagnoses) {
    const prev = prevDiagnoses.find(d => d.sense === curr.sense);
    if (!prev) continue;

    // Status degraded
    if (prev.status === 'healthy' && curr.status !== 'healthy') {
      insights.push({
        type: 'DEGRADED',
        sense: curr.sense,
        from: prev.status,
        to: curr.status,
        message: `${curr.sense} degraded from ${prev.status} to ${curr.status}`,
      });
    }

    // Status improved
    if (prev.status !== 'healthy' && curr.status === 'healthy') {
      insights.push({
        type: 'IMPROVED',
        sense: curr.sense,
        from: prev.status,
        to: curr.status,
        message: `${curr.sense} recovered: ${prev.status} → ${curr.status}`,
      });
    }
  }

  return insights;
}

// ── THERAPIST: Cross-sense integration ──────────────────────────────────────

function therapistScan(diagnoses, processHealth) {
  const observations = [];

  // Sight flagged concentration but Smell is silent about it
  const sight = diagnoses.find(d => d.sense === 'sight');
  const smell = diagnoses.find(d => d.sense === 'smell');
  if (sight?.flags?.some(f => f.includes('CONCENTRATION')) && !smell?.flags?.some(f => f.includes('CONCENTRATION'))) {
    observations.push('Sight sees vault concentration (40% technology). Smell doesn\'t flag this. The two senses aren\'t cross-referencing.');
  }

  // Lymphatic flagging bloat but Whisperer still producing long messages
  const lymphatic = diagnoses.find(d => d.sense === 'lymphatic');
  const glass = diagnoses.find(d => d.sense === 'looking_glass');
  if (lymphatic?.avg_bloat > 50 && glass?.status === 'healthy') {
    observations.push(`Lymphatic shows ${lymphatic.avg_bloat}% bloat. Whisperer is running. Is the Whisperer output itself bloated? Check whisper length vs 150-word target.`);
  }

  // Belief tracker underfed while cognitive bridge finds patterns
  const belief = diagnoses.find(d => d.sense === 'belief_tracker');
  const cognitive = diagnoses.find(d => d.sense === 'cognitive_bridge');
  if (belief?.status === 'underfed' && cognitive?.status === 'healthy') {
    observations.push(`Cognitive bridge found ${cognitive.patterns_found || '?'} patterns, but belief tracker has only ${belief.entries} entries. The system knows how Paul thinks but not what he believes. Gap in epistemological tracking.`);
  }

  // Proprioception shows drift but no recent correction logged
  const prop = diagnoses.find(d => d.sense === 'proprioception');
  if (prop?.drift_score > 0.3) {
    observations.push(`Proprioception drift at ${prop.drift_score}. Character may be slipping. Review last 5 Cathy conversations for tone/substance match.`);
  }

  // Many processes stopped — is this intentional?
  if (processHealth.stopped > processHealth.online) {
    observations.push(`${processHealth.stopped} processes stopped vs ${processHealth.online} online. More than half the Cathedral is dormant. Is this intentional or neglect?`);
  }

  // Ledger has unverified claims
  const ledger = diagnoses.find(d => d.sense === 'ledger');
  if (ledger?.unverified > 20) {
    observations.push(`Ledger: ${ledger.unverified} unverified claims accumulating. Claims without verification become false confidence over time.`);
  }

  return observations;
}

// ── Generate Report ─────────────────────────────────────────────────────────

function generateReport(diagnoses, processHealth, training, therapy) {
  const healthyCount = diagnoses.filter(d => d.status === 'healthy' || d.status === 'active').length;
  const totalSenses = diagnoses.length;
  const prescriptions = diagnoses.filter(d => d.prescription).map(d => `${d.sense}: ${d.prescription}`);
  const grade = healthyCount >= totalSenses * 0.8 ? 'A' : healthyCount >= totalSenses * 0.6 ? 'B' : healthyCount >= totalSenses * 0.4 ? 'C' : 'D';

  // CATHY STANDARD: Lead with the sharpest observation, not the status board.
  // Find the single most reply-worthy finding.
  let opener = '';
  if (therapy.length) {
    // Therapist observations are the sharpest — lead with one
    opener = therapy[0];
  } else if (prescriptions.length) {
    opener = prescriptions[0];
  } else {
    const dead = diagnoses.filter(d => d.status === 'dead' || d.status === 'unreachable');
    if (dead.length) opener = `${dead[0].sense} is dead. Has been for ${dead[0].age_hours || '?'} hours.`;
    else opener = `Cathedral health: ${grade}. ${healthyCount}/${totalSenses} senses checking in.`;
  }

  let report = `◎ PHYSICIAN — ${grade}\n\n${opener}\n\n`;

  // Compact sense line (one line, not a list)
  const senseIcons = diagnoses.map(d => {
    const icon = d.status === 'healthy' || d.status === 'active' ? '●' : d.status === 'stale' || d.status === 'underfed' ? '◐' : '○';
    return icon;
  }).join('');
  report += `Senses: ${senseIcons} (${healthyCount}/${totalSenses})\n`;
  report += `PM2: ${processHealth.online}↑ ${processHealth.stopped}↓\n`;

  // Only show problems, not everything healthy
  const problems = diagnoses.filter(d => d.status !== 'healthy' && d.status !== 'active');
  if (problems.length) {
    report += '\n';
    for (const d of problems) {
      report += `${d.sense}: ${d.status}`;
      if (d.prescription) report += ` → ${d.prescription}`;
      report += '\n';
    }
  }

  // Therapy (cross-sense) — the interesting part
  if (therapy.length > 1) {
    report += '\n';
    for (const o of therapy.slice(1, 3)) report += `→ ${o}\n`;
  }

  // Critical alerts only
  const critical = processHealth.alerts.filter(a => a.severity === 'CRITICAL');
  if (critical.length) {
    report += '\n🔴 ' + critical.map(a => a.message).join(' | ') + '\n';
  }

  return report;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('◎ The Physician — examining the Cathedral...');

  const prevState = loadState();

  // Doctor
  const diagnoses = await diagnoseSenses();
  const processHealth = diagnoseProcesses();
  console.log(`  Senses: ${diagnoses.filter(d => d.status === 'healthy' || d.status === 'active').length}/${diagnoses.length} healthy`);
  console.log(`  Processes: ${processHealth.online} online, ${processHealth.stopped} stopped`);

  // Trainer
  const training = trainingScan(diagnoses, prevState);

  // Therapist
  const therapy = therapistScan(diagnoses, processHealth);
  console.log(`  Training insights: ${training.length}`);
  console.log(`  Therapy observations: ${therapy.length}`);

  // Report
  const report = generateReport(diagnoses, processHealth, training, therapy);
  console.log('\n' + report);

  // File to vault
  if (!existsSync(REPORT_DIR)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(REPORT_DIR, { recursive: true });
  }
  const filename = `diagnosis-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(join(REPORT_DIR, filename), `# Physician Diagnosis — ${new Date().toISOString().slice(0, 10)}\n\n${report}`);
  console.log(`  Filed: ${join(REPORT_DIR, filename)}`);

  // Telegram
  try {
    const { config } = await import('dotenv');
    config();
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.PAUL_CHAT_ID;
    if (token && chatId) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: report }),
      });
      const j = await res.json();
      console.log(`  Telegram: ${j.ok ? 'sent' : j.description}`);
    }
  } catch (e) { console.log(`  Telegram: ${e.message}`); }

  // Save state
  const newState = {
    lastRun: new Date().toISOString(),
    history: [{ date: new Date().toISOString().slice(0, 10), diagnoses, processHealth, training, therapy }, ...(prevState.history || []).slice(0, 29)],
    alerts: processHealth.alerts,
  };
  saveState(newState);

  // Sunday interview
  const isSunday = new Date().getDay() === 0;
  const isInterview = process.argv.includes('--interview');
  if (isSunday || isInterview) {
    await runInterview();
  }

  console.log('◎ Done.');
}

// ── PHYSICIAN'S WEEKLY INTERVIEW ────────────────────────────────────────────

const INTERVIEW_QUESTIONS = [
  { id: 'changed_mind', q: '1. What changed your mind this week? (anything you thought was true that isn\'t, or vice versa)' },
  { id: 'actually_used', q: '2. What Cathedral output did you actually USE this week? (opened, read, acted on)' },
  { id: 'ignored', q: '3. What did you ignore or skip? (tells us what\'s noise)' },
  { id: 'morning_rate', q: '4. Rate the morning sequence 1-5. (briefing, whisperer, groundskeeper — are they landing?)' },
  { id: 'blind_spot', q: '5. Anything the Cathedral should know about but doesn\'t?' },
];

async function runInterview() {
  console.log('  Sending weekly interview...');
  try {
    const { config } = await import('dotenv');
    config();
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.PAUL_CHAT_ID;
    if (!token || !chatId) return;

    let text = '◎ PHYSICIAN\'S WEEKLY INTERVIEW\n\n';
    text += 'Reply to any question with /answer [number] [response]\n';
    text += 'Takes 2 minutes. Feeds belief tracker + lymphatic + taste map.\n\n';
    for (const q of INTERVIEW_QUESTIONS) {
      text += q.q + '\n\n';
    }
    text += '—\nExample: /answer 1 I was wrong about the divergence metric being useful';

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    console.log('  Interview sent.');
  } catch (e) { console.log('  Interview failed:', e.message); }
}

run().catch(console.error);
