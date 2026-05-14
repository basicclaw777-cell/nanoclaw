/**
 * corporate-outreach.js — Template engine for corporate programme outreach
 *
 * Segments:
 *   - Cold outreach (HR directors, wellness leads at HK firms)
 *   - Follow-up sequences (3-5 touch points)
 *   - Proposal template (customisable per company)
 *
 * Target sectors: banks, law firms, consulting, tech, co-working
 * in Central/Sheung Wan/Admiralty.
 *
 * Key selling points baked in:
 *   - HK has world's longest working hours
 *   - Boxing relieves stress (clinically documented)
 *   - Featured in TimeOut/Tatler/Sassy
 *   - Unique Cuban boxing methodology — nobody else offers this
 *   - 5 min walk from Central/Sheung Wan MTR
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const PIPELINE_PATH = path.join(__dirname, 'reports', 'corporate-pipeline.json');
const VAULT_CORPORATE = path.join(HOME, 'cathedral-vault', '10_Agents', 'growth', 'bizdev', 'corporate');

// ── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES = {
  cold_intro: {
    subject: 'Corporate Boxing Programme — {company}',
    body: `Hi {contact_name},

I'm Paul, founder of Basic Reflex — a boxing gym in Sheung Wan specialising in Cuban boxing methodology.

Hong Kong has the longest working hours in the world. Your team at {company} feels that. We offer corporate boxing sessions designed specifically for high-pressure professionals: stress relief, team building, and genuine fitness — not a token wellness box-tick.

What makes us different:
- Cuban boxing: technical, strategic, not just hitting bags
- Featured in TimeOut, Tatler, and Sassy Hong Kong
- 5 minutes from Central/Sheung Wan MTR
- Sessions customised for all fitness levels (beginners to experienced)
- Flexible scheduling: lunch hour, after-work, or team event format

We're currently running corporate pilots with firms in {area}. Happy to organise a complimentary trial session for your team.

Worth a conversation?

Paul
Basic Reflex
+852 9464 5361
basicreflex.com`,
  },

  follow_up_1: {
    subject: 'Re: Corporate Boxing — {company}',
    body: `Hi {contact_name},

Following up on my note about corporate boxing sessions for {company}.

Quick thought: one of the biggest challenges for corporate wellness programmes is participation. Boxing solves that — people actually want to come. It's not yoga-on-a-mat-in-the-boardroom. It's real, physical, and people leave feeling better than when they arrived.

Happy to send over our corporate programme overview if useful.

Paul
Basic Reflex`,
  },

  follow_up_2: {
    subject: 'Re: Corporate Boxing — {company}',
    body: `Hi {contact_name},

Last follow-up — I know {industry} moves fast and wellness emails stack up.

We recently ran a session for a {industry} team. Feedback: "Best team activity we've done in 3 years." Not because boxing is flashy, but because it levels the playing field. The MD and the intern are both learning something new. Nobody has an advantage. That's rare.

If corporate wellness is on your radar for {quarter}, I'd love to show you what we do. One trial session, no commitment.

Paul
Basic Reflex
+852 9464 5361`,
  },

  proposal: {
    subject: 'Corporate Boxing Programme Proposal — {company}',
    body: `# Corporate Boxing Programme
## Prepared for {company}

### Overview
Basic Reflex offers structured boxing training designed for corporate teams. Our Cuban boxing methodology focuses on technique, strategy, and stress management — not just fitness.

### Programme Options

**Option A: Team Sessions (most popular)**
- 60-minute group sessions at our Sheung Wan studio
- 8-20 participants per session
- Frequency: weekly or bi-weekly
- All equipment provided
- HK${'{'}price_team{'}'} per session

**Option B: Lunch & Box**
- 45-minute express sessions (12:30-1:15pm)
- Perfect for Central/Sheung Wan offices
- Walk in, box, shower, back at desk
- HK${'{'}price_lunch{'}'} per person

**Option C: Executive PT**
- 1-on-1 or small group (2-4)
- Personalised programme
- Flexible scheduling
- HK${'{'}price_pt{'}'} per session

### Why Boxing for Corporate
- Proven stress reduction (cortisol decrease documented within 30 min)
- Team bonding without the forced small-talk
- All levels welcome — zero experience needed
- Physical challenge that translates to mental resilience

### About Basic Reflex
- Founded by Paul Barrett, 15+ years boxing experience
- Cuban boxing methodology (unique in Hong Kong)
- Featured in TimeOut HK, Tatler, Sassy HK
- Located: Sheung Wan (5 min MTR)
- Members: professionals, creatives, families, first-timers

### Next Step
Complimentary trial session for up to 10 of your team.
Contact: Paul — +852 9464 5361 | paul@basicreflex.com

---
*Basic Reflex — Learn to box. Change how you live.*`,
  },
};

// ── Pipeline Management ─────────────────────────────────────────────────────

function loadPipeline() {
  try { return JSON.parse(fs.readFileSync(PIPELINE_PATH, 'utf-8')); }
  catch { return { prospects: [], lastUpdated: null }; }
}

function savePipeline(pipeline) {
  pipeline.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PIPELINE_PATH, JSON.stringify(pipeline, null, 2));
  try { fs.writeFileSync(path.join(VAULT_CORPORATE, 'pipeline.json'), JSON.stringify(pipeline, null, 2)); } catch {}
}

export function addProspect(company, contact_name, email, industry, area = 'Central') {
  const pipeline = loadPipeline();
  const prospect = {
    id: `corp-${Date.now()}`,
    company,
    contact_name,
    email,
    industry,
    area,
    stage: 'cold', // cold → contacted → follow_up_1 → follow_up_2 → proposal → won/lost
    touchpoints: [],
    createdAt: new Date().toISOString(),
    notes: '',
  };
  pipeline.prospects.push(prospect);
  savePipeline(pipeline);
  return prospect;
}

export function advanceProspect(prospectId, stage, notes = '') {
  const pipeline = loadPipeline();
  const prospect = pipeline.prospects.find(p => p.id === prospectId);
  if (!prospect) return null;
  prospect.stage = stage;
  prospect.touchpoints.push({ stage, date: new Date().toISOString(), notes });
  if (notes) prospect.notes = notes;
  savePipeline(pipeline);
  return prospect;
}

export function generateEmail(prospectId, templateName) {
  const pipeline = loadPipeline();
  const prospect = pipeline.prospects.find(p => p.id === prospectId);
  if (!prospect) return null;

  const tmpl = TEMPLATES[templateName];
  if (!tmpl) return null;

  const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;

  const fill = (text) => text
    .replace(/\{company\}/g, prospect.company)
    .replace(/\{contact_name\}/g, prospect.contact_name)
    .replace(/\{industry\}/g, prospect.industry)
    .replace(/\{area\}/g, prospect.area)
    .replace(/\{quarter\}/g, quarter);

  return {
    to: prospect.email,
    subject: fill(tmpl.subject),
    body: fill(tmpl.body),
    templateName,
  };
}

export function getPipeline() { return loadPipeline(); }

export function getPipelineSummary() {
  const pipeline = loadPipeline();
  const stages = {};
  for (const p of pipeline.prospects) {
    stages[p.stage] = (stages[p.stage] || 0) + 1;
  }
  return { total: pipeline.prospects.length, stages, lastUpdated: pipeline.lastUpdated };
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatPipelineTelegram() {
  const pipeline = loadPipeline();
  let text = `🏢 *Corporate Outreach Pipeline*\n\n`;

  if (pipeline.prospects.length === 0) {
    text += '_No prospects yet. Add with /growth corporate add <company> <contact> <email> <industry>_\n';
    return text;
  }

  const byStage = {};
  for (const p of pipeline.prospects) {
    if (!byStage[p.stage]) byStage[p.stage] = [];
    byStage[p.stage].push(p);
  }

  for (const [stage, prospects] of Object.entries(byStage)) {
    text += `*${stage.toUpperCase()}* (${prospects.length})\n`;
    for (const p of prospects.slice(0, 5)) {
      text += `  • ${p.company} — ${p.contact_name} (${p.industry})\n`;
    }
    if (prospects.length > 5) text += `  ... +${prospects.length - 5} more\n`;
    text += '\n';
  }

  text += `_Updated: ${pipeline.lastUpdated?.split('T')[0] || 'never'}_`;
  return text;
}

export function listTemplateNames() { return Object.keys(TEMPLATES); }
