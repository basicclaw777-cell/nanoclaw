import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CHANNELS } from './channel-router.js';

// The Enforcement Spectrum — Levels 0-5
// From Cathedral University: Routine Science & Process Design, Course 7
// "Documentation-vs-Interface Enforcement Spectrum"
//
// Cathedral data: hooks = 100% enforcement, prompts/memory = ~20%

const LEVELS = {
  0: { name: 'Hope',          mechanism: 'Nothing enforces it. Relies on the actor remembering.',           symbol: '○' },
  1: { name: 'Documentation', mechanism: 'Written in CLAUDE.md, memory files, READMEs. Read ≠ followed.',  symbol: '◔' },
  2: { name: 'Prompt',        mechanism: 'Injected into system prompt or agent context. ~20% compliance.',  symbol: '◑' },
  3: { name: 'Hook',          mechanism: 'PreToolUse/PostToolUse hook. 100% enforcement.',                  symbol: '◕' },
  4: { name: 'Gate',          mechanism: 'Pass/fail checkpoint that blocks progression.',                   symbol: '●' },
  5: { name: 'Impossible',    mechanism: 'Wrong action physically cannot happen. Poka-yoke.',               symbol: '⬤' },
};

// Promotion rules: what moves a process from level N to level N+1
const PROMOTIONS = {
  '0→1': 'Write it down. Add to CLAUDE.md, memory file, or KNOWN_ISSUES.md.',
  '1→2': 'Inject into agent system prompt or skill instructions. Context paragraph in SI-15.',
  '2→3': 'Add a PreToolUse or PostToolUse hook in settings.json. Hook script in ~/.claude/hooks/.',
  '3→4': 'Add a state gate: action blocked until prerequisite state exists (file, approval, checkpoint).',
  '4→5': 'Redesign the interface so the wrong action has no button, no command, no path. Code-level poka-yoke.',
};

// Every Cathedral process classified
// current = what it IS now (verified)
// target = what it SHOULD be (based on criticality)
// gap = target - current (enforcement debt)
const REGISTRY = [
  // === LEVEL 5 targets (critical — wrong action must be impossible) ===
  {
    process: 'sed-on-claude-md',
    description: 'Never use sed on CLAUDE.md or MEMORY.md (SI-16)',
    current: 3, target: 5,
    evidence: 'guard-claude-md-sed.js hook blocks sed commands on these files',
    promotion: 'Code-level: remove sed from allowed commands entirely when target matches these paths',
    category: 'data-integrity'
  },
  {
    process: 'gemma4-load',
    description: 'Never load gemma4:26b — crashes 16GB hardware (SI-24)',
    current: 3, target: 5,
    evidence: 'guard-gemma4.js PreToolUse hook blocks ollama+gemma4 commands. Promoted 2026-10-26',
    promotion: 'Shell alias/wrapper that refuses gemma4 at OS level (Level 5: impossible to load)',
    category: 'hardware-safety'
  },

  // === LEVEL 4 targets (important — must pass checkpoint) ===
  {
    process: 'openart-placeholder-gate',
    description: 'Must create placeholder before generating paid images',
    current: 4, target: 4,
    evidence: 'gate-placeholder.js blocks generation until placeholder-state.json exists',
    promotion: null,
    category: 'cost-control'
  },
  {
    process: 'openart-cost-control',
    description: 'Block high-quality generation without approval (SI-12)',
    current: 3, target: 4,
    evidence: 'validate-openart-cost.js hooks on generate. Warns but does not hard-block all overspend',
    promotion: 'Add budget ceiling check: daily/weekly spend cap in a state file, gate rejects when exceeded',
    category: 'cost-control'
  },
  {
    process: 'channel-approval',
    description: 'Channel output requires Paul approval before publish',
    current: 2, target: 4,
    evidence: 'Channel browsing method describes approval but no hook enforces it',
    promotion: 'Gate: channel output writes to staging, publish blocked until approval flag set',
    category: 'quality'
  },
  {
    process: 'build-completion-gate',
    description: 'SI-10: trigger + budget + Telegram + door + SYSTEM_MAP + BUILD_LOG',
    current: 3, target: 4,
    evidence: 'gate-build-completion.js PostToolUse hook checks BUILD_LOG+SYSTEM_MAP after git commit. Promoted 2026-10-26',
    promotion: 'Hard gate: block commit until BUILD_LOG.md and SYSTEM_MAP.md both updated same day',
    category: 'quality'
  },

  // === LEVEL 3 targets (standard — hook enforcement) ===
  {
    process: 'illustration-model-validation',
    description: 'Only GPT Image 2 for Stick Logan / text content',
    current: 3, target: 3,
    evidence: 'validate-illustration.js + illustration-state.json enforce model list',
    promotion: null,
    category: 'visual'
  },
  {
    process: 'artifact-backup',
    description: 'Backup artifact on every publish',
    current: 3, target: 3,
    evidence: 'backup-artifact.js PostToolUse hook on Artifact publishes',
    promotion: null,
    category: 'data-integrity'
  },
  {
    process: 'animation-lab-landing',
    description: 'New animations land in Animation Lab artifact',
    current: 3, target: 3,
    evidence: 'animation-lab-landing.js hook enforces landing',
    promotion: null,
    category: 'visual'
  },
  {
    process: 'memory-position-guard',
    description: 'Memory file edits preserve position/structure',
    current: 3, target: 3,
    evidence: 'guard-memory-position.js hook on Write|Edit',
    promotion: null,
    category: 'data-integrity'
  },
  {
    process: 'caveman-mode',
    description: 'Caveman mode persists across turns when active',
    current: 3, target: 3,
    evidence: 'caveman-activate.js SessionStart + UserPromptSubmit hooks',
    promotion: null,
    category: 'ux'
  },
  {
    process: 'selective-staging',
    description: 'Stage only changed files, not git add -A (SI-18)',
    current: 1, target: 3,
    evidence: 'Written in CLAUDE.md. No hook prevents broad git add',
    promotion: 'PreToolUse hook on Bash: reject "git add -A" and "git add ." commands',
    category: 'data-integrity'
  },
  {
    process: 'no-co-authored-by',
    description: 'No Co-Authored-By trailer in commits (SI-20)',
    current: 1, target: 3,
    evidence: 'Written in CLAUDE.md. Harness convention adds it. No hook strips it',
    promotion: 'PostToolUse hook on Bash (git commit): warn if Co-Authored-By present',
    category: 'repo-hygiene'
  },
  {
    process: 'build-log-at-build-time',
    description: 'Write BUILD_LOG entry when building, not at session end (SI-10⑥)',
    current: 1, target: 3,
    evidence: 'Written in CLAUDE.md. Frequently deferred to session close',
    promotion: 'PostToolUse hook: after N file writes in a session, remind about BUILD_LOG',
    category: 'quality'
  },

  // === LEVEL 2 targets (prompt-level — acceptable for guidance) ===
  {
    process: 'visual-gen-preflight',
    description: 'Read sheet-maker.md + visual-memory.md before any generation',
    current: 2, target: 3,
    evidence: 'reinject-visual-gen.js UserPromptSubmit hook reminds but does not block',
    promotion: 'PreToolUse on openart_generate: reject if visual-memory.md not in recent context',
    category: 'visual'
  },
  {
    process: 'karpathy-cognitive-profile',
    description: 'Apply Karpathy engineering judgment to all builds',
    current: 2, target: 2,
    evidence: 'Embedded in CLAUDE.md, loaded every session via system prompt',
    promotion: null,
    category: 'engineering'
  },
  {
    process: 'cathedral-context-paragraph',
    description: 'Automated LLM prompts include Cathedral context (SI-15)',
    current: 1, target: 2,
    evidence: 'Written in CLAUDE.md. Agent scripts that call LLMs should include it',
    promotion: 'Add context paragraph to agent-engine.js system prompt builder',
    category: 'quality'
  },
  {
    process: 'forge-identity-load',
    description: 'Read the-builders-frequency.md at session start',
    current: 2, target: 2,
    evidence: 'Listed in MEMORY.md as READ FIRST. Loaded via memory system',
    promotion: null,
    category: 'identity'
  },

  // === LEVEL 1 targets (documentation — acceptable for reference) ===
  {
    process: 'session-log-convention',
    description: 'Append timestamped entry to SESSION-LOG.md at session end',
    current: 2, target: 2,
    evidence: 'Session closer skill enforces it. But only fires on /end-session',
    promotion: null,
    category: 'documentation'
  },
  {
    process: 'system-map-after-lobby',
    description: 'Run gen-system-map.js after Lobby changes',
    current: 3, target: 3,
    evidence: 'auto-system-map.js PostToolUse hook reminds on lobby.html edits. Promoted 2026-10-26',
    promotion: null,
    category: 'documentation'
  },
  {
    process: 'pm2-stop-is-not-pause',
    description: 'pm2 stop resurrects via cron_restart. Must delete + manifest update (G2)',
    current: 1, target: 2,
    evidence: 'Written in CLAUDE.md gotchas. No enforcement beyond documentation',
    promotion: 'Inject into agent context when pm2 commands detected',
    category: 'infrastructure'
  },

  // === LEVEL 0 — pure hope, needs promotion ===
  {
    process: 'rate-limiters-on-watchers',
    description: 'Rate limiters mandatory on watcher-triggered callers (SI-21)',
    current: 0, target: 3,
    evidence: '$20 burn incident. Written in CLAUDE.md but no automated check',
    promotion: 'Code review hook or lint rule checking for rate limiter in watcher scripts',
    category: 'cost-control'
  },
  {
    process: 'verify-loop-fired',
    description: 'After wiring change, verify the loop actually fired (SI-01)',
    current: 0, target: 3,
    evidence: 'Most expensive recurring bug. Pure documentation. No enforcement',
    promotion: 'PostToolUse on Bash (pm2 restart/start): auto-check logs after 30s',
    category: 'infrastructure'
  },
];

function getRegistry() {
  return REGISTRY.map(r => ({
    ...r,
    gap: r.target - r.current,
    currentLabel: LEVELS[r.current],
    targetLabel: LEVELS[r.target],
  }));
}

function getDebt() {
  const registry = getRegistry();
  const totalDebt = registry.reduce((sum, r) => sum + r.gap, 0);
  const maxDebt = registry.reduce((sum, r) => sum + (5 - r.current), 0);
  const debtItems = registry.filter(r => r.gap > 0).sort((a, b) => b.gap - a.gap);

  return {
    totalProcesses: registry.length,
    totalDebt,
    maxPossibleDebt: maxDebt,
    debtRatio: +(totalDebt / (registry.length * 5)).toFixed(3),
    satisfied: registry.filter(r => r.gap === 0).length,
    underEnforced: debtItems.length,
    items: debtItems,
  };
}

function getByCategory() {
  const registry = getRegistry();
  const categories = {};
  for (const r of registry) {
    if (!categories[r.category]) categories[r.category] = { items: [], avgGap: 0, totalGap: 0 };
    categories[r.category].items.push(r);
    categories[r.category].totalGap += r.gap;
  }
  for (const cat of Object.values(categories)) {
    cat.avgGap = +(cat.totalGap / cat.items.length).toFixed(2);
  }
  return categories;
}

function getPromotionPlan() {
  const registry = getRegistry();
  const promotable = registry
    .filter(r => r.gap > 0 && r.promotion)
    .sort((a, b) => {
      if (b.gap !== a.gap) return b.gap - a.gap;
      return a.current - b.current;
    });

  return promotable.map(r => ({
    process: r.process,
    from: `${r.current} (${LEVELS[r.current].name})`,
    to: `${r.target} (${LEVELS[r.target].name})`,
    gap: r.gap,
    nextStep: PROMOTIONS[`${r.current}→${r.current + 1}`],
    specificAction: r.promotion,
    category: r.category,
  }));
}

function auditHooks() {
  const HOOKS_DIR = join(process.env.HOME, '.claude/hooks');
  const hookProcesses = REGISTRY.filter(r => r.current >= 3);
  const results = [];

  for (const proc of hookProcesses) {
    const hookFiles = (proc.evidence.match(/[\w-]+\.js/g) || []);
    for (const file of hookFiles) {
      const path = join(HOOKS_DIR, file);
      const exists = existsSync(path);
      results.push({
        process: proc.process,
        hookFile: file,
        exists,
        level: proc.current,
        status: exists ? 'verified' : 'MISSING',
      });
    }
  }

  return results;
}

function getChannelEnforcement() {
  const channelLevels = {};
  for (const [slug, ch] of Object.entries(CHANNELS)) {
    let level = 0;
    if (ch.phase === 0) level = 0;
    else if (ch.phase === 1) level = 2;
    else if (ch.phase >= 2) level = 3;

    channelLevels[slug] = {
      band: ch.band,
      phase: ch.phase,
      enforcementLevel: level,
      levelName: LEVELS[level].name,
      autonomyReady: level >= 3 && ch.phase >= 2,
    };
  }
  return channelLevels;
}

function printReport() {
  const debt = getDebt();
  const categories = getByCategory();
  const hookAudit = auditHooks();
  const plan = getPromotionPlan();
  const channels = getChannelEnforcement();

  console.log('ENFORCEMENT SPECTRUM — Cathedral Audit');
  console.log('======================================\n');

  console.log('LEVELS:');
  for (const [n, l] of Object.entries(LEVELS)) {
    console.log(`  ${l.symbol} ${n}: ${l.name.padEnd(14)} ${l.mechanism}`);
  }

  console.log('\n─── DEBT SUMMARY ───\n');
  console.log(`  Processes:      ${debt.totalProcesses}`);
  console.log(`  Satisfied:      ${debt.satisfied} (at target level)`);
  console.log(`  Under-enforced: ${debt.underEnforced}`);
  console.log(`  Total debt:     ${debt.totalDebt} levels`);
  console.log(`  Debt ratio:     ${debt.debtRatio} (0 = perfect, 1 = all at hope)`);

  console.log('\n─── BY CATEGORY ───\n');
  const sortedCats = Object.entries(categories).sort((a, b) => b[1].avgGap - a[1].avgGap);
  for (const [cat, data] of sortedCats) {
    const bar = data.items.map(r => LEVELS[r.current].symbol).join('');
    console.log(`  ${cat.padEnd(20)} ${bar.padEnd(12)} avg gap: ${data.avgGap}`);
  }

  console.log('\n─── HOOK VERIFICATION ───\n');
  for (const h of hookAudit) {
    const icon = h.exists ? '✓' : '✗';
    console.log(`  ${icon} ${h.hookFile.padEnd(35)} → ${h.process} (L${h.level})`);
  }

  console.log('\n─── ENFORCEMENT DEBT (ranked) ───\n');
  for (const item of debt.items) {
    const arrow = `${LEVELS[item.current].symbol}${item.current}→${item.target}${LEVELS[item.target].symbol}`;
    console.log(`  [gap ${item.gap}] ${arrow}  ${item.process}`);
    console.log(`         ${item.description}`);
    if (item.promotion) console.log(`         → ${item.promotion}`);
    console.log();
  }

  console.log('─── PROMOTION PLAN (next actions) ───\n');
  for (const p of plan.slice(0, 10)) {
    console.log(`  ${p.process}: ${p.from} → ${p.to}`);
    console.log(`    Next: ${p.nextStep}`);
    console.log(`    Specific: ${p.specificAction}`);
    console.log();
  }

  console.log('─── CHANNEL ENFORCEMENT ───\n');
  for (const [slug, ch] of Object.entries(channels)) {
    const auto = ch.autonomyReady ? ' ★ AUTONOMY CANDIDATE' : '';
    console.log(`  ${LEVELS[ch.enforcementLevel].symbol} ${slug.padEnd(25)} L${ch.enforcementLevel} (${ch.levelName}) phase ${ch.phase}${auto}`);
  }
}

export {
  LEVELS,
  PROMOTIONS,
  REGISTRY,
  getRegistry,
  getDebt,
  getByCategory,
  getPromotionPlan,
  auditHooks,
  getChannelEnforcement,
};

const isMain = process.argv[1]?.endsWith('enforcement-registry.js');
if (isMain && (process.argv[2] === 'report' || !process.argv[2])) {
  printReport();
} else if (isMain && process.argv[2] === 'debt') {
  console.log(JSON.stringify(getDebt(), null, 2));
} else if (isMain && process.argv[2] === 'plan') {
  console.log(JSON.stringify(getPromotionPlan(), null, 2));
} else if (isMain && process.argv[2] === 'audit') {
  console.log(JSON.stringify(auditHooks(), null, 2));
} else if (isMain && process.argv[2] === 'channels') {
  console.log(JSON.stringify(getChannelEnforcement(), null, 2));
} else if (isMain && process.argv[2] === 'json') {
  console.log(JSON.stringify({ levels: LEVELS, registry: getRegistry(), debt: getDebt(), channels: getChannelEnforcement() }, null, 2));
}
