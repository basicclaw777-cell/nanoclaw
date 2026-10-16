// ── Bias Space Mapper — Cognitive Error Periodic Table ────────────────────────
// Maps documented cognitive biases into a structured space by:
//   - Information processing stage (attention, encoding, retrieval, update, output)
//   - Error type (overweight, underweight, substitute, delete, invert, anchor)
// Finds structural gaps = predicted but undocumented biases.
// Checks Cathedral agents for known susceptibility.
//
// Uses existing embedding infra (nomic-embed via Ollama).
// Zero external API calls for the core map. DeepSeek for gap analysis only.
//
// Telegram: /bias-map
// CLI: node bias-mapper.js
// ──────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const OLLAMA_URL = 'http://localhost:11434';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;
const OUTPUT_DIR = path.join(HOME, 'nanoclaw', 'bias-mapper-output');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── The Documented Bias Catalogue ───────────────────────────────────────────
// 80 well-documented biases, classified by processing stage and error type.
// Source: Kahneman/Tversky, Gigerenzer, Ariely, Thaler, Wikipedia cognitive bias codex.
// Each entry is: [name, stage, errorType, description, cathedralRelevance]

const PROCESSING_STAGES = ['attention', 'encoding', 'retrieval', 'update', 'output'];
const ERROR_TYPES = ['overweight', 'underweight', 'substitute', 'delete', 'invert', 'anchor'];

const BIASES = [
  // ATTENTION stage
  ['Attentional Bias', 'attention', 'overweight', 'Recurring thoughts direct attention to emotionally dominant stimuli', 'Agents over-attend to domains with recent activity'],
  ['Inattentional Blindness', 'attention', 'delete', 'Failure to notice unexpected stimulus in plain sight', 'Vault orphans — 191 principles nobody sees'],
  ['Change Blindness', 'attention', 'delete', 'Failure to detect changes in visual scene', 'Slow drift in agent behavior goes unnoticed'],
  ['Cocktail Party Effect', 'attention', 'overweight', 'Selective attention to personally relevant stimuli', 'Taste map anchors create tunnel vision'],
  ['Frequency Illusion (Baader-Meinhof)', 'attention', 'overweight', 'Recently learned concept seems to appear everywhere', 'New vault topics get over-detected in subsequent sessions'],
  ['Salience Bias', 'attention', 'overweight', 'Prominent features receive disproportionate weight', 'Loud agents (Muse) get more attention than quiet ones (Groundskeeper)'],
  ['Selective Perception', 'attention', 'substitute', 'Expectations shape what is perceived', 'Searching vault for confirmation of existing theory'],
  ['Attention Tunneling', 'attention', 'delete', 'Narrow focus causes peripheral blindness', 'Deep research sessions miss cross-domain signals'],

  // ENCODING stage
  ['Anchoring', 'encoding', 'anchor', 'First piece of information dominates subsequent judgments', 'First agent response anchors roundtable consensus'],
  ['Framing Effect', 'encoding', 'substitute', 'Decision changes based on how information is presented', 'Same finding framed as discovery vs warning gets different treatment'],
  ['Availability Heuristic', 'encoding', 'overweight', 'Easily recalled events seem more probable', 'Recent session harvests dominate morning briefing'],
  ['Representativeness Heuristic', 'encoding', 'substitute', 'Judging probability by similarity to prototype', 'Classifying new techniques by surface similarity to known ones'],
  ['Primacy Effect', 'encoding', 'anchor', 'First items in sequence weighted more heavily', 'First strategy in trading roundtable sets the frame'],
  ['Recency Effect', 'encoding', 'overweight', 'Most recent information weighted more heavily', 'Latest session harvest overweights older but richer findings'],
  ['Halo Effect', 'encoding', 'overweight', 'One positive trait colors perception of everything else', 'High-scoring strategy gets benefit of doubt on bad trades'],
  ['Stereotyping', 'encoding', 'substitute', 'Categorization replaces individual assessment', 'Domain labels prevent cross-domain discovery'],
  ['Contrast Effect', 'encoding', 'invert', 'Judgment distorted by comparison to adjacent stimulus', 'Mediocre finding looks great after a run of noise'],
  ['Clustering Illusion', 'encoding', 'overweight', 'Seeing patterns in random sequences', 'Trading strategies finding signal in random price movements'],
  ['Illusion of Validity', 'encoding', 'overweight', 'Confidence in judgment exceeds accuracy', 'High-convergence roundtable score doesnt mean the call is right'],
  ['Conjunction Fallacy', 'encoding', 'overweight', 'Specific conditions judged more probable than general ones', 'Complex multi-strategy confluence feels more reliable than it is'],

  // RETRIEVAL stage
  ['Hindsight Bias', 'retrieval', 'substitute', 'Past events seem predictable after the fact', 'Meta-watcher counterfactuals look obvious in retrospect'],
  ['Recall Bias', 'retrieval', 'overweight', 'Certain memories are more accessible, distorting recall', 'Vault search returns recent over historical nuggets'],
  ['Mood-Congruent Memory', 'retrieval', 'overweight', 'Current mood biases which memories surface', 'Cath-state affects what vault context is retrieved'],
  ['Source Confusion', 'retrieval', 'substitute', 'Misattributing the origin of a memory', 'Agent attributing insight to wrong vault note or wrong session'],
  ['Misinformation Effect', 'retrieval', 'substitute', 'Post-event information alters memory of original event', 'Session harvests rewrite what actually happened in conversation'],
  ['Cryptomnesia', 'retrieval', 'delete', 'Failing to recognize a memory as a memory — thinking its new', 'Muse re-discovering something already in vault as novel'],
  ['Telescoping Effect', 'retrieval', 'substitute', 'Recent events feel further away, distant events feel closer', 'Misjudging when a build was completed or principle was filed'],
  ['Spacing Effect', 'retrieval', 'underweight', 'Spaced repetition aids memory but massed practice feels productive', 'Daily agent pulses vs weekly deep dives — daily feels more productive'],

  // UPDATE stage (belief revision)
  ['Confirmation Bias', 'update', 'overweight', 'Seeking/interpreting info that confirms existing beliefs', 'Bandit exploiting known-good domains, ignoring cold ones'],
  ['Anchoring in Update', 'update', 'anchor', 'Insufficient adjustment from initial value', 'Strategy P&L anchors future confidence regardless of new evidence'],
  ['Conservatism Bias', 'update', 'underweight', 'Insufficient updating when new evidence arrives', 'Slow to demote eliminated strategies even with bad data'],
  ['Base Rate Neglect', 'update', 'delete', 'Ignoring prior probability in favor of specific evidence', 'Individual trade outcome overweights base rate of strategy performance'],
  ['Belief Perseverance', 'update', 'anchor', 'Maintaining belief after evidence is discredited', 'Keeping faith in Cymatics strategy despite weak results'],
  ['Bandwagon Effect', 'update', 'overweight', 'Adopting beliefs because many others hold them', 'Roundtable convergence reinforcing groupthink'],
  ['Reactance', 'update', 'invert', 'Adopting opposite position when freedom is threatened', 'Contrarian signals in trading — healthy or reactive?'],
  ['Dunning-Kruger Effect', 'update', 'overweight', 'Low competence paired with high confidence', 'New strategies with few trades showing inflated win rates'],
  ['Sunk Cost Fallacy', 'update', 'anchor', 'Continuing because of past investment, not future value', 'Keeping a failing PM2 process running because it was hard to build'],
  ['Status Quo Bias', 'update', 'anchor', 'Preferring current state of affairs', 'Resistance to eliminating underperforming strategies'],
  ['Omission Bias', 'update', 'delete', 'Preferring inaction over action even when action is better', 'Not wiring vault-dig because existing tools feel sufficient'],
  ['Normalcy Bias', 'update', 'underweight', 'Underestimating probability of unprecedented events', 'Assuming trading experiment will continue in current regime'],
  ['Zero-Risk Bias', 'update', 'overweight', 'Preferring complete elimination of one risk over larger overall reduction', 'Over-engineering one safety net while leaving bigger gaps'],
  ['Endowment Effect', 'update', 'overweight', 'Overvaluing what you already own', 'Overvaluing existing vault content vs new external findings'],

  // OUTPUT stage (decision/communication)
  ['Overconfidence Effect', 'output', 'overweight', 'Confidence intervals too narrow', 'Strategy validator confidence exceeds actual prediction accuracy'],
  ['Planning Fallacy', 'output', 'underweight', 'Underestimating time/cost/risk for future tasks', 'Build estimates always shorter than reality'],
  ['Optimism Bias', 'output', 'overweight', 'Overestimating probability of positive outcomes', 'Paper trading profits assumed to transfer to real money'],
  ['Pessimism Bias', 'output', 'overweight', 'Overestimating probability of negative outcomes', 'WHY.md wound — assuming investment will always lose'],
  ['Curse of Knowledge', 'output', 'delete', 'Assuming others know what you know', 'Agent system prompts assuming context that isnt loaded'],
  ['Illusory Superiority', 'output', 'overweight', 'Overestimating own abilities relative to others', 'Cathedral assuming it has better architecture than it does'],
  ['Projection Bias', 'output', 'substitute', 'Projecting current preferences onto future self', 'Taste map anchors assumed stable when they evolve'],
  ['Impact Bias', 'output', 'overweight', 'Overestimating emotional impact of future events', 'Imagining Phase 1 real-money trading as scarier than it will be'],
  ['Denomination Effect', 'output', 'substitute', 'Spending patterns change with denomination size', 'DeepSeek at $0.001/call feels free — $20 bill shows its not'],
  ['Decoy Effect', 'output', 'substitute', 'Adding a dominated option changes preference between others', 'Strategy comparisons shift when a weak benchmark is added'],
  ['IKEA Effect', 'output', 'overweight', 'Overvaluing things you built yourself', 'Valuing Cathedral agents more than off-the-shelf tools that might work better'],
  ['Not Invented Here', 'output', 'delete', 'Rejecting external solutions in favor of internal builds', 'Building instead of using existing open-source when it fits'],
  ['Narrative Fallacy', 'output', 'substitute', 'Creating explanatory stories for random events', 'Trading post-hoc explanations for why a strategy won or lost'],
  ['Survivorship Bias', 'output', 'delete', 'Drawing conclusions from survivors, ignoring failures', 'Strategy leaderboard shows winners — eliminated strategies forgotten'],
  ['Automation Bias', 'output', 'overweight', 'Over-trusting automated system output', 'Trusting roundtable convergence score as ground truth'],
];

// ── Gap Analysis ────────────────────────────────────────────────────────────

function buildBiasSpace() {
  // Count biases per cell in the stage × error grid
  const grid = {};
  for (const stage of PROCESSING_STAGES) {
    grid[stage] = {};
    for (const err of ERROR_TYPES) {
      grid[stage][err] = [];
    }
  }

  for (const [name, stage, errorType] of BIASES) {
    if (grid[stage] && grid[stage][errorType]) {
      grid[stage][errorType].push(name);
    }
  }

  // Find gaps (cells with 0 or 1 entries)
  const gaps = [];
  const populated = [];
  for (const stage of PROCESSING_STAGES) {
    for (const err of ERROR_TYPES) {
      const count = grid[stage][err].length;
      if (count <= 1) {
        gaps.push({ stage, errorType: err, count, existing: grid[stage][err] });
      } else {
        populated.push({ stage, errorType: err, count, examples: grid[stage][err].slice(0, 3) });
      }
    }
  }

  return { grid, gaps, populated, total: BIASES.length };
}

// ── Cathedral Agent Susceptibility ──────────────────────────────────────────

function assessAgentSusceptibility() {
  const findings = [];

  // Map known Cathedral failure modes to biases
  const knownFailures = [
    { bias: 'Confirmation Bias', system: 'Bandit Brain', evidence: 'Thompson sampling exploitation bias — 73% allocation to external mining before vault-dig rewire', severity: 'HIGH' },
    { bias: 'Inattentional Blindness', system: 'Knowledge Graph', evidence: '88% orphan rate — 485/554 clustered nuggets have zero cross-domain links', severity: 'HIGH' },
    { bias: 'Survivorship Bias', system: 'Strategy Leaderboard', evidence: 'Eliminated strategies disappear from view — their lessons lost', severity: 'MEDIUM' },
    { bias: 'Anchoring', system: 'Roundtable', evidence: 'First speaker in sequential roundtable sets the frame for subsequent agents', severity: 'MEDIUM' },
    { bias: 'Automation Bias', system: 'Convergence Score', evidence: 'STRONG_LONG (10/10) treated as high-confidence signal — but convergence doesnt equal accuracy', severity: 'MEDIUM' },
    { bias: 'Cryptomnesia', system: 'Muse', evidence: 'Muse occasionally re-surfaces findings already in vault as novel discoveries', severity: 'LOW' },
    { bias: 'Sunk Cost Fallacy', system: 'PM2 Manifest', evidence: 'Processes kept running because they were hard to build, not because theyre useful', severity: 'MEDIUM' },
    { bias: 'IKEA Effect', system: 'Cathedral Architecture', evidence: 'Preferring custom builds over existing open-source tools (QuantMind parked, but should it be?)', severity: 'LOW' },
    { bias: 'Denomination Effect', system: 'DeepSeek Spend', evidence: '$0.001/call feels free until $20 bill arrives. Archaeologist 6019-call burn.', severity: 'HIGH' },
    { bias: 'Planning Fallacy', system: 'Build Estimates', evidence: 'Phase 1 consistently expands. Every "quick wire" takes a session.', severity: 'MEDIUM' },
    { bias: 'Recency Effect', system: 'Morning Briefing', evidence: 'Latest session harvest dominates briefing, older richer findings decay', severity: 'MEDIUM' },
    { bias: 'Not Invented Here', system: 'Infrastructure', evidence: 'Building custom scrapers/tools when mature open-source exists', severity: 'LOW' },
  ];

  return knownFailures;
}

// ── LLM Gap Prediction ──────────────────────────────────────────────────────

async function predictGapBiases(gaps) {
  if (gaps.length === 0) return [];
  if (!DEEPSEEK_KEY) return gaps.map(g => ({ ...g, prediction: 'LLM unavailable' }));

  const gapDescriptions = gaps.map(g =>
    `${g.stage} × ${g.errorType}: ${g.count === 0 ? 'EMPTY — no documented bias here' : `only "${g.existing[0]}" — thin coverage`}`
  ).join('\n');

  const prompt = `The cognitive bias literature documents biases across two dimensions:
- Processing stage: ${PROCESSING_STAGES.join(', ')}
- Error type: ${ERROR_TYPES.join(', ')}

The following cells have 0 or 1 documented biases — they are structural gaps in the bias space:

${gapDescriptions}

For each gap, either:
1. Name a REAL, documented bias I may have missed that fills this cell (cite the researcher)
2. Predict what a bias in this cell WOULD look like based on the dimensional logic (mark as [PREDICTED])
3. Say "genuinely empty — this combination may not produce a distinct bias" if thats the honest answer

Be specific. No fiction. Cite real researchers where possible. Mark predictions clearly.`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a cognitive science expert. Only cite real researchers and real biases. Mark predictions clearly. Say "I dont know" rather than fabricate.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000, temperature: 0.3
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch { return 'DeepSeek call failed'; }
}

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) { console.log(text); return; }
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  for (const chunk of chunks) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk })
      });
    } catch { /* silent */ }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Format Report ───────────────────────────────────────────────────────────

function formatReport(space, susceptibility, gapPredictions) {
  let report = `BIAS SPACE MAP — ${space.total} documented biases\n\n`;

  // Grid summary
  report += `GRID (${PROCESSING_STAGES.length} stages x ${ERROR_TYPES.length} error types = ${PROCESSING_STAGES.length * ERROR_TYPES.length} cells)\n`;
  report += `         ${ERROR_TYPES.map(e => e.slice(0, 6).padEnd(7)).join(' ')}\n`;
  for (const stage of PROCESSING_STAGES) {
    const row = ERROR_TYPES.map(err => {
      const count = space.grid[stage][err].length;
      return String(count).padEnd(7);
    }).join(' ');
    report += `${stage.padEnd(10)} ${row}\n`;
  }

  report += `\nGAPS (${space.gaps.length} cells with 0-1 biases):\n`;
  for (const g of space.gaps) {
    const status = g.count === 0 ? 'EMPTY' : `thin (${g.existing[0]})`;
    report += `  ${g.stage} x ${g.errorType}: ${status}\n`;
  }

  report += `\nCATHEDRAL AGENT SUSCEPTIBILITY (${susceptibility.length} known):\n`;
  const bySeverity = { HIGH: [], MEDIUM: [], LOW: [] };
  for (const s of susceptibility) bySeverity[s.severity].push(s);
  for (const sev of ['HIGH', 'MEDIUM', 'LOW']) {
    if (bySeverity[sev].length === 0) continue;
    report += `  ${sev}:\n`;
    for (const s of bySeverity[sev]) {
      report += `    ${s.bias} in ${s.system}\n      ${s.evidence}\n`;
    }
  }

  if (gapPredictions && typeof gapPredictions === 'string' && gapPredictions.length > 10) {
    report += `\nGAP PREDICTIONS (DeepSeek):\n${gapPredictions.slice(0, 2000)}\n`;
  }

  return report;
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runBiasMapper() {
  console.log('[bias-mapper] Building bias space...');
  const space = buildBiasSpace();
  console.log(`[bias-mapper] ${space.total} biases mapped, ${space.gaps.length} gaps found`);

  console.log('[bias-mapper] Assessing Cathedral agent susceptibility...');
  const susceptibility = assessAgentSusceptibility();
  console.log(`[bias-mapper] ${susceptibility.length} known susceptibilities`);

  console.log('[bias-mapper] Predicting gap biases...');
  const gapPredictions = await predictGapBiases(space.gaps);

  const report = formatReport(space, susceptibility, gapPredictions);

  // Save full report
  const reportPath = path.join(OUTPUT_DIR, `bias-map-${new Date().toISOString().split('T')[0]}.md`);
  fs.writeFileSync(reportPath, report);

  // Save structured data
  const dataPath = path.join(OUTPUT_DIR, 'bias-space.json');
  fs.writeFileSync(dataPath, JSON.stringify({
    biases: BIASES.map(([name, stage, errorType, desc, cathedral]) => ({ name, stage, errorType, desc, cathedral })),
    grid: Object.fromEntries(PROCESSING_STAGES.map(s => [s, Object.fromEntries(ERROR_TYPES.map(e => [e, space.grid[s][e]]))])),
    gaps: space.gaps,
    susceptibility,
    generated: new Date().toISOString()
  }, null, 2));

  await sendTelegram(report);
  console.log(`[bias-mapper] Report saved: ${reportPath}`);

  return { space, susceptibility, gapPredictions, report };
}

// ── Telegram command registration ────────────────────────────────────────────

export function registerBiasMapperCommands(bot) {
  const PAUL = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

  bot.onText(/^\/bias-map(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    await bot.sendMessage(chatId, 'Bias Space Mapper running... (grid + gaps + Cathedral susceptibility). ~30s.');
    try {
      const result = await runBiasMapper();
      await bot.sendMessage(chatId, `Bias map complete: ${result.space.total} biases, ${result.space.gaps.length} gaps, ${result.susceptibility.length} Cathedral susceptibilities`);
    } catch (e) {
      await bot.sendMessage(chatId, `Bias mapper error: ${e.message}`);
    }
  });
}

// ── Direct execution ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('bias-mapper')) {
  runBiasMapper().then(result => {
    console.log('\n' + result.report);
    process.exit(0);
  }).catch(e => {
    console.error('[bias-mapper] Fatal:', e);
    process.exit(1);
  });
}
