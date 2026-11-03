// Build SQLite transcript database from JSON transcripts + media-index
// Run after bulk-transcribe.sh completes (or incrementally during)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');
const FRAMES_DIR = path.join(process.env.HOME, 'iPhone-Archive', '_frames');
const INDEX_PATH = path.join(process.env.HOME, 'iPhone-Archive', 'media-index.json');
const DB_PATH = path.join(__dirname, 'transcripts.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    filename TEXT PRIMARY KEY,
    date TEXT,
    duration_sec REAL,
    width INTEGER,
    height INTEGER,
    size_bytes INTEGER,
    frame_path TEXT,
    -- Tagging fields (filled by Paul via gallery)
    person_names TEXT,     -- comma-separated
    class_type TEXT,       -- one-on-one, group-class, explainer, padwork, sparring, etc.
    location TEXT,         -- gym, ring, outside, etc.
    notes TEXT,
    tagged_at TEXT
  );

  CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    speaker TEXT,          -- filled later via diarization or manual tag
    FOREIGN KEY (filename) REFERENCES videos(filename)
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
    text, filename, content=segments, content_rowid=id
  );

  CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
    INSERT INTO segments_fts(rowid, text, filename)
    VALUES (new.id, new.text, new.filename);
  END;

  CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
    INSERT INTO segments_fts(segments_fts, rowid, text, filename)
    VALUES ('delete', old.id, old.text, old.filename);
  END;
`);

// Load media index
const mediaIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
const mediaMap = {};
for (const item of mediaIndex) {
  mediaMap[item.filename] = item;
}

const insertVideo = db.prepare(`
  INSERT OR IGNORE INTO videos (filename, date, duration_sec, width, height, size_bytes, frame_path)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertSegment = db.prepare(`
  INSERT INTO segments (filename, start_ms, end_ms, text)
  VALUES (?, ?, ?, ?)
`);

const existingSegments = db.prepare(
  'SELECT COUNT(*) as c FROM segments WHERE filename = ?'
);

let videoCount = 0;
let segmentCount = 0;
let skipped = 0;

const transcriptFiles = fs.readdirSync(TRANSCRIPTS_DIR)
  .filter(f => f.endsWith('.json'));

const insertAll = db.transaction(() => {
  for (const jsonFile of transcriptFiles) {
    const basename = jsonFile.replace('.json', '');
    // Find matching video filename (could be .MOV or .MP4)
    const videoFilename = Object.keys(mediaMap).find(k =>
      k.replace(/\.[^.]+$/, '') === basename
    );

    if (!videoFilename) continue;

    const meta = mediaMap[videoFilename];
    const framePath = path.join(FRAMES_DIR, basename + '.jpg');
    const hasFrame = fs.existsSync(framePath) ? framePath : null;

    insertVideo.run(
      videoFilename,
      meta.date || null,
      meta.duration_sec || null,
      meta.width || null,
      meta.height || null,
      meta.size_bytes || null,
      hasFrame
    );

    // Skip if segments already loaded
    const existing = existingSegments.get(videoFilename);
    if (existing.c > 0) {
      skipped++;
      continue;
    }

    // Parse whisper JSON output
    const jsonPath = path.join(TRANSCRIPTS_DIR, jsonFile);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {
      console.error(`[db] Bad JSON: ${jsonFile}`);
      continue;
    }

    // whisper.cpp JSON format: { transcription: [{ timestamps: { from, to }, text }] }
    const segments = data.transcription || data.segments || [];
    for (const seg of segments) {
      let startMs, endMs, text;

      if (seg.timestamps) {
        // whisper.cpp format: "00:00:01.000"
        startMs = parseTimestamp(seg.timestamps.from);
        endMs = parseTimestamp(seg.timestamps.to);
        text = (seg.text || '').trim();
      } else if (seg.start !== undefined) {
        // openai-whisper format
        startMs = Math.round((seg.start || 0) * 1000);
        endMs = Math.round((seg.end || 0) * 1000);
        text = (seg.text || '').trim();
      } else {
        continue;
      }

      if (!text) continue;
      insertSegment.run(videoFilename, startMs, endMs, text);
      segmentCount++;
    }

    videoCount++;
  }
});

function parseTimestamp(ts) {
  // "00:01:23.456" → milliseconds
  if (!ts) return 0;
  const parts = ts.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }
  return 0;
}

insertAll();

console.log(`[transcript-db] ${videoCount} videos indexed, ${segmentCount} segments, ${skipped} skipped`);
console.log(`[transcript-db] DB: ${DB_PATH}`);

// Summary stats
const stats = db.prepare(`
  SELECT
    COUNT(DISTINCT filename) as videos,
    COUNT(*) as segments,
    SUM(LENGTH(text)) as total_chars
  FROM segments
`).get();

console.log(`[transcript-db] Total: ${stats.videos} videos, ${stats.segments} segments, ${Math.round(stats.total_chars / 1000)}K chars`);
db.close();
