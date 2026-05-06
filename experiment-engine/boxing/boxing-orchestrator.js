/**
 * boxing-orchestrator.js — Domain 2 experiment runner
 *
 * Runs boxing strategies on YOLO movement data, publishes to meta-watcher,
 * logs results. Called by Telegram /boxing-lab command or after new YOLO data.
 *
 * ESM.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logDomainRun, detectCrossDomainConvergence } from '../meta-watcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANALYSIS_PATH = path.join(__dirname, 'boxing-analysis-latest.json');

export async function analyzeSession(category = 'padwork', filename = 'noodles1') {
  console.log(`[boxing-lab] Analyzing ${category}/${filename}...`);

  try {
    execSync(`python3 boxing-strategies.py ${category} ${filename}`, {
      cwd: __dirname,
      stdio: 'pipe',
      timeout: 30000,
    });
  } catch (e) {
    console.error('[boxing-lab] Analysis failed:', e.message);
    return null;
  }

  if (!fs.existsSync(ANALYSIS_PATH)) return null;

  const analysis = JSON.parse(fs.readFileSync(ANALYSIS_PATH, 'utf8'));

  // Publish signals to meta-watcher
  try {
    logDomainRun('boxing', analysis.signals.map(s => ({
      type: s.type,
      subject: s.subject,
      outcome: s.outcome,
      strength: s.strength,
      asset: s.subject,
      direction: s.outcome,
    })));

    const crossDomain = detectCrossDomainConvergence(48);
    if (crossDomain.length > 0) {
      console.log(`[boxing-lab] Cross-domain convergences: ${crossDomain.length}`);
      analysis.cross_domain = crossDomain;
    }
  } catch (e) {
    console.error('[boxing-lab] Meta-watcher error:', e.message);
  }

  return analysis;
}

export function formatAnalysis(analysis) {
  if (!analysis) return 'No analysis available.';

  const lines = [`Boxing Lab — ${analysis.session}`];
  const m = analysis.metrics;
  lines.push(`${m.total_punches} punches | ${m.punch_rate_per_min}/min | vel ${m.mean_velocity} | ${m.guard_drops} guard drops`);
  lines.push('');

  for (const strat of analysis.strategies) {
    if (strat.signals.length === 0 && strat.recommendations.length === 0) continue;
    lines.push(`[${strat.strategy}]`);
    for (const sig of strat.signals) {
      const icon = sig.outcome === 'positive' ? '+' : '-';
      lines.push(`  ${icon} ${sig.reasoning.substring(0, 100)}`);
    }
    for (const rec of strat.recommendations) {
      lines.push(`  > ${rec}`);
    }
    lines.push('');
  }

  if (analysis.cross_domain && analysis.cross_domain.length > 0) {
    lines.push('CROSS-DOMAIN:');
    for (const c of analysis.cross_domain) {
      lines.push(`  ${c.strategy}: ${c.direction} in ${c.domains.join(' + ')}`);
    }
  }

  return lines.join('\n');
}

// CLI
if (process.argv[1]?.endsWith('boxing-orchestrator.js')) {
  const cat = process.argv[2] || 'padwork';
  const name = process.argv[3] || 'noodles1';
  const analysis = await analyzeSession(cat, name);
  if (analysis) {
    console.log('\n' + formatAnalysis(analysis));
  }
}
