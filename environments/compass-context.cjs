// compass-context.cjs — Builds rich context for hermes3 Build Tracker intelligence
// Layer 2 (Compass): reads everything hermes3 needs to reason about Cathedral state
// All read-only. Zero risk. Zero external dependencies.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const HOME = process.env.HOME;
const CATH = path.join(HOME, 'Cathedral');
const NANO = path.join(HOME, 'nanoclaw');
const MEM = path.join(HOME, '.claude/projects/-Users-basicclaw777/memory');
const VAULT = path.join(HOME, 'cathedral-vault');

function safe(fn) { try { return fn(); } catch { return null; } }

function buildCompassContext() {
  const sections = [];

  // ── 1. Recent sessions (last 15) ──
  try {
    const raw = fs.readFileSync(path.join(CATH, 'SESSION-LOG.md'), 'utf8');
    const parts = raw.split(/^## /m).filter(s => s.trim()).slice(-15);
    const sessionSummary = parts.map(s => {
      const lines = s.split('\n');
      return '## ' + lines.slice(0, 6).join('\n');
    }).join('\n\n');
    sections.push(`# RECENT SESSIONS (last 15)\n${sessionSummary}`);
  } catch(e) {
    sections.push('# RECENT SESSIONS\nUnavailable.');
  }

  // ── 2. Open gaps from gap register ──
  try {
    const gapDir = path.join(CATH, 'gap-register');
    const files = fs.readdirSync(gapDir).filter(f => f.endsWith('.json'));
    const openGaps = [];
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(gapDir, f), 'utf8'));
        if (d.status === 'open') {
          const cp = d.closure_predicate;
          const expr = typeof cp === 'object' ? (cp.expr || JSON.stringify(cp)) : String(cp);
          openGaps.push(`- ${f.replace('gap-','').replace('.json','')}: ${expr.substring(0, 150)}`);
        }
      } catch {}
    }
    sections.push(openGaps.length
      ? `# OPEN GAPS (${openGaps.length} items — these are production orders)\n${openGaps.join('\n')}`
      : '# OPEN GAPS\nAll gaps closed.');
  } catch(e) {
    sections.push('# OPEN GAPS\nGap register unavailable.');
  }

  // ── 3. Build-ready + high-priority from memory ──
  try {
    const memIndex = fs.readFileSync(path.join(MEM, 'MEMORY.md'), 'utf8');
    const lines = memIndex.split('\n');
    const buildReady = lines.filter(l => /BUILD READY|IN FLIGHT/i.test(l)).map(l => l.trim());
    const bolded = lines.filter(l => l.includes('**') && l.includes('.md')).map(l => l.trim().substring(0, 140));
    if (buildReady.length) {
      sections.push(`# BUILD-READY & IN-FLIGHT (${buildReady.length} items)\n${buildReady.join('\n')}`);
    }
    if (bolded.length) {
      sections.push(`# HIGH-PRIORITY ITEMS (${bolded.length} bolded in memory)\n${bolded.slice(0, 20).join('\n')}`);
    }
  } catch {}

  // ── 4. Environment door status ──
  try {
    const envFiles = [
      { name: 'Basic Reflex', file: 'env-br.html' },
      { name: 'Studio', file: 'env-studio.html' },
      { name: 'Cathedral', file: 'env-cathedral.html' },
      { name: 'Money', file: 'env-money.html' },
      { name: 'University', file: 'env-university.html' },
    ];
    const envStatus = [];
    for (const env of envFiles) {
      const fp = path.join(NANO, 'environments', env.file);
      if (fs.existsSync(fp)) {
        const html = fs.readFileSync(fp, 'utf8');
        const live = (html.match(/LIVE/g) || []).length;
        const wip = (html.match(/WIP/g) || []).length;
        const gaps = (html.match(/Coming|COMING|gap-card/g) || []).length;
        envStatus.push(`- ${env.name}: ${live} live, ${wip} WIP, ${gaps} gaps`);
      }
    }
    if (envStatus.length) sections.push(`# ENVIRONMENT DOORS\n${envStatus.join('\n')}`);
  } catch {}

  // ── 5. Git activity (last 10 commits per repo) ──
  const repos = [
    { name: 'nanoclaw', dir: NANO },
    { name: 'Cathedral', dir: CATH },
    { name: 'cathedral-vault', dir: VAULT },
  ];
  const gitLines = [];
  for (const repo of repos) {
    const log = safe(() => execSync(
      `git -C "${repo.dir}" log --oneline --since="14 days ago" -10 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    ));
    if (log && log.trim()) {
      gitLines.push(`## ${repo.name}\n${log.trim()}`);
    }
  }
  if (gitLines.length) {
    sections.push(`# GIT ACTIVITY (last 14 days)\n${gitLines.join('\n\n')}`);
  }

  // ── 6. PM2 process health ──
  const pm2 = safe(() => {
    const raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const procs = JSON.parse(raw);
    const online = procs.filter(p => p.pm2_env.status === 'online');
    const stopped = procs.filter(p => p.pm2_env.status === 'stopped');
    const errored = procs.filter(p => p.pm2_env.status === 'errored');
    const crashLoop = online.filter(p => p.pm2_env.restart_time > 50);
    let out = `Total: ${procs.length} processes. ${online.length} online, ${stopped.length} stopped, ${errored.length} errored.`;
    if (crashLoop.length) {
      out += `\nCRASH-LOOPING (>50 restarts): ${crashLoop.map(p => `${p.name} (${p.pm2_env.restart_time}r)`).join(', ')}`;
    }
    const keyProcs = ['cath-bridge', 'telegram-bot', 'vault-watcher', 'b-team-shift', 'cathedral-calendar'];
    const keyStatus = keyProcs.map(name => {
      const p = procs.find(x => x.name === name);
      return p ? `${name}: ${p.pm2_env.status}` : `${name}: NOT FOUND`;
    });
    out += `\nKey processes: ${keyStatus.join(' | ')}`;
    return out;
  });
  if (pm2) sections.push(`# PM2 PROCESS HEALTH\n${pm2}`);

  // ── 7. SQLite database stats ──
  const dbStats = [];
  try {
    const Database = require('better-sqlite3');

    // Coaching OS
    const coachDb = safe(() => {
      const db = new Database(path.join(NANO, 'coaching-os/coaching.db'), { readonly: true });
      const drills = db.prepare('SELECT count(*) as c FROM drills').get().c;
      const classes = db.prepare('SELECT count(*) as c FROM classes').get().c;
      const cues = db.prepare('SELECT count(*) as c FROM coaching_cues').get().c;
      const obs = db.prepare('SELECT count(*) as c FROM class_observations').get().c;
      db.close();
      return `Coaching OS: ${drills} drills, ${classes} classes, ${cues} cues, ${obs} observations`;
    });
    if (coachDb) dbStats.push(coachDb);

    // Cathedral OS
    const cathDb = safe(() => {
      const db = new Database(path.join(NANO, 'cathedral-os.db'), { readonly: true });
      const signals = db.prepare('SELECT count(*) as c FROM signals').get().c;
      const events = db.prepare('SELECT count(*) as c FROM events').get().c;
      const breakthroughs = db.prepare('SELECT count(*) as c FROM breakthroughs').get().c;
      db.close();
      return `Cathedral OS: ${signals} signals, ${events} events, ${breakthroughs} breakthroughs`;
    });
    if (cathDb) dbStats.push(cathDb);

    // BR CRM
    const crmDb = safe(() => {
      const db = new Database(path.join(HOME, 'basic-reflex/crm/br-crm.db'), { readonly: true });
      const students = db.prepare('SELECT count(*) as c FROM students').get().c;
      const sessions = db.prepare('SELECT count(*) as c FROM sessions').get().c;
      db.close();
      return `BR CRM: ${students} students, ${sessions} sessions`;
    });
    if (crmDb) dbStats.push(crmDb);

  } catch {}
  if (dbStats.length) sections.push(`# DATABASE STATS (read-only)\n${dbStats.join('\n')}`);

  // ── 8. File freshness (key directories, most recent modification) ──
  const freshness = [];
  const checkDirs = [
    { name: 'Content Studio', dir: path.join(CATH, 'content-studio') },
    { name: 'BR CRM', dir: path.join(CATH, 'br-crm') },
    { name: 'Agents', dir: path.join(CATH, 'agents') },
    { name: 'Knowledge', dir: path.join(CATH, 'knowledge') },
    { name: 'Environments', dir: path.join(NANO, 'environments') },
    { name: 'Coaching OS', dir: path.join(NANO, 'coaching-os') },
  ];
  for (const cd of checkDirs) {
    const newest = safe(() => {
      const out = execSync(
        `find "${cd.dir}" -maxdepth 2 -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -1`,
        { encoding: 'utf8', timeout: 5000 }
      );
      if (!out.trim()) return null;
      const [ts, fp] = out.trim().split(' ', 2);
      const date = new Date(parseFloat(ts) * 1000);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
      return `${cd.name}: ${daysAgo}d ago (${path.basename(fp)})`;
    });
    // macOS fallback (no -printf)
    if (!newest) {
      const fallback = safe(() => {
        const out = execSync(
          `find "${cd.dir}" -maxdepth 2 -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -exec stat -f '%m %N' {} + 2>/dev/null | sort -rn | head -1`,
          { encoding: 'utf8', timeout: 5000 }
        );
        if (!out.trim()) return null;
        const parts = out.trim().split(' ');
        const ts = parseInt(parts[0]);
        const fp = parts.slice(1).join(' ');
        const daysAgo = Math.floor((Date.now() / 1000 - ts) / 86400);
        return `${cd.name}: ${daysAgo}d ago (${path.basename(fp)})`;
      });
      if (fallback) freshness.push(fallback);
    } else {
      freshness.push(newest);
    }
  }
  if (freshness.length) sections.push(`# FILE FRESHNESS (most recent change per area)\n${freshness.join('\n')}`);

  // ── 9. Vault scan (recent vault activity) ──
  const vaultScan = safe(() => {
    const staging = path.join(VAULT, '00_Staging');
    if (!fs.existsSync(staging)) return null;
    const files = execSync(
      `find "${staging}" -maxdepth 2 -type f -name "*.md" -o -name "*.yaml" 2>/dev/null | head -10`,
      { encoding: 'utf8', timeout: 5000 }
    );
    if (!files.trim()) return 'Staging empty.';
    const names = files.trim().split('\n').map(f => path.basename(f));
    return `Staging area: ${names.length} files\n${names.map(n => '- ' + n).join('\n')}`;
  });
  if (vaultScan) sections.push(`# VAULT STAGING\n${vaultScan}`);

  // ── 10. Capability status (what hermes3 now has) ──
  sections.push(`# HERMES CAPABILITY STATUS
Active tools (all read-only):
✓ SESSION-LOG.md parser (build history, 15 sessions)
✓ Gap register scanner (open/closed gaps with closure predicates)
✓ Memory index reader (build-ready, in-flight, high-priority items)
✓ Environment door counter (live/WIP/gap cards per environment)
✓ Git log reader (last 14 days, 3 repos)
✓ PM2 process health (online/stopped/errored/crash-looping)
✓ SQLite database stats (coaching-os, cathedral-os, br-crm — read-only)
✓ File freshness scanner (most recent change per project area)
✓ Vault staging scanner (what's waiting to be processed)

Execution tools (Layer 3 — bounded):
✓ append-session-log (log builds to SESSION-LOG.md)
✓ create-gap (open new gap in gap register)
✓ pm2-restart (restart named PM2 process)
✓ git-commit (stage + commit in nanoclaw/Cathedral/cathedral-vault)
✓ close-gap (close gap with disposition)

Not yet available:
- Telegram bot logs (notification history)
- Calendar/scheduling data
- API credit balance`);

  return sections.join('\n\n---\n\n');
}

module.exports = { buildCompassContext };
