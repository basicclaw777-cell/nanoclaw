const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'vortex_data', 'punchpass.db');
const BLOCKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'block-config.json'), 'utf-8')).blocks;

// ===== Archetype Definitions =====
const ARCHETYPES = [
  {
    id: 'core_regular',
    name: 'Core Regular',
    emoji: '🥊',
    desc: 'Session pass holder, consistent attendance, zero or low no-shows',
    blockRange: [3, 6],
    classNeeds: 'Fundamental Boxing, technique drills, pad work progressions',
    coachNote: 'Backbone of the gym. Challenge them — they can handle progression pressure.'
  },
  {
    id: 'pt_warrior',
    name: 'PT Warrior',
    emoji: '👊',
    desc: 'Head PT client (Paul), invested in personal development',
    blockRange: [4, 7],
    classNeeds: 'Advanced pad work, strategy sessions, sparring prep',
    coachNote: 'Highest investment clients. Track their block progression carefully.'
  },
  {
    id: 'trainer_client',
    name: 'Trainer Client',
    emoji: '🎯',
    desc: 'Senior PT client (Aman/Tony/Kiyoshi), regular training',
    blockRange: [3, 5],
    classNeeds: 'Structured technique, trainer-led pad work, conditioning',
    coachNote: 'Coordinate with their PT on what blocks they are working through.'
  },
  {
    id: 'fresh_trial',
    name: 'Fresh Trial',
    emoji: '🌱',
    desc: 'Trial or onboarding pass, new to the gym',
    blockRange: [1, 2],
    classNeeds: 'Foundation class only. Guard position, gym culture, basic movement.',
    coachNote: 'Conversion window is small. Make first 3 sessions count. Personal attention.'
  },
  {
    id: 'drop_in_drifter',
    name: 'Drop-In Drifter',
    emoji: '🌊',
    desc: 'Drop-in pass, irregular attendance',
    blockRange: [1, 3],
    classNeeds: 'Fundamental Boxing. Cannot assume continuity between sessions.',
    coachNote: 'Each session is standalone for them. Repeat basics without making it feel repetitive.'
  },
  {
    id: 'private_crew',
    name: 'Private Crew',
    emoji: '👥',
    desc: 'Private or corporate group pass holder',
    blockRange: [2, 4],
    classNeeds: 'Group-adapted fundamentals, partner drills, team conditioning',
    coachNote: 'Social motivation is primary driver. Keep energy high, technique secondary to experience.'
  },
  {
    id: 'sparring_ready',
    name: 'Sparring Ready',
    emoji: '⚔️',
    desc: 'Attends sparring sessions, high frequency, advanced',
    blockRange: [5, 8],
    classNeeds: 'Sparring rounds, counter-punching drills, pressure training, ring craft',
    coachNote: 'Push them. They want to be tested. Match them carefully for productive rounds.'
  },
  {
    id: 'fading_member',
    name: 'Fading Member',
    emoji: '📉',
    desc: 'Previously active, no current active pass or declining attendance',
    blockRange: [0, 0],
    classNeeds: 'Re-engagement class. Welcome back without pressure.',
    coachNote: 'Reach out personally. Find out why they stopped. Usually life, not dissatisfaction.'
  },
  {
    id: 'high_roller',
    name: 'High Roller',
    emoji: '💎',
    desc: '20x pass or multiple concurrent passes, high commitment',
    blockRange: [3, 6],
    classNeeds: 'Variety across class types. They train enough to need rotation.',
    coachNote: 'Most valuable by volume. They see everything — quality and consistency matter most.'
  },
  {
    id: 'ghost',
    name: 'Ghost',
    emoji: '👻',
    desc: 'Active pass but zero or very low attendance recently',
    blockRange: [0, 0],
    classNeeds: 'None currently — they are not showing up.',
    coachNote: 'Money is not the issue (pass is active). Barrier is something else. DM them.'
  }
];

// ===== DB Init =====
function initDB() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS member_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      archetype_id TEXT,
      archetype_override TEXT,
      current_block INTEGER DEFAULT 1,
      block_override INTEGER,
      total_attended INTEGER DEFAULT 0,
      monthly_avg REAL DEFAULT 0,
      no_show_rate REAL DEFAULT 0,
      pass_type TEXT,
      pass_category TEXT,
      last_attendance TEXT,
      member_since TEXT,
      notes TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS custom_archetypes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🏷️',
      description TEXT,
      block_range_low INTEGER DEFAULT 1,
      block_range_high INTEGER DEFAULT 10,
      class_needs TEXT,
      coach_note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// ===== Classification Engine =====
function classifyMember(passes, attendance, noPassRecord) {
  // passes: array of active passes for this customer
  // attendance: row from customer_attendance (or null)
  // noPassRecord: row from no_active_pass (or null)

  if (noPassRecord && (!passes || passes.length === 0)) {
    return 'fading_member';
  }

  if (!passes || passes.length === 0) {
    return 'fading_member';
  }

  const passTypes = passes.map(p => (p.pass || '').toLowerCase());
  const attended = attendance ? (attendance.attended || 0) : 0;
  const noShows = attendance ? (attendance.no_shows || 0) : 0;

  // Check pass categories
  const hasPT_Paul = passTypes.some(p => p.includes('head pt') || p.includes('paul'));
  const hasPT_Trainer = passTypes.some(p =>
    p.includes('senior pt') || p.includes('aman') || p.includes('tony') || p.includes('kiyoshi')
  );
  const hasPrivate = passTypes.some(p => p.includes('private') || p.includes('corporate'));
  const hasTrial = passTypes.some(p => p.includes('trial') || p.includes('on-boarding') || p.includes('onboarding'));
  const hasDropIn = passTypes.some(p => p.includes('drop-in') || p.includes('drop in'));
  const has20x = passTypes.some(p => p.includes('20x'));
  const hasSession = passTypes.some(p =>
    p.includes('classic') || p.includes('10x') || p.includes('session pass') || p.includes('early bird') || p.includes('extended')
  );

  // Ghost: has pass but zero/very low attendance
  if (passes.length > 0 && attended === 0) {
    return 'ghost';
  }

  // Fresh Trial
  if (hasTrial && attended <= 3) {
    return 'fresh_trial';
  }

  // PT Warrior (Paul's clients)
  if (hasPT_Paul) {
    return 'pt_warrior';
  }

  // Trainer Client
  if (hasPT_Trainer) {
    return 'trainer_client';
  }

  // Private Crew
  if (hasPrivate) {
    return 'private_crew';
  }

  // High Roller (20x pass or multiple passes)
  if (has20x || passes.length >= 3) {
    return 'high_roller';
  }

  // Drop-In Drifter
  if (hasDropIn && !hasSession) {
    return 'drop_in_drifter';
  }

  // Core Regular (session pass + decent attendance)
  if (hasSession && attended >= 3) {
    return 'core_regular';
  }

  // Sparring Ready — would need class-level data. For now, high attendance + session pass
  if (attended >= 6 && hasSession) {
    return 'sparring_ready';
  }

  // Low attendance with pass
  if (attended <= 1 && passes.length > 0) {
    return 'ghost';
  }

  // Default
  if (hasSession || hasDropIn) {
    return 'drop_in_drifter';
  }

  return 'core_regular';
}

function categorizePasses(passes) {
  if (!passes || passes.length === 0) return { type: 'none', category: 'none' };

  const types = passes.map(p => p.pass || 'Unknown');
  const primary = types[0];

  let category = 'other';
  const lower = primary.toLowerCase();
  if (lower.includes('head pt') || lower.includes('paul')) category = 'head_pt';
  else if (lower.includes('senior pt') || lower.includes('aman') || lower.includes('tony') || lower.includes('kiyoshi')) category = 'senior_pt';
  else if (lower.includes('private') || lower.includes('corporate')) category = 'private_group';
  else if (lower.includes('classic') || lower.includes('20x') || lower.includes('10x') || lower.includes('extended') || lower.includes('early bird')) category = 'session_pass';
  else if (lower.includes('drop')) category = 'drop_in';
  else if (lower.includes('trial') || lower.includes('onboard') || lower.includes('on-board')) category = 'trial';
  else if (lower.includes('complimentary')) category = 'complimentary';

  return { type: types.join(' | '), category };
}

// ===== Profile Builder =====
function buildProfiles(db) {
  const latestRun = db.prepare(`SELECT MAX(id) as id FROM scrape_runs WHERE status = 'completed'`).get();
  if (!latestRun || !latestRun.id) throw new Error('No completed scrape runs found');
  const runId = latestRun.id;

  // Get all unique customers from active passes
  const activePassRows = db.prepare(`SELECT * FROM active_passes WHERE scrape_run_id = ?`).all(runId);
  const attendanceRows = db.prepare(`SELECT * FROM customer_attendance WHERE scrape_run_id = ?`).all(runId);
  const noPassRows = db.prepare(`SELECT * FROM no_active_pass WHERE scrape_run_id = ?`).all(runId);

  // Group passes by customer_id
  const passByCustomer = {};
  for (const row of activePassRows) {
    const cid = row.customer_id;
    if (!cid) continue;
    if (!passByCustomer[cid]) passByCustomer[cid] = { passes: [], firstName: row.first_name, lastName: row.last_name };
    passByCustomer[cid].passes.push(row);
  }

  // Map attendance by email or name (customer_id might differ)
  const attendByName = {};
  for (const row of attendanceRows) {
    const key = `${(row.first_name || '').trim().toLowerCase()}_${(row.last_name || '').trim().toLowerCase()}`;
    attendByName[key] = row;
  }

  // Track no-pass members
  const noPassByCustomer = {};
  for (const row of noPassRows) {
    const cid = row.customer_id;
    if (cid) noPassByCustomer[cid] = row;
  }

  const upsert = db.prepare(`
    INSERT INTO member_profiles (customer_id, first_name, last_name, email, archetype_id, total_attended, monthly_avg, no_show_rate, pass_type, pass_category, last_attendance, updated_at)
    VALUES (@customer_id, @first_name, @last_name, @email, @archetype_id, @total_attended, @monthly_avg, @no_show_rate, @pass_type, @pass_category, @last_attendance, datetime('now'))
    ON CONFLICT(customer_id) DO UPDATE SET
      first_name = @first_name,
      last_name = @last_name,
      email = COALESCE(@email, member_profiles.email),
      archetype_id = CASE WHEN member_profiles.archetype_override IS NOT NULL THEN member_profiles.archetype_override ELSE @archetype_id END,
      total_attended = @total_attended,
      monthly_avg = @monthly_avg,
      no_show_rate = @no_show_rate,
      pass_type = @pass_type,
      pass_category = @pass_category,
      last_attendance = @last_attendance,
      updated_at = datetime('now')
  `);

  let count = 0;

  // Process active pass holders
  const processMany = db.transaction(() => {
    for (const [cid, data] of Object.entries(passByCustomer)) {
      const nameKey = `${(data.firstName || '').trim().toLowerCase()}_${(data.lastName || '').trim().toLowerCase()}`;
      const attendance = attendByName[nameKey] || null;
      const archetype = classifyMember(data.passes, attendance, null);
      const passInfo = categorizePasses(data.passes);

      const attended = attendance ? (attendance.attended || 0) : 0;
      const noShows = attendance ? (attendance.no_shows || 0) : 0;
      const noShowRate = attended > 0 ? noShows / (attended + noShows) : 0;

      upsert.run({
        customer_id: cid,
        first_name: (data.firstName || '').trim(),
        last_name: (data.lastName || '').trim(),
        email: data.passes[0]?.email || null,
        archetype_id: archetype,
        total_attended: attended,
        monthly_avg: attended, // single month snapshot for now
        no_show_rate: Math.round(noShowRate * 100) / 100,
        pass_type: passInfo.type,
        pass_category: passInfo.category,
        last_attendance: attendance?.last_attendance || null
      });
      count++;
    }

    // Process no-pass members (fading)
    for (const [cid, row] of Object.entries(noPassByCustomer)) {
      if (passByCustomer[cid]) continue; // already processed

      const nameKey = `${(row.first_name || '').trim().toLowerCase()}_${(row.last_name || '').trim().toLowerCase()}`;
      const attendance = attendByName[nameKey] || null;

      upsert.run({
        customer_id: cid,
        first_name: (row.first_name || '').trim(),
        last_name: (row.last_name || '').trim(),
        email: row.email || null,
        archetype_id: 'fading_member',
        total_attended: attendance ? (attendance.attended || 0) : 0,
        monthly_avg: 0,
        no_show_rate: 0,
        pass_type: 'none',
        pass_category: 'none',
        last_attendance: row.last_attendance || null
      });
      count++;
    }
  });

  processMany();
  return count;
}

// ===== Query Functions =====
function getArchetype(id) {
  return ARCHETYPES.find(a => a.id === id) || null;
}

function getAllArchetypes(db) {
  const custom = db.prepare(`SELECT * FROM custom_archetypes`).all();
  const customMapped = custom.map(c => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    desc: c.description,
    blockRange: [c.block_range_low, c.block_range_high],
    classNeeds: c.class_needs,
    coachNote: c.coach_note,
    custom: true
  }));
  return [...ARCHETYPES, ...customMapped];
}

function getProfileSummary(db) {
  const rows = db.prepare(`
    SELECT archetype_id, COUNT(*) as count,
           ROUND(AVG(total_attended), 1) as avg_attended,
           ROUND(AVG(no_show_rate), 2) as avg_no_show
    FROM member_profiles
    GROUP BY archetype_id
    ORDER BY count DESC
  `).all();

  return rows.map(r => {
    const arch = getArchetype(r.archetype_id);
    return {
      ...r,
      name: arch ? arch.name : r.archetype_id,
      emoji: arch ? arch.emoji : '🏷️',
      blockRange: arch ? arch.blockRange : [0, 0]
    };
  });
}

function getMembersByArchetype(db, archetypeId) {
  return db.prepare(`
    SELECT * FROM member_profiles
    WHERE archetype_id = ?
    ORDER BY total_attended DESC
  `).all(archetypeId);
}

function searchMembers(db, query) {
  const q = `%${query}%`;
  return db.prepare(`
    SELECT * FROM member_profiles
    WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
    ORDER BY total_attended DESC
    LIMIT 20
  `).all(q, q, q);
}

function getMemberProfile(db, customerId) {
  return db.prepare(`SELECT * FROM member_profiles WHERE customer_id = ?`).get(customerId);
}

function setArchetypeOverride(db, customerId, archetypeId) {
  db.prepare(`
    UPDATE member_profiles
    SET archetype_override = ?, archetype_id = ?, updated_at = datetime('now')
    WHERE customer_id = ?
  `).run(archetypeId, archetypeId, customerId);
}

function setBlockOverride(db, customerId, block) {
  db.prepare(`
    UPDATE member_profiles
    SET block_override = ?, current_block = ?, updated_at = datetime('now')
    WHERE customer_id = ?
  `).run(block, block, customerId);
}

function updateMemberNotes(db, customerId, notes) {
  db.prepare(`
    UPDATE member_profiles SET notes = ?, updated_at = datetime('now') WHERE customer_id = ?
  `).run(notes, customerId);
}

function addMemberTag(db, customerId, tag) {
  const member = getMemberProfile(db, customerId);
  if (!member) return;
  const tags = JSON.parse(member.tags || '[]');
  if (!tags.includes(tag)) {
    tags.push(tag);
    db.prepare(`UPDATE member_profiles SET tags = ?, updated_at = datetime('now') WHERE customer_id = ?`)
      .run(JSON.stringify(tags), customerId);
  }
}

function removeMemberTag(db, customerId, tag) {
  const member = getMemberProfile(db, customerId);
  if (!member) return;
  const tags = JSON.parse(member.tags || '[]').filter(t => t !== tag);
  db.prepare(`UPDATE member_profiles SET tags = ?, updated_at = datetime('now') WHERE customer_id = ?`)
    .run(JSON.stringify(tags), customerId);
}

// ===== Custom Archetype Management =====
function addCustomArchetype(db, arch) {
  db.prepare(`
    INSERT OR REPLACE INTO custom_archetypes (id, name, emoji, description, block_range_low, block_range_high, class_needs, coach_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    arch.id, arch.name, arch.emoji || '🏷️', arch.desc || '',
    arch.blockRange?.[0] || 1, arch.blockRange?.[1] || 10,
    arch.classNeeds || '', arch.coachNote || ''
  );
}

function removeCustomArchetype(db, id) {
  db.prepare(`DELETE FROM custom_archetypes WHERE id = ?`).run(id);
}

// ===== Express Router =====
function createRouter() {
  const express = require('express');
  const router = express.Router();

  // Profile summary
  router.get('/api/punchpass/profiles', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      res.json(getProfileSummary(db));
    } finally { db.close(); }
  });

  // All archetypes
  router.get('/api/punchpass/archetypes', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      res.json(getAllArchetypes(db));
    } finally { db.close(); }
  });

  // Members by archetype
  router.get('/api/punchpass/profiles/:archetype', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const members = getMembersByArchetype(db, req.params.archetype);
      const arch = getArchetype(req.params.archetype);
      res.json({ archetype: arch, members });
    } finally { db.close(); }
  });

  // Search members
  router.get('/api/punchpass/members/search', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const results = searchMembers(db, req.query.q || '');
      res.json(results.map(m => ({
        ...m,
        archetype: getArchetype(m.archetype_id),
        block: m.block_override || m.current_block,
        blockInfo: BLOCKS[(m.block_override || m.current_block) - 1] || null
      })));
    } finally { db.close(); }
  });

  // Single member
  router.get('/api/punchpass/member/:id', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const member = getMemberProfile(db, req.params.id);
      if (!member) return res.status(404).json({ error: 'Not found' });
      const arch = getArchetype(member.archetype_id);
      const block = BLOCKS[(member.block_override || member.current_block) - 1] || null;
      res.json({ ...member, archetype: arch, blockInfo: block });
    } finally { db.close(); }
  });

  // Update member archetype
  router.post('/api/punchpass/member/:id/archetype', express.json(), (req, res) => {
    const db = new Database(DB_PATH);
    try {
      setArchetypeOverride(db, req.params.id, req.body.archetype_id);
      res.json({ ok: true });
    } finally { db.close(); }
  });

  // Update member block
  router.post('/api/punchpass/member/:id/block', express.json(), (req, res) => {
    const db = new Database(DB_PATH);
    try {
      setBlockOverride(db, req.params.id, req.body.block);
      res.json({ ok: true });
    } finally { db.close(); }
  });

  // Update member notes
  router.post('/api/punchpass/member/:id/notes', express.json(), (req, res) => {
    const db = new Database(DB_PATH);
    try {
      updateMemberNotes(db, req.params.id, req.body.notes);
      res.json({ ok: true });
    } finally { db.close(); }
  });

  // Add/remove tags
  router.post('/api/punchpass/member/:id/tag', express.json(), (req, res) => {
    const db = new Database(DB_PATH);
    try {
      if (req.body.action === 'remove') {
        removeMemberTag(db, req.params.id, req.body.tag);
      } else {
        addMemberTag(db, req.params.id, req.body.tag);
      }
      res.json({ ok: true });
    } finally { db.close(); }
  });

  // Run profiler
  router.post('/api/punchpass/profiles/build', (req, res) => {
    const db = new Database(DB_PATH);
    try {
      const count = buildProfiles(db);
      res.json({ ok: true, profiles_built: count });
    } finally { db.close(); }
  });

  // Add custom archetype
  router.post('/api/punchpass/archetypes', express.json(), (req, res) => {
    const db = new Database(DB_PATH);
    try {
      addCustomArchetype(db, req.body);
      res.json({ ok: true });
    } finally { db.close(); }
  });

  // Delete custom archetype
  router.delete('/api/punchpass/archetypes/:id', (req, res) => {
    const db = new Database(DB_PATH);
    try {
      removeCustomArchetype(db, req.params.id);
      res.json({ ok: true });
    } finally { db.close(); }
  });

  return router;
}

// ===== CLI =====
if (require.main === module) {
  const db = initDB();
  const args = process.argv.slice(2);

  if (args[0] === 'build') {
    const count = buildProfiles(db);
    console.log(`Built ${count} member profiles`);

    const summary = getProfileSummary(db);
    console.log('\nArchetype Breakdown:');
    for (const s of summary) {
      console.log(`  ${s.emoji} ${s.name}: ${s.count} members (avg ${s.avg_attended} sessions, ${Math.round(s.avg_no_show * 100)}% no-show)`);
    }
  } else if (args[0] === 'search') {
    const results = searchMembers(db, args.slice(1).join(' '));
    for (const m of results) {
      const arch = getArchetype(m.archetype_id);
      console.log(`  ${arch?.emoji || '?'} ${m.first_name} ${m.last_name} — ${arch?.name || m.archetype_id} (${m.total_attended} sessions, block ${m.current_block})`);
    }
  } else if (args[0] === 'archetype') {
    const members = getMembersByArchetype(db, args[1]);
    const arch = getArchetype(args[1]);
    console.log(`\n${arch?.emoji} ${arch?.name} — ${arch?.desc}`);
    console.log(`Blocks ${arch?.blockRange[0]}-${arch?.blockRange[1]} | ${arch?.classNeeds}`);
    console.log(`Coach: ${arch?.coachNote}\n`);
    for (const m of members) {
      console.log(`  ${m.first_name} ${m.last_name} — ${m.total_attended} sessions`);
    }
  } else {
    console.log('Usage:');
    console.log('  node punchpass-profiler.cjs build          — classify all members');
    console.log('  node punchpass-profiler.cjs search <name>  — find member');
    console.log('  node punchpass-profiler.cjs archetype <id> — list archetype members');
    console.log('\nArchetypes:', ARCHETYPES.map(a => a.id).join(', '));
  }

  db.close();
}

module.exports = { initDB, buildProfiles, getProfileSummary, getMembersByArchetype, searchMembers, getMemberProfile, getArchetype, getAllArchetypes, setArchetypeOverride, setBlockOverride, updateMemberNotes, addMemberTag, removeMemberTag, addCustomArchetype, removeCustomArchetype, createRouter, ARCHETYPES, BLOCKS };
