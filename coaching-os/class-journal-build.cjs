// Class Journal: exports every taught class (segments, observations, journal notes) from coaching.db
// to class-journal.json for class-journal.html. Run after logging a class:
//   node ~/nanoclaw/coaching-os/class-journal-build.cjs
const path = require('path'), fs = require('fs');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'coaching.db'), { readonly: true });

const classes = db.prepare(`SELECT * FROM classes WHERE status IN ('taught','reviewed') ORDER BY taught_date DESC, updated DESC`).all();
const out = classes.map(c => {
  let notes = {};
  try { notes = JSON.parse(c.notes || '{}'); } catch { notes = { summary: c.notes }; }
  const segments = db.prepare(`SELECT s.segment_num, s.segment_name, s.drill_id, d.name AS drill_name, s.drill_notes
    FROM class_segments s LEFT JOIN drills d ON d.id = s.drill_id WHERE s.class_id = ? ORDER BY s.segment_num`).all(c.id);
  const observations = db.prepare(`SELECT observation, engine FROM class_observations WHERE class_id = ? ORDER BY id`).all(c.id);
  const tags = db.prepare(`SELECT tag FROM class_tags WHERE class_id = ?`).all(c.id).map(t => t.tag);
  return { id: c.id, title: c.title, date: c.taught_date, group: notes.group || (tags.find(t => t.startsWith('group:')) || '').slice(6) || 'Unassigned',
           athletes: notes.athletes_present ?? null, summary: notes.summary || '', suggestions: notes.suggestions || [], tags, segments, observations };
});
fs.writeFileSync(path.join(__dirname, 'class-journal.json'), JSON.stringify({ built_at: new Date().toISOString(), classes: out }, null, 2));
console.log(`class-journal.json: ${out.length} classes`);
