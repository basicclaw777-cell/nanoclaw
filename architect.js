// architect.js — Intent to Structured Plan Engine
// ESM module
// Takes natural language intent → dependency graph + task sequence + resource map
// Grounded in Cathedral infrastructure (PM2, vault, agents, hardware)

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HOME = process.env.HOME;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const VAULT_DIR = path.join(HOME, 'cathedral-vault');
const PROJECTS_DIR = path.join(VAULT_DIR, '08_Project_Orchestrator', 'projects');
const TEMPLATES_DIR = path.join(HOME, 'nanoclaw', 'architect-templates');
const OUTPUT_DIR = path.join(HOME, 'nanoclaw', 'architect-output');

// ── Infrastructure Scanner ──────────────────────────────────────────────────

/**
 * Scan current Cathedral infrastructure — what exists right now
 */
export function scanInfrastructure() {
  const infra = {
    scannedAt: new Date().toISOString(),
    pm2: [],
    vaultSections: [],
    existingProjects: [],
    endpoints: [],
    hardware: {
      machine: 'Mac Mini M-series, 16GB RAM',
      constraints: [
        'Only one Ollama model at a time',
        'gemma4:26b crashes the system — DO NOT LOAD',
        'hermes3 (4.7GB) is default local model'
      ]
    },
    agents: [],
    telegramCommands: []
  };

  // PM2 services
  try {
    const pm2Raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const pm2Data = JSON.parse(pm2Raw);
    infra.pm2 = pm2Data.map(p => ({
      name: p.name,
      status: p.pm2_env?.status || 'unknown',
      pid: p.pid || 0,
      uptime: p.pm2_env?.pm_uptime || 0
    }));
  } catch (e) {
    console.error('[architect] PM2 scan failed:', e.message);
  }

  // Vault sections
  try {
    const dirs = fs.readdirSync(VAULT_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
    infra.vaultSections = dirs;
  } catch {}

  // Existing project specs
  try {
    infra.existingProjects = fs.readdirSync(PROJECTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  } catch {}

  // Known endpoints
  infra.endpoints = [
    { url: 'localhost:8080', service: 'cath-bridge', type: 'REST API (vault read/write/search)' },
    { url: 'localhost:8888', service: 'cathedral-panel', type: 'Control panel UI' },
    { url: 'localhost:8000', service: 'cath-local', type: 'FastAPI (local LLM)' },
    { url: 'localhost:8080/predictive/map', service: 'predictive-intelligence', type: 'Interactive HTML' },
    { url: 'localhost:8080/techniques', service: 'technique-gallery', type: 'Dynamic HTML' },
    { url: 'localhost:8080/scraper/hub', service: 'intelligence-hub', type: 'Dashboard' }
  ];

  // Known agents
  infra.agents = [
    { name: 'Reed', role: 'Visual Director', commands: ['/reed', '/shots', '/lab'], status: 'live' },
    { name: 'Kit GM', role: 'Gym Manager', commands: ['/kit'], status: 'live' },
    { name: 'Researcher', role: 'Autonomous research', commands: ['/researcher'], status: 'live' },
    { name: 'Genius Council', role: '8 character council', commands: ['/council', '/genius'], status: 'live' },
    { name: 'Cath', role: 'Cathedral intelligence', commands: ['default chat'], status: 'live' },
    { name: 'Taste Map', role: 'Preference engine', commands: ['/taste'], status: 'live' }
  ];

  return infra;
}

/**
 * Format infrastructure as context string for LLM
 */
function formatInfraContext(infra) {
  const lines = ['## CATHEDRAL INFRASTRUCTURE (live scan)\n'];

  // PM2
  const online = infra.pm2.filter(p => p.status === 'online');
  const stopped = infra.pm2.filter(p => p.status === 'stopped');
  lines.push(`### Running Services (${online.length} online, ${stopped.length} stopped)`);
  online.forEach(p => lines.push(`  ✓ ${p.name}`));
  if (stopped.length > 5) {
    lines.push(`  ✗ ${stopped.length} stopped services`);
  } else {
    stopped.forEach(p => lines.push(`  ✗ ${p.name} (stopped)`));
  }

  // Vault
  lines.push(`\n### Vault Sections: ${infra.vaultSections.join(', ')}`);

  // Projects
  lines.push(`\n### Existing Project Specs (${infra.existingProjects.length}):`);
  infra.existingProjects.forEach(p => lines.push(`  - ${p}`));

  // Endpoints
  lines.push('\n### Live Endpoints:');
  infra.endpoints.forEach(e => lines.push(`  - ${e.url} → ${e.service} (${e.type})`));

  // Agents
  lines.push('\n### Active Agents:');
  infra.agents.forEach(a => lines.push(`  - ${a.name}: ${a.role} [${a.commands.join(', ')}]`));

  // Hardware
  lines.push(`\n### Hardware: ${infra.hardware.machine}`);
  infra.hardware.constraints.forEach(c => lines.push(`  ⚠️ ${c}`));

  return lines.join('\n');
}

// ── Template Library ────────────────────────────────────────────────────────

/**
 * Load available templates
 */
function loadTemplates() {
  try {
    return fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8'));
        return { name: f.replace('.json', ''), ...data };
      });
  } catch {
    return [];
  }
}

/**
 * Format templates as context
 */
function formatTemplateContext(templates) {
  if (templates.length === 0) return '';
  const lines = ['\n## AVAILABLE PLAN TEMPLATES\n'];
  templates.forEach(t => {
    lines.push(`- **${t.name}**: ${t.description || 'no description'}`);
    if (t.phases) {
      t.phases.forEach(p => lines.push(`    Phase: ${p.name} (${p.tasks?.length || 0} tasks)`));
    }
  });
  return lines.join('\n');
}

// ── Vault Search ────────────────────────────────────────────────────────────

/**
 * Search vault for related content
 */
function searchVault(query) {
  try {
    const raw = execSync(
      `python3 ${path.join(HOME, 'nanoclaw', 'vault_reader.py')} search "${query.replace(/"/g, '\\"')}" --top_k 5 --json`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Core Engine ─────────────────────────────────────────────────────────────

const ARCHITECT_SYSTEM = `You are the Architect — a structured decomposition engine for the Cathedral project system.

You take natural language intent and produce a STRUCTURED PROJECT PLAN as JSON.

RULES:
1. Every task has an ID (T1, T2...), name, dependencies (array of IDs), resource, and effort estimate
2. Tasks are grouped into phases (sequential phases, parallel tasks within phases)
3. Cross-reference with Cathedral infrastructure — if something already exists, reference it, don't rebuild it
4. Flag risks with specific mitigations
5. List Cathedral assets that are relevant (existing code, services, data, agents)
6. Be specific about resources: "Claude Code session", "Paul + iPhone", "PM2 cron", "existing API"
7. Effort in sessions (1 session ≈ 2-3 hours of focused work)
8. If a template fits, use its structure but customize to the specific intent

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences, no explanation:
{
  "project": "slug-name",
  "intent": "one sentence",
  "phases": [
    {
      "name": "Phase Name",
      "tasks": [
        { "id": "T1", "name": "task name", "depends": [], "resource": "what's needed", "effort": "estimate" }
      ]
    }
  ],
  "risks": [
    { "flag": "risk description", "mitigation": "how to handle" }
  ],
  "cathedral_assets": ["existing thing 1", "existing thing 2"],
  "template_used": "template-name or null",
  "estimated_total_sessions": 5
}`;

/**
 * Generate a structured plan from intent
 */
export async function generatePlan(intent) {
  const startMs = Date.now();
  console.log(`[architect] Generating plan for: "${intent.slice(0, 80)}"`);

  // Scan infrastructure
  const infra = scanInfrastructure();
  const infraContext = formatInfraContext(infra);

  // Load templates
  const templates = loadTemplates();
  const templateContext = formatTemplateContext(templates);

  // Search vault for related content
  const vaultResults = searchVault(intent);
  let vaultContext = '';
  if (vaultResults.length > 0) {
    vaultContext = '\n## RELATED VAULT CONTENT\n' +
      vaultResults.map(r => `- [${r.domain || 'unknown'}] ${r.title}: ${(r.first_line || '').slice(0, 150)}`).join('\n');
  }

  // Build prompt
  const userPrompt = `INTENT: ${intent}

${infraContext}
${templateContext}
${vaultContext}

Generate a structured project plan. Remember: reference existing Cathedral assets, don't propose rebuilding what exists. Be specific about dependencies between tasks.`;

  // Call DeepSeek
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 4096,
      temperature: 0.3,
      messages: [
        { role: 'system', content: ARCHITECT_SYSTEM },
        { role: 'user', content: userPrompt }
      ]
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`DeepSeek ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response from DeepSeek');

  // Parse JSON — strip markdown fences if present
  const cleaned = raw.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  let plan;
  try {
    plan = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse plan JSON: ${e.message}\nRaw: ${cleaned.slice(0, 300)}`);
  }

  // Enrich with metadata
  plan._meta = {
    generatedAt: new Date().toISOString(),
    intent,
    generationTimeMs: Date.now() - startMs,
    infraSnapshot: {
      onlineServices: infra.pm2.filter(p => p.status === 'online').length,
      existingProjects: infra.existingProjects.length,
      vaultResultsUsed: vaultResults.length
    }
  };

  // Save to output dir
  const slug = plan.project || intent.replace(/\W+/g, '-').slice(0, 40).toLowerCase();
  const outPath = path.join(OUTPUT_DIR, `${slug}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2));

  console.log(`[architect] Plan generated: ${slug} (${plan.phases?.length || 0} phases, ${Date.now() - startMs}ms)`);

  return plan;
}

// ── Mermaid Diagram ─────────────────────────────────────────────────────────

/**
 * Generate Mermaid dependency diagram from plan
 */
export function generateMermaid(plan) {
  const lines = ['graph TD'];

  // Collect all tasks
  const allTasks = [];
  for (const phase of (plan.phases || [])) {
    for (const task of (phase.tasks || [])) {
      allTasks.push({ ...task, phase: phase.name });
    }
  }

  // Add nodes with phase subgraphs
  for (const phase of (plan.phases || [])) {
    const phaseId = phase.name.replace(/\W+/g, '_');
    lines.push(`  subgraph ${phaseId}["${phase.name}"]`);
    for (const task of (phase.tasks || [])) {
      const label = `${task.id}: ${task.name}`;
      lines.push(`    ${task.id}["${label}"]`);
    }
    lines.push('  end');
  }

  // Add dependency edges
  for (const task of allTasks) {
    for (const dep of (task.depends || [])) {
      lines.push(`  ${dep} --> ${task.id}`);
    }
  }

  // Style
  lines.push('  classDef default fill:#1a1a2e,stroke:#e94560,color:#eee');

  return lines.join('\n');
}

// ── HTML Visualization ──────────────────────────────────────────────────────

/**
 * Generate interactive HTML visualization of plan
 */
export function generateHTML(plan) {
  const mermaid = generateMermaid(plan);
  const totalTasks = (plan.phases || []).reduce((sum, p) => sum + (p.tasks?.length || 0), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Architect: ${plan.project || 'Plan'}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0f; color: #e0e0e0; font-family: 'SF Mono', 'Fira Code', monospace; padding: 24px; }
  h1 { color: #e94560; font-size: 1.4rem; margin-bottom: 4px; }
  .intent { color: #888; font-size: 0.9rem; margin-bottom: 24px; }
  .meta { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
  .meta-card { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
  .meta-card .label { color: #888; font-size: 0.7rem; text-transform: uppercase; }
  .meta-card .value { color: #e94560; font-size: 1.4rem; font-weight: bold; }
  .diagram { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; padding: 24px; margin-bottom: 24px; overflow-x: auto; }
  .phase { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .phase-title { color: #e94560; font-size: 1.1rem; margin-bottom: 12px; }
  .task { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #222; align-items: flex-start; }
  .task:last-child { border-bottom: none; }
  .task-id { color: #e94560; font-weight: bold; min-width: 30px; }
  .task-name { flex: 1; }
  .task-deps { color: #888; font-size: 0.8rem; }
  .task-resource { color: #6b8f71; font-size: 0.8rem; }
  .task-effort { color: #c4a35a; font-size: 0.8rem; min-width: 80px; text-align: right; }
  .risks { background: #2a1a1a; border: 1px solid #4a2020; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .risk { padding: 6px 0; border-bottom: 1px solid #332020; }
  .risk:last-child { border-bottom: none; }
  .risk-flag { color: #e94560; }
  .risk-mitigation { color: #6b8f71; font-size: 0.85rem; margin-left: 16px; }
  .assets { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .asset { background: #162447; border: 1px solid #1f4068; border-radius: 4px; padding: 4px 10px; font-size: 0.8rem; color: #a8d8ea; }
  .section-title { color: #e94560; font-size: 1rem; margin: 24px 0 12px; text-transform: uppercase; letter-spacing: 1px; }
</style>
</head>
<body>
<h1>⚙️ ${plan.project || 'Project Plan'}</h1>
<div class="intent">${plan.intent || ''}</div>

<div class="meta">
  <div class="meta-card"><div class="label">Phases</div><div class="value">${(plan.phases || []).length}</div></div>
  <div class="meta-card"><div class="label">Tasks</div><div class="value">${totalTasks}</div></div>
  <div class="meta-card"><div class="label">Sessions</div><div class="value">${plan.estimated_total_sessions || '?'}</div></div>
  <div class="meta-card"><div class="label">Risks</div><div class="value">${(plan.risks || []).length}</div></div>
</div>

<div class="section-title">Dependency Graph</div>
<div class="diagram">
  <pre class="mermaid">
${mermaid}
  </pre>
</div>

<div class="section-title">Phases & Tasks</div>
${(plan.phases || []).map(phase => `
<div class="phase">
  <div class="phase-title">${phase.name}</div>
  ${(phase.tasks || []).map(t => `
  <div class="task">
    <div class="task-id">${t.id}</div>
    <div class="task-name">
      ${t.name}
      ${t.depends?.length ? `<div class="task-deps">depends: ${t.depends.join(', ')}</div>` : ''}
      <div class="task-resource">↳ ${t.resource || 'TBD'}</div>
    </div>
    <div class="task-effort">${t.effort || '?'}</div>
  </div>`).join('')}
</div>`).join('')}

${(plan.risks || []).length ? `
<div class="section-title">Risks</div>
<div class="risks">
  ${plan.risks.map(r => `
  <div class="risk">
    <div class="risk-flag">⚠️ ${r.flag}</div>
    <div class="risk-mitigation">→ ${r.mitigation}</div>
  </div>`).join('')}
</div>` : ''}

${(plan.cathedral_assets || []).length ? `
<div class="section-title">Cathedral Assets Used</div>
<div class="assets">
  ${plan.cathedral_assets.map(a => `<span class="asset">${a}</span>`).join('')}
</div>` : ''}

<script>mermaid.initialize({ theme: 'dark', startOnLoad: true });</script>
</body>
</html>`;
}

// ── Vault Deposit ───────────────────────────────────────────────────────────

/**
 * Save plan as vault project spec
 */
export function depositToVault(plan) {
  const slug = plan.project || 'unknown-project';
  const filePath = path.join(PROJECTS_DIR, `${slug}.md`);

  const totalTasks = (plan.phases || []).reduce((sum, p) => sum + (p.tasks?.length || 0), 0);

  let md = `# ${plan.project} — Architect Plan\n\n`;
  md += `## Status: PLANNED (${new Date().toISOString().split('T')[0]})\n\n`;
  md += `## Intent\n${plan.intent}\n\n`;
  md += `## Estimated: ${plan.estimated_total_sessions || '?'} sessions, ${totalTasks} tasks\n\n`;

  for (const phase of (plan.phases || [])) {
    md += `## Phase: ${phase.name}\n`;
    for (const t of (phase.tasks || [])) {
      md += `- **${t.id}** ${t.name}`;
      if (t.depends?.length) md += ` (depends: ${t.depends.join(', ')})`;
      md += ` — ${t.resource || 'TBD'} [${t.effort || '?'}]\n`;
    }
    md += '\n';
  }

  if (plan.risks?.length) {
    md += `## Risks\n`;
    plan.risks.forEach(r => {
      md += `- ⚠️ ${r.flag}\n  → ${r.mitigation}\n`;
    });
    md += '\n';
  }

  if (plan.cathedral_assets?.length) {
    md += `## Cathedral Assets\n`;
    plan.cathedral_assets.forEach(a => md += `- ${a}\n`);
  }

  fs.writeFileSync(filePath, md);
  return filePath;
}

// ── Format for Telegram ─────────────────────────────────────────────────────

/**
 * Format plan for Telegram display
 */
export function formatPlanTelegram(plan) {
  const totalTasks = (plan.phases || []).reduce((sum, p) => sum + (p.tasks?.length || 0), 0);

  let msg = `⚙️ *Architect: ${plan.project}*\n`;
  msg += `_${plan.intent}_\n\n`;
  msg += `📊 ${(plan.phases || []).length} phases · ${totalTasks} tasks · ~${plan.estimated_total_sessions || '?'} sessions\n\n`;

  for (const phase of (plan.phases || [])) {
    msg += `*${phase.name}*\n`;
    for (const t of (phase.tasks || [])) {
      const deps = t.depends?.length ? ` ←[${t.depends.join(',')}]` : '';
      msg += `  ${t.id} ${t.name}${deps} _[${t.effort || '?'}]_\n`;
    }
    msg += '\n';
  }

  if (plan.risks?.length) {
    msg += `*Risks:*\n`;
    plan.risks.forEach(r => msg += `  ⚠️ ${r.flag}\n`);
    msg += '\n';
  }

  if (plan.cathedral_assets?.length) {
    msg += `*Uses:* ${plan.cathedral_assets.join(', ')}`;
  }

  return msg;
}

/**
 * List all generated plans
 */
export function listPlans() {
  try {
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf8'));
        return {
          file: f,
          project: data.project,
          intent: data.intent,
          phases: data.phases?.length || 0,
          generatedAt: data._meta?.generatedAt || 'unknown'
        };
      } catch {
        return { file: f, project: 'parse-error' };
      }
    });
  } catch {
    return [];
  }
}

export default {
  generatePlan,
  generateMermaid,
  generateHTML,
  depositToVault,
  formatPlanTelegram,
  listPlans,
  scanInfrastructure
};
