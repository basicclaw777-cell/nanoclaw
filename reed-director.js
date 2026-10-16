// Reed Director — Visual Production Intelligence
// Manages Reed automation, plans experiments, collects Paul's feedback
// Paul talks to Director via /reed-director. Director controls Reed processes.

import fs from 'fs';
import path from 'path';
import { watch } from 'chokidar';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const STATE_PATH = path.join(HOME, 'nanoclaw', 'reed-lab', 'director-state.json');
const CURATOR_PATH = path.join(HOME, 'nanoclaw', 'reed-lab', 'curator-state.json');
const GEMINI_LOG = path.join(HOME, 'nanoclaw', 'reed-lab', 'gemini-log.json');
const HF_LOG = path.join(HOME, 'nanoclaw', 'reed-lab', 'test-log.json');
const TASTE_MAP = path.join(HOME, 'nanoclaw', 'taste-map.json');
const INTAKE_DIR = path.join(HOME, 'reed-intake');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

// ── State Management ──────────────────────────────────────────────────────────

function loadState() {
  if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  return {
    review_queue: [],        // Images pending Paul's review
    experiment_queue: [],    // Proposed/approved/running/completed experiments
    project_styles: {},      // Per-project style preferences learned
    source_requests: [],     // Things Director wants Paul to provide
    last_review_sent: null,  // When we last sent images for review
    ratings_collected: 0,    // Total ratings from Paul
    playbook: [],            // Accumulated learnings
    version: 1
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Review Loop ───────────────────────────────────────────────────────────────

// Pick best unreviewed images from Reed's output
export function buildReviewBatch(count = 5) {
  const state = loadState();
  const alreadyReviewed = new Set(state.review_queue.filter(r => r.rating !== null).map(r => r.image_path));

  // Gather from both Gemini and HF logs
  const allOutputs = [];

  try {
    const geminiLog = JSON.parse(fs.readFileSync(GEMINI_LOG, 'utf-8'));
    for (const entry of geminiLog) {
      if (entry.output && entry.success && !alreadyReviewed.has(entry.output)) {
        allOutputs.push({
          image_path: entry.output,
          style: entry.styleName || entry.styleKey,
          source: entry.sourceImage || 'generative',
          model: entry.model || 'gemini',
          grade: entry.grade,
          timestamp: entry.timestamp,
          engine: 'gemini'
        });
      }
    }
  } catch {}

  try {
    const hfLog = JSON.parse(fs.readFileSync(HF_LOG, 'utf-8'));
    for (const entry of hfLog) {
      if (entry.file && !alreadyReviewed.has(entry.file)) {
        allOutputs.push({
          image_path: entry.file,
          style: entry.styleName || entry.model,
          source: entry.sourceImage || 'unknown',
          model: entry.model,
          grade: entry.grade,
          timestamp: entry.timestamp,
          engine: 'higgsfield'
        });
      }
    }
  } catch {}

  // Sort by grade (A first) then recency
  const gradeOrder = { A: 0, B: 1, C: 2, D: 3 };
  allOutputs.sort((a, b) => {
    const gDiff = (gradeOrder[a.grade] || 3) - (gradeOrder[b.grade] || 3);
    if (gDiff !== 0) return gDiff;
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });

  // Pick top N that haven't been reviewed
  const batch = allOutputs
    .filter(o => fs.existsSync(o.image_path))
    .slice(0, count);

  // Add to review queue
  for (const item of batch) {
    if (!state.review_queue.some(r => r.image_path === item.image_path)) {
      state.review_queue.push({
        ...item,
        sent: false,
        rating: null,
        feedback: null,
        queued_at: new Date().toISOString()
      });
    }
  }

  saveState(state);
  return batch;
}

// Send review batch to Telegram
export async function sendReviewBatch() {
  const state = loadState();
  const unsent = state.review_queue.filter(r => !r.sent && r.rating === null);

  if (!unsent.length) return { sent: 0, message: 'No new images to review' };

  const batch = unsent.slice(0, 5);
  let sent = 0;

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    if (!fs.existsSync(item.image_path)) continue;

    const caption = `[${i + 1}/${batch.length}] ${item.style} | ${item.engine} | Grade: ${item.grade}\nSource: ${item.source}\nRate 1-5 or feedback`;

    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('chat_id', CHAT_ID);
      form.append('photo', fs.createReadStream(item.image_path));
      form.append('caption', caption);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
        method: 'POST', body: form, headers: form.getHeaders()
      });

      item.sent = true;
      sent++;
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[director] Send failed: ${err.message}`);
    }
  }

  state.last_review_sent = new Date().toISOString();
  saveState(state);
  return { sent, message: `Sent ${sent} images for review` };
}

// Record Paul's rating
export function recordRating(imageIndex, rating, feedback) {
  const state = loadState();
  const unsent = state.review_queue.filter(r => r.sent && r.rating === null);

  if (imageIndex < 0 || imageIndex >= unsent.length) return false;

  unsent[imageIndex].rating = rating;
  unsent[imageIndex].feedback = feedback || null;
  unsent[imageIndex].rated_at = new Date().toISOString();
  state.ratings_collected++;

  // Update taste map with rating
  updateTasteFromRating(unsent[imageIndex]);

  // Learn from rating
  updatePlaybook(state, unsent[imageIndex]);

  saveState(state);
  return true;
}

function updateTasteFromRating(item) {
  try {
    const tasteMap = JSON.parse(fs.readFileSync(TASTE_MAP, 'utf-8'));

    // Add as anchor if rated 4-5
    if (item.rating >= 4 && item.style) {
      const existing = (tasteMap.anchors || []).find(a =>
        a.domain === 'visual' && a.label === `reed_${item.style}`
      );
      if (!existing) {
        tasteMap.anchors = tasteMap.anchors || [];
        tasteMap.anchors.push({
          domain: 'visual',
          label: `reed_${item.style}`,
          modifier: `Style: ${item.style}, Engine: ${item.engine}`,
          weight: item.rating / 5,
          source: 'reed-director-rating',
          added: new Date().toISOString()
        });
      }
    }

    // Add as rejection if rated 1-2
    if (item.rating <= 2 && item.feedback) {
      tasteMap.rejections = tasteMap.rejections || [];
      tasteMap.rejections.push({
        pattern: item.feedback,
        source: 'reed-director-rating',
        context: `${item.style} via ${item.engine}`,
        added: new Date().toISOString()
      });
    }

    fs.writeFileSync(TASTE_MAP, JSON.stringify(tasteMap, null, 2));
  } catch {}
}

function updatePlaybook(state, item) {
  if (item.rating >= 4) {
    state.playbook.push({
      type: 'winner',
      style: item.style,
      engine: item.engine,
      source_type: item.source,
      rating: item.rating,
      date: new Date().toISOString()
    });
  } else if (item.rating <= 2) {
    state.playbook.push({
      type: 'reject',
      style: item.style,
      engine: item.engine,
      feedback: item.feedback,
      date: new Date().toISOString()
    });
  }

  // Keep playbook trimmed
  if (state.playbook.length > 200) state.playbook = state.playbook.slice(-200);
}

// ── Experiment Queue ──────────────────────────────────────────────────────────

export function proposeExperiment(description, rationale, images) {
  const state = loadState();
  const exp = {
    id: `exp-${Date.now()}`,
    description,
    rationale,
    status: 'proposed',
    images: images || [],
    results: [],
    proposed_at: new Date().toISOString(),
    approved_at: null,
    completed_at: null
  };
  state.experiment_queue.push(exp);
  saveState(state);
  return exp;
}

export function approveExperiment(expId) {
  const state = loadState();
  const exp = state.experiment_queue.find(e => e.id === expId);
  if (!exp || exp.status !== 'proposed') return false;
  exp.status = 'approved';
  exp.approved_at = new Date().toISOString();
  saveState(state);
  return true;
}

export function getExperiments(status) {
  const state = loadState();
  if (status) return state.experiment_queue.filter(e => e.status === status);
  return state.experiment_queue;
}

// ── Intake Watcher ────────────────────────────────────────────────────────────

let intakeWatcher = null;

export function startIntakeWatcher() {
  if (intakeWatcher) return;

  const IMAGE_RE = /\.(jpg|jpeg|png|webp|heic)$/i;
  const VIDEO_RE = /\.(mp4|mov|avi|mkv)$/i;

  intakeWatcher = watch(INTAKE_DIR, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,
    interval: 5000,
    depth: 1
  });

  intakeWatcher.on('add', async (filePath) => {
    const filename = path.basename(filePath);
    const folder = path.basename(path.dirname(filePath));

    if (IMAGE_RE.test(filename)) {
      console.log(`[director] New image in ${folder}: ${filename}`);

      // Notify via Telegram
      try {
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('photo', fs.createReadStream(filePath));
        form.append('caption', `New source: ${filename}\nCategory: ${folder}\nAdded to Reed's library.`);
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
          method: 'POST', body: form, headers: form.getHeaders()
        });
      } catch {}

    } else if (VIDEO_RE.test(filename) && folder === 'video-sources') {
      console.log(`[director] New video source: ${filename} — frame extraction queued`);
      // Queue for frame extraction (Phase 2)
      const state = loadState();
      state.source_requests.push({
        type: 'video-extraction',
        path: filePath,
        status: 'queued',
        added: new Date().toISOString()
      });
      saveState(state);
    }
  });

  console.log(`[director] Intake watcher active on ${INTAKE_DIR}`);
}

// ── Status Summary ────────────────────────────────────────────────────────────

export function getDirectorStatus() {
  const state = loadState();
  const pendingReviews = state.review_queue.filter(r => r.sent && r.rating === null).length;
  const unsentReviews = state.review_queue.filter(r => !r.sent && r.rating === null).length;
  const proposedExps = state.experiment_queue.filter(e => e.status === 'proposed').length;
  const runningExps = state.experiment_queue.filter(e => e.status === 'running').length;

  // Curator stats
  let curatorStats = { total: 0 };
  try { curatorStats = JSON.parse(fs.readFileSync(CURATOR_PATH, 'utf-8')); } catch {}
  const imageCount = Object.keys(curatorStats.images || {}).length;

  // Recent generation counts
  let geminiCount = 0, hfCount = 0;
  try { geminiCount = JSON.parse(fs.readFileSync(GEMINI_LOG, 'utf-8')).length; } catch {}
  try { hfCount = JSON.parse(fs.readFileSync(HF_LOG, 'utf-8')).length; } catch {}

  // Playbook summary
  const winners = state.playbook.filter(p => p.type === 'winner');
  const topStyles = {};
  for (const w of winners) topStyles[w.style] = (topStyles[w.style] || 0) + 1;

  return {
    ratings_collected: state.ratings_collected,
    pending_reviews: pendingReviews,
    unsent_reviews: unsentReviews,
    proposed_experiments: proposedExps,
    running_experiments: runningExps,
    source_images: imageCount,
    total_gemini: geminiCount,
    total_higgsfield: hfCount,
    top_styles: topStyles,
    playbook_entries: state.playbook.length,
    last_review: state.last_review_sent
  };
}

// Build context string for agent-engine DeepSeek calls
export function buildDirectorContext() {
  const status = getDirectorStatus();
  const state = loadState();

  let ctx = `## Reed Director Status\n`;
  ctx += `Ratings collected: ${status.ratings_collected}\n`;
  ctx += `Pending reviews: ${status.pending_reviews} | Unsent: ${status.unsent_reviews}\n`;
  ctx += `Source images: ${status.source_images}\n`;
  ctx += `Total generated: ${status.total_gemini} (Gemini) + ${status.total_higgsfield} (Higgsfield)\n`;
  ctx += `Experiments: ${status.proposed_experiments} proposed, ${status.running_experiments} running\n`;

  if (Object.keys(status.top_styles).length) {
    ctx += `\nTop rated styles: ${Object.entries(status.top_styles).sort((a,b) => b[1]-a[1]).map(([s,c]) => `${s}(${c})`).join(', ')}\n`;
  }

  // Recent playbook entries
  const recent = state.playbook.slice(-5);
  if (recent.length) {
    ctx += `\nRecent feedback:\n`;
    for (const p of recent) {
      ctx += `- ${p.type}: ${p.style} via ${p.engine}${p.feedback ? ` — "${p.feedback}"` : ''} (${p.rating || ''})\n`;
    }
  }

  // Pending experiments
  const proposed = state.experiment_queue.filter(e => e.status === 'proposed');
  if (proposed.length) {
    ctx += `\nProposed experiments:\n`;
    for (const e of proposed) {
      ctx += `- [${e.id}] ${e.description}\n`;
    }
  }

  return ctx;
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Initialize state file if needed
if (!fs.existsSync(STATE_PATH)) saveState(loadState());

// Start watcher if run directly or via PM2
const isMain = process.argv[1]?.endsWith('reed-director.js') || process.env.pm_id !== undefined;
if (isMain) {
  startIntakeWatcher();

  if (process.argv.includes('--review')) {
    buildReviewBatch(5);
    sendReviewBatch().then(r => console.log(r));
  } else if (process.argv.includes('--status')) {
    console.log(JSON.stringify(getDirectorStatus(), null, 2));
  } else {
    console.log('[director] Reed Director running. Intake watcher active.');
    // Keep alive
    setInterval(() => {}, 60000);
  }
}
