/**
 * pricing-model.js — Course Pricing Calculator
 *
 * No competitor in structured Cuban boxing online.
 * Closest comparable: $70 single video download.
 * Authority positioning: only course built on verified primary sources.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = path.join(HOME, 'cathedral-vault');
const REPORTS_DIR = path.join(__dirname, 'reports');

// ── Market Data ──────────────────────────────────────────────────────────────

const MARKET_DATA = {
  directCompetitors: 0,
  competitorNote: 'No structured Cuban boxing course exists online. Zero direct competitors.',
  closestComparable: {
    type: 'Single video download',
    price: 70,
    note: 'One-off boxing technique videos on platforms like Vimeo/Gumroad. No curriculum structure.',
  },
  adjacentMarket: [
    { name: 'Boxing fitness apps (FightCamp, Liteboxer)', priceRange: '$29-49/month', positioning: 'Fitness product, not boxing education' },
    { name: 'Online martial arts courses (BJJ Fanatics)', priceRange: '$77-197 one-time', positioning: 'Technique library, no progressive curriculum' },
    { name: 'Boxing combo apps', priceRange: '$5-15/month', positioning: 'Random combo callers, no biomechanical understanding' },
  ],
  positioning: {
    tagline: 'The only structured Cuban boxing course online, built on verified primary sources (Sagarra, Balmaseda)',
    differentiators: [
      '10-module progressive curriculum mapped to official Cuban age categories',
      '34 primary source documents backing every claim',
      '20+ peer-reviewed papers integrated',
      'Biomechanical explanations for WHY combinations work',
      'Observable gate criteria — measurable progression',
      'Weight-state relay system — novel intellectual property',
      'Drumming-brain rhythm engine — no other course has this',
    ],
  },
  sweetSpot: { annual: { min: 99, max: 149 }, monthly: { min: 9.99, max: 19.99 } },
};

// ── Pricing Calculator ───────────────────────────────────────────────────────

export function calculateProjection(opts = {}) {
  const {
    annualPrice = 129,
    monthlyPrice = 14.99,
    targetAnnualSubs = 500,
    targetMonthlySubs = 200,
    annualChurnRate = 0.25,
    monthlyChurnRate = 0.08,
    launchMonth = 'Month 1',
    growthRateMonthly = 0.10,
    startingSubscribers = 0,
  } = opts;

  // Monthly revenue projections over 12 months
  const months = [];
  let annualSubs = startingSubscribers;
  let monthlySubs = 0;

  for (let m = 1; m <= 12; m++) {
    // Growth
    const newAnnual = Math.round(targetAnnualSubs * growthRateMonthly * (m <= 3 ? 0.5 : 1));
    const newMonthly = Math.round(targetMonthlySubs * growthRateMonthly * (m <= 3 ? 0.5 : 1));

    annualSubs = Math.round(annualSubs + newAnnual - (annualSubs * annualChurnRate / 12));
    monthlySubs = Math.round(monthlySubs + newMonthly - (monthlySubs * monthlyChurnRate));

    const annualMRR = Math.round(annualSubs * annualPrice / 12);
    const monthlyMRR = Math.round(monthlySubs * monthlyPrice);
    const totalMRR = annualMRR + monthlyMRR;

    months.push({
      month: m,
      annualSubscribers: annualSubs,
      monthlySubscribers: monthlySubs,
      totalSubscribers: annualSubs + monthlySubs,
      annualMRR,
      monthlyMRR,
      totalMRR,
      annualizedRevenue: totalMRR * 12,
    });
  }

  const year1Revenue = months.reduce((sum, m) => sum + m.totalMRR, 0);
  const month12 = months[11];

  // Break-even (assuming minimal costs for digital course)
  const estimatedCosts = {
    platform: 99 * 12,       // Teachable/Kajabi basic
    hosting: 20 * 12,        // Video hosting
    marketing: 200 * 12,     // Basic ad spend
    total: (99 + 20 + 200) * 12,
  };

  const breakEvenMonth = months.findIndex(m => m.totalMRR > estimatedCosts.total / 12) + 1;

  return {
    inputs: { annualPrice, monthlyPrice, targetAnnualSubs, targetMonthlySubs, annualChurnRate, monthlyChurnRate, growthRateMonthly },
    market: MARKET_DATA,
    projections: months,
    summary: {
      year1TotalRevenue: year1Revenue,
      month12MRR: month12.totalMRR,
      month12ARR: month12.annualizedRevenue,
      month12Subscribers: month12.totalSubscribers,
      breakEvenMonth: breakEvenMonth || 'Not reached in year 1',
      estimatedAnnualCosts: estimatedCosts.total,
    },
    generated: new Date().toISOString(),
  };
}

export function getDefaultProjection() {
  return calculateProjection();
}

export function savePricingModel(opts) {
  const projection = calculateProjection(opts);
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'pricing-model.json'), JSON.stringify(projection, null, 2));

  try {
    const vaultPricing = path.join(VAULT, '10_Agents', 'course', 'pricing');
    fs.writeFileSync(path.join(vaultPricing, 'pricing-model.json'), JSON.stringify(projection, null, 2));
  } catch {}

  return projection;
}

export function getMarketData() {
  return MARKET_DATA;
}
