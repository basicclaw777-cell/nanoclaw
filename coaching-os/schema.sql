-- Coaching OS — Layer 1: Knowledge Layer (SQLite)
-- Foundation schema for drills, themes, series, class planning, skill states.
-- Designed to integrate with coaching-engine.js (Layer 4: Learning).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════════════
-- KNOWLEDGE LAYER — what exists
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL,           -- footwork, defense, combos, conditioning, mindset, strategy, warm_up, icebreaker
  mode TEXT,                      -- shadow, partner, pads, bag, solo, group
  block_min INTEGER DEFAULT 1,   -- lowest block this is appropriate for
  block_max INTEGER DEFAULT 10,  -- highest block (compatible, not gating)
  time_min INTEGER,              -- seconds
  time_max INTEGER,              -- seconds
  group_size_min INTEGER DEFAULT 1,
  group_size_max INTEGER DEFAULT 30,
  equipment TEXT,                 -- JSON array
  levels TEXT,                    -- JSON: {beginner, intermediate, advanced}
  energy_demand TEXT DEFAULT 'medium',  -- low, medium, high, max
  engines TEXT NOT NULL DEFAULT '["body"]',  -- JSON array: body, mind, eq
  source TEXT,                   -- provenance
  scoring TEXT,                  -- JSON: {embodies, accessible, layered, ...} from drill-scoring
  created TEXT DEFAULT (date('now')),
  updated TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS drill_tags (
  drill_id TEXT NOT NULL REFERENCES drills(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (drill_id, tag)
);

CREATE TABLE IF NOT EXISTS drill_regressions (
  drill_id TEXT NOT NULL REFERENCES drills(id),
  regression_id TEXT NOT NULL REFERENCES drills(id),
  PRIMARY KEY (drill_id, regression_id)
);

CREATE TABLE IF NOT EXISTS drill_progressions (
  drill_id TEXT NOT NULL REFERENCES drills(id),
  progression_id TEXT NOT NULL REFERENCES drills(id),
  PRIMARY KEY (drill_id, progression_id)
);

-- ═══════════════════════════════════════════════════════════════════
-- THEME TAXONOMY — what a class orbits
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layer TEXT NOT NULL,            -- technique, concept, combo_family, style, physical
  description TEXT,
  block_range TEXT DEFAULT '[1,10]',  -- JSON [min, max] — compatible, not gating
  engines TEXT DEFAULT '["body"]',    -- JSON array
  created TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS theme_drills (
  theme_id TEXT NOT NULL REFERENCES themes(id),
  drill_id TEXT NOT NULL REFERENCES drills(id),
  relevance REAL DEFAULT 1.0,    -- 0.0-1.0 how central this drill is to theme
  PRIMARY KEY (theme_id, drill_id)
);

-- ═══════════════════════════════════════════════════════════════════
-- SEGMENTS — class structure (configurable, not fixed)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS segment_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,             -- e.g. "standard_6", "paul_8", "kids_5"
  description TEXT,
  segments TEXT NOT NULL          -- JSON array: [{num, name, purpose, time_range}]
);

-- ═══════════════════════════════════════════════════════════════════
-- PLANNING LAYER — classes and series
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  theme_id TEXT REFERENCES themes(id),
  template_id TEXT REFERENCES segment_templates(id),
  status TEXT DEFAULT 'draft',    -- draft, planned, taught, reviewed
  target_block_min INTEGER DEFAULT 1,
  target_block_max INTEGER DEFAULT 10,
  duration_minutes INTEGER DEFAULT 60,
  notes TEXT,
  energy_curve TEXT,              -- JSON: array of energy levels per segment
  taught_date TEXT,
  created TEXT DEFAULT (date('now')),
  updated TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS class_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  segment_num INTEGER NOT NULL,
  segment_name TEXT,
  drill_id TEXT REFERENCES drills(id),
  drill_notes TEXT,               -- coaching cues, watch-fors
  duration_minutes INTEGER,
  locked INTEGER DEFAULT 0,       -- 1 = don't suggest replacements
  UNIQUE(class_id, segment_num, drill_id)
);

CREATE TABLE IF NOT EXISTS class_tags (
  class_id TEXT NOT NULL REFERENCES classes(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (class_id, tag)
);

-- ═══════════════════════════════════════════════════════════════════
-- SERIES & CURRICULUM GRAPH
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  theme_layer TEXT,               -- which seed layer this series explores
  block_range TEXT DEFAULT '[1,10]',
  total_sessions INTEGER,
  status TEXT DEFAULT 'placeholder',  -- placeholder, active, complete, archived
  lifecycle TEXT DEFAULT 'idea',  -- idea, placeholder, taught_live, refined, packaged, published, maintained
  created TEXT DEFAULT (date('now')),
  updated TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS series_classes (
  series_id TEXT NOT NULL REFERENCES series(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  position INTEGER NOT NULL,      -- order within series
  PRIMARY KEY (series_id, class_id)
);

CREATE TABLE IF NOT EXISTS series_edges (
  from_id TEXT NOT NULL REFERENCES series(id),
  to_id TEXT NOT NULL REFERENCES series(id),
  edge_type TEXT NOT NULL,        -- FOLLOWS, PREPARES, REINFORCES, CONTRASTS, DEFENDS, COMBINES, ADVANCES, SIMPLIFIES, ALTERNATIVE
  weight REAL DEFAULT 1.0,
  notes TEXT,
  PRIMARY KEY (from_id, to_id, edge_type)
);

-- ═══════════════════════════════════════════════════════════════════
-- LEARNING LAYER — skill states (ties into coaching-engine.js)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  current_block INTEGER DEFAULT 1,
  engines_profile TEXT,           -- JSON: {body: 0.0-1.0, mind: 0.0-1.0, eq: 0.0-1.0}
  notes TEXT,
  first_class TEXT,
  last_class TEXT,
  total_classes INTEGER DEFAULT 0,
  created TEXT DEFAULT (date('now')),
  updated TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS skill_states (
  student_id TEXT NOT NULL REFERENCES students(id),
  skill_id TEXT NOT NULL,         -- maps to drill domain or specific technique
  competency REAL DEFAULT 0.0,   -- 0.0-1.0 estimated
  confidence REAL DEFAULT 0.0,   -- how confident the estimate is (based on observations)
  last_observed TEXT,
  observation_count INTEGER DEFAULT 0,
  notes TEXT,
  PRIMARY KEY (student_id, skill_id)
);

CREATE TABLE IF NOT EXISTS class_attendance (
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  date TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY (class_id, student_id, date)
);

-- ═══════════════════════════════════════════════════════════════════
-- TEACHING LAYER — live class support
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coaching_cues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drill_id TEXT NOT NULL REFERENCES drills(id),
  cue_type TEXT NOT NULL,         -- watch_for, common_error, progression_trigger, key_phrase
  text TEXT NOT NULL,
  block_range TEXT DEFAULT '[1,10]',
  engine TEXT                     -- body, mind, eq
);

CREATE TABLE IF NOT EXISTS class_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT REFERENCES students(id),
  observation TEXT NOT NULL,
  engine TEXT,                    -- body, mind, eq
  drill_id TEXT REFERENCES drills(id),
  timestamp TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_drills_domain ON drills(domain);
CREATE INDEX IF NOT EXISTS idx_drills_mode ON drills(mode);
CREATE INDEX IF NOT EXISTS idx_themes_layer ON themes(layer);
CREATE INDEX IF NOT EXISTS idx_classes_theme ON classes(theme_id);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);
CREATE INDEX IF NOT EXISTS idx_series_status ON series(status);
CREATE INDEX IF NOT EXISTS idx_skill_states_student ON skill_states(student_id);
CREATE INDEX IF NOT EXISTS idx_class_segments_class ON class_segments(class_id);
CREATE INDEX IF NOT EXISTS idx_coaching_cues_drill ON coaching_cues(drill_id);
CREATE INDEX IF NOT EXISTS idx_class_observations_class ON class_observations(class_id);
