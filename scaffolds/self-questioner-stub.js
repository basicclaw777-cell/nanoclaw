// self-questioner.js — Cathedral Self-Diagnostic Agent (STUB — Fable fills)
// ESM module
// Reads system state → generates ONE research question per week
// The system asks its own questions

import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(process.env.HOME, 'nanoclaw', 'self-questioner-log.json');

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); }
  catch { return []; }
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

/**
 * Gather all input signals for question generation
 * @returns {object} SystemState
 */
async function gatherState() {
  // STUB — Fable implements
  // Should read:
  // 1. vault-metabolism.js → domain coverage, staleness
  // 2. taste-map-api.js → getStats() → thin domains
  // 3. convergence-atlas.js → low-connection zones
  // 4. git log on cathedral-vault → recent activity
  // 5. taste-practice-log.json → recent deposits
  // 6. session harvests → recurring patterns
  // 7. self-questioner-log.json → previous questions (no repeats)
  return {
    vaultHealth: {},
    tasteGaps: {},
    graphColdZones: [],
    recentActivity: [],
    tastePractice: [],
    previousQuestions: loadLog()
  };
}

/**
 * Generate ONE question from system state via hermes3
 * @returns {object} Question
 */
export async function generateQuestion() {
  const state = await gatherState();

  // STUB — Fable implements
  // Should call hermes3 with structured prompt
  // Returns a specific, actionable question targeting a real gap

  return {
    date: new Date().toISOString().split('T')[0],
    question: '[Self-Questioner not yet implemented]',
    domain: 'unknown',
    source: 'stub',
    action: 'build',
    priority: 3,
    status: 'pending',
    response: null,
    respondedDate: null
  };
}

/**
 * Get all questions
 * @returns {Array} Question[]
 */
export function getQuestionLog() {
  return loadLog();
}

/**
 * Answer a question by date
 * @param {string} date — YYYY-MM-DD
 * @param {string} answer — Paul's response
 * @returns {boolean}
 */
export function answerQuestion(date, answer) {
  const log = loadLog();
  const q = log.find(q => q.date === date && q.status === 'pending');
  if (!q) return false;
  q.status = 'answered';
  q.response = answer;
  q.respondedDate = new Date().toISOString().split('T')[0];
  saveLog(log);
  return true;
}

/**
 * Get unanswered questions
 * @returns {Array} Question[]
 */
export function getUnanswered() {
  return loadLog().filter(q => q.status === 'pending');
}
