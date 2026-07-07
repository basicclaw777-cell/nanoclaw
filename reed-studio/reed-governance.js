#!/usr/bin/env node
/**
 * reed-governance.js — Reed Visual Director on the Autonomy Chassis.
 *
 * Wraps Reed's existing scattered organs onto the standard constitutional interface.
 * No new logic — just formalizing what's already there.
 *
 * Organs implemented:
 *   PERCEPTION:  ReedMatchmaker (should we generate?), ReedRegime (what's needed?)
 *   GOVERNANCE:  ReedReferee (policy/kill-switch), ReedQuartermaster (budget)
 *   EXECUTION:   ReedBalanceCheck (style/character diversity), ReedCorner (what's landing?)
 *   LEARNING:    ReedCutMan (quality degradation throttle)
 *
 * Run standalone: node reed-governance.js
 * Import: import { createReedChassis } from './reed-governance.js'
 *
 * ESM.
 */

import { AgentOrgan } from '../governance/organ.js';
import { AutonomyChassis } from '../governance/chassis.js';
import { SIGNALS } from '../governance/escalation.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NANOCLAW = path.resolve(__dirname, '..');
const genGuard = createRequire(import.meta.url)(join(NANOCLAW, 'lib', 'generation-guard.cjs'));

const METRICS_FILE = join(__dirname, 'metrics.json');
const CATALOGUE_FILE = join(NANOCLAW, 'reed-lab', 'catalogue.json');
const STUDIO_STATE = join(__dirname, 'state.json');

function loadMetrics() {
  if (existsSync(METRICS_FILE)) return JSON.parse(readFileSync(METRICS_FILE, 'utf8'));
  return { lifetime: {}, weekly: {}, rates: {}, coverage: {} };
}

function loadCatalogue() {
  if (existsSync(CATALOGUE_FILE)) return JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8'));
  return { generations: [] };
}

// ─── PERCEPTION: ReedMatchmaker ──────────────────────────────────────────────
// "Should Reed generate today?"
// Wraps: generation-guard status + metrics rates + daily output count

class ReedMatchmaker extends AgentOrgan {
  constructor() { super('matchmaker', 'PERCEPTION'); }

  observe() {
    const guard = genGuard.status();
    const metrics = loadMetrics();
    const catalogue = loadCatalogue();

    const today = new Date().toISOString().slice(0, 10);
    const todayGens = catalogue.generations.filter(g =>
      (g.date || g.timestamp?.slice(0, 10) || '') === today
    ).length;

    return {
      paused: guard.paused,
      pauseReason: guard.reason,
      todayGenerations: todayGens,
      briefToExecutionRate: metrics.rates?.briefToExecution || 0,
      paulApprovalRate: metrics.rates?.paulApprovalRate || 0,
      totalGenerated: metrics.lifetime?.totalGenerated || 0,
      weeklyGenerated: metrics.weekly?.generated || 0,
    };
  }

  evaluate(obs) {
    const findings = [];

    // Kill-switch check
    if (obs.paused) {
      findings.push({ key: 'kill-switch', value: `Generation paused: ${obs.pauseReason}`, severity: 'critical' });
      return { signal: SIGNALS.ABORT, findings, score: 0 };
    }

    // Daily saturation
    if (obs.todayGenerations >= 12) {
      findings.push({ key: 'saturation', value: `${obs.todayGenerations} generations today — at daily cap`, severity: 'high' });
      return { signal: SIGNALS.PAUSE, findings, score: 20 };
    }

    // Brief execution rate — generating briefs but not executing = waste
    if (obs.briefToExecutionRate < 15 && obs.totalGenerated > 10) {
      findings.push({ key: 'execution-rate', value: `Brief→execution rate ${obs.briefToExecutionRate}% — mostly planning, not producing`, severity: 'medium' });
    }

    let score = 80;
    if (obs.todayGenerations > 8) score -= 20;
    if (obs.briefToExecutionRate < 20) score -= 10;

    if (findings.length === 0) {
      findings.push({ key: 'clear', value: `${obs.todayGenerations} generations today — capacity available`, severity: 'none' });
    }

    return { signal: SIGNALS.CONTINUE, findings, score };
  }

  recommend(evaluation) {
    return {
      actions: evaluation.signal === SIGNALS.CONTINUE ? ['generate'] : ['wait'],
      message: evaluation.findings.map(f => f.value).join('; '),
    };
  }

  enforce(action, evaluation) {
    if (!evaluation || evaluation.signal === SIGNALS.ABORT) {
      return { blocked: true, reason: 'Reed Matchmaker: generation paused (kill-switch)' };
    }
    if (evaluation.signal === SIGNALS.PAUSE) {
      return { blocked: true, reason: 'Reed Matchmaker: daily generation cap reached' };
    }
    return { blocked: false };
  }
}

// ─── PERCEPTION: ReedRegime ──────────────────────────────────────────────────
// "What does the visual landscape need?"
// Wraps: librarianScan() — stale styles, character gaps, coverage

class ReedRegime extends AgentOrgan {
  constructor() { super('regime_detector', 'PERCEPTION'); }

  observe() {
    const metrics = loadMetrics();
    const coverage = metrics.coverage || {};

    const styles = coverage.styles || {};
    const characters = coverage.characters || {};

    const staleStyles = Object.entries(styles)
      .filter(([, v]) => v.health === 'stale')
      .map(([k, v]) => ({ style: k, daysSince: v.daysSinceLast }));

    const freshStyles = Object.entries(styles)
      .filter(([, v]) => v.health === 'fresh')
      .map(([k]) => k);

    const characterGaps = Object.entries(characters)
      .filter(([, count]) => count < 3)
      .map(([char, count]) => ({ character: char, count }));

    return { staleStyles, freshStyles, characterGaps, totalStyles: Object.keys(styles).length };
  }

  evaluate(obs) {
    const findings = [];

    // Classify regime
    let regime;
    if (obs.staleStyles.length > obs.totalStyles * 0.7) {
      regime = 'STALE';
      findings.push({ key: 'regime', value: `${obs.staleStyles.length}/${obs.totalStyles} styles stale — studio needs refresh`, severity: 'high' });
    } else if (obs.characterGaps.length > 0) {
      regime = 'CHARACTER_GAP';
      findings.push({ key: 'regime', value: `Character gaps: ${obs.characterGaps.map(g => g.character).join(', ')}`, severity: 'medium' });
    } else if (obs.freshStyles.length > obs.totalStyles * 0.7) {
      regime = 'HEALTHY';
      findings.push({ key: 'regime', value: `${obs.freshStyles.length} styles fresh — healthy coverage`, severity: 'none' });
    } else {
      regime = 'NORMAL';
      findings.push({ key: 'regime', value: 'Mixed coverage — normal operations', severity: 'low' });
    }

    // Style multipliers (like trading regime → strategy weights)
    const styleMultipliers = {};
    for (const s of obs.staleStyles) {
      styleMultipliers[s.style] = 1.5; // boost stale styles
    }
    for (const f of obs.freshStyles) {
      styleMultipliers[f] = 0.5; // reduce fresh styles
    }

    return {
      signal: SIGNALS.CONTINUE,
      findings,
      score: regime === 'HEALTHY' ? 90 : regime === 'STALE' ? 40 : 65,
      regime,
      styleMultipliers,
    };
  }

  recommend(evaluation) {
    const priorities = [];
    if (evaluation.regime === 'STALE') priorities.push('refresh stale styles');
    if (evaluation.regime === 'CHARACTER_GAP') priorities.push('fill character gaps');

    return {
      actions: priorities.length ? priorities : ['maintain'],
      multipliers: evaluation.styleMultipliers,
      message: `Regime: ${evaluation.regime}`,
    };
  }
}

// ─── GOVERNANCE: ReedReferee ─────────────────────────────────────────────────
// "Am I allowed to generate this?"
// Wraps: generation-guard + editor gate logic + brand rules

class ReedReferee extends AgentOrgan {
  constructor() { super('referee', 'GOVERNANCE'); }

  observe() {
    const guard = genGuard.status();
    return { paused: guard.paused, reason: guard.reason };
  }

  evaluate(obs) {
    if (obs.paused) {
      return {
        signal: SIGNALS.ABORT,
        findings: [{ key: 'policy', value: `Generation blocked: ${obs.reason}`, severity: 'critical' }],
        score: 0,
      };
    }
    return {
      signal: SIGNALS.CONTINUE,
      findings: [{ key: 'policy', value: 'Generation permitted', severity: 'none' }],
      score: 100,
    };
  }

  recommend(evaluation) {
    return {
      actions: evaluation.signal === SIGNALS.CONTINUE ? ['permitted'] : ['blocked'],
      message: evaluation.findings[0].value,
    };
  }

  enforce(action) {
    // Brand policy enforcement
    if (action?.prompt) {
      const prompt = action.prompt.toLowerCase();
      // SI-39: Never use "Reed" in customer-facing content
      if (prompt.includes('reed') && action.customerFacing) {
        return { blocked: true, reason: 'Referee: "Reed" is internal only — use "Coach Paul" for customer-facing' };
      }
      // Brand color check — catch the hallucinated burgundy
      if (prompt.includes('#8b2020') || prompt.includes('burgundy')) {
        return { blocked: true, reason: 'Referee: burgundy #8B2020 is hallucinated brand color — use gold #f7b408' };
      }
    }
    return { blocked: false };
  }
}

// ─── GOVERNANCE: ReedQuartermaster ───────────────────────────────────────────
// "Do we have budget to generate?"
// Wraps: reed/tools.json costs + daily spend tracking

class ReedQuartermaster extends AgentOrgan {
  constructor() { super('quartermaster', 'GOVERNANCE'); }

  observe() {
    const budgetPath = join(NANOCLAW, 'reed', 'budget-state.json');
    const toolsPath = join(NANOCLAW, 'reed', 'tools.json');

    let budget = { todaySpend: 0, dailyCap: 50 };
    if (existsSync(budgetPath)) {
      try { budget = { ...budget, ...JSON.parse(readFileSync(budgetPath, 'utf8')) }; } catch {}
    }

    let tools = {};
    if (existsSync(toolsPath)) {
      try { tools = JSON.parse(readFileSync(toolsPath, 'utf8')); } catch {}
    }

    return {
      todaySpend: budget.todaySpend || 0,
      dailyCap: budget.dailyCap || 50,
      remainingBudget: (budget.dailyCap || 50) - (budget.todaySpend || 0),
      models: tools,
    };
  }

  evaluate(obs) {
    const findings = [];
    const pctUsed = obs.dailyCap > 0 ? (obs.todaySpend / obs.dailyCap) * 100 : 0;

    if (obs.remainingBudget <= 0) {
      findings.push({ key: 'budget', value: `Daily budget exhausted ($${obs.todaySpend}/$${obs.dailyCap})`, severity: 'critical' });
      return { signal: SIGNALS.ABORT, findings, score: 0 };
    }

    if (pctUsed > 80) {
      findings.push({ key: 'budget', value: `${pctUsed.toFixed(0)}% of daily budget used — conserve`, severity: 'high' });
      return { signal: SIGNALS.PAUSE, findings, score: 20 };
    }

    findings.push({ key: 'budget', value: `$${obs.remainingBudget.toFixed(2)} remaining (${pctUsed.toFixed(0)}% used)`, severity: 'none' });
    return { signal: SIGNALS.CONTINUE, findings, score: Math.round(100 - pctUsed) };
  }

  recommend(evaluation) {
    return {
      actions: evaluation.signal === SIGNALS.CONTINUE ? ['spend_ok'] : ['conserve'],
      message: evaluation.findings[0].value,
    };
  }
}

// ─── EXECUTION: ReedBalanceCheck ─────────────────────────────────────────────
// "Is Reed's output portfolio balanced?"
// Wraps: style coverage + character coverage from metrics

class ReedBalanceCheck extends AgentOrgan {
  constructor() { super('balance_check', 'EXECUTION'); }

  observe() {
    const metrics = loadMetrics();
    const coverage = metrics.coverage || {};
    return {
      styles: coverage.styles || {},
      characters: coverage.characters || {},
    };
  }

  evaluate(obs) {
    const findings = [];
    let score = 100;

    // Style concentration — is one style dominating?
    const styleCounts = Object.entries(obs.styles).map(([k, v]) => ({ style: k, count: v.count }));
    const totalStyleGens = styleCounts.reduce((s, v) => s + v.count, 0);

    if (totalStyleGens > 0) {
      for (const s of styleCounts) {
        const pct = (s.count / totalStyleGens) * 100;
        if (pct > 40) {
          score -= 20;
          findings.push({ key: 'style_concentration', value: `${s.style} is ${pct.toFixed(0)}% of all output — over-indexed`, severity: 'high' });
        }
      }
    }

    // Character balance
    const chars = Object.entries(obs.characters);
    const totalChars = chars.reduce((s, [, v]) => s + v, 0);
    if (totalChars > 0) {
      for (const [char, count] of chars) {
        if (count === 0) {
          score -= 15;
          findings.push({ key: 'character_gap', value: `${char} has zero generations — missing from portfolio`, severity: 'high' });
        }
      }
    }

    // Style freshness balance
    const staleCount = Object.values(obs.styles).filter(v => v.health === 'stale').length;
    const totalStyles = Object.keys(obs.styles).length;
    if (totalStyles > 0 && staleCount > totalStyles * 0.5) {
      score -= 15;
      findings.push({ key: 'freshness', value: `${staleCount}/${totalStyles} styles stale — portfolio aging`, severity: 'medium' });
    }

    if (findings.length === 0) {
      findings.push({ key: 'balanced', value: 'Style and character portfolio balanced', severity: 'none' });
    }

    return {
      signal: score >= 60 ? SIGNALS.CONTINUE : SIGNALS.PAUSE,
      findings,
      score: Math.max(0, score),
    };
  }

  recommend(evaluation) {
    const issues = evaluation.findings.filter(f => f.severity !== 'none');
    return {
      actions: issues.map(f => f.key),
      message: issues.length ? issues.map(f => f.value).join('; ') : 'Balanced',
    };
  }
}

// ─── EXECUTION: ReedCorner ───────────────────────────────────────────────────
// "Which styles are landing?"
// Wraps: orcDecide priorities + metrics coverage

class ReedCorner extends AgentOrgan {
  constructor() { super('corner', 'EXECUTION'); }

  observe() {
    const metrics = loadMetrics();
    const coverage = metrics.coverage || {};
    return {
      styles: coverage.styles || {},
      paulApprovalRate: metrics.rates?.paulApprovalRate || 0,
      briefToExecution: metrics.rates?.briefToExecution || 0,
      feedEngagement: metrics.rates?.feedEngagement || 0,
    };
  }

  evaluate(obs) {
    const findings = [];
    const multipliers = {};

    // Style-level performance
    for (const [style, data] of Object.entries(obs.styles)) {
      if (data.health === 'fresh' && data.count > 3) {
        multipliers[style] = 1.2;
        findings.push({ key: style, value: `BOOST — fresh + established (${data.count} gens)`, severity: 'positive' });
      } else if (data.health === 'stale') {
        multipliers[style] = 1.5; // stale = needs attention
        findings.push({ key: style, value: `PRIORITY — stale (${data.daysSinceLast}d since last)`, severity: 'medium' });
      } else {
        multipliers[style] = 1.0;
      }
    }

    // Overall effectiveness
    if (obs.paulApprovalRate < 20 && obs.paulApprovalRate > 0) {
      findings.push({ key: 'approval', value: `Paul approval rate ${obs.paulApprovalRate}% — output not landing`, severity: 'high' });
    }

    return {
      signal: SIGNALS.CONTINUE,
      findings,
      score: 70,
      multipliers,
    };
  }

  recommend(evaluation) {
    const boosted = Object.entries(evaluation.multipliers || {}).filter(([, v]) => v > 1.1).map(([k]) => k);
    return {
      actions: boosted.length ? [`prioritize: ${boosted.join(', ')}`] : ['maintain'],
      multipliers: evaluation.multipliers,
      message: `${boosted.length} styles prioritized`,
    };
  }
}

// ─── LEARNING: ReedCutMan ────────────────────────────────────────────────────
// "Is Reed hurt? Throttle if quality is dropping."
// Wraps: quality degradation detection from metrics

class ReedCutMan extends AgentOrgan {
  constructor() { super('cut_man', 'LEARNING'); }

  observe() {
    const metrics = loadMetrics();
    return {
      paulApprovalRate: metrics.rates?.paulApprovalRate || 0,
      paulReplacements: metrics.lifetime?.paulReplacements || 0,
      paulSelections: metrics.lifetime?.paulSelections || 0,
      weeklyGenerated: metrics.weekly?.generated || 0,
    };
  }

  evaluate(obs) {
    const findings = [];
    let signal = SIGNALS.CONTINUE;
    let maxDaily = 12; // default

    // Paul is replacing more than selecting = quality problem
    if (obs.paulReplacements > 3 && obs.paulReplacements > obs.paulSelections) {
      findings.push({ key: 'quality_decline', value: `Paul replaced ${obs.paulReplacements} vs selected ${obs.paulSelections} — quality problem`, severity: 'high' });
      maxDaily = 6; // throttle
      signal = SIGNALS.PAUSE;
    }

    // Overproduction without engagement
    if (obs.weeklyGenerated > 30 && obs.paulApprovalRate < 10) {
      findings.push({ key: 'overproduction', value: `${obs.weeklyGenerated} weekly gens, ${obs.paulApprovalRate}% approval — generating waste`, severity: 'high' });
      maxDaily = 4;
      signal = SIGNALS.PAUSE;
    }

    if (findings.length === 0) {
      findings.push({ key: 'healthy', value: 'Quality metrics within bounds', severity: 'none' });
    }

    return {
      signal,
      findings,
      score: signal === SIGNALS.CONTINUE ? 85 : 35,
      maxDaily,
    };
  }

  recommend(evaluation) {
    return {
      actions: evaluation.signal === SIGNALS.PAUSE ? ['throttle_output'] : ['maintain'],
      message: evaluation.findings.map(f => f.value).join('; '),
      maxDaily: evaluation.maxDaily,
    };
  }
}

// ─── CHASSIS FACTORY ─────────────────────────────────────────────────────────

export function createReedChassis() {
  const chassis = new AutonomyChassis('reed-visual-director', __dirname, {
    style: 'cinematic',
    riskTolerance: 0.3,
    timeHorizon: 'short',
    confidenceBaseline: 0.5,
    escalationThreshold: 0.4,
    autonomyLevel: 'supervised',
  });

  chassis.register(new ReedMatchmaker());
  chassis.register(new ReedRegime());
  chassis.register(new ReedReferee());
  chassis.register(new ReedQuartermaster());
  chassis.register(new ReedBalanceCheck());
  chassis.register(new ReedCorner());
  chassis.register(new ReedCutMan());

  return chassis;
}

// ─── STANDALONE RUN ──────────────────────────────────────────────────────────

if (process.argv[1]?.includes('reed-governance')) {
  console.log('\n============================================================');
  console.log(`[REED GOVERNANCE] Autonomy Constitution — ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const chassis = createReedChassis();
  const result = chassis.run();

  // Signal
  const signalIcon = { CONTINUE: 'GO', PAUSE: 'WAIT', ABORT: 'STOP', PASS: '--', ESCALATE: '??' };
  console.log(`SIGNAL: ${signalIcon[result.signal] || result.signal} (${result.signal})`);
  console.log(`ORGANS: ${result.organCount} | BLOCKING: ${result.blockingCount}`);
  console.log('');

  // Results by level
  const levels = {};
  for (const r of result.results) {
    if (!levels[r.level]) levels[r.level] = [];
    levels[r.level].push(r);
  }

  for (const [level, organs] of Object.entries(levels)) {
    console.log(`── ${level} ──`);
    for (const o of organs) {
      const icon = o.signal === 'CONTINUE' ? '+' : o.signal === 'ABORT' ? 'X' : o.signal === 'PAUSE' ? '~' : ' ';
      console.log(`  [${icon}] ${o.organ}: ${o.recommendation?.message || 'no message'}`);
      if (o.evaluation?.findings) {
        for (const f of o.evaluation.findings) {
          if (f.severity !== 'none') {
            console.log(`      ${f.severity}: ${f.value}`);
          }
        }
      }
    }
    console.log('');
  }

  // Fleet report
  console.log('── FLEET REPORT ──');
  const report = chassis.report();
  console.log(`  Agent: ${report.agentId}`);
  console.log(`  Signal: ${report.signal} | Healthy: ${report.healthy}`);
  if (report.reasons.length) {
    for (const r of report.reasons) {
      console.log(`  Block: ${r}`);
    }
  }

  // Enforcement test
  console.log('\n── ENFORCE TEST ──');
  const testActions = [
    { type: 'generate', style: 'noir', prompt: 'Dark moody boxing scene' },
    { type: 'generate', style: 'poster', prompt: 'Basic Reflex poster burgundy #8B2020 theme', customerFacing: true },
    { type: 'generate', style: 'promo', prompt: 'Reed studio showcase', customerFacing: true },
  ];

  for (const action of testActions) {
    const enforced = chassis.enforce(action);
    console.log(`  ${action.style}: ${enforced.blocked ? `BLOCKED — ${enforced.reason}` : 'ALLOWED'}`);
  }
}
