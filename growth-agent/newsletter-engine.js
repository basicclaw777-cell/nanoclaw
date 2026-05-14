/**
 * newsletter-engine.js — "Basic Reflex Lab Report" monthly newsletter generator
 *
 * Sections:
 *   - What we've been working on (curriculum updates, gym news)
 *   - Technique spotlight (one block focus per issue)
 *   - Member spotlight (with permission)
 *   - Upcoming events/promotions
 *   - CTA: book a trial / share with a friend
 *
 * Outputs markdown draft for Paul's review.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const REPORTS_DIR = path.join(__dirname, 'reports');
const VAULT_NEWSLETTER = path.join(HOME, 'cathedral-vault', '10_Agents', 'growth', 'content', 'newsletter');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

function readBlockConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(HOME, 'nanoclaw', 'block-config.json'), 'utf-8')); }
  catch { return null; }
}

function readMemberData() {
  try { return JSON.parse(fs.readFileSync(path.join(HOME, 'br-gm-agent', 'reports', 'member-data.json'), 'utf-8')); }
  catch { return null; }
}

function readPnL() {
  const reportsDir = path.join(HOME, 'nanoclaw', 'ops-agent', 'reports');
  try {
    const files = fs.readdirSync(reportsDir).filter(f => f.startsWith('pnl-') && f.endsWith('.json')).sort().reverse();
    if (files.length === 0) return null;
    return JSON.parse(fs.readFileSync(path.join(reportsDir, files[0]), 'utf-8'));
  } catch { return null; }
}

export async function generateNewsletter() {
  const now = new Date();
  const monthLabel = now.toISOString().slice(0, 7);
  const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const blockConfig = readBlockConfig();
  const memberData = readMemberData();
  const pnl = readPnL();

  // Pick a featured block for technique spotlight
  const blocks = blockConfig?.blocks || [];
  const monthNum = now.getMonth();
  const featuredBlock = blocks[monthNum % blocks.length];

  // Build context
  let context = `MONTH: ${monthName}\n`;
  context += `ACTIVE MEMBERS: ${memberData?.total_active_members || '?'}\n`;
  if (pnl) context += `REVENUE ESTIMATE: HK$${pnl.revenue?.totalEstimate?.toLocaleString() || '?'}\n`;
  if (featuredBlock) {
    context += `\nTECHNIQUE SPOTLIGHT: Block ${featuredBlock.num} — ${featuredBlock.name}\n`;
    context += `Punches: ${(featuredBlock.punches || []).join(', ')}\n`;
    context += `Defenses: ${(featuredBlock.defenses || []).join(', ')}\n`;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  let draft;
  if (apiKey) {
    try {
      const resp = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          max_tokens: 1200,
          temperature: 0.7,
          messages: [
            { role: 'system', content: 'You write newsletter drafts for Basic Reflex, a Cuban boxing gym in Hong Kong. Voice: warm, authentic, community-focused. Paul Barrett is the founder and head coach.' },
            { role: 'user', content: `Write the "Basic Reflex Lab Report" newsletter for ${monthName}.

${context}

Sections:
1. WHAT WE'VE BEEN WORKING ON — gym updates, curriculum news, any changes
2. TECHNIQUE SPOTLIGHT — feature the block above, make it accessible for beginners
3. MEMBER SPOTLIGHT — placeholder (Paul fills in with specific member + permission)
4. UPCOMING — mention trial pass offer, encourage referrals
5. CTA — book a trial / share with a friend / WhatsApp +852 9464 5361

Keep it under 500 words. Warm but not cheesy. Paul's voice. End with "See you at the gym."

Output as markdown.` }
          ]
        }),
        signal: AbortSignal.timeout(30000)
      });
      if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
      const data = await resp.json();
      draft = data.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      console.error('[newsletter] LLM error:', err.message);
      draft = null;
    }
  }

  if (!draft) {
    // Fallback template
    draft = `# Basic Reflex Lab Report — ${monthName}

## What We've Been Working On

[Paul: add gym updates, curriculum changes, new equipment, schedule changes]

Active members: ${memberData?.total_active_members || '?'}

## Technique Spotlight: ${featuredBlock ? `Block ${featuredBlock.num} — ${featuredBlock.name}` : 'Fundamentals'}

${featuredBlock ? `This month we're focusing on ${featuredBlock.name}. Key techniques: ${(featuredBlock.punches || []).join(', ')}. ${(featuredBlock.defenses || []).length > 0 ? `Defense focus: ${featuredBlock.defenses.join(', ')}.` : ''}` : 'This month: fundamentals review. Every great fighter returns to basics.'}

[Paul: add teaching insight or anecdote]

## Member Spotlight

[Paul: choose a member to feature — with their permission. What's their story? Why do they train?]

## Coming Up

- **$199 Trial Pass** — 3 sessions to try us out. No commitment.
- Know someone who'd love boxing? Send them our way.
- Corporate sessions available — perfect for team building.

## Book Your Trial

WhatsApp: +852 9464 5361
DM us on Instagram: @basicreflexhk
Link in bio

See you at the gym.
— Paul`;
  }

  const newsletter = {
    month: monthLabel,
    monthName,
    generated: new Date().toISOString(),
    status: 'draft',
    draft,
    featuredBlock: featuredBlock ? { num: featuredBlock.num, name: featuredBlock.name } : null,
  };

  const filename = `newsletter-${monthLabel}.json`;
  fs.writeFileSync(path.join(REPORTS_DIR, filename), JSON.stringify(newsletter, null, 2));
  try { fs.writeFileSync(path.join(VAULT_NEWSLETTER, filename), JSON.stringify(newsletter, null, 2)); } catch {}

  return newsletter;
}

export function getCurrentNewsletter() {
  try {
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith('newsletter-') && f.endsWith('.json'))
      .sort().reverse();
    if (files.length === 0) return null;
    return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, files[0]), 'utf-8'));
  } catch { return null; }
}

export function formatNewsletterTelegram(newsletter) {
  if (!newsletter) return '_No newsletter draft yet. Run /growth newsletter generate._';

  let text = `📰 *Lab Report — ${newsletter.monthName}*\n`;
  text += `Status: ${newsletter.status}\n`;
  if (newsletter.featuredBlock) text += `Spotlight: Block ${newsletter.featuredBlock.num} — ${newsletter.featuredBlock.name}\n`;
  text += `\n_Draft preview (first 500 chars):_\n`;
  text += newsletter.draft?.slice(0, 500) || '(empty)';
  text += '\n\n_Full draft in vault: 10\\_Agents/growth/content/newsletter/_';
  return text;
}
