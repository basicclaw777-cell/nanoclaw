/**
 * content-calendar.js — Weekly content plan generator for Basic Reflex
 *
 * Reads:
 *   - Kit's content feed (~/br-gm-agent/reports/content-feed.md)
 *   - Block config (~/nanoclaw/block-config.json) for curriculum highlights
 *   - Student intelligence profiles for milestones
 *   - Content pillars (vault) for strategic alignment
 *   - Seasonal/promotional context
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
  { pillar: 'Technique', weight: 0.4, desc: 'Breakdowns, tips, drills, Cuban boxing fundamentals' },
  { pillar: 'Community', weight: 0.3, desc: 'Student stories, class moments, team vibes' },
  { pillar: 'Brand', weight: 0.3, desc: 'Press, testimonials, coach spotlight, education' },
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
  context += `\nPROMOTIONS: $199 Trial Pass\n`;

  // If no API key, generate a simpler calendar without LLM
  if (!apiKey) {
    return generateFallbackCalendar(weekLabel, featuredBlock, principle, milestones);
  }

  const prompt = `You are a content strategist for Basic Reflex, a Cuban boxing gym in Sheung Wan, Hong Kong.

Generate a 5-7 post content calendar for the coming week.

${context}

CONTENT MIX TARGET:
- 40% technique (drills, tips, fundamentals)
- 30% community (member stories, class moments)
- 30% brand (coach spotlight, education, press features)

For each post, provide:
1. DAY (Mon-Sun)
2. TYPE (post / reel / carousel / story)
3. TOPIC (specific, not generic)
4. ANGLE (the hook — why someone stops scrolling)
5. VISUAL DIRECTION (what Reed should shoot/style)
6. TEMPLATE (technique_reel / class_recap / weekly_highlight / student_spotlight / quick_post)
7. CTA (one clear call to action)

Rules:
- The weekly principle should appear in at least one post (surface layer only — never explain the life principle)
- Feature the curriculum block's techniques naturally
- Include at least one member-focused post
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
  const posts = [
    { day: 'Monday', type: 'reel', topic: featuredBlock ? `Block ${featuredBlock.num} drill breakdown` : 'Jab fundamentals', angle: 'Start the week with fundamentals', visual: 'Reed pro_photo: clean technique demo', template: 'technique_reel', cta: CTA_OPTIONS[0] },
    { day: 'Tuesday', type: 'carousel', topic: 'Monday night class recap', angle: 'The energy from last night', visual: 'Reed: 3-5 class photos, pro_photo style', template: 'class_recap', cta: CTA_OPTIONS[3] },
    { day: 'Wednesday', type: 'post', topic: `"${principle.split("'")[0]}..."`, angle: 'Weekly principle — surface layer only', visual: 'Text overlay on gym atmosphere shot', template: 'quick_post', cta: CTA_OPTIONS[4] },
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
    const icon = post.type === 'reel' ? '🎬' : post.type === 'carousel' ? '📸' : post.type === 'story' ? '📱' : '📝';
    text += `${icon} *${post.day}* — ${post.type}\n`;
    text += `  ${post.topic}\n`;
    text += `  _${post.angle}_\n`;
    if (post.visual) text += `  Visual: ${post.visual}\n`;
    text += '\n';
  }

  text += `_Generated: ${calendar.generated?.split('T')[0]}_`;
  return text;
}
