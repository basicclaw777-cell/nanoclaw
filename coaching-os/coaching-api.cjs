// coaching-api.cjs — Write endpoints for Coaching OS (separate from read-only bridge routes)
// CJS (Cathedral convention). Mounted by cath-bridge as middleware.
// Handles: save class, load class, delete class, suggest drills, add drill

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'coaching.db');

function getDb() {
  return new Database(DB_PATH);
}

function uid() {
  return 'cls-' + crypto.randomBytes(4).toString('hex');
}

const BLOCK_CONFIG_PATH = path.join(process.env.HOME, 'nanoclaw', 'block-config.json');

let _blockCache = null;
let _blockMtime = 0;
function getBlockConfig() {
  try {
    const stat = fs.statSync(BLOCK_CONFIG_PATH);
    if (!_blockCache || stat.mtimeMs !== _blockMtime) {
      _blockCache = JSON.parse(fs.readFileSync(BLOCK_CONFIG_PATH, 'utf8'));
      _blockMtime = stat.mtimeMs;
    }
    return _blockCache;
  } catch { return null; }
}

module.exports = function mountCoachingApi(app) {

  // Mount intelligence endpoints
  require('./intelligence.cjs')(app);

  // ── Block config (single source of truth) ─────────────────────────
  app.get('/coaching/blocks', (req, res) => {
    const config = getBlockConfig();
    if (!config) return res.status(404).json({ error: 'block-config.json not found' });
    res.json(config);
  });

  // ── Visual bible ──────────────────────────────────────────────────
  app.get('/visual-bible', (req, res) => {
    const p = path.join(process.env.HOME, 'basic-reflex', 'visuals', 'visual-bible.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── Intelligence dashboard ─────────────────────────────────────────
  app.get('/coaching-intel', (req, res) => {
    const p = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'intelligence-dashboard.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── Drill library (Pinterest-style drill browser) ──────────────────
  app.get('/drill-library', (req, res) => {
    const p = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'drill-library.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── Workout builder (drag-and-drop class builder) ─────────────────
  app.get('/workout-builder', (req, res) => {
    const p = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'workout-builder.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── Student deck (Keynote-style workout presentation) ──────────────
  app.get('/student-deck', (req, res) => {
    const p = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'student-deck.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── Workout card (student-facing) ─────────────────────────────────
  app.get('/workout', (req, res) => {
    const p = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'workout-card.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── Teach mode HTML ───────────────────────────────────────────────
  app.get('/teach', (req, res) => {
    const p = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'teach-mode.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── Get cues for a drill ──────────────────────────────────────────
  app.get('/coaching/cues/:drill_id', (req, res) => {
    try {
      const db = getDb();
      const cues = db.prepare('SELECT * FROM coaching_cues WHERE drill_id = ? ORDER BY cue_type').all(req.params.drill_id);
      db.close();
      res.json(cues);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Add a coaching cue ────────────────────────────────────────────
  app.post('/coaching/cues', (req, res) => {
    try {
      const db = getDb();
      const { drill_id, cue_type, text, block_range, engine } = req.body;
      if (!drill_id || !cue_type || !text) return res.status(400).json({ error: 'drill_id, cue_type, text required' });
      db.prepare('INSERT INTO coaching_cues (drill_id, cue_type, text, block_range, engine) VALUES (?, ?, ?, ?, ?)')
        .run(drill_id, cue_type, text, block_range || '[1,10]', engine || null);
      db.close();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Log an observation during class ───────────────────────────────
  app.post('/coaching/observations', (req, res) => {
    try {
      const db = getDb();
      const { class_id, student_id, observation, engine, drill_id } = req.body;
      if (!class_id || !observation) return res.status(400).json({ error: 'class_id and observation required' });
      db.prepare('INSERT INTO class_observations (class_id, student_id, observation, engine, drill_id) VALUES (?, ?, ?, ?, ?)')
        .run(class_id, student_id || null, observation, engine || null, drill_id || null);
      db.close();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Get observations for a class ──────────────────────────────────
  app.get('/coaching/observations/:class_id', (req, res) => {
    try {
      const db = getDb();
      const obs = db.prepare('SELECT * FROM class_observations WHERE class_id = ? ORDER BY timestamp DESC').all(req.params.class_id);
      db.close();
      res.json(obs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Series graph HTML ──────────────────────────────────────────────
  app.get('/series-graph', (req, res) => {
    const p = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'series-graph.html');
    if (!fs.existsSync(p)) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
    res.sendFile(p);
  });

  // ── All edges (for graph) ─────────────────────────────────────────
  app.get('/coaching/edges', (req, res) => {
    try {
      const db = getDb();
      const edges = db.prepare('SELECT * FROM series_edges').all();
      db.close();
      res.json(edges);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Save a class ──────────────────────────────────────────────────
  app.post('/coaching/classes', (req, res) => {
    try {
      const db = getDb();
      const { title, theme_id, template_id, segments, duration_minutes, notes, energy_curve } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });

      const id = uid();
      db.prepare(`
        INSERT INTO classes (id, title, theme_id, template_id, status, duration_minutes, notes, energy_curve, created, updated)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, date('now'), date('now'))
      `).run(id, title, theme_id || null, template_id || 'paul_8', duration_minutes || 60, notes || null, energy_curve ? JSON.stringify(energy_curve) : null);

      // Save segments
      if (segments && Array.isArray(segments)) {
        const stmt = db.prepare(`
          INSERT INTO class_segments (class_id, segment_num, segment_name, drill_id, drill_notes, duration_minutes)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const seg of segments) {
          stmt.run(id, seg.num, seg.name || null, seg.drill_id || null, seg.notes || null, seg.duration || null);
        }
      }

      db.close();
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Update a class ────────────────────────────────────────────────
  app.put('/coaching/classes/:id', (req, res) => {
    try {
      const db = getDb();
      const { title, theme_id, template_id, segments, status, notes, energy_curve } = req.body;

      db.prepare(`
        UPDATE classes SET title = ?, theme_id = ?, template_id = ?, status = ?, notes = ?, energy_curve = ?, updated = date('now')
        WHERE id = ?
      `).run(title, theme_id || null, template_id || 'paul_8', status || 'draft', notes || null, energy_curve ? JSON.stringify(energy_curve) : null, req.params.id);

      // Replace segments
      db.prepare('DELETE FROM class_segments WHERE class_id = ?').run(req.params.id);
      if (segments && Array.isArray(segments)) {
        const stmt = db.prepare(`
          INSERT INTO class_segments (class_id, segment_num, segment_name, drill_id, drill_notes, duration_minutes)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const seg of segments) {
          stmt.run(req.params.id, seg.num, seg.name || null, seg.drill_id || null, seg.notes || null, seg.duration || null);
        }
      }

      db.close();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Get a single class with segments ──────────────────────────────
  app.get('/coaching/classes/:id', (req, res) => {
    try {
      const db = getDb();
      const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
      if (!cls) { db.close(); return res.status(404).json({ error: 'not found' }); }
      cls.segments = db.prepare('SELECT * FROM class_segments WHERE class_id = ? ORDER BY segment_num').all(req.params.id);
      db.close();
      res.json(cls);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── List all classes ──────────────────────────────────────────────
  app.get('/coaching/classes', (req, res) => {
    try {
      const db = getDb();
      const classes = db.prepare('SELECT id, title, theme_id, status, taught_date, created FROM classes ORDER BY updated DESC').all();
      db.close();
      res.json(classes);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Delete a class ────────────────────────────────────────────────
  app.delete('/coaching/classes/:id', (req, res) => {
    try {
      const db = getDb();
      db.prepare('DELETE FROM class_segments WHERE class_id = ?').run(req.params.id);
      db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
      db.close();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Mark class as taught ──────────────────────────────────────────
  app.post('/coaching/classes/:id/taught', (req, res) => {
    try {
      const db = getDb();
      const date = req.body.date || new Date().toISOString().split('T')[0];
      db.prepare('UPDATE classes SET status = ?, taught_date = ?, updated = date(?) WHERE id = ?')
        .run('taught', date, date, req.params.id);
      db.close();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Suggest drills for a theme + segment ──────────────────────────
  app.get('/coaching/suggest', (req, res) => {
    try {
      const db = getDb();
      const { theme_id, segment_name, limit, block } = req.query;
      const max = parseInt(limit) || 8;
      const blockNum = block ? parseInt(block) : null;

      let drills = db.prepare('SELECT * FROM drills').all();

      if (blockNum) {
        drills = drills.filter(d => d.block_min <= blockNum && d.block_max >= blockNum);
      }

      // Score each drill
      let theme = null;
      if (theme_id) {
        theme = db.prepare('SELECT * FROM themes WHERE id = ?').get(theme_id);
      }

      const scored = drills.map(d => {
        let score = 0;
        const dEngines = JSON.parse(d.engines || '["body"]');

        // Engine match with theme
        if (theme) {
          const tEngines = JSON.parse(theme.engines || '["body"]');
          const overlap = dEngines.filter(e => tEngines.includes(e)).length;
          score += overlap * 3;
        }

        // Domain match to segment name
        if (segment_name) {
          const segLower = segment_name.toLowerCase();
          if (segLower.includes('warm') && (d.domain === 'warm_up' || d.domain === 'conditioning')) score += 2;
          if (segLower.includes('ice') && d.domain === 'icebreaker') score += 4;
          if (segLower.includes('agility') && d.domain === 'footwork') score += 2;
          if (segLower.includes('foot') && d.domain === 'footwork') score += 4;
          if (segLower.includes('bag') && (d.mode === 'bag' || d.mode === 'solo')) score += 4;
          if (segLower.includes('pad') && d.mode === 'pads') score += 4;
          if (segLower.includes('partner') && d.mode === 'partner') score += 4;
          if (segLower.includes('condition') && d.domain === 'conditioning') score += 4;
          if (segLower.includes('coordination') && d.domain === 'icebreaker') score += 3;
        }

        // Energy demand matching (future: match to energy curve position)
        // Variety bonus: less common domains get slight boost
        if (d.domain === 'mindset' || d.domain === 'strategy') score += 1;

        return { ...d, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);
      const results = scored.slice(0, max).map(d => { delete d._score; return d; });

      db.close();
      res.json(results);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── List all drills ────────────────────────────────────────────────
  app.get('/coaching/drills', (req, res) => {
    try {
      const db = getDb();
      const drills = db.prepare('SELECT * FROM drills ORDER BY domain, name').all();
      db.close();
      res.json(drills);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Add a new drill ───────────────────────────────────────────────
  app.post('/coaching/drills', (req, res) => {
    try {
      const db = getDb();
      const { name, description, domain, mode, engines, tags, block_min, block_max, equipment, levels, source } = req.body;
      if (!name || !domain) return res.status(400).json({ error: 'name and domain required' });

      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      db.prepare(`
        INSERT OR REPLACE INTO drills (id, name, description, domain, mode, block_min, block_max, equipment, levels, engines, source, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), date('now'))
      `).run(id, name, description || null, domain, mode || null, block_min || 1, block_max || 10,
        equipment ? JSON.stringify(equipment) : null,
        levels ? JSON.stringify(levels) : null,
        JSON.stringify(engines || ['body']),
        source || 'manual'
      );

      if (tags && Array.isArray(tags)) {
        const stmt = db.prepare('INSERT OR IGNORE INTO drill_tags (drill_id, tag) VALUES (?, ?)');
        for (const tag of tags) stmt.run(id, tag);
      }

      db.close();
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

};
