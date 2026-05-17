// engineering-studio/metrics-tracker.js — KPI computation and recording
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRICS_PATH = path.join(__dirname, 'metrics.json');
const MEMORY_PATH = path.join(__dirname, 'studio-memory.json');
const GYM_EYES_DIR = path.join(process.env.HOME, 'basic-reflex', 'gym-eyes');
const SESSIONS_DIR = path.join(GYM_EYES_DIR, 'sessions');
const STUDENTS_DIR = path.join(GYM_EYES_DIR, 'students');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ── Compute Live Metrics ─────────────────────────────────────────────────────

export function computeMetrics() {
  const metrics = loadJSON(METRICS_PATH) || {};

  // Count sessions
  let totalSessions = 0;
  let weekSessions = 0;
  const weekAgo = Date.now() - 7 * 86400000;

  try {
    const sessionFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    totalSessions = sessionFiles.length;
    weekSessions = sessionFiles.filter(f => {
      const stat = fs.statSync(path.join(SESSIONS_DIR, f));
      return stat.mtimeMs > weekAgo;
    }).length;
  } catch {}

  // Count students
  let studentCount = 0;
  try {
    studentCount = fs.readdirSync(STUDENTS_DIR).filter(f => f.endsWith('.json')).length;
  } catch {}

  // Update metrics
  if (!metrics.projects) metrics.projects = {};
  if (!metrics.projects.gym_eyes) metrics.projects.gym_eyes = {};
  metrics.projects.gym_eyes.sessions_processed_total = totalSessions;
  metrics.projects.gym_eyes.sessions_processed_week = weekSessions;
  metrics.projects.gym_eyes.students_tracked = studentCount;

  metrics.generated = new Date().toISOString();
  saveJSON(METRICS_PATH, metrics);
  return metrics;
}

// ── Record Events ────────────────────────────────────────────────────────────

export function recordExperiment(name, result, notes) {
  const metrics = loadJSON(METRICS_PATH) || {};
  if (!metrics.lab_health) metrics.lab_health = {};
  metrics.lab_health.experiments_this_week = (metrics.lab_health.experiments_this_week || 0) + 1;
  saveJSON(METRICS_PATH, metrics);

  const memory = loadJSON(MEMORY_PATH) || {};
  if (!memory.researchLog) memory.researchLog = { entries: [] };
  memory.researchLog.entries.push({
    name,
    result,
    notes,
    date: new Date().toISOString()
  });
  saveJSON(MEMORY_PATH, memory);
}

export function recordPostMortem(project, finding, lesson, decision) {
  const metrics = loadJSON(METRICS_PATH) || {};
  if (!metrics.lab_health) metrics.lab_health = {};
  metrics.lab_health.post_mortems_this_month = (metrics.lab_health.post_mortems_this_month || 0) + 1;
  saveJSON(METRICS_PATH, metrics);

  const memory = loadJSON(MEMORY_PATH) || {};
  if (!memory.postMortems) memory.postMortems = { entries: [] };
  memory.postMortems.entries.push({
    project,
    finding,
    lesson,
    decision,
    date: new Date().toISOString()
  });
  saveJSON(MEMORY_PATH, memory);
}

export function recordPipelineFailure(component, error, context) {
  const metrics = loadJSON(METRICS_PATH) || {};
  if (!metrics.lab_health) metrics.lab_health = {};
  metrics.lab_health.pipeline_failures_week = (metrics.lab_health.pipeline_failures_week || 0) + 1;
  saveJSON(METRICS_PATH, metrics);
}

// ── Agent Briefing ───────────────────────────────────────────────────────────

export function getAgentBriefing() {
  const metrics = loadJSON(METRICS_PATH);
  const memory = loadJSON(MEMORY_PATH);
  if (!metrics) return 'Engineering Studio: no metrics available.';

  const gym = metrics.projects?.gym_eyes || {};
  const ingestion = metrics.projects?.ingestion_pipeline || {};
  const cnn = metrics.projects?.cnn_training || {};
  const health = metrics.lab_health || {};

  const lines = [
    `ENGINEERING STUDIO BRIEFING`,
    ``,
    `Gym Eyes: ${gym.sessions_processed_total || 0} sessions total, ${gym.sessions_processed_week || 0} this week, ${gym.students_tracked || 0} students`,
    `Detection accuracy: ${gym.detection_accuracy || 'UNMEASURED'}`,
    `Ingestion pipeline: ${ingestion.status} — ${ingestion.days_running_unattended || 0} days autonomous`,
    `CNN training: ${cnn.status} — ${cnn.frames_collected || 0}/${cnn.target_frames || '?'} frames`,
    ``,
    `Lab health: ${health.experiments_this_week || 0} experiments, ${health.post_mortems_this_month || 0} post-mortems, ${health.pipeline_failures_week || 0} failures`,
    ``,
    `Known edge cases: ${memory?.pipelineLearnings?.known_edge_cases?.length || 0}`,
    `Post-mortems filed: ${memory?.postMortems?.entries?.length || 0}`,
    `Research log entries: ${memory?.researchLog?.entries?.length || 0}`
  ];

  return lines.join('\n');
}

export default { computeMetrics, recordExperiment, recordPostMortem, recordPipelineFailure, getAgentBriefing };
