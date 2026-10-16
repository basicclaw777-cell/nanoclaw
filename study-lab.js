/**
 * Study Lab — Topic-focused learning tools.
 *
 * Three outputs from one topic:
 *   1. Slides — key concepts as a navigable HTML deck
 *   2. Mind Map — entity-relationship concept graph
 *   3. Podcast — multi-voice discussion (via cathedral-podcast.js)
 *
 * Usage:
 *   node study-lab.js slides "golden ratio"
 *   node study-lab.js mindmap "fear gate model"
 *   node study-lab.js all "sacred geometry" --minutes 10
 *
 * Telegram: /study [topic], /slides [topic], /mindmap [topic]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOME = process.env.HOME;
const VAULT = join(HOME, 'cathedral-vault');
const OUTPUT_DIR = join(__dirname, 'study-lab-output');
const DOTENV = join(__dirname, '.env');

mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {};
  if (existsSync(DOTENV)) {
    for (const line of readFileSync(DOTENV, 'utf8').split('\n')) {
      if (line.includes('=') && !line.startsWith('#')) {
        const [k, ...v] = line.split('=');
        env[k.trim()] = v.join('=').trim();
      }
    }
  }
  return env;
}

const ENV = loadEnv();

// ── Vault search ────────────────────────────────────────────────────────────

async function searchVault(query, limit = 12) {
  try {
    const url = `http://localhost:8080/vault/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, { headers: { 'x-api-key': ENV.CATH_API_KEY || 'cathedral-mcp-2026' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || data || []).map(r => ({
      title: r.title || r.file_path?.split('/').pop()?.replace('.md', '') || 'untitled',
      content: (r.content || r.first_line || '').slice(0, 1200),
      domain: r.domain || 'unknown',
      path: r.file_path || ''
    }));
  } catch { return []; }
}

// ── DeepSeek call ───────────────────────────────────────────────────────────

async function callDeepSeek(prompt, maxTokens = 4000) {
  const apiKey = ENV.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });
  if (!res.ok) throw new Error(`DeepSeek: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJSON(text) {
  let clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!clean.endsWith(']') && !clean.endsWith('}')) {
    const last = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'));
    if (last > 0) clean = clean.slice(0, last + 1);
  }
  return JSON.parse(clean);
}

// ── Slides generator ────────────────────────────────────────────────────────

async function generateSlides(topic, vaultContext) {
  const vaultText = vaultContext.map(n => `[${n.domain}] ${n.title}\n${n.content}`).join('\n---\n');

  const prompt = `Generate a study slide deck about: "${topic}"

SOURCE MATERIAL FROM VAULT:
${vaultText}

Create 8-12 slides. Each slide has:
- title: short heading (5-8 words)
- content: 2-4 bullet points (key insights, not summaries)
- grade: epistemic grade if applicable (A/B/C or null)
- connection: how this connects to the next slide (1 sentence)
- diagram: optional Mermaid diagram code if relationships exist (or null)

Return as JSON array:
[{"title":"...", "content":["bullet1","bullet2"], "grade":"B", "connection":"...", "diagram":null}, ...]

RULES:
- Each bullet should teach ONE thing
- Use specific numbers, names, ratios from the vault material
- Grade A/B claims get prominent placement
- Grade C = "open thread" label
- Final slide = "Open Questions" with research directions
- Return ONLY JSON array`;

  const raw = await callDeepSeek(prompt, 4000);
  return parseJSON(raw);
}

function renderSlidesHTML(topic, slides, date) {
  const slideCards = slides.map((s, i) => {
    const gradeColor = s.grade === 'A' ? '#22c55e' : s.grade === 'B' ? '#f7b408' : s.grade === 'C' ? '#ef4444' : '#666';
    const gradeTag = s.grade ? `<span class="grade" style="background:${gradeColor}">${s.grade}</span>` : '';
    const bullets = (s.content || []).map(b => `<li>${b}</li>`).join('');
    const diagram = s.diagram ? `<div class="diagram"><pre class="mermaid">${s.diagram}</pre></div>` : '';
    const conn = s.connection ? `<div class="connection">${s.connection}</div>` : '';
    return `
    <section class="slide" id="slide-${i}">
      <div class="slide-num">${String(i + 1).padStart(2, '0')}</div>
      <h2>${s.title} ${gradeTag}</h2>
      <ul>${bullets}</ul>
      ${diagram}
      ${conn}
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Study: ${topic}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>
  :root { --bg:#0A0A0A; --fg:#FAFAFA; --gold:#f7b408; --dim:#666; --card:#141414; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--fg); font-family:'Epilogue',system-ui,sans-serif; }
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@400;600;700&display=swap');
  .header { padding:2rem; text-align:center; border-bottom:1px solid #222; }
  .header h1 { font-family:'Anton',sans-serif; font-size:2.5rem; color:var(--gold); text-transform:uppercase; letter-spacing:2px; }
  .header .meta { color:var(--dim); margin-top:0.5rem; font-size:0.9rem; }
  .controls { position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); display:flex; gap:1rem; z-index:100; }
  .controls button { background:var(--card); border:1px solid #333; color:var(--fg); padding:0.6rem 1.5rem; border-radius:4px; cursor:pointer; font-size:1rem; }
  .controls button:hover { border-color:var(--gold); }
  .controls .counter { color:var(--dim); line-height:2.4rem; font-size:0.9rem; }
  .slides { max-width:900px; margin:0 auto; padding:2rem 2rem 6rem; }
  .slide { display:none; padding:3rem 2rem; min-height:60vh; }
  .slide.active { display:block; animation:fadeIn 0.3s; }
  @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
  .slide-num { font-family:'Anton',sans-serif; font-size:4rem; color:#1a1a1a; position:absolute; right:2rem; top:1rem; }
  .slide { position:relative; }
  .slide h2 { font-family:'Anton',sans-serif; font-size:2rem; color:var(--gold); margin-bottom:1.5rem; }
  .slide ul { list-style:none; }
  .slide li { padding:0.8rem 0; padding-left:1.5rem; border-left:2px solid #333; margin-bottom:0.5rem; font-size:1.1rem; line-height:1.6; }
  .slide li:hover { border-color:var(--gold); }
  .grade { display:inline-block; padding:0.1rem 0.5rem; border-radius:3px; font-size:0.75rem; color:#000; font-weight:700; margin-left:0.5rem; vertical-align:middle; }
  .connection { margin-top:2rem; padding:1rem; background:#111; border-left:3px solid var(--gold); color:var(--dim); font-style:italic; font-size:0.9rem; }
  .diagram { margin-top:1.5rem; background:#111; padding:1rem; border-radius:4px; }
  .progress { position:fixed; top:0; left:0; height:3px; background:var(--gold); transition:width 0.3s; z-index:200; }
  .nav-dots { display:flex; gap:0.5rem; }
  .nav-dots .dot { width:8px; height:8px; border-radius:50%; background:#333; cursor:pointer; }
  .nav-dots .dot.active { background:var(--gold); }
</style>
</head><body>
<div class="progress" id="progress"></div>
<div class="header">
  <h1>${topic}</h1>
  <div class="meta">${date} &middot; ${slides.length} slides &middot; Cathedral Study Lab</div>
</div>
<div class="slides" id="slides">${slideCards}</div>
<div class="controls">
  <button onclick="prev()">&larr; Prev</button>
  <div class="nav-dots" id="dots"></div>
  <span class="counter" id="counter"></span>
  <button onclick="next()">Next &rarr;</button>
</div>
<script>
  mermaid.initialize({theme:'dark',startOnLoad:true});
  const slides=document.querySelectorAll('.slide');
  const dots=document.getElementById('dots');
  const total=slides.length;
  let cur=0;
  for(let i=0;i<total;i++){const d=document.createElement('div');d.className='dot';d.onclick=()=>go(i);dots.appendChild(d)}
  function go(n){slides[cur].classList.remove('active');cur=Math.max(0,Math.min(n,total-1));slides[cur].classList.add('active');
    document.getElementById('counter').textContent=(cur+1)+'/'+total;
    document.getElementById('progress').style.width=((cur+1)/total*100)+'%';
    dots.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('active',i===cur));}
  function next(){go(cur+1)}function prev(){go(cur-1)}
  document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev()});
  go(0);
<\/script>
</body></html>`;
}

// ── Mind Map generator ──────────────────────────────────────────────────────

async function generateMindMap(topic, vaultContext) {
  const vaultText = vaultContext.map(n => `[${n.domain}] ${n.title}\n${n.content}`).join('\n---\n');

  const prompt = `Analyze this research topic and extract a concept map: "${topic}"

SOURCE MATERIAL:
${vaultText}

Extract:
1. nodes: key concepts/entities (max 30). Each node: {id, label, type, domain, grade}
   Types: concept, person, technique, finding, question, institution
   grade: epistemic confidence (A/B/C/D/null) — A=verified, B=strong, C=open thread, D=weak
2. edges: relationships between nodes. Each edge: {source, target, label}
   Labels: influences, contradicts, supports, enables, suppresses, part_of, discovered_by, tested_by
3. clusters: group related nodes. Each cluster: {name, nodeIds:[]}

Return JSON: {"nodes":[...], "edges":[...], "clusters":[...]}

RULES:
- Extract from the source material, don't invent
- Include cross-domain connections (the interesting ones)
- Mark contradictions explicitly
- Include open questions as nodes (type: question)
- Return ONLY JSON`;

  const raw = await callDeepSeek(prompt, 4000);
  return parseJSON(raw);
}

function renderMindMapHTML(topic, graph, date) {
  const nodesJSON = JSON.stringify(graph.nodes || []);
  const edgesJSON = JSON.stringify(graph.edges || []);
  const clustersJSON = JSON.stringify(graph.clusters || []);

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mind Map: ${topic}</title>
<script src="https://d3js.org/d3.v7.min.js"><\/script>
<style>
  :root { --bg:#0A0A0A; --fg:#FAFAFA; --gold:#f7b408; --dim:#666; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--fg); font-family:'Epilogue',system-ui,sans-serif; overflow:hidden; }
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@400;600;700&display=swap');
  .header { position:fixed; top:0; left:0; right:0; padding:1rem 2rem; z-index:10; background:rgba(10,10,10,0.9); border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center; }
  .header h1 { font-family:'Anton',sans-serif; font-size:1.5rem; color:var(--gold); text-transform:uppercase; }
  .header .meta { color:var(--dim); font-size:0.8rem; }
  svg { width:100vw; height:100vh; }
  .node-label { fill:var(--fg); font-size:11px; pointer-events:none; text-anchor:middle; }
  .edge-label { fill:var(--dim); font-size:9px; pointer-events:none; }
  .legend { position:fixed; bottom:1rem; left:1rem; background:rgba(20,20,20,0.9); padding:1rem; border-radius:4px; border:1px solid #333; }
  .legend div { display:flex; align-items:center; gap:0.5rem; margin:0.3rem 0; font-size:0.8rem; color:var(--dim); }
  .legend .swatch { width:12px; height:12px; border-radius:50%; }
  .info { position:fixed; top:5rem; right:1rem; background:rgba(20,20,20,0.95); padding:1.5rem; border-radius:4px; border:1px solid #333; max-width:300px; display:none; }
  .info h3 { color:var(--gold); font-size:1rem; margin-bottom:0.5rem; }
  .info .type { color:var(--dim); font-size:0.8rem; text-transform:uppercase; }
  .info .connections { margin-top:0.5rem; font-size:0.85rem; }
  .cluster-labels { pointer-events:none; }
</style>
</head><body>
<div class="header">
  <h1>Mind Map: ${topic}</h1>
  <div class="meta">${date} &middot; Cathedral Study Lab</div>
</div>
<div class="info" id="info">
  <h3 id="info-label"></h3>
  <div class="type" id="info-type"></div>
  <div class="connections" id="info-conn"></div>
</div>
<svg id="svg"></svg>
<div class="legend" id="legend"></div>
<script>
const nodes = ${nodesJSON};
const edges = ${edgesJSON};
const clusters = ${clustersJSON};

const typeColors = {
  concept:'#f7b408', person:'#22c55e', technique:'#3b82f6',
  finding:'#a855f7', question:'#ef4444', institution:'#6b7280'
};
const edgeColors = {
  supports:'#22c55e', contradicts:'#ef4444', influences:'#f7b408',
  enables:'#3b82f6', suppresses:'#6b7280', part_of:'#666',
  discovered_by:'#a855f7', tested_by:'#3b82f6'
};

// Legend
const leg = document.getElementById('legend');
for (const [t,c] of Object.entries(typeColors)) {
  const d = document.createElement('div');
  d.innerHTML = '<div class="swatch" style="background:'+c+'"></div>'+t;
  leg.appendChild(d);
}

const W = window.innerWidth, H = window.innerHeight;
const svg = d3.select('#svg');
const g = svg.append('g');

// Zoom
svg.call(d3.zoom().scaleExtent([0.2,4]).on('zoom', e => g.attr('transform', e.transform)));

// Cluster hulls
const clusterMap = {};
clusters.forEach(c => c.nodeIds.forEach(id => clusterMap[id] = c.name));

// Force sim
const sim = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(edges).id(d=>d.id).distance(120))
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(W/2, H/2))
  .force('collision', d3.forceCollide(30));

// Edges — contradicts=dashed, supports=thick, suppresses=dotted
const link = g.selectAll('.link').data(edges).join('line')
  .attr('class','link')
  .attr('stroke', d => edgeColors[d.label]||'#333')
  .attr('stroke-width', d => d.label==='supports' ? 2.5 : d.label==='contradicts' ? 2 : 1.5)
  .attr('stroke-opacity', d => d.label==='contradicts' ? 0.8 : 0.5)
  .attr('stroke-dasharray', d => d.label==='contradicts' ? '6,3' : d.label==='suppresses' ? '2,4' : 'none');

// Edge labels
const elabel = g.selectAll('.edge-label').data(edges).join('text')
  .attr('class','edge-label').text(d=>d.label);

// Epistemic sizing: A=16, B=12, C=9, D=7, null=10
const gradeRadius = {A:16, B:12, C:9, D:7};
function nodeR(d) { return gradeRadius[d.grade] || (d.type==='question' ? 8 : 10); }

// Nodes
const node = g.selectAll('.node').data(nodes).join('circle')
  .attr('class','node')
  .attr('r', nodeR)
  .attr('fill', d => typeColors[d.type]||'#666')
  .attr('stroke', d => d.grade==='A' ? '#22c55e' : d.grade==='D' ? '#ef4444' : '#222')
  .attr('stroke-width', d => d.grade==='A' ? 3 : 2)
  .style('cursor','pointer')
  .call(d3.drag().on('start',ds).on('drag',dd).on('end',de));

// Labels
const label = g.selectAll('.node-label').data(nodes).join('text')
  .attr('class','node-label').text(d=>d.label).attr('dy',20);

// Info panel
node.on('click', (e, d) => {
  const info = document.getElementById('info');
  info.style.display = 'block';
  document.getElementById('info-label').textContent = d.label;
  document.getElementById('info-type').textContent = d.type + (d.domain ? ' / '+d.domain : '') + (d.grade ? ' / Grade '+d.grade : '');
  const conns = edges.filter(l => l.source.id===d.id || l.target.id===d.id);
  document.getElementById('info-conn').innerHTML = conns.map(c => {
    const other = c.source.id===d.id ? c.target.label : c.source.label;
    return '<div>'+c.label+' &rarr; '+other+'</div>';
  }).join('');
});

sim.on('tick', () => {
  link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
  elabel.attr('x',d=>(d.source.x+d.target.x)/2).attr('y',d=>(d.source.y+d.target.y)/2);
  node.attr('cx',d=>d.x).attr('cy',d=>d.y);
  label.attr('x',d=>d.x).attr('y',d=>d.y);
});

function ds(e,d){if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y}
function dd(e,d){d.fx=e.x;d.fy=e.y}
function de(e,d){if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null}
<\/script>
</body></html>`;
}

// ── Quiz generator ──────────────────────────────────────────────────────────

async function generateQuiz(topic, vaultContext) {
  const vaultText = vaultContext.map(n => `[${n.domain}] ${n.title}\n${n.content}`).join('\n---\n');

  const prompt = `Generate a study quiz about: "${topic}"

SOURCE MATERIAL FROM VAULT:
${vaultText}

Create 10-15 questions. Mix of types:
- multiple_choice: 4 options, one correct
- true_false: statement + correct answer
- fill_blank: sentence with ___ blank + answer

Each question has:
- type: "multiple_choice" | "true_false" | "fill_blank"
- question: the question text
- options: array (for multiple_choice only, null otherwise)
- answer: correct answer
- explanation: 1-2 sentence explanation with vault reference
- difficulty: 1-3 (1=recall, 2=understanding, 3=synthesis)

Return as JSON array:
[{"type":"multiple_choice", "question":"...", "options":["a","b","c","d"], "answer":"b", "explanation":"...", "difficulty":2}, ...]

RULES:
- Questions should TEST understanding, not just recall
- Difficulty 3 = requires connecting concepts across sources
- Use specific names, numbers, ratios from the vault material
- At least 2 questions that challenge common misconceptions
- At least 1 question about open/unresolved threads
- Return ONLY JSON array`;

  const raw = await callDeepSeek(prompt, 4000);
  return parseJSON(raw);
}

function renderQuizHTML(topic, questions, date) {
  const qJSON = JSON.stringify(questions);

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quiz: ${topic}</title>
<style>
  :root { --bg:#0A0A0A; --fg:#FAFAFA; --gold:#f7b408; --dim:#666; --card:#141414; --green:#22c55e; --red:#ef4444; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--fg); font-family:'Epilogue',system-ui,sans-serif; }
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@400;600;700&display=swap');
  .header { padding:2rem; text-align:center; border-bottom:1px solid #222; }
  .header h1 { font-family:'Anton',sans-serif; font-size:2.5rem; color:var(--gold); text-transform:uppercase; }
  .header .meta { color:var(--dim); margin-top:0.5rem; font-size:0.9rem; }
  .quiz { max-width:700px; margin:0 auto; padding:2rem; }
  .question-card { background:var(--card); border:1px solid #222; border-radius:6px; padding:2rem; margin-bottom:1.5rem; }
  .question-card.correct { border-color:var(--green); }
  .question-card.wrong { border-color:var(--red); }
  .q-num { font-family:'Anton',sans-serif; color:var(--gold); font-size:0.9rem; margin-bottom:0.5rem; }
  .q-diff { display:inline-block; padding:0.1rem 0.5rem; border-radius:3px; font-size:0.7rem; font-weight:700; margin-left:0.5rem; }
  .q-diff.d1 { background:#22c55e33; color:#22c55e; }
  .q-diff.d2 { background:#f7b40833; color:#f7b408; }
  .q-diff.d3 { background:#ef444433; color:#ef4444; }
  .q-text { font-size:1.1rem; line-height:1.6; margin-bottom:1rem; }
  .options { display:flex; flex-direction:column; gap:0.5rem; }
  .option { padding:0.8rem 1rem; background:#111; border:1px solid #333; border-radius:4px; cursor:pointer; font-size:0.95rem; }
  .option:hover { border-color:#555; }
  .option.selected { border-color:var(--gold); background:#1a1500; }
  .option.correct-answer { border-color:var(--green); background:#0a2010; }
  .option.wrong-answer { border-color:var(--red); background:#200a0a; }
  .option.disabled { pointer-events:none; opacity:0.7; }
  .tf-row { display:flex; gap:1rem; }
  .tf-btn { flex:1; padding:0.8rem; background:#111; border:1px solid #333; border-radius:4px; cursor:pointer; text-align:center; font-weight:600; }
  .tf-btn:hover { border-color:#555; }
  .fill-input { width:100%; padding:0.8rem; background:#111; border:1px solid #333; border-radius:4px; color:var(--fg); font-size:1rem; font-family:inherit; }
  .fill-input:focus { outline:none; border-color:var(--gold); }
  .check-btn { background:var(--gold); color:#000; border:none; padding:0.6rem 1.5rem; border-radius:4px; font-weight:700; cursor:pointer; margin-top:0.5rem; }
  .explanation { margin-top:1rem; padding:1rem; background:#111; border-left:3px solid var(--gold); color:var(--dim); font-size:0.9rem; display:none; }
  .explanation.show { display:block; }
  .score-bar { position:fixed; bottom:0; left:0; right:0; padding:1rem 2rem; background:#111; border-top:1px solid #222; display:flex; justify-content:space-between; align-items:center; }
  .score-bar .score { font-family:'Anton',sans-serif; font-size:1.5rem; color:var(--gold); }
  .score-bar .progress { color:var(--dim); }
  .reset-btn { background:none; border:1px solid #333; color:var(--fg); padding:0.5rem 1rem; border-radius:4px; cursor:pointer; }
</style>
</head><body>
<div class="header">
  <h1>Quiz: ${topic}</h1>
  <div class="meta">${date} · ${questions.length} questions · Cathedral Study Lab</div>
</div>
<div class="quiz" id="quiz"></div>
<div class="score-bar">
  <div class="score" id="score">0 / 0</div>
  <div class="progress" id="progress">Answer all questions</div>
  <button class="reset-btn" onclick="resetQuiz()">Reset</button>
</div>
<script>
const questions = ${qJSON};
let answered = 0, correct = 0;

function renderQuiz() {
  const quiz = document.getElementById('quiz');
  quiz.innerHTML = questions.map((q, i) => {
    const diffLabel = ['Recall','Understanding','Synthesis'][q.difficulty-1] || '';
    const diffClass = 'd' + q.difficulty;
    let body = '';
    if (q.type === 'multiple_choice') {
      body = '<div class="options">' + (q.options||[]).map((o, j) =>
        '<div class="option" data-q="'+i+'" data-val="'+o+'" onclick="selectOption(this,'+i+')">'+o+'</div>'
      ).join('') + '</div>';
    } else if (q.type === 'true_false') {
      body = '<div class="tf-row"><div class="tf-btn option" data-q="'+i+'" data-val="true" onclick="selectOption(this,'+i+')">True</div><div class="tf-btn option" data-q="'+i+'" data-val="false" onclick="selectOption(this,'+i+')">False</div></div>';
    } else {
      body = '<input class="fill-input" id="fill-'+i+'" placeholder="Type your answer..." onkeydown="if(event.key===\\'Enter\\')checkFill('+i+')"><button class="check-btn" onclick="checkFill('+i+')">Check</button>';
    }
    return '<div class="question-card" id="qc-'+i+'"><div class="q-num">Q'+(i+1)+' <span class="q-diff '+diffClass+'">'+diffLabel+'</span></div><div class="q-text">'+q.question+'</div>'+body+'<div class="explanation" id="exp-'+i+'">'+q.explanation+'</div></div>';
  }).join('');
}

function selectOption(el, qi) {
  const q = questions[qi];
  const card = document.getElementById('qc-'+qi);
  if (card.classList.contains('correct') || card.classList.contains('wrong')) return;
  const val = el.dataset.val;
  const isCorrect = val.toLowerCase() === String(q.answer).toLowerCase();
  answered++;
  if (isCorrect) correct++;
  card.querySelectorAll('.option').forEach(o => {
    o.classList.add('disabled');
    if (o.dataset.val.toLowerCase() === String(q.answer).toLowerCase()) o.classList.add('correct-answer');
    else if (o === el && !isCorrect) o.classList.add('wrong-answer');
  });
  card.classList.add(isCorrect ? 'correct' : 'wrong');
  document.getElementById('exp-'+qi).classList.add('show');
  updateScore();
}

function checkFill(qi) {
  const q = questions[qi];
  const card = document.getElementById('qc-'+qi);
  if (card.classList.contains('correct') || card.classList.contains('wrong')) return;
  const input = document.getElementById('fill-'+qi);
  const val = input.value.trim();
  if (!val) return;
  const isCorrect = val.toLowerCase().includes(String(q.answer).toLowerCase());
  answered++;
  if (isCorrect) correct++;
  input.disabled = true;
  input.style.borderColor = isCorrect ? 'var(--green)' : 'var(--red)';
  if (!isCorrect) { const hint = document.createElement('div'); hint.style.cssText='color:var(--green);margin-top:0.5rem;font-size:0.9rem'; hint.textContent='Answer: '+q.answer; card.appendChild(hint); }
  card.classList.add(isCorrect ? 'correct' : 'wrong');
  document.getElementById('exp-'+qi).classList.add('show');
  updateScore();
}

function updateScore() {
  document.getElementById('score').textContent = correct + ' / ' + answered;
  document.getElementById('progress').textContent = answered === questions.length ?
    (correct === questions.length ? 'Perfect!' : Math.round(correct/questions.length*100) + '% — review explanations') :
    (questions.length - answered) + ' remaining';
}

function resetQuiz() { answered=0; correct=0; renderQuiz(); updateScore(); }
renderQuiz();
<\/script>
</body></html>`;
}

export async function createQuiz(topic) {
  const date = new Date().toISOString().split('T')[0];
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

  console.log(`Generating quiz: "${topic}"`);
  const vault = await searchVault(topic);
  console.log(`  ${vault.length} vault nuggets found`);

  const questions = await generateQuiz(topic, vault);
  console.log(`  ${questions.length} questions generated`);

  const html = renderQuizHTML(topic, questions, date);
  const outPath = join(OUTPUT_DIR, `quiz-${slug}.html`);
  writeFileSync(outPath, html);
  console.log(`  Saved: ${outPath}`);

  return { path: outPath, questions: questions.length, topic };
}

// ── Main exports ────────────────────────────────────────────────────────────

export async function createSlides(topic) {
  const date = new Date().toISOString().split('T')[0];
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

  console.log(`Generating slides: "${topic}"`);
  const vault = await searchVault(topic);
  console.log(`  ${vault.length} vault nuggets found`);

  const slides = await generateSlides(topic, vault);
  console.log(`  ${slides.length} slides generated`);

  const html = renderSlidesHTML(topic, slides, date);
  const outPath = join(OUTPUT_DIR, `slides-${slug}.html`);
  writeFileSync(outPath, html);
  console.log(`  Saved: ${outPath}`);

  return { path: outPath, slides: slides.length, topic };
}

export async function createMindMap(topic) {
  const date = new Date().toISOString().split('T')[0];
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

  console.log(`Generating mind map: "${topic}"`);
  const vault = await searchVault(topic);
  console.log(`  ${vault.length} vault nuggets found`);

  const graph = await generateMindMap(topic, vault);
  console.log(`  ${(graph.nodes||[]).length} nodes, ${(graph.edges||[]).length} edges`);

  const html = renderMindMapHTML(topic, graph, date);
  const outPath = join(OUTPUT_DIR, `mindmap-${slug}.html`);
  writeFileSync(outPath, html);
  console.log(`  Saved: ${outPath}`);

  return { path: outPath, nodes: (graph.nodes||[]).length, edges: (graph.edges||[]).length, topic };
}

export function listStudyMaterials() {
  if (!existsSync(OUTPUT_DIR)) return { slides: [], mindmaps: [], quizzes: [] };
  const files = readdirSync(OUTPUT_DIR);
  return {
    slides: files.filter(f => f.startsWith('slides-')).sort().reverse(),
    mindmaps: files.filter(f => f.startsWith('mindmap-')).sort().reverse(),
    quizzes: files.filter(f => f.startsWith('quiz-')).sort().reverse()
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('study-lab.js')) {
  const [cmd, ...rest] = process.argv.slice(2);
  const topic = rest.find(a => !a.startsWith('--'));

  if (!cmd || cmd === '--help') {
    console.log('Usage:');
    console.log('  node study-lab.js slides "topic"');
    console.log('  node study-lab.js mindmap "topic"');
    console.log('  node study-lab.js quiz "topic"');
    console.log('  node study-lab.js list');
    process.exit(0);
  }

  if (cmd === 'list') {
    const m = listStudyMaterials();
    console.log('Slides:', m.slides.length ? m.slides.join(', ') : 'none');
    console.log('Mind Maps:', m.mindmaps.length ? m.mindmaps.join(', ') : 'none');
    console.log('Quizzes:', m.quizzes.length ? m.quizzes.join(', ') : 'none');
    process.exit(0);
  }

  if (!topic) { console.error('Provide a topic.'); process.exit(1); }

  const fn = cmd === 'slides' ? createSlides : cmd === 'mindmap' ? createMindMap : cmd === 'quiz' ? createQuiz : null;
  if (!fn) { console.error('Unknown command:', cmd); process.exit(1); }
  fn(topic).then(r => console.log('\nDone:', r)).catch(e => { console.error('Error:', e.message); process.exit(1); });
}
