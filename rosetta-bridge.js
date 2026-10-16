// Rosetta Bridge — Ancient ↔ Modern Convergence Cross-Reference
// Maps 39 ancient civilisation convergences against 59 Cathedral cognitive convergences
// Finds structural isomorphisms between how civilisations think and how Paul thinks
// The unique asset: nobody else has both datasets

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ANCIENT_FILE = '/Volumes/KINGSTON2/cathedral-archive/rosetta/convergences.json';
const CATHEDRAL_FILE = '/Users/basicclaw777/cathedral-vault/00_Staging/cathedral/cathedral-convergences.json';
const OUTPUT_DIR = '/Users/basicclaw777/cathedral-vault/00_Staging/cathedral';
const DASHBOARD_FILE = '/Users/basicclaw777/nanoclaw/rosetta-bridge-dashboard.html';

// Load env
const envPath = '/Users/basicclaw777/nanoclaw/.env';
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const DEEPSEEK_KEY = env.DEEPSEEK_API_KEY;
const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
const CHAT_ID = env.PAUL_CHAT_ID;

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) { /* silent */ }
}

async function callDeepSeek(messages, jsonMode = false) {
  const body = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.15,
    max_tokens: 4000
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  if (!data || data.error) throw new Error(data?.error?.message || 'Empty response');
  if (!data.choices || !data.choices[0]) throw new Error('No choices in response');
  return data.choices[0].message.content;
}

// ─── Bridge Analysis ───

async function findBridges(ancientConvergences, cathedralConvergences) {
  // Chunk: send batches of ancient convergences against cathedral convergences
  // Compact summaries to fit token limits
  const ancientSummary = ancientConvergences.map(c =>
    `[${c.grade}] ${c.pattern} (${c.domain}) — ${(c.corpora || []).join(', ')}`
  ).join('\n');

  const cathedralSummary = cathedralConvergences.map(c =>
    `[${c.grade}] ${c.pattern} (${c.analysisDomain}) — ${(c.domains || []).join(', ')}`
  ).join('\n');

  // Phase 1: Split into two chunks to avoid token overflow
  console.log('  Phase 1a: Finding structural bridges (batch 1)...');
  const ancientHalf1 = ancientConvergences.slice(0, 20);
  const ancientHalf2 = ancientConvergences.slice(20);

  let bridges = [];

  for (let batch = 0; batch < 2; batch++) {
    const ancientBatch = batch === 0 ? ancientHalf1 : ancientHalf2;
    if (ancientBatch.length === 0) continue;
    if (batch === 1) console.log('  Phase 1b: Finding structural bridges (batch 2)...');

    const batchSummary = ancientBatch.map(c =>
      `[${c.grade}] ${c.pattern} (${c.domain}) — ${(c.corpora || []).join(', ')}`
    ).join('\n');

    const structuralResult = await callDeepSeek([
      {
        role: 'system',
        content: `Cross-reference ancient civilisation convergences against modern cognitive convergences. Find STRUCTURAL ISOMORPHISMS — same underlying architecture at different scales. Not metaphors.

Return JSON: {"bridges":[...]} where each bridge has:
- ancient_pattern, modern_pattern (names from the lists)
- structural_link (1-2 sentences: what makes these the SAME pattern)
- scale_mapping (1 sentence: civilisation scale vs individual scale)
- grade: S (structural identity), A (strong), B (probable), C (suggestive)
- universality (1 sentence)
- prediction (1 sentence: what to look for next)

Keep descriptions SHORT. Max 15 bridges per batch.`
      },
      {
        role: 'user',
        content: `ANCIENT (batch ${batch + 1}):\n${batchSummary}\n\nMODERN (all 59):\n${cathedralSummary}\n\nFind structural bridges.`
      }
    ], true);

    try {
      const parsed = JSON.parse(structuralResult);
      const items = parsed.bridges || parsed;
      if (Array.isArray(items)) bridges.push(...items);
    } catch (err) {
      console.error(`  Parse error in phase 1 batch ${batch + 1}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  await new Promise(r => setTimeout(r, 500));

  // Phase 2: The deep question — are Paul's 5 moves civilisation universals?
  console.log('  Phase 2: Testing the 5 moves as civilisation universals...');
  const movesResult = await callDeepSeek([
    {
      role: 'system',
      content: `You are testing a hypothesis: One person's cognitive architecture (Paul) uses 5 recurring moves across all his domains. The question is whether these SAME 5 moves appear in the ancient civilisation convergences — which would mean they are human universals, not personal quirks.

The 5 moves:
1. THE GATE — threshold filtering, layered checks, signal must pass through coherent barriers
2. THE BROKEN LOOP — dysfunction diagnosed as severed feedback; repair = restore the loop
3. SIGNAL IN NOISE — pattern recognition to extract truth from interference
4. CALIBRATE→EXECUTE→OBSERVE — closed-loop feedback cycle
5. PHI AS RULER — golden ratio as coherence test across domains

Return JSON with "move_tests" array. Each test has:
- move: which of the 5 moves
- ancient_evidence: specific ancient convergences that show this SAME structural move at civilisation scale
- structural_proof: why this is the same move (not just similar topic)
- verdict: UNIVERSAL (proven across both scales), PROBABLE (strong evidence), PERSONAL (only in modern), INSUFFICIENT (can't determine)
- counter_evidence: anything that weakens the case
- implications: if this IS universal, what does that mean?`
    },
    {
      role: 'user',
      content: `ANCIENT CONVERGENCES:\n${ancientSummary}\n\nTest each of the 5 cognitive moves against the ancient evidence.`
    }
  ], true);

  let moveTests = [];
  try {
    const parsed = JSON.parse(movesResult);
    moveTests = parsed.move_tests || parsed;
  } catch (err) {
    console.error('  Parse error in phase 2:', err.message);
  }

  await new Promise(r => setTimeout(r, 500));

  // Phase 3: Predictions — what should we find next?
  console.log('  Phase 3: Generating predictions from bridges...');
  const predictResult = await callDeepSeek([
    {
      role: 'system',
      content: `Based on bridges between ancient civilisation patterns and modern cognitive patterns, generate TESTABLE PREDICTIONS. Each prediction should be something that can be verified by:
1. Looking in an existing Cathedral domain where the pattern hasn't been found yet
2. Looking in a specific ancient corpus for a pattern the modern analysis predicts
3. Entering a new domain and applying the pattern to see if it produces insight

Return JSON with "predictions" array. Each prediction has:
- prediction: clear testable statement
- basis: which bridge(s) generate this prediction
- test_method: how to verify
- domain: where to look
- confidence: HIGH / MEDIUM / LOW
- novelty: why nobody would look here without both Rossettae`
    },
    {
      role: 'user',
      content: `BRIDGES FOUND:\n${JSON.stringify(bridges.slice(0, 15), null, 2)}\n\nMOVE TESTS:\n${JSON.stringify(moveTests, null, 2)}\n\nGenerate predictions.`
    }
  ], true);

  let predictions = [];
  try {
    const parsed = JSON.parse(predictResult);
    predictions = parsed.predictions || parsed;
  } catch (err) {
    console.error('  Parse error in phase 3:', err.message);
  }

  return { bridges, moveTests, predictions };
}

// ─── Dashboard ───

function generateDashboard(bridges, moveTests, predictions, ancientCount, cathedralCount) {
  const gradeS = bridges.filter(b => b.grade === 'S');
  const gradeA = bridges.filter(b => b.grade === 'A');
  const gradeB = bridges.filter(b => b.grade === 'B');
  const universals = moveTests.filter(m => m.verdict === 'UNIVERSAL');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rosetta Bridge — Ancient ↔ Modern</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0f; color: #e0e0e8; font-family: 'DM Sans', system-ui, sans-serif; }

  .header { padding: 32px 40px 20px; border-bottom: 1px solid #1a1a2e; }
  .header h1 { font-family: 'Bebas Neue', system-ui; font-size: 42px; letter-spacing: 2px; color: #fff; }
  .header .subtitle { color: #8888aa; font-size: 14px; margin-top: 4px; }

  .stats-bar { display: flex; gap: 32px; padding: 20px 40px; background: #0d0d14; border-bottom: 1px solid #1a1a2e; flex-wrap: wrap; }
  .stat .value { font-size: 28px; font-weight: 700; color: #fff; font-family: 'Share Tech Mono', monospace; }
  .stat .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }

  .tabs { display: flex; gap: 0; padding: 0 40px; border-bottom: 1px solid #1a1a2e; background: #0d0d14; }
  .tab { padding: 12px 24px; cursor: pointer; color: #666; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid transparent; transition: all 0.2s; }
  .tab:hover { color: #aaa; }
  .tab.active { color: #d97706; border-bottom-color: #d97706; }

  .content { padding: 32px 40px; max-width: 1400px; }
  .view { display: none; }
  .view.active { display: block; }

  /* Bridge cards */
  .bridge-card { background: #12121a; border: 1px solid #1a1a2e; border-radius: 12px; padding: 24px; margin-bottom: 20px; transition: border-color 0.2s; }
  .bridge-card:hover { border-color: #333; }
  .bridge-card.grade-s { border-left: 4px solid #f59e0b; }
  .bridge-card.grade-a { border-left: 4px solid #22c55e; }
  .bridge-card.grade-b { border-left: 4px solid #3b82f6; }

  .bridge-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .bridge-grade { font-size: 13px; font-weight: 700; padding: 3px 10px; border-radius: 4px; }
  .bridge-grade.s { background: #f59e0b22; color: #f59e0b; }
  .bridge-grade.a { background: #22c55e22; color: #22c55e; }
  .bridge-grade.b { background: #3b82f622; color: #3b82f6; }

  .bridge-sides { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; margin-bottom: 16px; }
  .bridge-side { padding: 12px 16px; border-radius: 8px; }
  .bridge-side.ancient { background: #d9770611; border: 1px solid #d9770633; }
  .bridge-side.modern { background: #8b5cf611; border: 1px solid #8b5cf633; }
  .bridge-side .side-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .bridge-side.ancient .side-label { color: #d97706; }
  .bridge-side.modern .side-label { color: #8b5cf6; }
  .bridge-side .side-pattern { font-size: 15px; font-weight: 600; color: #fff; }
  .bridge-connector { display: flex; align-items: center; justify-content: center; font-size: 24px; color: #444; }

  .bridge-link { font-size: 14px; color: #ccc; line-height: 1.6; margin-bottom: 12px; }
  .bridge-scale { font-size: 13px; color: #999; line-height: 1.5; padding: 10px 14px; background: #0a0a0f; border-radius: 6px; margin-bottom: 12px; }
  .bridge-prediction { font-size: 12px; color: #d97706; background: rgba(217,119,6,0.1); padding: 8px 12px; border-radius: 6px; line-height: 1.4; }
  .bridge-universality { font-size: 13px; color: #22c55e; margin-bottom: 8px; font-style: italic; }

  /* Move tests */
  .move-card { background: #12121a; border: 1px solid #1a1a2e; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .move-name { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .move-verdict { display: inline-block; font-size: 12px; padding: 3px 12px; border-radius: 4px; font-weight: 600; margin-bottom: 12px; }
  .move-verdict.universal { background: #f59e0b22; color: #f59e0b; }
  .move-verdict.probable { background: #22c55e22; color: #22c55e; }
  .move-verdict.personal { background: #8b5cf622; color: #8b5cf6; }
  .move-verdict.insufficient { background: #66666622; color: #888; }
  .move-evidence { font-size: 13px; color: #aaa; line-height: 1.5; margin-bottom: 10px; }
  .move-proof { font-size: 13px; color: #ccc; line-height: 1.5; margin-bottom: 10px; }
  .move-implications { font-size: 13px; color: #d97706; background: rgba(217,119,6,0.08); padding: 10px 14px; border-radius: 6px; line-height: 1.5; }
  .move-counter { font-size: 12px; color: #ef4444; margin-top: 8px; }

  /* Predictions */
  .pred-card { background: #12121a; border: 1px solid #1a1a2e; border-radius: 10px; padding: 20px; margin-bottom: 14px; }
  .pred-text { font-size: 14px; color: #fff; font-weight: 500; margin-bottom: 8px; line-height: 1.4; }
  .pred-meta { font-size: 12px; color: #888; margin-bottom: 6px; }
  .pred-test { font-size: 12px; color: #22c55e; }
  .pred-confidence { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 3px; margin-right: 8px; }
  .pred-confidence.high { background: #22c55e22; color: #22c55e; }
  .pred-confidence.medium { background: #f59e0b22; color: #f59e0b; }
  .pred-confidence.low { background: #66666622; color: #888; }

  .section-title { font-size: 20px; font-weight: 600; color: #fff; margin-bottom: 8px; }
  .section-desc { font-size: 13px; color: #666; margin-bottom: 24px; line-height: 1.5; }

  @media (max-width: 768px) {
    .header { padding: 20px; }
    .content { padding: 20px; }
    .bridge-sides { grid-template-columns: 1fr; }
    .bridge-connector { transform: rotate(90deg); }
    .stats-bar { gap: 16px; padding: 16px 20px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>ROSETTA BRIDGE</h1>
  <div class="subtitle">Ancient Civilisation Patterns ↔ Modern Cognitive Architecture — ${new Date().toISOString().split('T')[0]}</div>
</div>

<div class="stats-bar">
  <div class="stat"><div class="value">${ancientCount}</div><div class="label">Ancient Patterns</div></div>
  <div class="stat"><div class="value">${cathedralCount}</div><div class="label">Cathedral Patterns</div></div>
  <div class="stat"><div class="value">${bridges.length}</div><div class="label">Bridges Found</div></div>
  <div class="stat"><div class="value" style="color:#f59e0b">${gradeS.length}</div><div class="label">Grade S</div></div>
  <div class="stat"><div class="value" style="color:#22c55e">${gradeA.length}</div><div class="label">Grade A</div></div>
  <div class="stat"><div class="value" style="color:#3b82f6">${gradeB.length}</div><div class="label">Grade B</div></div>
  <div class="stat"><div class="value" style="color:#f59e0b">${universals.length}/5</div><div class="label">Universal Moves</div></div>
  <div class="stat"><div class="value">${predictions.length}</div><div class="label">Predictions</div></div>
</div>

<div class="tabs">
  <div class="tab active" onclick="showView('bridges')">Bridges</div>
  <div class="tab" onclick="showView('moves')">5 Moves Test</div>
  <div class="tab" onclick="showView('predictions')">Predictions</div>
</div>

<div class="content">

  <!-- Bridges View -->
  <div class="view active" id="view-bridges">
    <div class="section-title">Structural Bridges</div>
    <div class="section-desc">Places where an ancient civilisation-scale pattern is the SAME structural move as a modern cognitive pattern. Not metaphors — isomorphisms.</div>
    <div id="bridges-list"></div>
  </div>

  <!-- Moves View -->
  <div class="view" id="view-moves">
    <div class="section-title">The 5 Moves — Civilisation Universal Test</div>
    <div class="section-desc">Testing whether Paul's 5 cognitive moves appear at civilisation scale across independent ancient traditions. UNIVERSAL = confirmed at both scales.</div>
    <div id="moves-list"></div>
  </div>

  <!-- Predictions View -->
  <div class="view" id="view-predictions">
    <div class="section-title">Predictions from the Bridge</div>
    <div class="section-desc">Testable predictions generated by cross-referencing both Rossettae. Things nobody would look for without both datasets.</div>
    <div id="predictions-list"></div>
  </div>

</div>

<script>
const bridges = ${JSON.stringify(bridges)};
const moveTests = ${JSON.stringify(moveTests)};
const predictions = ${JSON.stringify(predictions)};

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  event.target.classList.add('active');
}

// Render bridges
document.getElementById('bridges-list').innerHTML = [...bridges]
  .sort((a, b) => {
    const order = { S: 0, A: 1, B: 2, C: 3 };
    return (order[a.grade] || 4) - (order[b.grade] || 4);
  })
  .map(b => \`
    <div class="bridge-card grade-\${(b.grade || 'b').toLowerCase()}">
      <div class="bridge-header">
        <span class="bridge-grade \${(b.grade || 'b').toLowerCase()}">\${b.grade || '?'}</span>
      </div>
      <div class="bridge-sides">
        <div class="bridge-side ancient">
          <div class="side-label">Ancient (5 civilisations)</div>
          <div class="side-pattern">\${b.ancient_pattern || ''}</div>
        </div>
        <div class="bridge-connector">=</div>
        <div class="bridge-side modern">
          <div class="side-label">Cathedral (14 domains)</div>
          <div class="side-pattern">\${b.modern_pattern || ''}</div>
        </div>
      </div>
      <div class="bridge-link">\${b.structural_link || ''}</div>
      <div class="bridge-scale">\${b.scale_mapping || ''}</div>
      \${b.universality ? \`<div class="bridge-universality">\${b.universality}</div>\` : ''}
      \${b.prediction ? \`<div class="bridge-prediction">\${b.prediction}</div>\` : ''}
    </div>
  \`).join('');

// Render move tests
document.getElementById('moves-list').innerHTML = moveTests.map(m => \`
  <div class="move-card">
    <div class="move-name">\${m.move || ''}</div>
    <span class="move-verdict \${(m.verdict || '').toLowerCase()}">\${m.verdict || ''}</span>
    <div class="move-evidence">\${m.ancient_evidence || ''}</div>
    <div class="move-proof">\${m.structural_proof || ''}</div>
    \${m.implications ? \`<div class="move-implications">\${m.implications}</div>\` : ''}
    \${m.counter_evidence ? \`<div class="move-counter">\${m.counter_evidence}</div>\` : ''}
  </div>
\`).join('');

// Render predictions
document.getElementById('predictions-list').innerHTML = predictions.map(p => \`
  <div class="pred-card">
    <div class="pred-text">\${p.prediction || ''}</div>
    <div class="pred-meta">
      <span class="pred-confidence \${(p.confidence || '').toLowerCase()}">\${p.confidence || ''}</span>
      Basis: \${p.basis || ''} | Domain: \${p.domain || ''}
    </div>
    <div class="pred-test">\${p.test_method || ''}</div>
    \${p.novelty ? \`<div style="font-size:11px;color:#666;margin-top:6px">\${p.novelty}</div>\` : ''}
  </div>
\`).join('');
</script>
</body>
</html>`;
}

// ─── Main ───

async function run() {
  console.log('Loading both Rossettae...');
  const ancient = JSON.parse(readFileSync(ANCIENT_FILE, 'utf8'));
  const cathedral = JSON.parse(readFileSync(CATHEDRAL_FILE, 'utf8'));

  console.log(`  Ancient: ${ancient.convergences.length} convergences across 5 civilisations`);
  console.log(`  Cathedral: ${cathedral.convergences.length} convergences across 14 domains`);

  console.log('\nBuilding the bridge...');
  const { bridges, moveTests, predictions } = await findBridges(ancient.convergences, cathedral.convergences);

  console.log(`\n  Bridges found: ${bridges.length}`);
  const gradeS = bridges.filter(b => b.grade === 'S');
  const gradeA = bridges.filter(b => b.grade === 'A');
  console.log(`  Grade S: ${gradeS.length}, Grade A: ${gradeA.length}`);

  const universals = moveTests.filter(m => m.verdict === 'UNIVERSAL');
  const probable = moveTests.filter(m => m.verdict === 'PROBABLE');
  console.log(`  Universal moves: ${universals.length}/5, Probable: ${probable.length}/5`);
  console.log(`  Predictions: ${predictions.length}`);

  // Save data
  const output = {
    generated: new Date().toISOString(),
    ancientConvergences: ancient.convergences.length,
    cathedralConvergences: cathedral.convergences.length,
    bridges,
    moveTests,
    predictions,
    summary: {
      totalBridges: bridges.length,
      gradeS: gradeS.length,
      gradeA: gradeA.length,
      universalMoves: universals.length,
      predictions: predictions.length
    }
  };

  writeFileSync(join(OUTPUT_DIR, 'rosetta-bridge.json'), JSON.stringify(output, null, 2));

  // Generate dashboard
  console.log('\nGenerating dashboard...');
  const html = generateDashboard(bridges, moveTests, predictions, ancient.convergences.length, cathedral.convergences.length);
  writeFileSync(DASHBOARD_FILE, html);

  // Report
  const report = [
    `*Rosetta Bridge — Ancient to Modern*`,
    ``,
    `Ancient: ${ancient.convergences.length} patterns (5 civilisations, 612K entities)`,
    `Cathedral: ${cathedral.convergences.length} patterns (14 domains, 7.4K files)`,
    ``,
    `Bridges: ${bridges.length} (${gradeS.length} Grade S, ${gradeA.length} Grade A)`,
    `Universal moves: ${universals.length}/5`,
    `Predictions: ${predictions.length}`,
    ``
  ];

  if (gradeS.length > 0) {
    report.push(`*Grade S — Structural Identity:*`);
    for (const b of gradeS.slice(0, 5)) {
      report.push(`• ${b.ancient_pattern} = ${b.modern_pattern}`);
    }
    report.push('');
  }

  if (gradeA.length > 0) {
    report.push(`*Grade A — Strong Isomorphisms:*`);
    for (const b of gradeA.slice(0, 8)) {
      report.push(`• ${b.ancient_pattern} = ${b.modern_pattern}`);
    }
    report.push('');
  }

  report.push(`*Universal Moves:*`);
  for (const m of moveTests) {
    report.push(`• ${m.move}: ${m.verdict}`);
  }

  report.push('');
  report.push(`Dashboard: localhost:8080/rosetta-bridge`);

  const reportText = report.join('\n');
  console.log(`\n${reportText}`);
  await sendTelegram(reportText);

  console.log(`\nDashboard: ${DASHBOARD_FILE}`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
