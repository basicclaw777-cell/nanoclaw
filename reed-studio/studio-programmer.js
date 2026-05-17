/**
 * Studio Programmer — Self-improving pipeline agent
 *
 * Reads metrics, memory, feed. Identifies bottlenecks.
 * Proposes prompt refinements. Learns from failures.
 * Posts findings to studio feed.
 *
 * Runs as part of R&D cycle (every 6h inside engine).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { postToStudioFeed } from './studio-orc.js';

const STUDIO_DIR = process.env.HOME + '/nanoclaw/reed-studio';
const MEMORY_FILE = join(STUDIO_DIR, 'studio-memory.json');
const METRICS_FILE = join(STUDIO_DIR, 'metrics.json');
const CAPABILITIES_FILE = join(STUDIO_DIR, 'capabilities.json');

// ─── PIPELINE ANALYSIS ────────────────────────────────────────────────────────

export function analyzeAndImprove() {
  const findings = [];

  // 1. Check for generation failures
  const failurePatterns = checkFailures();
  if (failurePatterns.length > 0) {
    findings.push(...failurePatterns);
  }

  // 2. Check prompt effectiveness
  const promptFindings = analyzePrompts();
  if (promptFindings.length > 0) {
    findings.push(...promptFindings);
  }

  // 3. Check model selection efficiency
  const modelFindings = analyzeModelUsage();
  if (modelFindings.length > 0) {
    findings.push(...modelFindings);
  }

  // 4. Post findings to studio feed
  if (findings.length > 0) {
    postToStudioFeed('programmer', `PIPELINE ANALYSIS:\n${findings.map(f => `- [${f.type}] ${f.finding}`).join('\n')}`, ['analysis', 'improvement']);

    // Save to memory
    const memory = existsSync(MEMORY_FILE) ? JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) : {};
    memory.pipelineInsights = memory.pipelineInsights || { bottlenecks: [], optimizations: [], failures: [] };
    for (const f of findings) {
      if (f.type === 'bottleneck') memory.pipelineInsights.bottlenecks.push({ ...f, date: new Date().toISOString() });
      if (f.type === 'optimization') memory.pipelineInsights.optimizations.push({ ...f, date: new Date().toISOString() });
      if (f.type === 'failure') memory.pipelineInsights.failures.push({ ...f, date: new Date().toISOString() });
    }
    // Keep last 30 of each
    memory.pipelineInsights.bottlenecks = memory.pipelineInsights.bottlenecks.slice(-30);
    memory.pipelineInsights.optimizations = memory.pipelineInsights.optimizations.slice(-30);
    memory.pipelineInsights.failures = memory.pipelineInsights.failures.slice(-30);
    writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  }

  return findings;
}

function checkFailures() {
  const findings = [];
  const memory = existsSync(MEMORY_FILE) ? JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) : {};
  const failures = memory.pipelineInsights?.failures || [];

  // Pattern: same model failing repeatedly
  const recentFailures = failures.filter(f => {
    const age = Date.now() - new Date(f.date || 0).getTime();
    return age < 7 * 24 * 60 * 60 * 1000; // last 7 days
  });

  const modelFailCounts = {};
  for (const f of recentFailures) {
    modelFailCounts[f.model || 'unknown'] = (modelFailCounts[f.model || 'unknown'] || 0) + 1;
  }

  for (const [model, count] of Object.entries(modelFailCounts)) {
    if (count >= 3) {
      findings.push({
        type: 'bottleneck',
        finding: `${model} failed ${count} times this week. Consider fallback model or timeout increase.`,
        model,
        suggestion: 'switch-model-or-increase-timeout'
      });
    }
  }

  return findings;
}

function analyzePrompts() {
  const findings = [];
  const memory = existsSync(MEMORY_FILE) ? JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) : {};
  const metrics = existsSync(METRICS_FILE) ? JSON.parse(readFileSync(METRICS_FILE, 'utf8')) : {};

  // If Paul is replacing more than selecting, prompts need work
  const replacements = metrics.lifetime?.paulReplacements || 0;
  const selections = metrics.lifetime?.paulSelections || 0;

  if (replacements > 2 && replacements >= selections) {
    // Check what Paul replaced — find common patterns
    const replaced = memory.paulPreferences?.replacements || [];
    const recentReplaced = replaced.slice(-5);
    const styles = recentReplaced.map(r => r.style).filter(Boolean);
    const uniqueStyles = [...new Set(styles)];

    if (uniqueStyles.length <= 2 && uniqueStyles.length > 0) {
      findings.push({
        type: 'optimization',
        finding: `Paul replacing ${uniqueStyles.join(', ')} style outputs. Prompts for these styles need refinement.`,
        suggestion: 'refine-style-prompts',
        styles: uniqueStyles
      });
    }
  }

  return findings;
}

function analyzeModelUsage() {
  const findings = [];
  const metrics = existsSync(METRICS_FILE) ? JSON.parse(readFileSync(METRICS_FILE, 'utf8')) : {};
  const caps = existsSync(CAPABILITIES_FILE) ? JSON.parse(readFileSync(CAPABILITIES_FILE, 'utf8')) : {};

  const modelUsage = metrics.coverage?.models || {};
  const totalGens = Object.values(modelUsage).reduce((a, b) => a + b, 0);

  // Check if we're over-relying on one model
  for (const [model, count] of Object.entries(modelUsage)) {
    const share = totalGens > 0 ? (count / totalGens) * 100 : 0;
    if (share > 70 && totalGens > 10) {
      findings.push({
        type: 'optimization',
        finding: `${model} accounts for ${Math.round(share)}% of generations. Consider diversifying — other models may produce better results for some tasks.`,
        suggestion: 'diversify-models'
      });
    }
  }

  // Check if expensive models are being used for R&D (should use cheap ones)
  // This would require tracking per-brief model usage, queued for future

  return findings;
}

// ─── PROMPT REFINEMENT PROPOSALS ──────────────────────────────────────────────

export function proposePromptRefinement(style, currentPrompt, paulFeedback) {
  const memory = existsSync(MEMORY_FILE) ? JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) : {};
  const styleMem = memory.styleLearnings?.[style] || {};

  const proposal = {
    style,
    currentPrompt,
    paulFeedback,
    works: styleMem.works || [],
    avoid: styleMem.avoid || [],
    suggestion: `Incorporate: ${(styleMem.works || []).join(', ')}. Avoid: ${(styleMem.avoid || []).join(', ')}. Paul said: "${paulFeedback}".`,
    timestamp: new Date().toISOString()
  };

  postToStudioFeed('programmer', `PROMPT REFINEMENT PROPOSED for ${style}:\n${proposal.suggestion}`, ['prompt', 'refinement']);

  return proposal;
}
