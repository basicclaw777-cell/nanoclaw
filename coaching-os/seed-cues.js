// seed-cues.js — Populate coaching_cues table with watch-fors and key phrases
// Run: node coaching-os/seed-cues.js

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'coaching-os', 'coaching.db');
const db = new Database(DB_PATH);

const insert = db.prepare(`
  INSERT OR IGNORE INTO coaching_cues (drill_id, cue_type, text, block_range, engine)
  VALUES (?, ?, ?, ?, ?)
`);

const cues = [
  // Footwork
  ['fw-01', 'watch_for', 'Are they crossing their feet on entry?', '[1,4]', 'body'],
  ['fw-01', 'key_phrase', 'Step THEN punch. Never arrive square.', '[1,4]', 'body'],
  ['fw-01', 'common_error', 'Leaning forward instead of stepping — weight stays centred', '[1,4]', 'body'],
  ['fw-02', 'watch_for', 'Weight sitting flat? Should feel like a pendulum, never planted.', '[1,3]', 'body'],
  ['fw-02', 'key_phrase', 'Rock the boat. Forward-back, never flat.', '[1,3]', 'body'],
  ['fw-03', 'watch_for', 'Pivot on ball of lead foot — heel off the ground', '[2,5]', 'body'],
  ['fw-03', 'common_error', 'Pivoting on heel = slow + off-balance', '[2,5]', 'body'],
  ['fw-04', 'watch_for', 'Three points clearly defined? Or are they shuffling vaguely?', '[3,6]', 'body'],
  ['fw-05', 'watch_for', 'Mirroring or chasing? They should CUT not FOLLOW', '[4,7]', 'mind'],
  ['fw-05', 'key_phrase', 'Head them off. Think where they WILL be.', '[4,7]', 'mind'],
  ['fw-06', 'watch_for', 'Who controls the centre? The one walking backwards lost it.', '[5,8]', 'mind'],
  ['fw-07', 'watch_for', 'Guard up while weaving? Or hands drop during movement?', '[1,3]', 'body'],
  ['fw-07', 'common_error', 'Looking at cones instead of keeping head position', '[1,3]', 'body'],
  ['fw-08', 'watch_for', 'Feet crossing? Back foot dragging or stepping past lead?', '[1,2]', 'body'],
  ['fw-08', 'key_phrase', 'Step-drag. Lead foot goes first. Every direction.', '[1,2]', 'body'],

  // Defense
  ['df-01', 'watch_for', 'Are they bending at waist or knees? Knees = correct.', '[2,5]', 'body'],
  ['df-01', 'key_phrase', 'Slip with the knees, not the waist. Eyes stay on opponent.', '[2,5]', 'body'],
  ['df-01', 'common_error', 'Closing eyes when the punch comes — the flinch', '[2,5]', 'eq'],
  ['df-01', 'progression_trigger', 'Clean slips 8/10 times → add counter punch on exit', '[2,5]', 'body'],
  ['df-02', 'watch_for', 'Catch is clean? Or flinching/blocking high?', '[1,3]', 'body'],
  ['df-02', 'key_phrase', 'Catch, counter. One rhythm. Dont catch then think.', '[1,3]', 'body'],
  ['df-03', 'watch_for', 'Coming up on same side they went down? Should be OPPOSITE.', '[3,5]', 'body'],
  ['df-03', 'common_error', 'Rolling too low and losing balance on the way up', '[3,5]', 'body'],
  ['df-04', 'watch_for', 'Parry is a redirect not a slap. Small movement.', '[2,4]', 'body'],
  ['df-05', 'watch_for', 'Weight shifts back but chin stays tucked? Or leaning back head-first?', '[4,7]', 'body'],
  ['df-05', 'key_phrase', 'Pull from the hips. Chin stays. Counter is already loaded.', '[4,7]', 'body'],
  ['df-06', 'watch_for', 'Can they SEE through the shell? Or just hiding?', '[3,6]', 'mind'],
  ['df-06', 'key_phrase', 'Shell is for READING, not hiding. Absorb, read, counter.', '[3,6]', 'mind'],
  ['df-07', 'watch_for', 'Pivot timing — too early = miss, too late = eat the shot', '[5,8]', 'mind'],
  ['df-08', 'watch_for', 'Lead shoulder high enough to catch? Or arm doing all the work?', '[6,9]', 'body'],

  // Combos
  ['cb-01', 'watch_for', 'Jab setting range or just thrown to throw? Cross should LAND.', '[1,3]', 'body'],
  ['cb-01', 'key_phrase', 'Jab is the question. Cross is the answer.', '[1,3]', 'body'],
  ['cb-01', 'common_error', 'Dropping the jab hand before throwing the cross — telegraph', '[1,3]', 'body'],
  ['cb-02', 'watch_for', 'Weight transfer through all three? Or stuck after the cross?', '[1,3]', 'body'],
  ['cb-02', 'key_phrase', 'Flow through. 1 sets 2, 2 sets 3. One river.', '[1,3]', 'body'],
  ['cb-02', 'progression_trigger', 'Landing clean 1-2-3 → add defense after (slip out)', '[1,3]', 'body'],
  ['cb-03', 'watch_for', 'Second jab changes rhythm? Or is it just two of the same?', '[2,4]', 'mind'],
  ['cb-03', 'key_phrase', 'Double jab = timing disrupt. Second one is the setup.', '[2,4]', 'mind'],
  ['cb-04', 'watch_for', 'Starting from the cross — are they loaded on the back foot?', '[2,5]', 'body'],

  // System drills (rich format)
  ['tennis-ball-foot-catch', 'watch_for', 'Laughter = mission accomplished. No laughter = too serious.', '[1,10]', 'eq'],
  ['tennis-ball-foot-catch', 'key_phrase', 'Names! Say the name before you throw.', '[1,10]', 'eq'],
  ['tennis-ball-basketball', 'watch_for', 'Can they maintain boxing guard position while dribbling?', '[1,5]', 'body'],
  ['line-drill-agility', 'watch_for', 'Who reacts fastest? Who panics? Watch the hesitation.', '[1,5]', 'mind'],
  ['line-drill-agility', 'key_phrase', 'React, dont think. Body knows before brain.', '[1,5]', 'mind'],
  ['numbers-footwork', 'watch_for', 'Moving to numbers with correct footwork or just running?', '[1,5]', 'body'],
  ['numbers-footwork', 'progression_trigger', 'Moving cleanly → add punch on arrival', '[1,5]', 'body'],
  ['jab-defend-reset', 'watch_for', 'What happens AFTER the punch? Do they reset or freeze?', '[2,5]', 'mind'],
  ['jab-defend-reset', 'key_phrase', 'Punch is only 50%. The exit is the other 50%.', '[2,5]', 'mind'],
  ['jab-defend-reset', 'common_error', 'Admiring the punch — standing still after throwing', '[2,5]', 'mind'],
];

let count = 0;
for (const [drill_id, type, text, range, engine] of cues) {
  try {
    insert.run(drill_id, type, text, range, engine);
    count++;
  } catch (e) {
    // drill_id might not exist — skip
  }
}

db.close();
console.log(`Coaching cues seeded: ${count}`);
