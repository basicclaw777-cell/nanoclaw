/**
 * br-auto-responder.js — Instant reply drafts for BR inquiries
 *
 * Paul types /reply <type> [name] [details] on Telegram.
 * Gets back a copyable Coach Paul reply to paste into WhatsApp/IG.
 *
 * Types: kids, adult, classpass, opengym, trial, pricing, schedule, custom
 *
 * Also: /quickreply — one-tap access to most common reply types
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';

// Load env
const envFile = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8');
const DEEPSEEK_KEY = envFile.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim();

// Reply context — loaded from product packages
const PRODUCTS = {};

function loadProducts() {
  const files = [
    { key: 'kids', path: path.join(HOME, 'basic-reflex', 'kids-class', 'package.json') },
    { key: 'opengym', path: path.join(HOME, 'basic-reflex', 'open-gym', 'package.json') },
    { key: 'pathway', path: path.join(HOME, 'basic-reflex', '10-block-pathway', 'package.json') },
  ];
  for (const f of files) {
    try { PRODUCTS[f.key] = JSON.parse(fs.readFileSync(f.path, 'utf-8')); }
    catch { PRODUCTS[f.key] = null; }
  }
}

// Static reply templates — instant, no LLM needed
const QUICK_REPLIES = {
  kids: (name) => `Hi${name ? ' ' + name : ''}! Thanks for reaching out about boxing classes for your child.

We run a Youth Boxing programme at Basic Reflex — small group classes (max 8 kids), ages 12-16.

Schedule: Monday & Friday, 5:00-5:45pm

It's real boxing — technique, pads, bag work — taught properly in a safe environment. No contact sparring.

Pricing:
- Drop-in: HK$250 per class
- 10-class block: HK$2,000 (save $500)

First class is free — come try it out, no commitment.

They just need water, sportswear, and clean indoor trainers. We provide gloves and all equipment.

Want to book a trial?

Coach Paul
Basic Reflex Boxing, Kennedy Town`,

  adult: (name) => `Hey${name ? ' ' + name : ''}! Thanks for the message.

We're a boxing gym in Kennedy Town — real technique, not just fitness. Cuban boxing method, small classes, proper coaching.

First class is free. Just show up in sportswear with clean indoor trainers. We provide gloves and everything else.

Classes run evenings — check the schedule and pick one that works.

Any questions, just ask.

Coach Paul
Basic Reflex Boxing`,

  classpass: (name) => `Hey${name ? ' ' + name : ''}! Welcome via ClassPass.

Quick info:
- We're a boxing gym, not a fitness class. Real technique, proper coaching.
- No experience needed — we'll get you started.
- Bring sportswear + clean indoor trainers. Gloves provided.
- Small class — I'll know your name by the end.

See you in class.

Coach Paul`,

  opengym: (name) => `Hey${name ? ' ' + name : ''}! Open Gym is available.

You get the whole gym to yourself — heavy bags, speed ball, double-end bags, floor space. Your playlist, your pace.

Hours: 7am-11am and 12pm-4pm weekdays (when no class running)
Pricing: HK$200 per session or HK$1,800 for 10 (save $200)

15-minute induction on first visit. Solo training only.

Optional: AI form feedback via our wall camera (Gym Eyes) — punch count, technique flags, session report sent to your phone.

Want to book a session?

Coach Paul
Basic Reflex Boxing, Kennedy Town`,

  trial: (name) => `Hey${name ? ' ' + name : ''}! First class is free — no commitment, just come try it.

Bring sportswear and clean indoor trainers. We provide gloves and all equipment.

Show up 10 minutes early so I can get you set up.

See you there.

Coach Paul`,

  pricing: (name) => `Hey${name ? ' ' + name : ''}! Here's the pricing:

Adults:
- Monthly membership: HK$1,200/month
- First class: Free

Kids (12-16):
- Drop-in: HK$250/class
- 10-class block: HK$2,000 (save $500)
- First class: Free

Open Gym (private access):
- Drop-in: HK$200/session
- 10-session block: HK$1,800 (save $200)

10-Block Pathway (structured curriculum):
- HK$2,500 per 10-session block

Any questions, just ask.

Coach Paul`,

  schedule: (name) => `Hey${name ? ' ' + name : ''}! Here's our schedule:

Adult classes run evenings — check our page for exact times.

Kids class: Monday & Friday 5:00-5:45pm

Open Gym: Weekdays 7am-11am and 12pm-4pm (when no class running)

First class is always free. Just pick a time and show up.

Coach Paul`,
};

/**
 * Generate a custom reply using DeepSeek
 */
async function generateCustomReply(type, name, details) {
  if (!DEEPSEEK_KEY) return null;

  loadProducts();

  const productContext = Object.entries(PRODUCTS)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 500)}`)
    .join('\n');

  const prompt = `You are Coach Paul from Basic Reflex Boxing gym in Kennedy Town, Hong Kong.

Write a WhatsApp/DM reply to a potential customer.

VOICE RULES:
- Direct, warm, personal. Never corporate or salesy.
- Short paragraphs. No bullet-point walls unless showing pricing.
- Sign off: "Coach Paul" (never "Best regards" or "Kind regards")
- Include specific pricing when relevant
- Always mention first class is free
- Keep under 150 words

PRODUCT INFO:
${productContext}

INQUIRY TYPE: ${type}
PERSON'S NAME: ${name || 'unknown'}
DETAILS: ${details || 'General inquiry, no specific details given'}

Write the reply now. Plain text only, no markdown.`;

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[auto-responder] DeepSeek error:', err.message);
    return null;
  }
}

/**
 * Get a reply — quick template or AI-generated
 */
export async function getReply(type, name, details) {
  // Quick replies for standard types
  const quickFn = QUICK_REPLIES[type];
  if (quickFn && !details) {
    return { source: 'template', text: quickFn(name) };
  }

  // Custom details provided or unknown type — use DeepSeek
  const aiReply = await generateCustomReply(type, name, details);
  if (aiReply) {
    return { source: 'ai', text: aiReply };
  }

  // Fallback to template if AI fails
  if (quickFn) {
    return { source: 'template', text: quickFn(name) };
  }

  return { source: 'none', text: 'No template available for this inquiry type. Use /reply custom [name] [details]' };
}

/**
 * List available reply types
 */
export function listTypes() {
  return Object.keys(QUICK_REPLIES);
}

export default { getReply, listTypes, QUICK_REPLIES };
