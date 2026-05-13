/**
 * paper-trial-tracker.js — Tracks approval/rejection rates across paper trials
 *
 * Each trial has: name, metric, graduation criteria, running stats.
 * Telegram commands: /trial (status), /trial [name] (detail)
 * API: recordVote(trial, decision), getTrialStats(trial), checkGraduation(trial)
 *
 * Data stored in JSON — lightweight, no DB needed for this scale.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'paper-trials.json');

function load() {
  if (!fs.existsSync(DATA_PATH)) {
    const initial = {
      trials: {
        content: {
          name: 'Content Auto-Post',
          description: 'Reed generates → Paul reviews → track approval rate',
          metric: 'approval_rate',
          graduation: { min_votes: 30, approval_rate: 0.80, max_embarrass_rate: 0.05 },
          votes: [],
          started: new Date().toISOString(),
          status: 'active'
        },
        trading: {
          name: 'Trading',
          description: 'Paper $10K → live signals → track win rate + profit factor',
          metric: 'win_rate',
          graduation: { min_trades: 20, win_rate: 0.55, profit_factor: 1.3, min_days: 14 },
          votes: [],
          started: '2026-05-07T00:00:00Z',
          status: 'active'
        },
        grants: {
          name: 'Grant Auto-Submit',
          description: 'Grant Hunter scans → Paul reviews shortlist → track agreement',
          metric: 'agreement_rate',
          graduation: { min_votes: 40, agreement_rate: 0.70 },
          votes: [],
          started: new Date().toISOString(),
          status: 'queued'
        },
        leads: {
          name: 'Gym Lead Outreach',
          description: 'Scrape + draft outreach → Paul grades → track send rate',
          metric: 'send_rate',
          graduation: { min_votes: 30, send_rate: 0.60 },
          votes: [],
          started: new Date().toISOString(),
          status: 'queued'
        },
        products: {
          name: 'Product Auto-Build',
          description: 'Prospector briefs → Paul grades → track quality',
          metric: 'yes_rate',
          graduation: { min_votes: 10, yes_rate: 0.50, max_embarrass_rate: 0.0 },
          votes: [],
          started: new Date().toISOString(),
          status: 'active'
        },
        fifthgear: {
          name: 'Fifth Gear',
          description: 'LLM extraction toolkit → The Guide PDF → track sales + feedback quality',
          metric: 'approval_rate',
          graduation: { min_votes: 20, approval_rate: 0.70, min_days: 14 },
          votes: [],
          started: new Date().toISOString(),
          status: 'queued'
        }
      }
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

/**
 * Record a vote for a trial
 * @param {string} trial - trial key (content, trading, grants, leads, products)
 * @param {string} decision - 'approve' | 'reject' | 'embarrass' | 'edit' | 'win' | 'loss'
 * @param {object} meta - optional metadata (filename, asset, strategy, etc)
 */
export function recordVote(trial, decision, meta = {}) {
  const data = load();
  if (!data.trials[trial]) return null;

  data.trials[trial].votes.push({
    decision,
    meta,
    timestamp: new Date().toISOString()
  });

  save(data);
  return getTrialStats(trial);
}

/**
 * Get stats for a trial
 */
export function getTrialStats(trial) {
  const data = load();
  const t = data.trials[trial];
  if (!t) return null;

  const votes = t.votes;
  const total = votes.length;

  const daysActive = ((Date.now() - new Date(t.started).getTime()) / 86400000).toFixed(0);

  if (total === 0) {
    return { ...t, total: 0, rate: '0%', daysActive, ready: false, message: 'No votes yet' };
  }

  const approvals = votes.filter(v => ['approve', 'win'].includes(v.decision)).length;
  const rejections = votes.filter(v => ['reject', 'loss'].includes(v.decision)).length;
  const embarrassments = votes.filter(v => v.decision === 'embarrass').length;
  const edits = votes.filter(v => v.decision === 'edit').length;

  const rate = approvals / total;
  const embarrassRate = embarrassments / total;

  // Check graduation
  const grad = t.graduation;
  const checks = {};
  checks.enough_votes = total >= (grad.min_votes || grad.min_trades || 0);
  checks.rate_met = rate >= (grad.approval_rate || grad.win_rate || grad.agreement_rate || grad.send_rate || grad.yes_rate || 0);
  if (grad.max_embarrass_rate !== undefined) {
    checks.embarrass_safe = embarrassRate <= grad.max_embarrass_rate;
  }
  if (grad.min_days) {
    checks.time_served = parseInt(daysActive) >= grad.min_days;
  }
  if (grad.profit_factor) {
    // Trading-specific — calculated externally, recorded via meta
    const pf = votes.filter(v => v.meta?.profit_factor).pop()?.meta?.profit_factor || 0;
    checks.profit_factor_met = pf >= grad.profit_factor;
  }

  const ready = Object.values(checks).every(v => v === true);

  return {
    name: t.name,
    status: t.status,
    total,
    approvals,
    rejections,
    embarrassments,
    edits,
    rate: (rate * 100).toFixed(1) + '%',
    embarrassRate: (embarrassRate * 100).toFixed(1) + '%',
    daysActive: daysActive.toFixed(0),
    graduation: checks,
    ready,
    message: ready ? '🟢 READY TO GRADUATE' : `⏳ ${Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ')} not met`
  };
}

/**
 * Get all trial stats
 */
export function getAllTrialStats() {
  const data = load();
  return Object.keys(data.trials).map(k => getTrialStats(k));
}

/**
 * Format stats for Telegram
 */
export function formatTrialReport() {
  const stats = getAllTrialStats();
  let msg = '📋 *Paper Trial Dashboard*\n\n';

  for (const s of stats) {
    const icon = s.status === 'active' ? (s.ready ? '🟢' : '🟡') : '⚪';
    msg += `${icon} *${s.name}*\n`;
    msg += `   ${s.total} votes | ${s.rate} approval | ${s.daysActive}d active\n`;
    msg += `   ${s.message}\n\n`;
  }

  return msg.trim();
}
