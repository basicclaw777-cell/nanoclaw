/**
 * creative-strategies.js — Domain 3: Competing aesthetic philosophies
 *
 * Each of Reed's styles is a strategy with a worldview.
 * Paul's selections are ground truth. Data decides which aesthetic wins.
 *
 * Strategies:
 * 1. pro_photo      — Preservation. Commercial retouch. Honest documentation.
 * 2. manga          — Graphic novel translation. Narrative through ink.
 * 3. noir           — Chiaroscuro. Drama through absence of light.
 * 4. ippo           — Shonen energy. Impact through movement lines.
 * 5. neon           — HK cyberpunk. Identity through electric colour.
 * 6. dramatic       — Volumetric cinema. Atmosphere as subject.
 * 7. poster         — Vintage typography. Heritage as brand.
 * 8. cathedral_dark — Cathedral aesthetic. Architecture as identity. (#09090f, amber)
 *
 * Plus meta-strategies:
 * 9. fibonacci_composition — Golden ratio in framing. Does phi make better images?
 * 10. schumann_timing     — Generate at Schumann-aligned times. Does timing matter?
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'creative-experiment.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        style TEXT NOT NULL,
        subject TEXT,
        source_photo TEXT,
        output_path TEXT,
        prompt_used TEXT,
        model TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        generation_id INTEGER,
        style TEXT NOT NULL,
        action TEXT NOT NULL,
        paul_reaction TEXT,
        context TEXT,
        FOREIGN KEY (generation_id) REFERENCES generations(id)
      );

      CREATE TABLE IF NOT EXISTS style_leaderboard (
        style TEXT PRIMARY KEY,
        total_generated INTEGER DEFAULT 0,
        selected INTEGER DEFAULT 0,
        rejected INTEGER DEFAULT 0,
        ignored INTEGER DEFAULT 0,
        selection_rate REAL,
        last_selected TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS creative_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        strategy TEXT NOT NULL,
        subject TEXT,
        direction TEXT NOT NULL,
        strength REAL,
        reasoning TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_gen_style ON generations(style);
      CREATE INDEX IF NOT EXISTS idx_sel_style ON selections(style);
    `);
  }
  return db;
}

// ── Strategy Personas ────────────────────────────────────────────────────────

const STRATEGIES = {
  pro_photo: {
    name: 'Pro Photo',
    worldview: 'Preservation. The photo is already good — enhance, don\'t transform. Commercial retouch honours what exists. The best style is invisible.',
    predicts: 'Selected when Paul needs real content: social media, documentation, gym marketing. Honest images for honest work.',
  },
  manga: {
    name: 'Manga',
    worldview: 'Translation. Reality rendered through ink becomes narrative. Every photo has a story — manga makes the story visible. Environment becomes character.',
    predicts: 'Selected for storytelling contexts: blog headers, character development, world-building.',
  },
  noir: {
    name: 'Film Noir',
    worldview: 'Absence. What you don\'t show is stronger than what you show. Chiaroscuro forces the eye to the subject. Drama lives in shadows.',
    predicts: 'Selected for mood and gravitas: profile images, serious content, atmospheric branding.',
  },
  ippo: {
    name: 'Ippo Shonen',
    worldview: 'Impact. Speed lines and screentone communicate force that photos can\'t. Energy is the message. Movement is meaning.',
    predicts: 'Selected for excitement and action: technique cards, social media engagement, youth appeal.',
  },
  neon: {
    name: 'HK Neon',
    worldview: 'Place. Hong Kong\'s electric identity is the brand\'s identity. Neon and rain are not effects — they\'re heritage.',
    predicts: 'Selected for location identity: HK-specific content, late-night atmosphere, cultural anchoring.',
  },
  dramatic: {
    name: 'Dramatic Cinema',
    worldview: 'Atmosphere. The air in the room IS the subject. Volumetric light and fog make the ordinary mythic. Every gym session is an epic.',
    predicts: 'Selected for premium feel: brand launches, hero images, when Paul wants the gym to look legendary.',
  },
  poster: {
    name: '70s Fight Poster',
    worldview: 'Heritage. Boxing has 200 years of visual language. Retro typography and halftone dots connect to that lineage. Brand is history.',
    predicts: 'Selected for events: fight nights, promotions, merch, anything that needs to feel like an occasion.',
  },
  cathedral_dark: {
    name: 'Cathedral Dark',
    worldview: 'Architecture. The Cathedral aesthetic (#09090f, amber) is a worldview: darkness reveals structure. What matters glows.',
    predicts: 'Selected for Cathedral-specific content: system diagrams, architecture cards, slides, internal identity.',
  },
};

// ── Log Generation ───────────────────────────────────────────────────────────

export function logGeneration(style, subject, sourcePath, outputPath, prompt, model, metadata = {}) {
  const d = getDb();
  const result = d.prepare(`
    INSERT INTO generations (style, subject, source_photo, output_path, prompt_used, model, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(style, subject, sourcePath, outputPath, prompt, model, JSON.stringify(metadata));

  // Update leaderboard
  d.prepare(`
    INSERT INTO style_leaderboard (style, total_generated) VALUES (?, 1)
    ON CONFLICT(style) DO UPDATE SET total_generated = total_generated + 1
  `).run(style);

  // Generate signal
  const strat = STRATEGIES[style];
  if (strat) {
    d.prepare(`
      INSERT INTO creative_signals (strategy, subject, direction, strength, reasoning)
      VALUES (?, ?, 'generated', 0.5, ?)
    `).run(style, subject, `${strat.name} generated for "${subject}". ${strat.predicts}`);
  }

  return result.lastInsertRowid;
}

// ── Log Selection (Paul's choice) ────────────────────────────────────────────

export function logSelection(generationId, style, action, reaction = '', context = '') {
  const d = getDb();

  // action: 'selected', 'rejected', 'ignored', 'used', 'shared'
  d.prepare(`
    INSERT INTO selections (generation_id, style, action, paul_reaction, context)
    VALUES (?, ?, ?, ?, ?)
  `).run(generationId, style, action, reaction, context);

  // Update leaderboard
  const field = action === 'selected' || action === 'used' || action === 'shared'
    ? 'selected' : action === 'rejected' ? 'rejected' : 'ignored';

  d.prepare(`
    INSERT INTO style_leaderboard (style, ${field}) VALUES (?, 1)
    ON CONFLICT(style) DO UPDATE SET ${field} = ${field} + 1,
    selection_rate = CAST(selected AS REAL) / MAX(total_generated, 1)
    ${field === 'selected' ? ", last_selected = datetime('now')" : ''}
  `).run(style);

  // Signal
  const strength = action === 'selected' || action === 'used' ? 0.8 :
                   action === 'shared' ? 0.9 : action === 'rejected' ? 0.3 : 0.5;
  const direction = action === 'selected' || action === 'used' || action === 'shared'
    ? 'positive' : action === 'rejected' ? 'negative' : 'neutral';

  d.prepare(`
    INSERT INTO creative_signals (strategy, subject, direction, strength, reasoning)
    VALUES (?, ?, ?, ?, ?)
  `).run(style, `gen-${generationId}`, direction, strength,
    `Paul ${action} ${style} image. ${reaction || 'No comment.'}`);

  return { style, action, direction };
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

export function getLeaderboard() {
  const d = getDb();
  return d.prepare(`
    SELECT style, total_generated, selected, rejected, ignored,
           ROUND(CAST(selected AS REAL) / MAX(total_generated, 1) * 100, 1) as selection_rate,
           last_selected
    FROM style_leaderboard
    ORDER BY selection_rate DESC, selected DESC
  `).all();
}

// ── Recommend Next Style ─────────────────────────────────────────────────────

export function recommendStyle(subject = '') {
  const d = getDb();
  const leaderboard = getLeaderboard();

  // Multi-armed bandit: explore vs exploit
  // 80% exploit (highest selection rate), 20% explore (least generated)
  const explore = Math.random() < 0.2;

  if (explore || leaderboard.length === 0) {
    // Explore: pick least-generated style
    const allStyles = Object.keys(STRATEGIES);
    const generated = new Set(leaderboard.map(l => l.style));
    const ungenerated = allStyles.filter(s => !generated.has(s));

    if (ungenerated.length > 0) {
      const pick = ungenerated[Math.floor(Math.random() * ungenerated.length)];
      return { style: pick, reason: 'Explore: never generated', explore: true };
    }

    const leastGen = leaderboard.sort((a, b) => a.total_generated - b.total_generated)[0];
    return { style: leastGen.style, reason: `Explore: least generated (${leastGen.total_generated})`, explore: true };
  }

  // Exploit: highest selection rate with minimum 3 generations
  const qualified = leaderboard.filter(l => l.total_generated >= 3);
  if (qualified.length > 0) {
    return { style: qualified[0].style, reason: `Exploit: ${qualified[0].selection_rate}% selection rate`, explore: false };
  }

  // Not enough data — round-robin
  const leastGen = leaderboard.sort((a, b) => a.total_generated - b.total_generated)[0];
  return { style: leastGen.style, reason: 'Round-robin: insufficient data', explore: true };
}

// ── Get signals for meta-watcher ─────────────────────────────────────────────

export function getRecentSignals(hours = 24) {
  const d = getDb();
  return d.prepare(`
    SELECT * FROM creative_signals
    WHERE timestamp > datetime('now', '-' || ? || ' hours')
    ORDER BY id DESC
  `).all(hours);
}

export function getStats() {
  const d = getDb();
  const gens = d.prepare('SELECT COUNT(*) as c FROM generations').get();
  const sels = d.prepare('SELECT COUNT(*) as c FROM selections').get();
  const sigs = d.prepare('SELECT COUNT(*) as c FROM creative_signals').get();
  return { generations: gens.c, selections: sels.c, signals: sigs.c };
}
