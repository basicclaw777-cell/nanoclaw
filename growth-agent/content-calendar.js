/**
 * content-calendar.js — Weekly content plan generator for Basic Reflex
 *
 * Reads:
 *   - Kit's content feed (~/br-gm-agent/reports/content-feed.md)
 *   - Block config (~/nanoclaw/block-config.json) for curriculum highlights
 *   - Student intelligence profiles for milestones
 *   - Content pillars (vault) for strategic alignment
 *   - Seasonal/promotional context
 *   - BR Screening Room (films/docs/songs with principles) for Internal Game posts
 *
 * Outputs: 5-7 post briefs per week with topic, angle, visual direction,
 *          caption draft, hashtags, CTA, and scheduled day.
 *
 * Does NOT generate captions — that's content-conductor's job.
 * Calendar generates the PLAN. Conductor + Maya generate the VOICE.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const REPORTS_DIR = path.join(__dirname, 'reports');
const VAULT_CALENDAR = path.join(HOME, 'cathedral-vault', '10_Agents', 'growth', 'content', 'calendar');

// ── Data Sources ────────────────────────────────────────────────────────────

function readKitFeed() {
  try {
    return fs.readFileSync(path.join(HOME, 'br-gm-agent', 'reports', 'content-feed.md'), 'utf-8');
  } catch { return 'No Kit feed available this week.'; }
}

function readBlockConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(HOME, 'nanoclaw', 'block-config.json'), 'utf-8'));
  } catch { return null; }
}

function readScreeningRoom() {
  try {
    const html = fs.readFileSync(path.join(HOME, 'Cathedral', 'control-panel', 'br-screening-room.html'), 'utf-8');
    // Extract MEDIA array from the HTML
    const match = html.match(/const MEDIA = \[([\s\S]*?)\];/);
    if (!match) return [];
    // Safe parse: wrap in array brackets and eval-free extraction
    const entries = [];
    const typeRe = /type:\s*'(\w+)'/g;
    const titleRe = /title:\s*'([^']+)'/g;
    const principleRe = /principle:\s*'([^']+)'/g;
    const realRe = /real:\s*'([^']+)'/g;
    const blocksRe = /blocks:\s*\[([^\]]+)\]/g;
    const themesRe = /themes:\s*\[([^\]]+)\]/g;
    const artistRe = /artist:\s*'([^']+)'/g;
    const raw = match[1];
    // Split by opening brace of each object
    const chunks = raw.split(/\n\s*\{/).filter(c => c.includes('type:'));
    for (const chunk of chunks) {
      const t = chunk.match(/type:\s*'(\w+)'/);
      const ti = chunk.match(/title:\s*'([^']+)'/);
      const p = chunk.match(/principle:\s*'([^']+)'/);
      const r = chunk.match(/real:\s*'([^']+)'/);
      const b = chunk.match(/blocks:\s*\[([^\]]+)\]/);
      const th = chunk.match(/themes:\s*\[([^\]]+)\]/);
      const a = chunk.match(/artist:\s*'([^']+)'/);
      if (t && ti && p) {
        entries.push({
          type: t[1],
          title: ti[1],
          principle: p[1].replace(/\\'/g, "'"),
          real: r ? r[1].replace(/\\'/g, "'") : '',
          blocks: b ? b[1].split(',').map(n => parseInt(n.trim())) : [],
          themes: th ? th[1].replace(/'/g, '').split(',').map(s => s.trim()) : [],
          artist: a ? a[1] : null
        });
      }
    }
    return entries;
  } catch { return []; }
}

function getScreeningPicks(count = 2) {
  const entries = readScreeningRoom();
  if (entries.length === 0) return '';
  // Pick random entries biased toward internal game themes
  const internalThemes = ['ego', 'fear', 'discipline', 'identity', 'mentorship', 'mastery', 'heart', 'resilience', 'presence', 'patience', 'sacrifice', 'courage', 'purpose', 'obsession'];
  const internal = entries.filter(e => e.themes.some(t => internalThemes.includes(t)));
  const pool = internal.length >= count ? internal : entries;
  const picks = [];
  const used = new Set();
  while (picks.length < count && picks.length < pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!used.has(idx)) {
      used.add(idx);
      picks.push(pool[idx]);
    }
  }
  return picks.map(p => {
    const credit = p.artist ? ` (${p.artist})` : '';
    return `- ${p.type.toUpperCase()}: "${p.title}"${credit} | Blocks: ${p.blocks.map(b => 'B' + b).join(',')} | Themes: ${p.themes.join(', ')}\n  Principle: "${p.principle}"\n  Teaching: ${p.real}`;
  }).join('\n');
}

// ── Maya Asks Format ─────────────────────────────────────────────────────────

const MAYA_ASKS_QUESTIONS = {
  // Theme → question templates Maya would ask Coach Paul
  heart:       ["Coach, what keeps you going when the round gets ugly?", "Why do you say heart matters more than hands?"],
  discipline:  ["Coach, why do you make us do the same drill over and over?", "What's the difference between discipline and punishment?"],
  ego:         ["Coach, how do you know when ego is driving instead of hunger?", "Why do some talented fighters destroy themselves?"],
  identity:    ["Coach, when did you stop being someone who does boxing and become a boxer?", "How do you find your own style?"],
  mentorship:  ["Coach, what's the hardest part about teaching?", "When do you know a student is ready for the next level?"],
  mastery:     ["Coach, what does mastery actually look like in the ring?", "Is mastery a destination or a direction?"],
  fear:        ["Coach, how do you deal with fear before a fight?", "Can you train fear out of someone?"],
  resilience:  ["Coach, how do you come back after a loss?", "What did your worst round teach you?"],
  sacrifice:   ["Coach, what did boxing cost you?", "Is the sacrifice worth it?"],
  patience:    ["Coach, why do you always say 'jab first'?", "How do you teach patience to someone who just wants to throw bombs?"],
  strategy:    ["Coach, how do you make someone fight YOUR fight?", "When do you change the game plan mid-round?"],
  presence:    ["Coach, what does 'being present' mean in the ring?", "Why do you tell us to stop thinking?"],
  courage:     ["Coach, what's the bravest thing you've seen in the ring?", "Is courage the same as not being afraid?"],
  purpose:     ["Coach, why do you still do this?", "What's the difference between fighting for something and just fighting?"],
  destruction: ["Coach, why do some fighters self-destruct?", "What's the line between pushing hard and breaking?"],
  obsession:   ["Coach, when does dedication become obsession?", "Is obsession required for greatness?"],
  legacy:      ["Coach, what do you want people to remember about Basic Reflex?", "How do you build something that lasts?"],
  humility:    ["Coach, why do the best fighters seem the most humble?", "What does humility look like in the ring?"],
};

const SCENE_SUGGESTIONS = {
  // Film/doc → iconic scene to reference
  'Rocky': 'Rocky running up the Philadelphia Museum steps at dawn — alone, 4am, nobody watching',
  'Raging Bull': 'LaMotta punching the cell wall after losing everything — rage with nowhere to go',
  'Million Dollar Baby': 'Frankie finally agreeing to train Maggie — the moment a mentor accepts responsibility',
  'Creed': 'Adonis shadow boxing in front of Apollo\'s old fight tape — becoming your own man',
  'Creed II': 'Adonis choosing to fight Drago despite Rocky saying no — when the student outgrows the teacher',
  'Cinderella Man': 'Braddock returning his welfare money — pride after the storm',
  'The Fighter': 'Micky telling his family to step back — choosing his own corner',
  'Ali': 'Ali refusing the draft — "I ain\'t got no quarrel with them Viet Cong"',
  'When We Were Kings': 'Ali on the ropes letting Foreman exhaust himself — the rope-a-dope moment',
  'Warrior': 'Tommy and Brendan facing each other in the cage — the fight nobody wanted',
  'Ip Man': 'Ip Man fighting 10 Japanese soldiers — mastery unleashed without ego',
  'Whiplash': 'Andrew bleeding on the drums, not stopping — the cost of greatness',
  'The Karate Kid': '"Wax on, wax off" — Daniel realising the chores WERE the training',
  'Gladiator': 'Maximus revealing himself in the arena — "What we do in life echoes in eternity"',
  'Fearless': 'Huo Yuanjia refusing to fight in the final round — the highest level is choosing peace',
  'Peaceful Warrior': 'Socrates at the gas station — "The journey is what brings us happiness"',
  'Hajime no Ippo: Rising': 'Ippo\'s first Dempsey Roll — pure earned technique, no shortcuts',
  'Megalo Box': 'Joe removing his gear before the final — fighting naked, nothing to hide behind',
  'Bloodsport': 'Frank Dux fighting blind in the final — when sight goes, instinct takes over',
  'Southpaw': 'Billy Hope sweeping the gym floor — champion restarting from zero',
  'Rocky Balboa': '"It ain\'t about how hard you hit" speech to his son',
  'Hoop Dreams': 'Arthur\'s family watching him play — dreams bigger than one person',
  'Girlfight': 'Diana\'s first session — the gym doesn\'t care about your story',
  'Tyson': 'Tyson crying about Cus D\'Amato — "He was the only one who believed in me"',
  'Champs': 'Hopkins describing prison — the cage that created the champion',
  'Senna': 'Senna driving in the rain at Monaco — beyond the machine',
  'Pumping Iron': 'Arnold psyching out Lou Ferrigno at breakfast — the fight before the fight',
  'Free Solo': 'Honnold\'s brain scan showing no fear response — repetition dissolved the fear',
  'The Last Dance': 'Jordan pushing Steve Kerr in practice then passing to him for the championship shot',
  'Jiro Dreams of Sushi': 'Apprentice spending 10 years learning to make rice — spiral mastery',
  'I Am Bruce Lee': '"Be water, my friend" — absorb what is useful',
  'Icarus': 'Rodchenkov explaining the state-sponsored cheat — the system is not your friend',
  'Counting the Cost': 'Brain scan of a retired fighter — the cost nobody talks about',
  'Knuckle': 'Bare-knuckle fight on the roadside — fighting before sport, before rules',
};

function getMayaAsksEntry() {
  const entries = readScreeningRoom();
  if (entries.length === 0) {
    return {
      day: 'Wednesday', type: 'reel', template: 'maya_asks',
      topic: 'Maya Asks: Why do we train?',
      angle: 'Maya asks, Coach Paul answers, film clip proves it',
      visual: 'Act 1: Maya question text on screen. Act 2: Paul talking in gym, natural, 30-60s. Act 3: principle text overlay.',
      cta: CTA_OPTIONS[4],
      maya_question: "Coach, why do you still do this every day?",
      paul_answer_angle: "Talk about the process being the point, not the destination.",
      screening_ref: null,
    };
  }

  // Pick one entry, prefer internal game themes
  const internalThemes = ['ego', 'fear', 'discipline', 'identity', 'mentorship', 'mastery', 'heart', 'resilience', 'presence', 'patience', 'sacrifice', 'courage', 'purpose', 'obsession', 'humility', 'legacy'];
  const internal = entries.filter(e => e.themes.some(t => internalThemes.includes(t)));
  const pool = internal.length > 0 ? internal : entries;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  // Find a matching question
  const matchingTheme = pick.themes.find(t => MAYA_ASKS_QUESTIONS[t]) || pick.themes[0];
  const questions = MAYA_ASKS_QUESTIONS[matchingTheme] || MAYA_ASKS_QUESTIONS.heart;
  const question = questions[Math.floor(Math.random() * questions.length)];

  // Get scene suggestion
  const scene = SCENE_SUGGESTIONS[pick.title] || `Key scene from ${pick.title} that shows the principle in action`;

  const credit = pick.artist ? ` by ${pick.artist}` : ` (${pick.type})`;

  return {
    day: 'Wednesday',
    type: 'reel',
    template: 'maya_asks',
    topic: `Maya Asks: ${pick.principle.split('.')[0]}`,
    angle: `${question} — Paul answers with his take, then cut to ${pick.title}`,
    visual: `ACT 1: Maya question as text on dark screen with gym ambient sound (3s). ACT 2: Coach Paul answers on camera — gym setting, natural, 30-60s. ACT 3: Cut to clip from "${pick.title}"${credit} — ${scene}. ACT 4: Principle text overlay on black: "${pick.principle}"`,
    cta: 'Save this for your next session',
    maya_question: question,
    paul_answer_angle: pick.real,
    screening_ref: {
      title: pick.title,
      type: pick.type,
      artist: pick.artist || null,
      principle: pick.principle,
      scene_to_cut: scene,
      blocks: pick.blocks,
      themes: pick.themes,
    },
  };
}

function readMemberData() {
  try {
    return JSON.parse(fs.readFileSync(path.join(HOME, 'br-gm-agent', 'reports', 'member-data.json'), 'utf-8'));
  } catch { return null; }
}

function readStudentMilestones() {
  const profilesDir = path.join(HOME, 'nanoclaw', 'student-intelligence', 'profiles');
  const milestones = [];
  try {
    for (const f of fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'))) {
      const profile = JSON.parse(fs.readFileSync(path.join(profilesDir, f), 'utf-8'));
      if (profile.attendance?.total_classes >= 50 || profile.risk_level === 'green') {
        milestones.push({ name: profile.name, classes: profile.attendance?.total_classes || 0, risk: profile.risk_level });
      }
    }
  } catch {}
  return milestones;
}

// ── Content Pillars (hardcoded from vault strategy) ─────────────────────────

const CONTENT_PILLARS = [
  { pillar: 'Technique', weight: 0.35, desc: 'Breakdowns, tips, drills, Cuban boxing fundamentals' },
  { pillar: 'Community', weight: 0.25, desc: 'Student stories, class moments, team vibes' },
  { pillar: 'Brand', weight: 0.2, desc: 'Press, testimonials, coach spotlight, education' },
  { pillar: 'Internal Game', weight: 0.2, desc: 'Mindset, philosophy, lessons from film/music/docs — sourced from BR Screening Room' },
];

const DUAL_LAYER_PRINCIPLES = [
  "Don't throw the cross until you've established the jab",
  "Test range",
  "Match what they give you before giving more",
  "Return to neutral between exchanges",
  "Don't keep loading the same axis",
];

const CTA_OPTIONS = [
  'Book your trial — link in bio',
  'DM us to get started',
  'WhatsApp +852 9464 5361',
  'Tag someone who needs this',
  'Save this for your next session',
];

const HASHTAG_POOL = [
  '#BasicReflex', '#BoxingHK', '#CubanBoxing', '#HongKongBoxing',
  '#BoxingGym', '#BoxingTraining', '#LearnToBox', '#BoxingLife',
  '#SheungWan', '#HKFitness', '#BoxingIsTherapy', '#PadWork',
  '#BoxingDrills', '#DefenceFirst', '#FootworkMatters',
];

// ── Calendar Generation ─────────────────────────────────────────────────────

export async function generateWeeklyCalendar() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  // Gather context
  const kitFeed = readKitFeed();
  const blockConfig = readBlockConfig();
  const memberData = readMemberData();
  const milestones = readStudentMilestones();

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + (1 - now.getDay() + 7) % 7); // next Monday
  const weekLabel = weekStart.toISOString().slice(0, 10);

  // Pick this week's featured block
  const blocks = blockConfig?.blocks || [];
  const featuredBlock = blocks[Math.floor(Math.random() * blocks.length)];

  // Pick this week's dual-layer principle
  const weekNum = Math.floor(now.getTime() / (7 * 86400000));
  const principle = DUAL_LAYER_PRINCIPLES[weekNum % DUAL_LAYER_PRINCIPLES.length];

  // Build context for LLM
  let context = `WEEK OF: ${weekLabel}\n\n`;
  context += `KIT'S BRIEFING:\n${kitFeed}\n\n`;
  if (featuredBlock) {
    context += `FEATURED BLOCK: Block ${featuredBlock.num} — ${featuredBlock.name}\n`;
    context += `Punches: ${(featuredBlock.punches || []).join(', ')}\n`;
    context += `Defenses: ${(featuredBlock.defenses || []).join(', ')}\n`;
    context += `Max combo: ${featuredBlock.maxComboLength}\n\n`;
  }
  context += `WEEKLY PRINCIPLE: "${principle}"\n\n`;
  context += `ACTIVE MEMBERS: ${memberData?.total_active_members || '?'}\n`;
  if (milestones.length > 0) {
    context += `MILESTONE CANDIDATES: ${milestones.map(m => `${m.name} (${m.classes} classes)`).join(', ')}\n`;
  }
  const screeningPicks = getScreeningPicks(2);
  if (screeningPicks) {
    context += `\nSCREENING ROOM PICKS (for Internal Game posts — use the principle, not the plot):\n${screeningPicks}\n`;
  }
  context += `\nPROMOTIONS: $199 Trial Pass\n`;

  // If no API key, generate a simpler calendar without LLM
  if (!apiKey) {
    return generateFallbackCalendar(weekLabel, featuredBlock, principle, milestones);
  }

  const prompt = `You are a content strategist for Basic Reflex, a Cuban boxing gym in Sheung Wan, Hong Kong.

Generate a 5-7 post content calendar for the coming week.

${context}

CONTENT MIX TARGET:
- 35% technique (drills, tips, fundamentals)
- 25% community (member stories, class moments)
- 20% brand (coach spotlight, education, press features)
- 20% internal game (mindset, philosophy — use Screening Room principles as hooks. Post the PRINCIPLE as caption, reference the film/song/doc. Never summarise the plot — extract the boxing lesson.)

For each post, provide:
1. DAY (Mon-Sun)
2. TYPE (post / reel / carousel / story)
3. TOPIC (specific, not generic)
4. ANGLE (the hook — why someone stops scrolling)
5. VISUAL DIRECTION (what Reed should shoot/style)
6. TEMPLATE (technique_reel / class_recap / weekly_highlight / student_spotlight / quick_post / maya_asks)
7. CTA (one clear call to action)
8. SCREENING_REF (only for maya_asks template — the film/song/doc title and specific scene/moment to reference)

MAYA ASKS FORMAT (use 1x per week, template: maya_asks):
Structure: Maya (AI text on screen) asks Coach Paul a principle question → Paul answers on camera (30-60s, gym setting) → cut to film/song clip that proves the point → principle text overlay to close.
Three-act reel: QUESTION → LIVED ANSWER → CULTURAL PROOF.
The Screening Room picks above are your source. Pick one. Write Maya's question, Paul's answer angle, and the specific scene to cut to.
The question should feel like a student asking, not an interview. "Coach, why do you always say [principle]?" or "What does [principle] actually mean in the ring?"

Rules:
- The weekly principle should appear in at least one post (surface layer only — never explain the life principle)
- Feature the curriculum block's techniques naturally
- Include at least one member-focused post
- Include exactly one maya_asks post per week (Internal Game pillar)
- Weekend posts can be lighter/lifestyle
- Never two technique posts back-to-back
- Every post must be specific enough that Reed + Maya can execute without asking questions

Format as JSON array of objects.`;

  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 1500,
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'You generate structured content calendars for a boxing gym. Output valid JSON only.' },
          { role: 'user', content: prompt }
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '[]';

    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const posts = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Enrich with hashtags and CTAs
    const calendar = {
      week: weekLabel,
      generated: new Date().toISOString(),
      principle,
      featuredBlock: featuredBlock ? { num: featuredBlock.num, name: featuredBlock.name } : null,
      posts: posts.map((p, i) => ({
        ...p,
        hashtags: pickHashtags(p.topic || '', 5),
        cta: p.cta || CTA_OPTIONS[i % CTA_OPTIONS.length],
        status: 'planned',
      })),
    };

    saveCalendar(calendar);
    return calendar;
  } catch (err) {
    console.error('[content-calendar] LLM error:', err.message);
    return generateFallbackCalendar(weekLabel, featuredBlock, principle, milestones);
  }
}

function generateFallbackCalendar(weekLabel, featuredBlock, principle, milestones) {
  // Get a screening room pick for Maya Asks
  const mayaEntry = getMayaAsksEntry();

  const posts = [
    { day: 'Monday', type: 'reel', topic: featuredBlock ? `Block ${featuredBlock.num} drill breakdown` : 'Jab fundamentals', angle: 'Start the week with fundamentals', visual: 'Reed pro_photo: clean technique demo', template: 'technique_reel', cta: CTA_OPTIONS[0] },
    { day: 'Tuesday', type: 'carousel', topic: 'Monday night class recap', angle: 'The energy from last night', visual: 'Reed: 3-5 class photos, pro_photo style', template: 'class_recap', cta: CTA_OPTIONS[3] },
    mayaEntry,
    { day: 'Thursday', type: 'reel', topic: 'Coach Paul pad work', angle: 'Watch the hands. Every detail matters.', visual: 'Reed dramatic: slow-mo pad work', template: 'technique_reel', cta: CTA_OPTIONS[1] },
    { day: 'Friday', type: 'post', topic: milestones.length > 0 ? `${milestones[0].name} milestone` : 'Community highlight', angle: milestones.length > 0 ? `${milestones[0].classes} classes and counting` : 'Friday vibes at the gym', visual: 'Reed pro_photo: member portrait or group energy', template: milestones.length > 0 ? 'student_spotlight' : 'quick_post', cta: CTA_OPTIONS[2] },
  ];

  const calendar = {
    week: weekLabel,
    generated: new Date().toISOString(),
    principle,
    featuredBlock: featuredBlock ? { num: featuredBlock.num, name: featuredBlock.name } : null,
    posts: posts.map(p => ({ ...p, hashtags: pickHashtags(p.topic, 5), status: 'planned' })),
    note: 'Fallback calendar (no LLM). Upgrade with DEEPSEEK_API_KEY.',
  };

  saveCalendar(calendar);
  return calendar;
}

function pickHashtags(topic, count) {
  const always = ['#BasicReflex', '#BoxingHK', '#CubanBoxing'];
  const pool = HASHTAG_POOL.filter(h => !always.includes(h));
  const extra = pool.sort(() => Math.random() - 0.5).slice(0, count - always.length);
  return [...always, ...extra];
}

function saveCalendar(calendar) {
  const filename = `calendar-${calendar.week}.json`;
  fs.writeFileSync(path.join(REPORTS_DIR, filename), JSON.stringify(calendar, null, 2));
  // Also save to vault
  try {
    fs.writeFileSync(path.join(VAULT_CALENDAR, filename), JSON.stringify(calendar, null, 2));
  } catch {}
}

// ── Read current calendar ───────────────────────────────────────────────────

export function getCurrentCalendar() {
  try {
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith('calendar-') && f.endsWith('.json'))
      .sort().reverse();
    if (files.length === 0) return null;
    return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, files[0]), 'utf-8'));
  } catch { return null; }
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatCalendarTelegram(calendar) {
  if (!calendar) return '_No content calendar generated yet. Run /growth generate._';

  let text = `📅 *Content Calendar — ${calendar.week}*\n`;
  text += `Principle: _"${calendar.principle}"_\n`;
  if (calendar.featuredBlock) text += `Block: ${calendar.featuredBlock.num} — ${calendar.featuredBlock.name}\n`;
  text += '\n';

  for (const post of calendar.posts || []) {
    const isMayaAsks = post.template === 'maya_asks';
    const icon = isMayaAsks ? '🎭' : post.type === 'reel' ? '🎬' : post.type === 'carousel' ? '📸' : post.type === 'story' ? '📱' : '📝';
    text += `${icon} *${post.day}* — ${isMayaAsks ? 'MAYA ASKS' : post.type}\n`;
    text += `  ${post.topic}\n`;
    text += `  _${post.angle}_\n`;
    if (isMayaAsks && post.maya_question) {
      text += `  Maya: "${post.maya_question}"\n`;
      if (post.screening_ref) {
        text += `  Film: ${post.screening_ref.title} — ${post.screening_ref.scene_to_cut}\n`;
        text += `  Principle: _"${post.screening_ref.principle}"_\n`;
      }
    }
    if (post.visual) text += `  Visual: ${post.visual}\n`;
    text += '\n';
  }

  text += `_Generated: ${calendar.generated?.split('T')[0]}_`;
  return text;
}
