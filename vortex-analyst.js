#!/usr/bin/env node
// vortex-analyst.js
// Phase 2: Analyses extraction failures and improves keyword patterns
// Runs after harvester to study what was missed and why

import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import https from 'https';

const HOME = process.env.HOME;
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const KEYWORDS_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'philosophical_keywords.json');
const RAW_CHATS_PATH = path.join(HOME, 'raw-chats');
const VAULT_PATH = path.join(HOME, 'cathedral-vault', '02_Refined_Gold');
const OPENROUTER_KEY = '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';

const db = new sqlite3.Database(DB_PATH);

// ============================================
// CALL CLAUDE
// ============================================
async function callClaude(systemPrompt, userMessage) {
  const data = JSON.stringify({
    model: 'anthropic/claude-3.5-sonnet',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  });

  const options = {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(response).choices[0].message.content); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============================================
// LOAD CURRENT KEYWORDS
// ============================================
function loadKeywords() {
  try {
    return JSON.parse(fs.readFileSync(KEYWORDS_PATH, 'utf8'));
  } catch (e) {
    return { keywords: [], categories: {} };
  }
}

// ============================================
// GET FAILURE SAMPLES FROM DB
// ============================================
function getFailureSamples() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT fs.chat_snippet, fs.failure_type, fs.actual_output,
             ea.chat_file, ea.philosophical_depth_score, ea.nugget_count
      FROM failure_samples fs
      JOIN extraction_attempts ea ON fs.attempt_id = ea.id
      WHERE fs.reviewed = 0
      ORDER BY ea.timestamp DESC
      LIMIT 20
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ============================================
// GET RECENT LOW-SCORING FILES
// ============================================
function getLowScoringFiles() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT chat_file, philosophical_depth_score, nugget_count, source_text_sample
      FROM extraction_attempts
      WHERE philosophical_depth_score < 40
      ORDER BY timestamp DESC
      LIMIT 10
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ============================================
// READ SAMPLE OF MISSED FILES
// ============================================
function readMissedContent() {
  const samples = [];
  try {
    const getAllFiles = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...getAllFiles(full));
        else if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) files.push(full);
      }
      return files;
    };

    const allFiles = getAllFiles(RAW_CHATS_PATH);
    // Sample a few recent files
    allFiles.slice(-10).forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8').substring(0, 500);
        const folder = path.dirname(file).split('/').pop();
        samples.push({ file: path.basename(file), folder, preview: content });
      } catch (e) {}
    });
  } catch (e) {}
  return samples;
}

// ============================================
// PHASE 2 ANALYSIS — THE CORE
// ============================================
async function analyseFailures(failures, lowScoring, missedSamples, currentKeywords) {
  const systemPrompt = `You are the Vortex Analyst — the self-improvement engine for Paul's Cathedral AI knowledge extraction system.

Paul is a boxing gym owner and philosopher in Hong Kong building a personal AI Cathedral. His knowledge spans:
- Philosophy (IntegrityOS, OmissionOS, Saper Vedere, Cathedral architecture)
- Boxing (technical, psychological, coaching)
- Business (strategy, team building, opportunity evaluation)
- Technology (AI systems, local LLMs, knowledge architecture)
- Personal development (sovereignty, identity, relationships)
- Universe/esoteric (sacred geometry, natural law)

The current harvester uses ${currentKeywords.keywords?.length || 35} philosophical keywords but scores technical and business content at only 25% depth — meaning it's MISSING most of Paul's valuable insights.

Your job: analyse the failures and generate an expanded keyword/pattern set that captures ALL of Paul's knowledge domains.

Respond ONLY with valid JSON:
{
  "analysis": "2-3 sentence diagnosis of what's failing and why",
  "newKeywords": ["keyword1", "keyword2", ...],
  "categoryPatterns": {
    "boxing": ["pattern1", "pattern2"],
    "business": ["pattern1", "pattern2"],
    "technology": ["pattern1", "pattern2"],
    "philosophy": ["pattern1", "pattern2"],
    "personal": ["pattern1", "pattern2"],
    "universe": ["pattern1", "pattern2"]
  },
  "nuggetTriggers": ["phrase that signals a valuable insight", ...],
  "qualitySignals": ["signal that indicates high-value content", ...],
  "recommendedThreshold": 20
}`;

  const userMessage = `Current keywords: ${JSON.stringify(currentKeywords.keywords || [])}\n\nFailure samples:\n${JSON.stringify(failures, null, 2)}\n\nLow scoring files:\n${JSON.stringify(lowScoring, null, 2)}\n\nRecent file samples:\n${JSON.stringify(missedSamples, null, 2)}\n\nAnalyse and generate improved patterns.`;

  const result = await callClaude(systemPrompt, userMessage);
  const clean = result.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ============================================
// UPDATE KEYWORDS FILE
// ============================================
function updateKeywords(current, analysis) {
  const existing = current.keywords || [];
  const newKeywords = analysis.newKeywords || [];

  // Merge without duplicates
  const merged = [...new Set([...existing, ...newKeywords])];

  const updated = {
    keywords: merged,
    categories: analysis.categoryPatterns || {},
    nuggetTriggers: analysis.nuggetTriggers || [],
    qualitySignals: analysis.qualitySignals || [],
    version: (current.version || 1) + 1,
    lastUpdated: new Date().toISOString(),
    previousCount: existing.length,
    newCount: merged.length,
    addedThisRound: newKeywords.filter(k => !existing.includes(k))
  };

  fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(updated, null, 2));
  return updated;
}

// ============================================
// MARK FAILURES AS REVIEWED
// ============================================
function markReviewed() {
  return new Promise((resolve) => {
    db.run(`UPDATE failure_samples SET reviewed = 1 WHERE reviewed = 0`, resolve);
  });
}

// ============================================
// SAVE ANALYSIS REPORT TO VAULT
// ============================================
function saveReport(analysis, updatedKeywords) {
  const date = new Date().toISOString().split('T')[0];
  const reportPath = path.join(HOME, 'cathedral-vault', '04_Esoteric_Studies', `vortex-analyst-${date}.md`);

  const report = `---
tags: [vortex, analyst, phase-2, self-improvement]
date: ${date}
category: System_Intelligence
---

# 🌀 Vortex Analyst Report — ${date}

## Diagnosis
${analysis.analysis}

## What Changed
- Keywords: ${updatedKeywords.previousCount} → ${updatedKeywords.newCount} (+${updatedKeywords.addedThisRound?.length || 0} new)
- New keywords added: ${updatedKeywords.addedThisRound?.join(', ')}

## Category Patterns Added
${Object.entries(analysis.categoryPatterns || {}).map(([cat, patterns]) =>
  `### ${cat}\n${patterns.map(p => `- ${p}`).join('\n')}`
).join('\n\n')}

## Nugget Triggers
${(analysis.nuggetTriggers || []).map(t => `- ${t}`).join('\n')}

## Quality Signals
${(analysis.qualitySignals || []).map(s => `- ${s}`).join('\n')}

---
*The Vortex improves itself. Run harvester again to see the difference.*
`;

  fs.writeFileSync(reportPath, report);
  console.log(`📄 Report saved to vault: vortex-analyst-${date}.md`);
}

// ============================================
// MAIN
// ============================================
async function runAnalyst() {
  console.log('\n🌀 VORTEX ANALYST — Phase 2');
  console.log('============================\n');

  try {
    // Gather data
    console.log('📊 Loading failure samples...');
    const [failures, lowScoring] = await Promise.all([
      getFailureSamples(),
      getLowScoringFiles()
    ]);
    const missedSamples = readMissedContent();
    const currentKeywords = loadKeywords();

    console.log(`Found: ${failures.length} failure samples, ${lowScoring.length} low-scoring files`);
    console.log(`Current keywords: ${currentKeywords.keywords?.length || 35}`);

    if (failures.length === 0 && lowScoring.length === 0) {
      console.log('✅ No failures to analyse. System is performing well.');
      return;
    }

    // Run analysis
    console.log('\n🧠 Analysing with Claude...');
    const analysis = await analyseFailures(failures, lowScoring, missedSamples, currentKeywords);

    console.log(`\n📋 Diagnosis: ${analysis.analysis}`);

    // Update keywords
    const updatedKeywords = updateKeywords(currentKeywords, analysis);
    console.log(`\n✅ Keywords expanded: ${updatedKeywords.previousCount} → ${updatedKeywords.newCount}`);
    console.log(`   Added: ${updatedKeywords.addedThisRound?.slice(0, 10).join(', ')}...`);

    // Mark failures reviewed
    await markReviewed();
    console.log('✅ Failure samples marked as reviewed');

    // Save report
    saveReport(analysis, updatedKeywords);

    console.log('\n🎯 NEXT STEP: Run the harvester again to see improved extraction');
    console.log('   node ~/nanoclaw/vortex-ready-harvester.cjs\n');

    // Show recommended threshold
    if (analysis.recommendedThreshold) {
      console.log(`💡 Recommended depth threshold: ${analysis.recommendedThreshold}% (currently using higher)`);
    }

  } catch (error) {
    console.error('Analyst error:', error.message);
  } finally {
    db.close();
  }
}

runAnalyst();
