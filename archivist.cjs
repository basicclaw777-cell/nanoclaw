#!/usr/bin/env node
// archivist.cjs — the Archivist: keeper of the Cathedral's collection.
// Indexes the asset piles into one searchable catalogue (SQLite + FTS5).
//   node archivist.cjs index            # scan + index all piles
//   node archivist.cjs search "claire"  # full-text search (name/tags/path)
//   node archivist.cjs where "IMG_1181" # locate a specific asset
//   node archivist.cjs collect <tag>    # list everything with a tag
'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const DB_PATH = path.join(HOME, 'nanoclaw/archivist.db');

const ROOTS = [
  '~/basic-reflex',
  '~/iPhone-Archive',
  '~/Cathedral/artifact-backup',
  '~/Cathedral/cathy/shots',
  '~/Cathedral/artifacts',
  '~/Cathedral/cathy/drawings',
  '~/nanoclaw/gym-eyes-classes',
  '~/Downloads',
].map((p) => p.replace('~', HOME));

const EXT_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.heic', '.tiff', '.bmp']);
const EXT_VIDEO = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi']);
const EXT_PAGE = new Set(['.html', '.pdf', '.md']);

function db() {
  const d = new Database(DB_PATH);
  d.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      path TEXT PRIMARY KEY, name TEXT, ext TEXT, type TEXT,
      size INTEGER, mtime TEXT, tags TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(name, tags, path);
  `);
  return d;
}

function tagsFor(rel, name) {
  const segs = rel.split(path.sep).filter(Boolean);
  const tags = new Set();
  for (const s of segs) {
    const t = s.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();
    if (t) t.split(' ').forEach((w) => { if (w.length >= 3 && !/^\d+$/.test(w)) tags.add(w); });
  }
  // filename words too
  name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').forEach((w) => {
    if (w.length >= 3 && !/^\d+$/.test(w)) tags.add(w);
  });
  return [...tags].slice(0, 30).join(' ');
}

function mergeClientTags(d) {
  const tdb = path.join(HOME, 'nanoclaw/transcription/transcripts.db');
  if (!fs.existsSync(tdb)) { console.log('[archivist] no transcripts.db, skipping client-tag merge'); return; }
  let t;
  try { t = new Database(tdb, { readonly: true }); } catch { return; }
  const rows = t.prepare("SELECT filename, person_names FROM videos WHERE person_names IS NOT NULL AND person_names != ''").all();
  const upd = d.prepare('UPDATE assets SET tags = ? WHERE name = ?');
  const ftsUpd = d.prepare('UPDATE assets_fts SET tags = ? WHERE rowid = (SELECT rowid FROM assets WHERE path = ?)');
  let n = 0;
  for (const r of rows) {
    const persons = String(r.person_names).replace(/[^a-zA-Z0-9 ,]/g, ' ').split(',').map((s) => s.trim()).filter(Boolean).join(' ');
    if (!persons) continue;
    const matches = d.prepare('SELECT path, tags FROM assets WHERE name = ?').all(r.filename);
    for (const x of matches) {
      if ((x.tags || '').includes(persons.split(' ')[0])) continue;
      const nt = ((x.tags || '') + ' ' + persons).replace(/\s+/g, ' ').trim();
      upd.run(nt, r.filename);
      ftsUpd.run(nt, x.path);
      n++;
    }
  }
  t.close();
  console.log(`[archivist] merged client tags onto ${n} assets`);
}

function scan() {
  const d = db();
  const ins = d.prepare('INSERT OR REPLACE INTO assets (path,name,ext,type,size,mtime,tags) VALUES (?,?,?,?,?,?,?)');
  const fts = d.prepare('INSERT OR REPLACE INTO assets_fts (rowid,name,tags,path) VALUES ((SELECT rowid FROM assets WHERE path=?),?,?,?)');
  let count = 0;
  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    const walk = (dir) => {
      let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'venv') walk(full); continue; }
        const ext = path.extname(e.name).toLowerCase();
        let type = null;
        if (EXT_IMAGE.has(ext)) type = 'image';
        else if (EXT_VIDEO.has(ext)) type = 'video';
        else if (EXT_PAGE.has(ext)) type = 'page';
        if (!type) continue;
        try {
          const st = fs.statSync(full);
          const rel = path.relative(root, dir);
          const tags = tagsFor(rel, e.name);
          ins.run(full, e.name, ext, type, st.size, st.mtime.toISOString().slice(0, 10), tags);
          fts.run(full, e.name, tags, full);
          count++;
        } catch {}
      }
    };
    walk(root);
  }
  mergeClientTags(d);
  console.log(`[archivist] indexed ${count} assets -> ${DB_PATH}`);
  d.close();
}

function search(q) {
  const d = db();
  const rows = d.prepare('SELECT path, name, tags FROM assets_fts WHERE assets_fts MATCH ? ORDER BY rank LIMIT 40').all(q);
  for (const r of rows) console.log(`${r.name.padEnd(40)} [${(r.tags || '').slice(0, 50)}]\n  ${r.path}`);
  if (!rows.length) console.log('(no matches)');
  d.close();
}

function where(name) {
  const d = db();
  const rows = d.prepare('SELECT path, type, size, mtime, tags FROM assets WHERE name LIKE ? LIMIT 20').all(`%${name}%`);
  for (const r of rows) console.log(`${r.type.padEnd(6)} ${r.mtime} ${r.path}  [${(r.tags || '').slice(0, 60)}]`);
  if (!rows.length) console.log('(not found)');
  d.close();
}

function collect(tag) {
  const d = db();
  const rows = d.prepare('SELECT name, type, path FROM assets WHERE tags LIKE ? LIMIT 50').all(`%${tag}%`);
  console.log(`Collection "${tag}" — ${rows.length} shown:`);
  for (const r of rows) console.log(`  ${r.type.padEnd(6)} ${r.name}  ${r.path}`);
  d.close();
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'index') scan();
else if (cmd === 'search') search(arg || '');
else if (cmd === 'where') where(arg || '');
else if (cmd === 'collect') collect(arg || '');
else console.log('usage: node archivist.cjs index | search <q> | where <name> | collect <tag>');
