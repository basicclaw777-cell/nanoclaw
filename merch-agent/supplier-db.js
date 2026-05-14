/**
 * supplier-db.js — Supplier database for merch runs
 *
 * Pre-populated with Print House HK from training data.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const SUPPLIERS_PATH = path.join(__dirname, 'suppliers.json');
const VAULT_SUPPLIERS = path.join(HOME, 'cathedral-vault', '10_Agents', 'merch', 'suppliers');

const DEFAULT_SUPPLIERS = [
  {
    id: 'print-house-hk',
    name: 'Print House HK',
    website: 'www.print-house.hk',
    contact: null,
    email: null,
    phone: null,
    capabilities: ['screen printing', 'DTG', 'embroidery', 'sublimation'],
    sample_cost: 285,
    quality_rating: 'approved',
    notes: 'Paul approved quality. Good for poster tees and standard runs.',
    turnaround: '7-14 days for samples, 14-21 days for bulk',
    minimum_order: null,
    location: 'Hong Kong',
    addedAt: '2026-05-14',
  },
];

function loadSuppliers() {
  try { return JSON.parse(fs.readFileSync(SUPPLIERS_PATH, 'utf-8')); }
  catch {
    fs.writeFileSync(SUPPLIERS_PATH, JSON.stringify(DEFAULT_SUPPLIERS, null, 2));
    return DEFAULT_SUPPLIERS;
  }
}

function saveSuppliers(suppliers) {
  fs.writeFileSync(SUPPLIERS_PATH, JSON.stringify(suppliers, null, 2));
  try {
    for (const s of suppliers) {
      fs.writeFileSync(path.join(VAULT_SUPPLIERS, `${s.id}.json`), JSON.stringify(s, null, 2));
    }
  } catch {}
}

export function getSuppliers() { return loadSuppliers(); }

export function getSupplier(id) {
  return loadSuppliers().find(s => s.id === id) || null;
}

export function addSupplier(name, website, capabilities = [], notes = '') {
  const suppliers = loadSuppliers();
  const supplier = {
    id: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    name,
    website,
    contact: null,
    email: null,
    phone: null,
    capabilities,
    sample_cost: null,
    quality_rating: 'untested',
    notes,
    turnaround: null,
    minimum_order: null,
    location: 'Hong Kong',
    addedAt: new Date().toISOString().split('T')[0],
  };
  suppliers.push(supplier);
  saveSuppliers(suppliers);
  return supplier;
}

export function updateSupplier(id, updates) {
  const suppliers = loadSuppliers();
  const s = suppliers.find(s => s.id === id);
  if (!s) return null;
  Object.assign(s, updates);
  saveSuppliers(suppliers);
  return s;
}

export function formatSuppliersTelegram() {
  const suppliers = loadSuppliers();
  if (suppliers.length === 0) return '_No suppliers yet._';

  let text = '🏭 *Supplier Database*\n\n';
  for (const s of suppliers) {
    const icon = s.quality_rating === 'approved' ? '✅' : s.quality_rating === 'rejected' ? '❌' : '❓';
    text += `${icon} *${s.name}*\n`;
    if (s.website) text += `  ${s.website}\n`;
    text += `  Capabilities: ${s.capabilities.join(', ')}\n`;
    if (s.sample_cost) text += `  Sample: HK$${s.sample_cost}\n`;
    if (s.turnaround) text += `  Turnaround: ${s.turnaround}\n`;
    if (s.notes) text += `  _${s.notes}_\n`;
    text += '\n';
  }
  return text;
}
