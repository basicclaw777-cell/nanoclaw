import { routeProject, routeTags, updateHealth, CHANNELS, PROJECT_TAGS } from './channel-router.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CHANNELS_DIR = new URL('.', import.meta.url).pathname;
const LOG_FILE = join(CHANNELS_DIR, 'research-log.json');
const PLACEHOLDERS_DIR = join(CHANNELS_DIR, 'placeholders');

if (!existsSync(PLACEHOLDERS_DIR)) mkdirSync(PLACEHOLDERS_DIR, { recursive: true });

const DEPTHS = {
  brief: {
    label: 'Brief',
    maxChannels: 2,
    maxFindings: 3,
    description: 'Quick scan — top 2 channels, surface-level findings'
  },
  medium: {
    label: 'Medium',
    maxChannels: 5,
    maxFindings: 8,
    description: 'Standard research — primary channels + secondaries, thorough scan'
  },
  deep: {
    label: 'Deep Ocean',
    maxChannels: 16,
    maxFindings: 20,
    description: 'Full excavation — every relevant channel fires, cross-domain convergence'
  }
};

function loadLog() {
  if (existsSync(LOG_FILE)) return JSON.parse(readFileSync(LOG_FILE, 'utf8'));
  return { sessions: [] };
}

function saveLog(log) {
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function planResearch(projectOrTags, depth = 'medium') {
  const depthConfig = DEPTHS[depth];
  if (!depthConfig) return { error: `Unknown depth: ${depth}. Use: brief, medium, deep` };

  let routing;
  if (PROJECT_TAGS[projectOrTags]) {
    routing = routeProject(projectOrTags);
  } else {
    const tags = projectOrTags.split(',').map(t => t.trim());
    routing = { project: null, tags, primary: [], secondary: [] };
    const routed = routeTags(tags);
    routing.primary = routed.filter(r => r.score >= 2);
    routing.secondary = routed.filter(r => r.score === 1);
  }

  const allChannels = [...routing.primary, ...routing.secondary];
  const activated = allChannels.slice(0, depthConfig.maxChannels);

  const goldExtraction = activated.find(c => c.channel === 'gold-extraction');
  const feeders = activated.filter(c => CHANNELS[c.channel]?.band === 'research');
  const runConvergence = depth === 'deep' && feeders.length >= 2;

  if (runConvergence && !goldExtraction) {
    const ge = allChannels.find(c => c.channel === 'gold-extraction');
    if (ge && activated.length < depthConfig.maxChannels) {
      activated.push(ge);
    }
  }

  const plan = {
    project: routing.project,
    tags: routing.tags,
    depth,
    depthLabel: depthConfig.label,
    depthDescription: depthConfig.description,
    maxFindings: depthConfig.maxFindings,
    channels: activated.map(ch => ({
      channel: ch.channel,
      band: ch.band,
      phase: ch.phase,
      score: ch.score,
      matchedDomains: ch.matchedDomains,
      builtStatus: ch.phase > 0 ? 'active' : 'not-built',
      description: CHANNELS[ch.channel]?.description
    })),
    convergence: runConvergence,
    channelCount: activated.length,
    skipped: allChannels.slice(depthConfig.maxChannels).map(c => c.channel)
  };

  return plan;
}

function startResearch(projectOrTags, depth = 'medium') {
  const plan = planResearch(projectOrTags, depth);
  if (plan.error) return plan;

  const session = {
    id: `research-${Date.now()}`,
    timestamp: new Date().toISOString(),
    project: plan.project,
    tags: plan.tags,
    depth: plan.depth,
    channels: plan.channels.map(c => c.channel),
    status: 'running',
    findings: [],
    convergences: []
  };

  for (const ch of plan.channels) {
    updateHealth(ch.channel, { ran: true });
  }

  const log = loadLog();
  log.sessions.unshift(session);
  if (log.sessions.length > 50) log.sessions = log.sessions.slice(0, 50);
  saveLog(log);

  return { session, plan };
}

function addFinding(sessionId, channelSlug, finding) {
  const log = loadLog();
  const session = log.sessions.find(s => s.id === sessionId);
  if (!session) return { error: `Session not found: ${sessionId}` };

  const entry = {
    channel: channelSlug,
    timestamp: new Date().toISOString(),
    title: finding.title,
    summary: finding.summary,
    grade: finding.grade || null,
    domains: finding.domains || [],
    actionable: finding.actionable || false,
    skillCandidate: finding.skillCandidate || null
  };

  session.findings.push(entry);
  saveLog(log);

  updateHealth(channelSlug, { placeholder: true });

  const placeholderFile = join(PLACEHOLDERS_DIR, `${sessionId}-${channelSlug}.json`);
  const existingPlaceholders = existsSync(placeholderFile)
    ? JSON.parse(readFileSync(placeholderFile, 'utf8'))
    : [];
  existingPlaceholders.push(entry);
  writeFileSync(placeholderFile, JSON.stringify(existingPlaceholders, null, 2));

  return entry;
}

function approveFinding(sessionId, findingIndex, approved = true) {
  const log = loadLog();
  const session = log.sessions.find(s => s.id === sessionId);
  if (!session) return { error: `Session not found: ${sessionId}` };
  if (!session.findings[findingIndex]) return { error: `Finding not found at index ${findingIndex}` };

  session.findings[findingIndex].approved = approved;
  session.findings[findingIndex].reviewedAt = new Date().toISOString();
  saveLog(log);

  const channelSlug = session.findings[findingIndex].channel;
  updateHealth(channelSlug, { approved });

  return session.findings[findingIndex];
}

function completeResearch(sessionId) {
  const log = loadLog();
  const session = log.sessions.find(s => s.id === sessionId);
  if (!session) return { error: `Session not found: ${sessionId}` };

  session.status = 'complete';
  session.completedAt = new Date().toISOString();

  const approved = session.findings.filter(f => f.approved === true).length;
  const rejected = session.findings.filter(f => f.approved === false).length;
  const pending = session.findings.filter(f => f.approved === undefined).length;
  const skillCandidates = session.findings.filter(f => f.skillCandidate).map(f => f.skillCandidate);

  session.summary = { approved, rejected, pending, total: session.findings.length, skillCandidates };
  saveLog(log);

  return session;
}

function getResearchHistory(limit = 10) {
  const log = loadLog();
  return log.sessions.slice(0, limit).map(s => ({
    id: s.id,
    timestamp: s.timestamp,
    project: s.project,
    depth: s.depth,
    channels: s.channels,
    status: s.status,
    findingCount: s.findings.length,
    approved: s.findings.filter(f => f.approved === true).length,
    skillCandidates: s.findings.filter(f => f.skillCandidate).length
  }));
}

export {
  DEPTHS,
  planResearch,
  startResearch,
  addFinding,
  approveFinding,
  completeResearch,
  getResearchHistory
};

const cmd = process.argv[2];
const target = process.argv[3];
const depth = process.argv[4] || 'medium';

if (cmd === 'plan') {
  if (!target) { console.log('Usage: node research-launcher.js plan <project|tags> [brief|medium|deep]'); process.exit(1); }
  console.log(JSON.stringify(planResearch(target, depth), null, 2));
} else if (cmd === 'start') {
  if (!target) { console.log('Usage: node research-launcher.js start <project|tags> [brief|medium|deep]'); process.exit(1); }
  const result = startResearch(target, depth);
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === 'history') {
  console.log(JSON.stringify(getResearchHistory(), null, 2));
} else {
  console.log('Cathedral Research Launcher');
  console.log('');
  console.log('Commands:');
  console.log('  plan  <project|tags> [brief|medium|deep]  — Show research plan without starting');
  console.log('  start <project|tags> [brief|medium|deep]  — Start research session');
  console.log('  history                                    — Show recent research sessions');
  console.log('');
  console.log('Depths:');
  for (const [k, v] of Object.entries(DEPTHS)) {
    console.log(`  ${k.padEnd(8)} — ${v.description}`);
  }
  console.log('');
  console.log('Projects:', Object.keys(PROJECT_TAGS).join(', '));
}
