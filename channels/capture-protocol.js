import { routeProject, updateHealth } from './channel-router.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CHANNELS_DIR = new URL('.', import.meta.url).pathname;
const CAPTURES_DIR = join(CHANNELS_DIR, 'captures');
const CAPTURE_LOG = join(CHANNELS_DIR, 'capture-log.json');

if (!existsSync(CAPTURES_DIR)) mkdirSync(CAPTURES_DIR, { recursive: true });

// Each segment type = known input → known output → known routing
const SEGMENT_TYPES = {
  'class-header': {
    description: 'Class start — wide shot, auto-timestamp',
    camera: 'wide',
    duration: '30-60s',
    outputs: [
      { type: 'metadata', target: 'class-journal', description: 'Class date, time, group, attendance count' }
    ],
    editTemplate: 'title-card',
    captureNotes: 'Fixed wide angle. All athletes visible. Coach announces class/group.'
  },
  'technique-demo': {
    description: 'Coach demonstrates technique — medium or close-up',
    camera: 'medium-close',
    duration: '30-120s',
    outputs: [
      { type: 'clip', target: 'drill-library', description: 'Clean demo → technique library asset' },
      { type: 'transcript', target: 'coaching-whiteboard', description: 'Verbal cues → drill instruction text' },
      { type: 'content', target: 'reed-studio', description: 'Social-ready coaching clip' },
      { type: 'explainer', target: 'logan-stories', description: 'Logan ELI5 version of technique' }
    ],
    editTemplate: 'demo-clip',
    captureNotes: 'Coach faces camera. Clear background. Demonstrate slowly first, then at speed. Name the technique verbally.'
  },
  'drill-work': {
    description: 'Athletes drilling — wide shot, multiple pairs/bags',
    camera: 'wide',
    duration: '2-5min per round',
    outputs: [
      { type: 'assessment', target: 'gym-eyes', description: 'Form analysis per athlete (M5 CV)' },
      { type: 'observation', target: 'class-journal', description: 'Common faults, who needs correction' },
      { type: 'stats', target: 'coaching-whiteboard', description: 'Drill completion, round count' }
    ],
    editTemplate: 'training-montage',
    captureNotes: 'Keep camera stable. All pairs in frame if possible. Coach circulating visible.'
  },
  'pad-round': {
    description: 'Coach + individual athlete on pads — medium shot',
    camera: 'medium',
    duration: '2-3min per round',
    outputs: [
      { type: 'assessment', target: 'gym-eyes', description: 'Individual punch stats, form analysis' },
      { type: 'prescription', target: 'drill-plans', description: 'Personalized drill prescription from observed faults' },
      { type: 'clip', target: 'reed-studio', description: 'Highlight clip for athlete + social' },
      { type: 'billing', target: 'first-visit-conversion', description: 'Session proof for billing/CRM' }
    ],
    editTemplate: 'athlete-spotlight',
    captureNotes: 'Frame both coach and athlete. Capture full combinations. Good audio for coaching cues.'
  },
  'sparring': {
    description: 'Sparring rounds — wide shot, safety-first',
    camera: 'wide',
    duration: '2-3min per round',
    outputs: [
      { type: 'assessment', target: 'gym-eyes', description: 'Tactical patterns, distance management, defence' },
      { type: 'clip', target: 'reed-studio', description: 'Social highlight — action shots' },
      { type: 'observation', target: 'class-journal', description: 'Who sparred, intensity, notable moments' }
    ],
    editTemplate: 'fight-highlights',
    captureNotes: 'Safety visible. Both fighters in frame. Coach supervision clear.'
  },
  'debrief': {
    description: 'Post-class voice debrief — coach only, audio-primary',
    camera: 'close-up or audio-only',
    duration: '1-5min',
    outputs: [
      { type: 'transcript', target: 'class-journal', description: 'Full debrief → class entry (summary, observations, suggestions)' },
      { type: 'planning', target: 'coaching-whiteboard', description: 'Next-class suggestions → whiteboard' },
      { type: 'prescription', target: 'drill-plans', description: 'Individual drill assignments from observations' }
    ],
    editTemplate: 'voice-over',
    captureNotes: 'Quiet moment after class. Coach speaks naturally about what happened, what to work on next.'
  }
};

// Edit templates — each segment type maps to a known edit pattern
const EDIT_TEMPLATES = {
  'title-card': {
    structure: 'Wide shot + text overlay (date, group, attendance)',
    duration: '5-10s in final edit',
    music: 'Intro sting or class theme',
    transitions: 'Fade in from black'
  },
  'demo-clip': {
    structure: 'Slow-mo first pass → real-speed second pass → text overlay of technique name + key cues',
    duration: '15-30s per technique',
    music: 'Low instrumental, voice prominent',
    transitions: 'Cut on action'
  },
  'training-montage': {
    structure: 'Best moments from drill work, 3-5 cuts per round',
    duration: '30-60s in final edit',
    music: 'Energy builds',
    transitions: 'Quick cuts, beat-matched if music'
  },
  'athlete-spotlight': {
    structure: 'Best combination → slow-mo replay → coach reaction/correction',
    duration: '20-40s per athlete',
    music: 'Individual athlete theme or class music',
    transitions: 'Cut to slow-mo on impact'
  },
  'fight-highlights': {
    structure: 'Clean exchanges → slow-mo highlights → coach commentary overlay if available',
    duration: '30-60s per round',
    music: 'Intensity peak',
    transitions: 'Smash cuts on exchanges'
  },
  'voice-over': {
    structure: 'Coach audio over training footage (B-roll from earlier segments)',
    duration: '30-90s',
    music: 'Quiet ambient',
    transitions: 'Gentle crossfade to closing'
  }
};

// The capture session — a structured recording following the protocol
function startCapture(group, date = null) {
  const captureDate = date || new Date().toISOString().split('T')[0];
  const session = {
    id: `capture-${Date.now()}`,
    date: captureDate,
    group,
    status: 'recording',
    startedAt: new Date().toISOString(),
    segments: [],
    routing: routeProject('gym-studio')
  };

  const log = loadCaptureLog();
  log.sessions.unshift(session);
  saveLog(log);

  return {
    session,
    protocol: Object.entries(SEGMENT_TYPES).map(([key, seg]) => ({
      segmentType: key,
      description: seg.description,
      camera: seg.camera,
      duration: seg.duration,
      captureNotes: seg.captureNotes,
      outputCount: seg.outputs.length,
      editTemplate: seg.editTemplate
    }))
  };
}

function addSegment(sessionId, segmentType, metadata = {}) {
  const log = loadCaptureLog();
  const session = log.sessions.find(s => s.id === sessionId);
  if (!session) return { error: `Session not found: ${sessionId}` };

  const segDef = SEGMENT_TYPES[segmentType];
  if (!segDef) return { error: `Unknown segment type: ${segmentType}. Use: ${Object.keys(SEGMENT_TYPES).join(', ')}` };

  const segment = {
    type: segmentType,
    timestamp: new Date().toISOString(),
    camera: segDef.camera,
    editTemplate: segDef.editTemplate,
    outputs: segDef.outputs.map(o => ({
      ...o,
      status: 'pending',
      processed: false
    })),
    metadata: {
      ...metadata,
      athleteName: metadata.athleteName || null,
      techniqueName: metadata.techniqueName || null,
      roundNumber: metadata.roundNumber || null,
      notes: metadata.notes || null
    }
  };

  session.segments.push(segment);
  saveLog(log);

  return {
    segment,
    segmentIndex: session.segments.length - 1,
    nextStep: `Segment "${segmentType}" logged. ${segDef.outputs.length} outputs queued for processing.`
  };
}

function processSegment(sessionId, segmentIndex, clipPath = null) {
  const log = loadCaptureLog();
  const session = log.sessions.find(s => s.id === sessionId);
  if (!session) return { error: `Session not found: ${sessionId}` };

  const segment = session.segments[segmentIndex];
  if (!segment) return { error: `Segment not found at index ${segmentIndex}` };

  const segDef = SEGMENT_TYPES[segment.type];
  const editTemplate = EDIT_TEMPLATES[segment.editTemplate];
  const results = [];

  for (const output of segment.outputs) {
    output.status = 'routed';
    output.processedAt = new Date().toISOString();
    if (clipPath) output.sourcePath = clipPath;

    updateHealth(getChannelForTarget(output.target), { ran: true, placeholder: true });

    results.push({
      type: output.type,
      target: output.target,
      description: output.description,
      editGuidance: editTemplate
    });
  }

  saveLog(log);

  return {
    processed: results.length,
    results,
    editTemplate: {
      name: segment.editTemplate,
      ...editTemplate
    }
  };
}

function completeCapture(sessionId) {
  const log = loadCaptureLog();
  const session = log.sessions.find(s => s.id === sessionId);
  if (!session) return { error: `Session not found: ${sessionId}` };

  session.status = 'complete';
  session.completedAt = new Date().toISOString();

  const summary = {
    totalSegments: session.segments.length,
    byType: {},
    totalOutputs: 0,
    outputsByTarget: {}
  };

  for (const seg of session.segments) {
    summary.byType[seg.type] = (summary.byType[seg.type] || 0) + 1;
    for (const out of seg.outputs) {
      summary.totalOutputs++;
      summary.outputsByTarget[out.target] = (summary.outputsByTarget[out.target] || 0) + 1;
    }
  }

  session.summary = summary;
  saveLog(log);

  return session;
}

function getChannelForTarget(target) {
  const targetMap = {
    'class-journal': 'first-visit-conversion',
    'coaching-whiteboard': 'first-visit-conversion',
    'drill-library': 'animation-lab',
    'drill-plans': 'first-visit-conversion',
    'gym-eyes': 'phd-miner',
    'reed-studio': 'reed-studio',
    'logan-stories': 'logan-stories',
    'first-visit-conversion': 'first-visit-conversion'
  };
  return targetMap[target] || 'animation-lab';
}

function loadCaptureLog() {
  if (existsSync(CAPTURE_LOG)) return JSON.parse(readFileSync(CAPTURE_LOG, 'utf8'));
  return { sessions: [] };
}

function saveLog(log) {
  if (log.sessions.length > 50) log.sessions = log.sessions.slice(0, 50);
  writeFileSync(CAPTURE_LOG, JSON.stringify(log, null, 2));
}

function getCaptureHistory(limit = 10) {
  const log = loadCaptureLog();
  return log.sessions.slice(0, limit).map(s => ({
    id: s.id,
    date: s.date,
    group: s.group,
    status: s.status,
    segmentCount: s.segments.length,
    summary: s.summary || null
  }));
}

export {
  SEGMENT_TYPES,
  EDIT_TEMPLATES,
  startCapture,
  addSegment,
  processSegment,
  completeCapture,
  getCaptureHistory
};

const isMain = process.argv[1]?.endsWith('capture-protocol.js');

if (isMain && process.argv[2] === 'protocol') {
  console.log('GYM STUDIO CAPTURE PROTOCOL');
  console.log('===========================\n');
  console.log('Capture in this order. Each segment type has known outputs and edit templates.\n');
  for (const [key, seg] of Object.entries(SEGMENT_TYPES)) {
    console.log(`  ${key.padEnd(18)} | ${seg.camera.padEnd(15)} | ${seg.duration.padEnd(12)} | → ${seg.outputs.length} outputs`);
    console.log(`  ${''.padEnd(18)} | ${seg.captureNotes}`);
    console.log(`  ${''.padEnd(18)} | Edit: ${EDIT_TEMPLATES[seg.editTemplate].structure}`);
    console.log();
  }
} else if (isMain && process.argv[2] === 'templates') {
  console.log('EDIT TEMPLATES');
  console.log('==============\n');
  for (const [key, tmpl] of Object.entries(EDIT_TEMPLATES)) {
    console.log(`  ${key}`);
    console.log(`    Structure:   ${tmpl.structure}`);
    console.log(`    Duration:    ${tmpl.duration}`);
    console.log(`    Music:       ${tmpl.music}`);
    console.log(`    Transitions: ${tmpl.transitions}`);
    console.log();
  }
} else if (isMain && process.argv[2] === 'start') {
  const group = process.argv[3] || 'general';
  const result = startCapture(group);
  console.log(JSON.stringify(result, null, 2));
} else if (isMain && process.argv[2] === 'history') {
  console.log(JSON.stringify(getCaptureHistory(), null, 2));
} else if (isMain) {
  console.log('Gym Studio Capture Protocol');
  console.log('');
  console.log('Commands:');
  console.log('  protocol           — Show full capture protocol (segment types + edit templates)');
  console.log('  templates          — Show edit templates only');
  console.log('  start <group>      — Start a capture session');
  console.log('  history            — Show recent capture sessions');
}
