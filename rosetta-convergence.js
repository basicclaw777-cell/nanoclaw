// The Rosetta — Cross-Corpus Convergence Detector
// Court Member #30: Accumulating Linguistic Intelligence
// Scans 225K+ entities across 5 civilisations for cross-corpus patterns

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const KINGSTON = '/Volumes/KINGSTON2/cathedral-archive';
const ROSETTA_STATE = '/Users/basicclaw777/Cathedral/agents/rosetta-state.json';
const OUTPUT_DIR = join(KINGSTON, 'rosetta');
const CONVERGENCE_FILE = join(OUTPUT_DIR, 'convergences.json');

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
    temperature: 0.2,
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

// ─── Entity Loaders ───

function loadSumerianEntities() {
  const dir = join(KINGSTON, 'sumerian/entities');
  const entities = [];
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        const ents = record.entities || {};
        // Flatten nested categories
        for (const [category, items] of Object.entries(ents)) {
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            entities.push({
              text: item.name || item.value || item.text || '',
              type: category.replace(/s$/, ''), // persons→person, cities→city
              context: item.context || item.role || '',
              corpus: 'sumerian',
              id: record.id
            });
          }
        }
      } catch {}
    }
  }
  return entities;
}

function loadJsonEntities(corpusDir, corpusName) {
  const dir = join(KINGSTON, corpusDir, 'entities');
  if (!existsSync(dir)) return [];
  const entities = [];
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'progress.json');

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const items = Array.isArray(data) ? data : (data.entities || []);
      for (const item of items) {
        entities.push({
          text: item.text || item.name || '',
          type: item.type || 'unknown',
          context: item.context || '',
          corpus: corpusName
        });
      }
    } catch {}
  }
  return entities;
}

// ─── Entity Index Builder ───

function buildEntityIndex(allEntities) {
  // Group by normalized text
  const index = {};
  for (const ent of allEntities) {
    const key = ent.text.toLowerCase().trim();
    if (!key || key.length < 2) continue;
    if (!index[key]) index[key] = [];
    index[key].push(ent);
  }
  return index;
}

function buildTypeIndex(allEntities) {
  // Group by type across corpora
  const index = {};
  for (const ent of allEntities) {
    const type = ent.type.toLowerCase();
    if (!index[type]) index[type] = {};
    if (!index[type][ent.corpus]) index[type][ent.corpus] = [];
    index[type][ent.corpus].push(ent.text);
  }
  return index;
}

// ─── Convergence Detection ───

function findDirectMatches(entityIndex) {
  // Entities with exact same name appearing in 2+ corpora
  const matches = [];
  for (const [key, entities] of Object.entries(entityIndex)) {
    const corpora = [...new Set(entities.map(e => e.corpus))];
    if (corpora.length >= 2) {
      matches.push({
        entity: key,
        corpora,
        count: entities.length,
        types: [...new Set(entities.map(e => e.type))],
        contexts: entities.slice(0, 5).map(e => ({ corpus: e.corpus, type: e.type, context: e.context }))
      });
    }
  }
  return matches.sort((a, b) => b.corpora.length - a.corpora.length || b.count - a.count);
}

function buildTopEntitiesByCorporaAndType(allEntities) {
  // Get top entities per corpus per type for LLM analysis
  const corpusTypes = {};
  for (const ent of allEntities) {
    const key = `${ent.corpus}:${ent.type}`;
    if (!corpusTypes[key]) corpusTypes[key] = {};
    const text = ent.text.trim();
    if (!text) continue;
    corpusTypes[key][text] = (corpusTypes[key][text] || 0) + 1;
  }

  const result = {};
  for (const [key, counts] of Object.entries(corpusTypes)) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    result[key] = sorted.map(([text, count]) => ({ text, count }));
  }
  return result;
}

async function detectSemanticConvergences(topEntities) {
  // Use DeepSeek to find conceptual matches across corpora
  const domains = [
    {
      name: 'divine_hierarchy',
      description: 'Supreme deities and divine hierarchies',
      types: ['deity', 'divine_name', 'god', 'divine']
    },
    {
      name: 'astronomical',
      description: 'Astronomical observations, calendar systems, celestial events',
      types: ['astronomical', 'calendar', 'date']
    },
    {
      name: 'creation_flood',
      description: 'Creation narratives, flood myths, cosmological origins',
      types: ['creation', 'ritual', 'prophecy']
    },
    {
      name: 'underworld_afterlife',
      description: 'Underworld geography, afterlife concepts, death rituals',
      types: ['underworld', 'ritual', 'sacrifice']
    },
    {
      name: 'mathematical',
      description: 'Number systems, mathematical constants, sacred numbers',
      types: ['mathematical', 'number', 'quantity']
    },
    {
      name: 'sacrifice_ritual',
      description: 'Sacrifice types, ritual practices, offerings',
      types: ['sacrifice', 'ritual', 'animal']
    },
    {
      name: 'political_structure',
      description: 'Kingship, titles, military, governance',
      types: ['ruler', 'person', 'title', 'military', 'diviner', 'pharaoh', 'group']
    },
    {
      name: 'places_geography',
      description: 'Sacred places, cities, geographic features',
      types: ['place', 'city', 'architectural']
    }
  ];

  const convergences = [];

  for (const domain of domains) {
    console.log(`  Analyzing domain: ${domain.name}...`);

    // Collect relevant entities per corpus for this domain
    const perCorpus = {};
    for (const [key, items] of Object.entries(topEntities)) {
      const [corpus, type] = key.split(':');
      if (domain.types.some(t => type.includes(t))) {
        if (!perCorpus[corpus]) perCorpus[corpus] = [];
        perCorpus[corpus].push(...items.map(i => `${i.text} (×${i.count})`));
      }
    }

    // Need at least 2 corpora to compare
    const activeCorpora = Object.keys(perCorpus);
    if (activeCorpora.length < 2) continue;

    const corpusLists = activeCorpora.map(c =>
      `**${c.toUpperCase()}**: ${perCorpus[c].slice(0, 15).join(', ')}`
    ).join('\n');

    try {
      const result = await callDeepSeek([
        {
          role: 'system',
          content: `You are a comparative mythology and ancient studies scholar. You have deep knowledge of Sumerian, Egyptian, Hebrew/Aramaic (Dead Sea Scrolls), Chinese Shang Dynasty (oracle bones), and Maya civilisations.

Analyze entity lists from these independent ancient traditions and identify GENUINE cross-corpus convergences. Return JSON with "convergences" array. Each convergence has:
- pattern: name of the convergent pattern
- type: one of [structural_parallel, shared_concept, possible_contact, independent_convergence, mathematical_universal]
- corpora: which civilisations share this pattern (array)
- entities: specific entities from each corpus that converge (object: corpus → entity names)
- evidence: why this is a genuine convergence, not superficial similarity
- grade: A (strong structural match), B (probable parallel), C (possible but uncertain)
- significance: why this matters for cross-corpus understanding

Be rigorous. Reject superficial similarities ("both have gods" is not a convergence). Look for STRUCTURAL parallels — same hierarchical position, same function, same astronomical referent, same mathematical relationship. Independent convergence (Maya + Old World agreeing) is the highest signal.`
        },
        {
          role: 'user',
          content: `Domain: ${domain.description}\n\nTop entities by corpus:\n${corpusLists}\n\nIdentify genuine cross-corpus convergences in this domain.`
        }
      ], true);

      const parsed = JSON.parse(result);
      const items = parsed.convergences || parsed;
      if (Array.isArray(items)) {
        for (const item of items) {
          convergences.push({ ...item, domain: domain.name });
        }
      }
    } catch (err) {
      console.error(`  Error in ${domain.name}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  return convergences;
}

// ─── Main ───

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Loading entities from 5 corpora...');

  const sumerian = loadSumerianEntities();
  console.log(`  Sumerian: ${sumerian.length} entities`);

  const egyptian = loadJsonEntities('egyptian', 'egyptian');
  console.log(`  Egyptian: ${egyptian.length} entities`);

  const dss = loadJsonEntities('dead-sea-scrolls', 'dss');
  console.log(`  Dead Sea Scrolls: ${dss.length} entities`);

  const oracle = loadJsonEntities('oracle-bones', 'oracle_bones');
  console.log(`  Oracle Bones: ${oracle.length} entities`);

  const maya = loadJsonEntities('maya', 'maya');
  console.log(`  Maya: ${maya.length} entities`);

  const allEntities = [...sumerian, ...egyptian, ...dss, ...oracle, ...maya];
  console.log(`\nTotal entities: ${allEntities.length}`);

  // Build indices
  console.log('\nBuilding entity index...');
  const entityIndex = buildEntityIndex(allEntities);
  console.log(`  Unique entity texts: ${Object.keys(entityIndex).length}`);

  // Direct matches (same name, 2+ corpora)
  const directMatches = findDirectMatches(entityIndex);
  console.log(`  Direct cross-corpus matches: ${directMatches.length}`);

  // Save direct matches
  writeFileSync(
    join(OUTPUT_DIR, 'direct-matches.json'),
    JSON.stringify(directMatches.slice(0, 500), null, 2)
  );

  // Top entities by corpus and type
  const topEntities = buildTopEntitiesByCorporaAndType(allEntities);

  // Save entity summary
  const summary = {};
  for (const [key, items] of Object.entries(topEntities)) {
    summary[key] = items.slice(0, 10);
  }
  writeFileSync(join(OUTPUT_DIR, 'entity-summary.json'), JSON.stringify(summary, null, 2));

  // Semantic convergence detection via DeepSeek
  console.log('\nDetecting semantic convergences across 8 domains...');
  const convergences = await detectSemanticConvergences(topEntities);
  console.log(`  Convergences found: ${convergences.length}`);

  // Grade distribution
  const grades = {};
  for (const c of convergences) {
    grades[c.grade] = (grades[c.grade] || 0) + 1;
  }
  console.log(`  Grades: ${JSON.stringify(grades)}`);

  // Save convergences
  writeFileSync(CONVERGENCE_FILE, JSON.stringify({
    generated: new Date().toISOString(),
    totalEntities: allEntities.length,
    corpora: {
      sumerian: sumerian.length,
      egyptian: egyptian.length,
      dss: dss.length,
      oracle_bones: oracle.length,
      maya: maya.length
    },
    directMatches: directMatches.length,
    convergences,
    grades
  }, null, 2));

  // Update Rosetta state
  let rosetta = {};
  if (existsSync(ROSETTA_STATE)) rosetta = JSON.parse(readFileSync(ROSETTA_STATE, 'utf8'));

  rosetta.cross_linguistic_patterns = convergences.filter(c => c.grade === 'A' || c.grade === 'B');
  rosetta.last_convergence_scan = new Date().toISOString();
  rosetta.total_entities = allEntities.length;
  rosetta.direct_cross_corpus_matches = directMatches.length;

  // Add sumerian to completed if missing
  if (!rosetta.languages_completed) rosetta.languages_completed = [];
  if (!rosetta.languages_completed.includes('sumerian')) rosetta.languages_completed.push('sumerian');
  if (!rosetta.languages_completed.includes('akkadian')) rosetta.languages_completed.push('akkadian');

  if (!rosetta.corpus_stats) rosetta.corpus_stats = {};
  rosetta.corpus_stats.sumerian = {
    totalEntities: sumerian.length,
    lastRun: new Date().toISOString()
  };

  mkdirSync(join(ROSETTA_STATE, '..'), { recursive: true });
  writeFileSync(ROSETTA_STATE, JSON.stringify(rosetta, null, 2));

  // Report
  const gradeA = convergences.filter(c => c.grade === 'A');
  const gradeB = convergences.filter(c => c.grade === 'B');

  const report = [
    `*The Rosetta — Convergence Report*`,
    ``,
    `Entities scanned: ${allEntities.length.toLocaleString()}`,
    `Corpora: 5 (Sumerian, Egyptian, DSS, Oracle Bones, Maya)`,
    `Direct matches: ${directMatches.length}`,
    `Convergences: ${convergences.length} (${gradeA.length} Grade A, ${gradeB.length} Grade B)`,
    ``
  ];

  if (gradeA.length > 0) {
    report.push(`*Grade A Convergences:*`);
    for (const c of gradeA.slice(0, 10)) {
      report.push(`• ${c.pattern} [${c.corpora.join(', ')}]`);
    }
    report.push('');
  }

  if (gradeB.length > 0) {
    report.push(`*Grade B Convergences:*`);
    for (const c of gradeB.slice(0, 10)) {
      report.push(`• ${c.pattern} [${c.corpora.join(', ')}]`);
    }
  }

  const reportText = report.join('\n');
  console.log(`\n${reportText}`);
  await sendTelegram(reportText);

  // Top 5 direct matches
  console.log('\nTop direct cross-corpus entity matches:');
  for (const m of directMatches.slice(0, 20)) {
    console.log(`  "${m.entity}" — ${m.corpora.join(', ')} (×${m.count})`);
  }

  console.log(`\nConvergence data saved to: ${OUTPUT_DIR}`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
