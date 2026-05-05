import TelegramBot from 'node-telegram-bot-api';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { generateReport } from './vortex-report.js';
import { createSeed, getSeedTopics } from './seed-generator.js';
import {
  addToConversation,
  getConversationHistory,
  clearConversation,
  formatHistoryForPrompt,
  formatSessionMemoryForPrompt,
  formatPaulProfileForPrompt,
  updateMemoryAfterConversation,
  getMemoryStatus,
  loadPaulProfile
} from './memory-system.js';

const TELEGRAM_TOKEN = '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4';
const OPENROUTER_KEY = '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';
const KNOWLEDGEBASE_PATH = path.join(process.env.HOME, 'nanoclaw-data', 'knowledgebase');
const SAGES_PATH = path.join(process.env.HOME, 'nanoclaw', 'sages');
const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'vortex_data', 'metrics.db');

const MODELS = {
  fast: 'gemma3:4b',
  balanced: 'llama3.1',
  powerful: 'qwen3:14b',
  cloud: 'anthropic/claude-3.5-sonnet'
};

const QUALITY_THRESHOLD = 70;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userModes = {};

// ============================================
// DATABASE
// ============================================
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB error:', err.message);
  else console.log('📊 Vortex Keeper DB connected');
});

db.run(`CREATE TABLE IF NOT EXISTS cascade_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT, question TEXT, local_model TEXT,
  local_response TEXT, local_quality_score REAL,
  escalated BOOLEAN, final_model TEXT, final_response TEXT,
  tokens_local INTEGER DEFAULT 0, tokens_cloud INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0, latency_ms INTEGER
)`);

