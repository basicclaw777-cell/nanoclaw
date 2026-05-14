/**
 * seo-checklist.js — SEO task tracker for basicreflex.com
 *
 * Tracks:
 *   - Meta titles and descriptions per page
 *   - Target keywords per page
 *   - Blog post pipeline (topics, status, publish date)
 *   - Monthly audit notes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const SEO_PATH = path.join(__dirname, 'reports', 'seo-checklist.json');
const VAULT_SEO = path.join(HOME, 'cathedral-vault', '10_Agents', 'growth', 'website');

function loadSEO() {
  try { return JSON.parse(fs.readFileSync(SEO_PATH, 'utf-8')); }
  catch {
    // Default checklist
    const defaults = {
      lastAudit: null,
      pages: [
        { page: 'Homepage', url: 'basicreflex.com', metaTitle: 'Basic Reflex — Cuban Boxing Gym Hong Kong', metaDesc: 'Learn Cuban boxing in Sheung Wan, Hong Kong. Personal training, group classes, corporate sessions. All levels welcome.', keywords: ['boxing gym Hong Kong', 'Cuban boxing', 'boxing classes HK'], status: 'draft' },
        { page: 'About', url: 'basicreflex.com/about', metaTitle: 'About Basic Reflex — Our Story & Cuban Boxing Philosophy', metaDesc: 'Founded by Paul Barrett. Cuban boxing methodology. 15+ years experience. Featured in TimeOut, Tatler, Sassy HK.', keywords: ['Cuban boxing Hong Kong', 'Paul Barrett boxing', 'boxing coach HK'], status: 'draft' },
        { page: 'Classes', url: 'basicreflex.com/classes', metaTitle: 'Boxing Classes Hong Kong — Beginners to Advanced | Basic Reflex', metaDesc: 'Group boxing classes, personal training, corporate sessions in Sheung Wan. Fundamentals to advanced sparring. Book your trial.', keywords: ['boxing classes Hong Kong', 'group boxing HK', 'personal training Sheung Wan'], status: 'draft' },
        { page: 'Corporate', url: 'basicreflex.com/corporate', metaTitle: 'Corporate Boxing Programme Hong Kong | Basic Reflex', metaDesc: 'Corporate team boxing sessions in Central/Sheung Wan. Stress relief, team building, wellness. Flexible scheduling for HK businesses.', keywords: ['corporate fitness Hong Kong', 'corporate boxing', 'team building HK'], status: 'draft' },
        { page: 'Contact', url: 'basicreflex.com/contact', metaTitle: 'Contact Basic Reflex — Book a Trial Session', metaDesc: 'WhatsApp +852 9464 5361. Sheung Wan, Hong Kong. Book your boxing trial session today.', keywords: ['boxing trial Hong Kong', 'boxing gym Sheung Wan'], status: 'draft' },
      ],
      blogPipeline: [
        { topic: 'What is Cuban Boxing? A Complete Guide', keywords: ['Cuban boxing', 'what is Cuban boxing', 'Cuban boxing vs regular boxing'], status: 'planned', publishDate: null },
        { topic: '5 Reasons Boxing Is the Best Stress Relief in Hong Kong', keywords: ['boxing stress relief', 'fitness Hong Kong', 'stress management HK'], status: 'planned', publishDate: null },
        { topic: 'Boxing for Beginners: What to Expect at Your First Class', keywords: ['boxing for beginners', 'first boxing class', 'learn to box HK'], status: 'planned', publishDate: null },
        { topic: 'Corporate Fitness in Hong Kong: Why Boxing Beats Yoga', keywords: ['corporate fitness Hong Kong', 'corporate wellness HK', 'team building boxing'], status: 'planned', publishDate: null },
        { topic: 'The 10-Block System: How We Teach Boxing Differently', keywords: ['boxing curriculum', 'structured boxing training', 'boxing methodology'], status: 'planned', publishDate: null },
      ],
      targetKeywords: [
        { keyword: 'boxing gym Hong Kong', priority: 'primary', currentRank: null },
        { keyword: 'Cuban boxing', priority: 'primary', currentRank: null },
        { keyword: 'personal training Sheung Wan', priority: 'primary', currentRank: null },
        { keyword: 'corporate fitness Hong Kong', priority: 'secondary', currentRank: null },
        { keyword: 'boxing classes HK', priority: 'primary', currentRank: null },
        { keyword: 'learn to box Hong Kong', priority: 'secondary', currentRank: null },
        { keyword: 'boxing for beginners HK', priority: 'secondary', currentRank: null },
        { keyword: 'Sheung Wan gym', priority: 'tertiary', currentRank: null },
      ],
      auditHistory: [],
    };
    fs.writeFileSync(SEO_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
}

function saveSEO(data) {
  fs.writeFileSync(SEO_PATH, JSON.stringify(data, null, 2));
  try { fs.writeFileSync(path.join(VAULT_SEO, 'seo-checklist.json'), JSON.stringify(data, null, 2)); } catch {}
}

export function getSEOChecklist() { return loadSEO(); }

export function runAudit() {
  const seo = loadSEO();
  const audit = {
    date: new Date().toISOString(),
    pagesWithMeta: seo.pages.filter(p => p.metaTitle && p.metaDesc).length,
    totalPages: seo.pages.length,
    blogPlanned: seo.blogPipeline.filter(b => b.status === 'planned').length,
    blogPublished: seo.blogPipeline.filter(b => b.status === 'published').length,
    keywordsTracked: seo.targetKeywords.length,
    keywordsRanked: seo.targetKeywords.filter(k => k.currentRank !== null).length,
  };
  seo.lastAudit = audit.date;
  seo.auditHistory.push(audit);
  saveSEO(seo);
  return audit;
}

export function updateKeywordRank(keyword, rank) {
  const seo = loadSEO();
  const kw = seo.targetKeywords.find(k => k.keyword === keyword);
  if (!kw) return null;
  kw.currentRank = rank;
  kw.lastChecked = new Date().toISOString();
  saveSEO(seo);
  return kw;
}

export function updateBlogStatus(topic, status, publishDate = null) {
  const seo = loadSEO();
  const blog = seo.blogPipeline.find(b => b.topic.toLowerCase().includes(topic.toLowerCase()));
  if (!blog) return null;
  blog.status = status;
  if (publishDate) blog.publishDate = publishDate;
  saveSEO(seo);
  return blog;
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatSEOTelegram() {
  const seo = loadSEO();
  let text = `🔍 *SEO Checklist — basicreflex.com*\n\n`;

  text += `*Pages* (${seo.pages.length})\n`;
  for (const p of seo.pages) {
    const icon = p.status === 'live' ? '✅' : p.status === 'draft' ? '📝' : '⏳';
    text += `${icon} ${p.page}: _${p.keywords[0]}_\n`;
  }

  text += `\n*Blog Pipeline* (${seo.blogPipeline.length})\n`;
  for (const b of seo.blogPipeline) {
    const icon = b.status === 'published' ? '✅' : b.status === 'writing' ? '✍️' : '📋';
    text += `${icon} ${b.topic.slice(0, 50)}\n`;
  }

  text += `\n*Keywords* (${seo.targetKeywords.length})\n`;
  for (const k of seo.targetKeywords.filter(k => k.priority === 'primary')) {
    text += `  • "${k.keyword}" — ${k.currentRank ? `#${k.currentRank}` : 'unranked'}\n`;
  }

  if (seo.lastAudit) text += `\n_Last audit: ${seo.lastAudit.split('T')[0]}_`;
  return text;
}
