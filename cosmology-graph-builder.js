#!/usr/bin/env node

/**
 * Cosmology Research Series — Knowledge Graph Builder
 * Reads all .md files from ~/cathedral-vault/00_Staging/cosmology/
 * Extracts tracks, cross-references, and named entities
 * Generates an interactive HTML visualization
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COSMOLOGY_DIR = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'cosmology');
const OUTPUT_PATH = path.join(__dirname, 'reed-lab', 'cosmology-graph.html');

// ── Tier color map ───────────────────────────────────────────────────────────

const TIER_MAP = {
  1: { tier: 'Core', color: '#8B2020' },
  2: { tier: 'Core', color: '#8B2020' },
  3: { tier: 'Core', color: '#8B2020' },
  4: { tier: 'Core', color: '#8B2020' },
  5: { tier: 'Core', color: '#8B2020' },
  6: { tier: 'Core', color: '#8B2020' },
  7: { tier: 'Core', color: '#8B2020' },
  8: { tier: 'Finance', color: '#EF9F27' },
  9: { tier: 'OS', color: '#1D9E75' },
  10: { tier: 'OS', color: '#1D9E75' },
  11: { tier: 'Finance', color: '#EF9F27' },
  12: { tier: 'Finance', color: '#EF9F27' },
  13: { tier: 'Bio', color: '#534AB7' },
  14: { tier: 'Finance', color: '#EF9F27' },
  15: { tier: 'Bio', color: '#534AB7' },
  16: { tier: 'Pillars', color: '#378ADD' },
  17: { tier: 'Pillars', color: '#378ADD' },
  18: { tier: 'Pillars', color: '#378ADD' },
  19: { tier: 'Pillars', color: '#378ADD' },
  20: { tier: 'Pillars', color: '#378ADD' },
  21: { tier: 'Pillars', color: '#378ADD' },
  22: { tier: 'Ops', color: '#666666' },
  23: { tier: 'Ops', color: '#666666' },
  24: { tier: 'Ops', color: '#666666' },
  25: { tier: 'Ops', color: '#666666' },
  26: { tier: 'Forbidden', color: '#cc4444' },
  27: { tier: 'Forbidden', color: '#cc4444' },
};

// ── Parse frontmatter ────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const fm = {};
  if (!content.startsWith('---')) return { fm, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { fm, body: content };
  const raw = content.slice(3, end);
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*"?(.+?)"?\s*$/);
    if (m) {
      let val = m[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim());
      }
      fm[m[1]] = val;
    }
  }
  const body = content.slice(end + 4);
  return { fm, body };
}

// ── Extract track number from filename or title ──────────────────────────────

function extractTrackNumber(filename, title) {
  let m = filename.match(/track(\d+)/i);
  if (m) return parseInt(m[1]);
  m = (title || '').match(/Track\s+(\d+)/i);
  if (m) return parseInt(m[1]);
  return null;
}

// ── Extract cross-references ─────────────────────────────────────────────────

function extractTrackRefs(body, selfTrack) {
  const refs = {};
  // Match: Track 1, Track 14, Tracks 1-5, Tracks 9, 10, 13
  const patterns = [
    /Tracks?\s+(\d+)(?:\s*[-–]\s*(\d+))?/gi,
    /\(Track\s+(\d+)\)/gi,
    /track(\d+)/gi,  // filename refs like track1-boundary
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(body)) !== null) {
      if (m[2]) {
        // Range: Tracks 1-5
        const lo = parseInt(m[1]), hi = parseInt(m[2]);
        for (let i = lo; i <= hi; i++) {
          if (i !== selfTrack) refs[i] = (refs[i] || 0) + 1;
        }
      } else {
        const n = parseInt(m[1]);
        if (n !== selfTrack && n >= 1 && n <= 27) refs[n] = (refs[n] || 0) + 1;
      }
    }
  }
  return refs;
}

// ── Extract named entities ───────────────────────────────────────────────────

function extractEntities(body) {
  const entities = {};
  // Known entities to look for (appears in 3+ tracks → secondary node)
  const KNOWN_ENTITIES = [
    'Tesla', 'Rife', 'Schumann', 'Schauberger', 'Moray', 'Wardenclyffe',
    'Anunnaki', 'Vanguard', 'BlackRock', 'Archons', 'Monroe',
    'CIA', 'NASA', 'AMA', 'FDA', 'Pentagon', 'DARPA',
    'Antarctica', 'Byrd', 'Piri Reis', 'Tartaria',
    'Cymatics', 'Sonoluminescence', 'Fluoride', 'Glyphosate',
    'Stargate', 'Gateway Process', 'Blue Beam', 'HAARP',
    'Enoch', 'Nag Hammadi', 'Gnostic', 'Bardo',
    'Firmament', 'Ionosphere', 'Van Allen',
    'Fishbowl', 'Highjump', 'West Ford',
    'Pollack', 'Emoto', 'Dollard', 'Brown',
    'Petrodollar', 'Federal Reserve', 'BIS',
    'Pyramid', 'Dwarka', 'Yonaguni', 'Lake Vostok',
    'PEMF', 'Infrared', 'Grounding',
    'Reincarnation', 'NDE', 'Loosh', 'Soul Trap',
    'Demiurge', 'Elohim', 'Watchers', 'Neteru',
    'Looking Glass', 'Chronovisor', 'Montauk', 'Philadelphia Experiment',
    'Bedini', 'Coanda', 'Hutchison',
    'Derinkuyu', 'Tayos', 'Dulce',
    'von Braun', 'Lazar', 'Greer',
    'Fibonacci', 'Golden Ratio', 'Phi',
  ];

  for (const entity of KNOWN_ENTITIES) {
    const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = body.match(regex);
    if (matches && matches.length > 0) {
      entities[entity] = matches.length;
    }
  }
  return entities;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const files = fs.readdirSync(COSMOLOGY_DIR).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} markdown files in cosmology/`);

  const tracks = [];       // { id, trackNum, title, grade, tier, color, file, entities }
  const specialNodes = [];  // master-index, roadmap, aletheia, house-analogy
  const allEntities = {};   // entity → Set<trackId>
  const crossRefs = [];     // { source, target, weight }

  // Pass 1: Parse all files
  for (const file of files) {
    const content = fs.readFileSync(path.join(COSMOLOGY_DIR, file), 'utf8');
    const { fm, body } = parseFrontmatter(content);
    const title = fm.title || file.replace('.md', '');
    const grade = fm.grade || '?';
    const trackNum = extractTrackNumber(file, title);

    const nodeId = trackNum ? `track-${trackNum}` : file.replace('.md', '').replace(/^2026-\d{2}-\d{2}_cosmology_/, '');

    const node = {
      id: nodeId,
      trackNum,
      title: title.replace(/^"/, '').replace(/"$/, ''),
      grade,
      file,
      entities: extractEntities(body),
      refs: trackNum ? extractTrackRefs(body, trackNum) : {},
    };

    if (trackNum) {
      const tierInfo = TIER_MAP[trackNum] || { tier: 'Other', color: '#888' };
      node.tier = tierInfo.tier;
      node.color = tierInfo.color;
      tracks.push(node);
    } else {
      node.tier = 'Meta';
      node.color = '#999';
      specialNodes.push(node);
    }

    // Collect entity appearances
    for (const [ent, count] of Object.entries(node.entities)) {
      if (!allEntities[ent]) allEntities[ent] = new Set();
      allEntities[ent].add(node.id);
    }
  }

  // Sort tracks by number
  tracks.sort((a, b) => (a.trackNum || 99) - (b.trackNum || 99));

  // Pass 2: Build cross-reference edges
  const allNodes = [...tracks, ...specialNodes];
  const trackById = {};
  for (const t of tracks) trackById[t.trackNum] = t;

  for (const node of allNodes) {
    if (!node.refs) continue;
    for (const [refNum, weight] of Object.entries(node.refs)) {
      const target = trackById[parseInt(refNum)];
      if (target) {
        crossRefs.push({ source: node.id, target: target.id, weight });
      }
    }
  }

  // Pass 3: Filter entities to those appearing in 3+ tracks
  const significantEntities = {};
  for (const [ent, trackSet] of Object.entries(allEntities)) {
    if (trackSet.size >= 3) {
      significantEntities[ent] = [...trackSet];
    }
  }

  console.log(`Tracks: ${tracks.length}`);
  console.log(`Special nodes: ${specialNodes.length}`);
  console.log(`Cross-references: ${crossRefs.length}`);
  console.log(`Significant entities (3+ tracks): ${Object.keys(significantEntities).length}`);

  // Build graph data
  const nodes = [];
  const edges = [];

  // Add track nodes
  for (const t of allNodes) {
    nodes.push({
      id: t.id,
      label: t.trackNum ? `T${t.trackNum}` : t.id.replace(/-/g, ' ').slice(0, 20),
      title: t.title,
      grade: t.grade,
      tier: t.tier,
      color: t.color,
      type: t.trackNum ? 'track' : 'meta',
      trackNum: t.trackNum || null,
    });
  }

  // Add entity nodes
  for (const [ent, trackIds] of Object.entries(significantEntities)) {
    nodes.push({
      id: `entity-${ent.replace(/\s+/g, '-').toLowerCase()}`,
      label: ent,
      title: ent,
      grade: null,
      tier: 'Entity',
      color: '#555555',
      type: 'entity',
      trackNum: null,
    });
    // Entity-to-track edges
    for (const tid of trackIds) {
      edges.push({ source: `entity-${ent.replace(/\s+/g, '-').toLowerCase()}`, target: tid, weight: 1 });
    }
  }

  // Add cross-ref edges
  for (const ref of crossRefs) {
    // Check if edge already exists (combine weights)
    const existing = edges.find(e =>
      (e.source === ref.source && e.target === ref.target) ||
      (e.source === ref.target && e.target === ref.source)
    );
    if (existing && existing.source !== existing.target) {
      existing.weight += ref.weight;
    } else {
      edges.push(ref);
    }
  }

  // Stats
  const connectionCount = {};
  for (const e of edges) {
    connectionCount[e.source] = (connectionCount[e.source] || 0) + 1;
    connectionCount[e.target] = (connectionCount[e.target] || 0) + 1;
  }

  let mostConnected = { id: '', count: 0 };
  for (const n of nodes) {
    const cnt = connectionCount[n.id] || 0;
    n.connections = cnt;
    if (n.type === 'track' && cnt > mostConnected.count) {
      mostConnected = { id: n.id, label: n.title, count: cnt };
    }
  }

  const stats = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    trackNodes: nodes.filter(n => n.type === 'track').length,
    entityNodes: nodes.filter(n => n.type === 'entity').length,
    metaNodes: nodes.filter(n => n.type === 'meta').length,
    mostConnected,
  };

  console.log(`Total nodes: ${stats.totalNodes} (${stats.trackNodes} tracks, ${stats.entityNodes} entities, ${stats.metaNodes} meta)`);
  console.log(`Total edges: ${stats.totalEdges}`);
  console.log(`Most connected: ${mostConnected.label} (${mostConnected.count} connections)`);

  // Generate HTML
  const html = generateHTML(nodes, edges, stats);
  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log(`\nGraph written to ${OUTPUT_PATH}`);
}

// ── HTML Generator ───────────────────────────────────────────────────────────

function generateHTML(nodes, edges, stats) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cosmology Research Series - Knowledge Graph</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a0a; color: #ccc; font-family: 'SF Mono', 'Fira Code', monospace; overflow: hidden; }
#stats-bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  background: rgba(10,10,10,0.92); border-bottom: 1px solid #222;
  padding: 10px 20px; display: flex; gap: 28px; align-items: center;
  font-size: 12px; backdrop-filter: blur(8px);
}
.stat-label { color: #666; text-transform: uppercase; letter-spacing: 1px; font-size: 10px; }
.stat-value { color: #ddd; font-size: 14px; font-weight: 600; }
.stat-value.highlight { color: #EF9F27; }
#legend {
  position: fixed; bottom: 16px; left: 16px; z-index: 100;
  background: rgba(10,10,10,0.85); border: 1px solid #222; border-radius: 6px;
  padding: 12px 16px; font-size: 11px; backdrop-filter: blur(8px);
}
#legend .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
#legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
#tooltip {
  position: fixed; z-index: 200; pointer-events: none;
  background: rgba(15,15,15,0.95); border: 1px solid #333; border-radius: 6px;
  padding: 10px 14px; font-size: 12px; display: none; max-width: 320px;
  backdrop-filter: blur(8px);
}
#tooltip .tt-title { color: #fff; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
#tooltip .tt-grade { color: #EF9F27; }
#tooltip .tt-tier { color: #888; font-size: 11px; }
#tooltip .tt-conn { color: #666; font-size: 11px; margin-top: 4px; }
canvas { display: block; cursor: grab; }
canvas:active { cursor: grabbing; }
#instructions {
  position: fixed; bottom: 16px; right: 16px; z-index: 100;
  color: #444; font-size: 10px; text-align: right; line-height: 1.6;
}
</style>
</head>
<body>

<div id="stats-bar">
  <div><span class="stat-label">Nodes</span><br><span class="stat-value">${stats.totalNodes}</span></div>
  <div><span class="stat-label">Edges</span><br><span class="stat-value">${stats.totalEdges}</span></div>
  <div><span class="stat-label">Tracks</span><br><span class="stat-value">${stats.trackNodes}</span></div>
  <div><span class="stat-label">Entities</span><br><span class="stat-value">${stats.entityNodes}</span></div>
  <div><span class="stat-label">Most Connected</span><br><span class="stat-value highlight">${escapeHtml(stats.mostConnected.label || '?')} (${stats.mostConnected.count})</span></div>
</div>

<div id="legend">
  <div style="color:#888;margin-bottom:6px;font-weight:600">TIERS</div>
  <div class="row"><span class="dot" style="background:#8B2020"></span> Core (1-7)</div>
  <div class="row"><span class="dot" style="background:#EF9F27"></span> Finance (8,11,12,14)</div>
  <div class="row"><span class="dot" style="background:#1D9E75"></span> OS (9,10)</div>
  <div class="row"><span class="dot" style="background:#534AB7"></span> Bio (13,15)</div>
  <div class="row"><span class="dot" style="background:#378ADD"></span> Pillars (16-21)</div>
  <div class="row"><span class="dot" style="background:#666"></span> Ops (22-25)</div>
  <div class="row"><span class="dot" style="background:#c44"></span> Forbidden (26-27)</div>
  <div class="row"><span class="dot" style="background:#555;border:1px solid #777"></span> Entity (3+ tracks)</div>
</div>

<div id="tooltip">
  <div class="tt-title"></div>
  <div class="tt-grade"></div>
  <div class="tt-tier"></div>
  <div class="tt-conn"></div>
</div>

<div id="instructions">
  Scroll to zoom / Drag to pan<br>
  Hover for details / Click to highlight connections<br>
  Click background to reset
</div>

<canvas id="graph"></canvas>

<script>
const NODES = ${JSON.stringify(nodes)};
const EDGES = ${JSON.stringify(edges)};

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

let W, H;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ---- Physics simulation ----

const nodeMap = {};
for (const n of NODES) {
  // Initial positions: cluster by tier
  const tierOffsets = {
    Core: { x: -200, y: -150 }, Finance: { x: 250, y: -100 },
    OS: { x: -250, y: 100 }, Bio: { x: 200, y: 200 },
    Pillars: { x: 0, y: -250 }, Ops: { x: -150, y: 250 },
    Forbidden: { x: 150, y: 280 }, Entity: { x: 0, y: 0 }, Meta: { x: -300, y: 0 }
  };
  const off = tierOffsets[n.tier] || { x: 0, y: 0 };
  n.x = W / 2 + off.x + (Math.random() - 0.5) * 200;
  n.y = H / 2 + off.y + (Math.random() - 0.5) * 200;
  n.vx = 0; n.vy = 0;
  n.radius = n.type === 'track' ? 18 : n.type === 'meta' ? 14 : 7;
  nodeMap[n.id] = n;
}

// Build adjacency
const adjacency = {};
for (const n of NODES) adjacency[n.id] = new Set();
for (const e of EDGES) {
  if (nodeMap[e.source] && nodeMap[e.target]) {
    adjacency[e.source].add(e.target);
    adjacency[e.target].add(e.source);
  }
}

// Simulation parameters
const SIM_ITERATIONS = 300;
const REPULSION = 3000;
const ATTRACTION = 0.003;
const DAMPING = 0.92;
const CENTER_PULL = 0.001;

function simulate() {
  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    // Repulsion
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const a = NODES[i], b = NODES[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = REPULSION / (dist * dist);
        let fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    // Attraction (edges)
    for (const e of EDGES) {
      const a = nodeMap[e.source], b = nodeMap[e.target];
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = dist * ATTRACTION * (e.weight || 1);
      let fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    // Center pull
    for (const n of NODES) {
      n.vx += (W / 2 - n.x) * CENTER_PULL;
      n.vy += (H / 2 - n.y) * CENTER_PULL;
    }
    // Update
    for (const n of NODES) {
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x += n.vx; n.y += n.vy;
    }
  }
}

simulate();

// ---- Camera ----
let camX = 0, camY = 0, zoom = 1;
let dragging = false, dragStartX = 0, dragStartY = 0, camStartX = 0, camStartY = 0;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  const mx = e.clientX, my = e.clientY;
  // Zoom toward mouse
  camX = mx - (mx - camX) * factor;
  camY = my - (my - camY) * factor;
  zoom *= factor;
  draw();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  dragStartX = e.clientX; dragStartY = e.clientY;
  camStartX = camX; camStartY = camY;
});
canvas.addEventListener('mousemove', (e) => {
  if (dragging) {
    camX = camStartX + (e.clientX - dragStartX);
    camY = camStartY + (e.clientY - dragStartY);
    draw();
  }
  handleHover(e);
});
canvas.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('mouseleave', () => { dragging = false; tooltip.style.display = 'none'; });

// ---- Hit detection ----

let hoveredNode = null;
let selectedNode = null;

function screenToWorld(sx, sy) {
  return { x: (sx - camX) / zoom, y: (sy - camY) / zoom };
}
function worldToScreen(wx, wy) {
  return { x: wx * zoom + camX, y: wy * zoom + camY };
}

function findNodeAt(sx, sy) {
  const wp = screenToWorld(sx, sy);
  for (let i = NODES.length - 1; i >= 0; i--) {
    const n = NODES[i];
    const dx = wp.x - n.x, dy = wp.y - n.y;
    if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) return n;
  }
  return null;
}

function handleHover(e) {
  const node = findNodeAt(e.clientX, e.clientY);
  if (node !== hoveredNode) {
    hoveredNode = node;
    if (node) {
      const tt = tooltip;
      tt.querySelector('.tt-title').textContent = node.title;
      tt.querySelector('.tt-grade').textContent = node.grade ? 'Grade: ' + node.grade : '';
      tt.querySelector('.tt-tier').textContent = node.tier + (node.trackNum ? ' | Track ' + node.trackNum : '');
      tt.querySelector('.tt-conn').textContent = (node.connections || 0) + ' connections';
      tt.style.display = 'block';
      tt.style.left = Math.min(e.clientX + 14, W - 340) + 'px';
      tt.style.top = Math.min(e.clientY + 14, H - 100) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
    draw();
  } else if (node) {
    tooltip.style.left = Math.min(e.clientX + 14, W - 340) + 'px';
    tooltip.style.top = Math.min(e.clientY + 14, H - 100) + 'px';
  }
}

canvas.addEventListener('click', (e) => {
  const node = findNodeAt(e.clientX, e.clientY);
  selectedNode = node === selectedNode ? null : node;
  draw();
});

// ---- Draw ----

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(zoom, zoom);

  const highlightSet = new Set();
  if (selectedNode) {
    highlightSet.add(selectedNode.id);
    const adj = adjacency[selectedNode.id];
    if (adj) for (const id of adj) highlightSet.add(id);
  }

  // Draw edges
  for (const e of EDGES) {
    const a = nodeMap[e.source], b = nodeMap[e.target];
    if (!a || !b) continue;

    const active = !selectedNode || (highlightSet.has(e.source) && highlightSet.has(e.target));
    const alpha = active ? 0.35 : 0.05;
    const lineWidth = Math.min(1 + (e.weight || 1) * 0.5, 4);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = active ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = lineWidth / zoom;
    ctx.stroke();
  }

  // Draw nodes
  for (const n of NODES) {
    const active = !selectedNode || highlightSet.has(n.id);
    const isHovered = n === hoveredNode;
    const isSelected = n === selectedNode;

    const r = n.radius;
    const alpha = active ? 1 : 0.15;

    // Glow for hovered/selected
    if (isHovered || isSelected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
      const glow = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 6);
      glow.addColorStop(0, n.color + '66');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = n.color;
    ctx.fill();

    if (n.type === 'entity') {
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }

    // Label
    if (n.type !== 'entity' || zoom > 0.8 || isHovered || (selectedNode && highlightSet.has(n.id))) {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = active ? 0.9 : 0.15;
      ctx.font = (n.type === 'track' ? 'bold ' : '') + Math.max(10, 11) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label, n.x, n.y);
    }

    // Grade badge for tracks
    if (n.type === 'track' && n.grade && (zoom > 0.6 || isHovered)) {
      ctx.globalAlpha = active ? 0.7 : 0.1;
      ctx.fillStyle = '#EF9F27';
      ctx.font = '9px monospace';
      ctx.fillText(n.grade, n.x, n.y + r + 10);
    }

    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

draw();
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main();
