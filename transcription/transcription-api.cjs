// Express router for transcription gallery + search
// Mount in cath-bridge: app.use('/api/transcription', require('./transcription/transcription-api.cjs'))

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const FRAMES_DIR = path.join(process.env.HOME, 'iPhone-Archive', '_frames');
const INDEX_PATH = path.join(process.env.HOME, 'iPhone-Archive', 'media-index.json');
const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');
const DB_PATH = path.join(__dirname, 'transcripts.db');

// GET /api/transcription/videos — list all videos with metadata + transcript preview
router.get('/videos', (req, res) => {
  let mediaIndex;
  try {
    mediaIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  } catch (e) {
    return res.status(500).json({ error: 'Cannot read media index' });
  }

  const videos = mediaIndex
    .filter(item => item.category === 'video')
    .map(item => {
      const basename = item.filename.replace(/\.[^.]+$/, '');
      const framePath = path.join(FRAMES_DIR, basename + '.jpg');
      const transcriptPath = path.join(TRANSCRIPTS_DIR, basename + '.txt');

      let transcriptPreview = '';
      if (fs.existsSync(transcriptPath)) {
        try {
          const txt = fs.readFileSync(transcriptPath, 'utf-8').trim();
          transcriptPreview = txt.slice(0, 200);
        } catch (e) {}
      }

      return {
        filename: item.filename,
        date: item.date,
        duration_sec: item.duration_sec,
        width: item.width,
        height: item.height,
        size_bytes: item.size_bytes,
        frame_path: fs.existsSync(framePath) ? framePath : null,
        transcript_preview: transcriptPreview || null
      };
    })
    .sort((a, b) => (b.duration_sec || 0) - (a.duration_sec || 0));

  res.json(videos);
});

// GET /api/transcription/frame/:filename — serve frame thumbnail
router.get('/frame/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const framePath = path.join(FRAMES_DIR, filename);
  if (!fs.existsSync(framePath)) {
    return res.status(404).send('Frame not found');
  }
  res.sendFile(framePath);
});

// POST /api/transcription/save-tags — save tags to DB
router.post('/save-tags', (req, res) => {
  const tags = req.body;
  if (!tags || typeof tags !== 'object') {
    return res.status(400).json({ error: 'Invalid tags' });
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    return res.status(500).json({ error: 'better-sqlite3 not available' });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      filename TEXT PRIMARY KEY,
      date TEXT, duration_sec REAL, width INTEGER, height INTEGER,
      size_bytes INTEGER, frame_path TEXT,
      person_names TEXT, class_type TEXT, location TEXT, notes TEXT, tagged_at TEXT
    )
  `);

  const upsert = db.prepare(`
    INSERT INTO videos (filename, person_names, class_type, notes, tagged_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(filename) DO UPDATE SET
      person_names = excluded.person_names,
      class_type = excluded.class_type,
      notes = excluded.notes,
      tagged_at = excluded.tagged_at
  `);

  let count = 0;
  const tx = db.transaction(() => {
    for (const [filename, tag] of Object.entries(tags)) {
      if (tag.class_type) {
        upsert.run(
          filename,
          tag.person_names || null,
          tag.class_type || null,
          tag.notes || null,
          tag.tagged_at || new Date().toISOString()
        );
        count++;
      }
    }
  });
  tx();
  db.close();

  res.json({ ok: true, count });
});

// GET /api/transcription/search?q=jab+cross — full-text search transcripts
router.get('/search', (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    return res.status(500).json({ error: 'better-sqlite3 not available' });
  }

  if (!fs.existsSync(DB_PATH)) {
    return res.json([]);
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const results = db.prepare(`
      SELECT s.filename, s.start_ms, s.end_ms, s.text,
             v.date, v.duration_sec, v.person_names, v.class_type
      FROM segments_fts fts
      JOIN segments s ON s.id = fts.rowid
      LEFT JOIN videos v ON v.filename = s.filename
      WHERE segments_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(q);
    res.json(results);
  } catch (e) {
    res.json([]);
  } finally {
    db.close();
  }
});

// GET /api/transcription/transcript/:filename — full transcript for one video
router.get('/transcript/:filename', (req, res) => {
  const basename = req.params.filename.replace(/\.[^.]+$/, '');
  const txtPath = path.join(TRANSCRIPTS_DIR, basename + '.txt');
  const jsonPath = path.join(TRANSCRIPTS_DIR, basename + '.json');

  if (req.query.format === 'json' && fs.existsSync(jsonPath)) {
    return res.sendFile(jsonPath);
  }
  if (fs.existsSync(txtPath)) {
    return res.type('text/plain').sendFile(txtPath);
  }
  res.status(404).send('Transcript not found');
});

module.exports = router;
