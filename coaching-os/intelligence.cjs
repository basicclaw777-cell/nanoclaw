// intelligence.cjs — Coaching OS suggestion intelligence
// Mounted by coaching-api.cjs. Answers: what should I teach next?

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'coaching.db');

function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

module.exports = function mountIntelligence(app) {

  // ── What should I teach today? ────────────────────────────────────
  // Returns: theme suggestions ranked by freshness + coverage gaps
  app.get('/coaching/next', (req, res) => {
    try {
      const db = getDb();
      const themes = db.prepare('SELECT * FROM themes').all();
      const taughtClasses = db.prepare(`
        SELECT theme_id, taught_date FROM classes
        WHERE status = 'taught' AND theme_id IS NOT NULL
        ORDER BY taught_date DESC
      `).all();

      // Build freshness map: how many days since this theme was last taught?
      const now = new Date();
      const freshness = {};
      for (const t of themes) {
        const last = taughtClasses.find(c => c.theme_id === t.id);
        if (!last || !last.taught_date) {
          freshness[t.id] = 999; // never taught
        } else {
          const days = Math.floor((now - new Date(last.taught_date)) / 86400000);
          freshness[t.id] = days;
        }
      }

      // Count how many times each theme has been taught
      const counts = {};
      for (const c of taughtClasses) {
        counts[c.theme_id] = (counts[c.theme_id] || 0) + 1;
      }

      // Layer coverage: how balanced are we across the 5 layers?
      const layerCounts = {};
      for (const c of taughtClasses) {
        const theme = themes.find(t => t.id === c.theme_id);
        if (theme) layerCounts[theme.layer] = (layerCounts[theme.layer] || 0) + 1;
      }
      const totalTaught = taughtClasses.length || 1;
      const layerDeficit = {};
      const idealPct = 0.2; // 5 layers, 20% each
      for (const layer of ['technique', 'concept', 'combo_family', 'style', 'physical']) {
        const actual = (layerCounts[layer] || 0) / totalTaught;
        layerDeficit[layer] = Math.max(0, idealPct - actual);
      }

      // Score each theme
      const scored = themes.map(t => {
        let score = 0;
        const days = freshness[t.id] || 0;

        // Freshness: more days since last taught = higher score
        score += Math.min(days, 30) * 2;

        // Never taught bonus
        if (days >= 999) score += 50;

        // Layer deficit bonus
        score += (layerDeficit[t.layer] || 0) * 100;

        // Underrepresented theme bonus
        const count = counts[t.id] || 0;
        if (count === 0) score += 20;
        else if (count < 3) score += 10;

        return { ...t, _score: Math.round(score), _days: days >= 999 ? 'never' : `${days}d ago`, _count: count };
      });

      scored.sort((a, b) => b._score - a._score);
      const top = scored.slice(0, 8);

      db.close();
      res.json({
        suggestions: top,
        coverage: {
          total_taught: taughtClasses.length,
          by_layer: layerCounts,
          deficit: layerDeficit
        }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Teaching history ──────────────────────────────────────────────
  app.get('/coaching/history', (req, res) => {
    try {
      const db = getDb();
      const limit = parseInt(req.query.limit) || 20;
      const classes = db.prepare(`
        SELECT c.id, c.title, c.theme_id, c.taught_date, c.status, t.name as theme_name, t.layer as theme_layer
        FROM classes c
        LEFT JOIN themes t ON c.theme_id = t.id
        WHERE c.status = 'taught'
        ORDER BY c.taught_date DESC
        LIMIT ?
      `).all(limit);
      db.close();
      res.json(classes);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Drill usage frequency ─────────────────────────────────────────
  app.get('/coaching/drill-usage', (req, res) => {
    try {
      const db = getDb();
      const usage = db.prepare(`
        SELECT cs.drill_id, d.name, d.domain, COUNT(*) as times_used,
               MAX(c.taught_date) as last_used
        FROM class_segments cs
        JOIN classes c ON cs.class_id = c.id
        JOIN drills d ON cs.drill_id = d.id
        WHERE c.status = 'taught' AND cs.drill_id IS NOT NULL
        GROUP BY cs.drill_id
        ORDER BY times_used DESC
      `).all();

      // Also get never-used drills
      const neverUsed = db.prepare(`
        SELECT d.id, d.name, d.domain FROM drills d
        WHERE d.id NOT IN (
          SELECT DISTINCT cs.drill_id FROM class_segments cs
          JOIN classes c ON cs.class_id = c.id
          WHERE c.status = 'taught' AND cs.drill_id IS NOT NULL
        )
        ORDER BY d.domain, d.name
      `).all();

      db.close();
      res.json({ used: usage, never_used: neverUsed, total_drills: usage.length + neverUsed.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Weekly summary ────────────────────────────────────────────────
  app.get('/coaching/weekly', (req, res) => {
    try {
      const db = getDb();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

      const classes = db.prepare(`
        SELECT c.*, t.name as theme_name FROM classes c
        LEFT JOIN themes t ON c.theme_id = t.id
        WHERE c.taught_date >= ? ORDER BY c.taught_date
      `).all(weekAgo);

      const observations = db.prepare(`
        SELECT * FROM class_observations WHERE timestamp >= ?
        ORDER BY timestamp DESC
      `).all(weekAgo + 'T00:00:00');

      const themes_covered = [...new Set(classes.map(c => c.theme_name).filter(Boolean))];
      const engines_hit = {};
      for (const c of classes) {
        if (c.theme_id) {
          const theme = db.prepare('SELECT engines FROM themes WHERE id = ?').get(c.theme_id);
          if (theme) {
            for (const e of JSON.parse(theme.engines || '[]')) {
              engines_hit[e] = (engines_hit[e] || 0) + 1;
            }
          }
        }
      }

      db.close();
      res.json({
        classes_taught: classes.length,
        themes_covered,
        engines_hit,
        observations: observations.length,
        recent_observations: observations.slice(0, 10)
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

};
