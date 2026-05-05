// ~/nanoclaw/resonance-filter.js
// The Resonance Filter — Phase 1 (pattern matching)
//
// Reads the Cathedral's governing field, checks incoming briefs for
// contradictions against it, returns a structured flag.
//
// Library module — imported by cath-bridge (/resonance/check) and
// telegram-bot /test command. Not a standalone service.
//
// Phase 1: keyword/pattern matching. Phase 2: LLM reasoning.

import fs from 'fs';
import path from 'path';

const HOME  = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');

// ── Governing field sources ─────────────────────────────────────────
const GOVERNING_FIELD = {
  cognitiveSignature: path.join(VAULT, '06_Methods', 'pauls-cognitive-signature.md'),
  designSignature:    path.join(VAULT, '06_Methods', 'pauls-design-signature.md'),
  senses:             path.join(VAULT, '06_Methods', 'cathedral-senses.md'),
  claudeMd:           path.join(HOME, 'nanoclaw', 'CLAUDE.md'),
  projectsDir:        path.join(VAULT, '08_Project_Orchestrator', 'projects'),
};

// ── Contradiction patterns (Phase 1 keyword matching) ───────────────

// Red/alarm colour keywords
const RED_COLOUR_PATTERNS = [
  /\b(#ef4444|#e74c3c|#ff0000|#dc143c)\b/i,
  /\bred\b(?!\s*herring)/i,
  /\bcrimson\b/i,
  /\bfire\s*alarm\b/i,
  /\balarm\s*colou?r\b/i,
  /\bbright\s*red\b/i,
  /\bblood\s*red\b/i,
];

// Living/calm context keywords — when red is proposed in these contexts it's an aesthetic contradiction
const LIVING_SPACE_PATTERNS = [
  /\bvilla\b/i,
  /\bliving\s*space\b/i,
  /\bliving\s*document\b/i,
  /\bcalm\b/i,
  /\bambient\b/i,
  /\bresearch\s*instrument\b/i,
  /\bcockpit\b/i,
  /\bdaily\s*interface\b/i,
  /\bprimary\s*(accent|colou?r|interface)\b/i,
  /\bdeep\s*water\b/i,
  /\bnight\s*sky\b/i,
];

// "Posing" keywords in character/illustration briefs
const POSING_PATTERNS = [
  /\bempty\s*smil(e|ing)\b/i,
  /\bhero\s*pose\b/i,
  /\bstock\s*photo(graph)?y?\b/i,
  /\bfacing\s*camera\b/i,
  /\bgeneric\s*(character|portrait)\b/i,
];

// Minimalism violations
const MINIMALIST_PATTERNS = [
  /\bwhite\s*space\b/i,
  /\bminimal\b/i,
  /\bsparse\b/i,
  /\bempty\s*hero\b/i,
];
const DENSE_CONTEXT_PATTERNS = [
  /\bvault\b/i,
  /\bcathedral\s*villa\b/i,
  /\binformation\s*dense\b/i,
];

// Verbs that indicate new-feature work
const NEW_FEATURE_VERBS = /\b(build|add|create|new|develop)\b/i;

// Trigger-absent build patterns (standing instruction #19)
const TRIGGER_SYNONYMS = /\btrigger|cron|pm2|watcher|webhook|schedule\b/i;

// ── File loaders ────────────────────────────────────────────────────

function safeRead(filepath) {
  try { return fs.readFileSync(filepath, 'utf8'); } catch { return ''; }
}

function stripFrontmatter(raw) {
  return raw.replace(/^---[\s\S]*?---\n*/, '');
}

// ── Project frontmatter parser (handles both formats) ───────────────
// Format 1 (orchestrator): project-status, project-priority, project-domain
// Format 2 (seed-idea):    status, phase, owner, type

function parseProjects() {
  const dir = GOVERNING_FIELD.projectsDir;
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const raw = safeRead(path.join(dir, entry.name));
      const fm  = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!fm) continue;

      const fmText = fm[1];
      const get = (key) => {
        const m = fmText.match(new RegExp(`^${key}\\s*:\\s*"?([^"\\n]+?)"?\\s*$`, 'm'));
        return m ? m[1].trim() : null;
      };

      // Try both formats
      const title      = get('title') || entry.name.replace(/\.md$/, '');
      const status     = get('project-status') || get('status');
      const priority   = get('project-priority') || get('priority') || null;
      const domain     = get('project-domain') || get('domain') || null;
      const nextAction = get('project-next-action') || get('next-action') || null;
      const stem       = entry.name.replace(/\.md$/, '').toLowerCase();

      // Name aliases for matching in briefs
      const aliases = new Set();
      aliases.add(title.toLowerCase());
      aliases.add(stem);
      // Add title words as partial aliases
      title.toLowerCase().split(/\s+[—-]\s+|\s+/).forEach(w => {
        if (w.length > 3) aliases.add(w);
      });

      results.push({
        file: entry.name,
        title,
        status,
        priority,
        domain,
        nextAction,
        aliases: [...aliases],
      });
    }
  } catch (_) { /* empty or missing */ }
  return results;
}

// ── Principle extraction from CLAUDE.md ─────────────────────────────
// Pulls standing instructions as a list for contextual flagging.

function extractStandingInstructions() {
  const raw = safeRead(GOVERNING_FIELD.claudeMd);
  const matches = [];
  // Match "### Standing Instruction N — Title" + body
  const re = /###\s+Standing\s+Instruction\s+(\d+)\s*—\s*([^\n]+)\n([\s\S]*?)(?=\n###|\n##\s|$)/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    matches.push({
      number: parseInt(m[1], 10),
      title: m[2].trim(),
      body: m[3].trim().slice(0, 300),
    });
  }
  // Also grab the numbered list "1. Never pre-filter options" etc.
  const numberedRe = /\n(\d+)\.\s+([^\n]+)/g;
  while ((m = numberedRe.exec(raw)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 30 && !matches.some(x => x.number === n)) {
      matches.push({ number: n, title: m[2].trim().slice(0, 100), body: '' });
    }
  }
  return matches.sort((a, b) => a.number - b.number);
}

// ── Check functions ─────────────────────────────────────────────────

function checkAesthetic(brief) {
  const findings = [];

  // Red in living space
  const hasRed     = RED_COLOUR_PATTERNS.some(p => p.test(brief));
  const hasLiving  = LIVING_SPACE_PATTERNS.some(p => p.test(brief));
  if (hasRed && hasLiving) {
    findings.push({
      contradiction: 'Red as primary colour proposed in a living/calm context',
      reference: '06_Methods/pauls-design-signature.md — Aesthetic Register: red reserved for critical/alert only',
      suggestion: 'Use primary blue (#378ADD) or secondary green (#1D9E75). Reserve red for stopped processes and critical flags only.',
    });
  }

  // "Primary red" even without living context — still flags red as primary
  if (hasRed && /\bprimary\s*(accent|colou?r)\b/i.test(brief)) {
    const already = findings.some(f => f.contradiction.includes('Red as primary'));
    if (!already) {
      findings.push({
        contradiction: 'Red proposed as primary accent colour',
        reference: '06_Methods/pauls-design-signature.md — "Red reserved for critical/alert only"',
        suggestion: 'Primary accent should be #378ADD (blue). Red is reserved for alerts and stopped states.',
      });
    }
  }

  // Posing characters
  if (POSING_PATTERNS.some(p => p.test(brief))) {
    findings.push({
      contradiction: 'Character posing/smiling at camera proposed',
      reference: '06_Methods/pauls-design-signature.md — Pattern 7: Character in specific moment, not posing',
      suggestion: 'Give the character a specific action, thought, or moment. No hero poses, no empty smiles.',
    });
  }

  // Excessive minimalism in dense context
  if (MINIMALIST_PATTERNS.some(p => p.test(brief)) && DENSE_CONTEXT_PATTERNS.some(p => p.test(brief))) {
    findings.push({
      contradiction: 'Minimalism/white space proposed in a dense context (vault/villa)',
      reference: '06_Methods/pauls-design-signature.md — Pattern 4: Density over minimalism',
      suggestion: 'The Cathedral is full. Information earns its place by contribution. Minimalism reads as withholding here.',
    });
  }

  return findings;
}

function checkPriority(brief, projects) {
  const findings = [];
  const briefLower = brief.toLowerCase();

  for (const proj of projects) {
    if (!proj.status) continue;
    const statusLower = proj.status.toLowerCase();
    const isGated    = statusLower.includes('gated') || statusLower.includes('paused') || statusLower.includes('stalled');
    const isCaptured = statusLower.includes('captured') || statusLower.includes('not yet actioned');

    if (!isGated && !isCaptured) continue;

    // Check if brief mentions this project by any alias
    const matched = proj.aliases.find(alias =>
      alias.length > 3 && briefLower.includes(alias) && NEW_FEATURE_VERBS.test(brief)
    );
    if (matched) {
      findings.push({
        contradiction: `Build proposed for "${proj.title}" which is currently ${proj.status}`,
        reference: `08_Project_Orchestrator/projects/${proj.file}`,
        suggestion: isGated
          ? 'This project is gated. Unblock gating conditions first, or confirm explicit override.'
          : 'This project is captured but not actioned. Confirm prioritisation before building.',
        severity_override: isGated ? 'block' : 'warning',
      });
    }
  }

  return findings;
}

function checkPrinciple(brief, standingInstructions) {
  const findings = [];

  // Standing Instruction #19 — No build without trigger
  if (NEW_FEATURE_VERBS.test(brief) && !TRIGGER_SYNONYMS.test(brief)) {
    // Only flag if the brief is clearly about building something that would run
    const runtimeHints = /\b(pipeline|agent|daemon|service|watcher|scanner|handler|listener|bot)\b/i;
    if (runtimeHints.test(brief)) {
      findings.push({
        contradiction: 'New runtime component proposed with no trigger mentioned',
        reference: 'CLAUDE.md — Standing Instruction 19: No build is complete without a trigger',
        suggestion: 'Specify the trigger (cron, PM2, watcher, webhook, voice command) as part of the brief.',
      });
    }
  }

  return findings;
}

// ── Main check ──────────────────────────────────────────────────────

export function checkResonance(brief, context = '') {
  if (!brief || typeof brief !== 'string' || brief.trim().length === 0) {
    return {
      resonant: true,
      note: 'empty brief — nothing to check',
    };
  }

  const fullText = `${brief}\n${context}`;

  // Load governing field (fresh each call — vault may change)
  const projects = parseProjects();
  const standingInstructions = extractStandingInstructions();

  const findings = [];
  findings.push(...checkAesthetic(fullText).map(f => ({ ...f, type: 'AESTHETIC' })));
  findings.push(...checkPriority(fullText, projects).map(f => ({ ...f, type: 'PRIORITY' })));
  findings.push(...checkPrinciple(fullText, standingInstructions).map(f => ({ ...f, type: 'PRINCIPLE' })));

  if (findings.length === 0) {
    return {
      resonant: true,
      governing_field_loaded: {
        projects: projects.length,
        standing_instructions: standingInstructions.length,
      },
    };
  }

  // Determine severity — highest wins
  //   AESTHETIC → advisory
  //   PRINCIPLE → warning
  //   PRIORITY  → block (or warning for captured)
  const SEVERITY_ORDER = { advisory: 0, warning: 1, block: 2 };
  let severity = 'advisory';
  for (const f of findings) {
    const s = f.severity_override
      || (f.type === 'PRIORITY' ? 'block'
        : f.type === 'PRINCIPLE' ? 'warning'
        : 'advisory');
    if (SEVERITY_ORDER[s] > SEVERITY_ORDER[severity]) severity = s;
  }

  // Primary finding is the highest-severity one
  const sorted = findings.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity_override || (a.type === 'PRIORITY' ? 'block' : a.type === 'PRINCIPLE' ? 'warning' : 'advisory')];
    const sb = SEVERITY_ORDER[b.severity_override || (b.type === 'PRIORITY' ? 'block' : b.type === 'PRINCIPLE' ? 'warning' : 'advisory')];
    return sb - sa;
  });
  const primary = sorted[0];

  return {
    resonant: false,
    contradiction_type: primary.type,
    contradiction: primary.contradiction,
    governing_field_reference: primary.reference,
    severity,
    suggestion: primary.suggestion,
    proceed_anyway: severity !== 'block', // block = require explicit Paul override
    all_findings: sorted,
  };
}

// ── CLI usage for testing ───────────────────────────────────────────
// node resonance-filter.js "use red as the primary colour for the villa"

if (import.meta.url === `file://${process.argv[1]}`) {
  const brief = process.argv.slice(2).join(' ');
  if (!brief) {
    console.log('Usage: node resonance-filter.js "<brief text>"');
    process.exit(1);
  }
  const result = checkResonance(brief);
  console.log(JSON.stringify(result, null, 2));
}
