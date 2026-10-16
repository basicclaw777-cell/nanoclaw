'use strict';

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Ollama — local models
async function chatOllama(model, messages) {
  const res = await axios.post('http://localhost:11434/api/chat', {
    model,
    messages,
    stream: false,
    options: { temperature: 0.7, num_predict: 2048 },
  }, { timeout: 120000 });
  return res.data.message.content;
}

// OpenRouter — Claude, GPT, etc.
async function chatOpenRouter(model, messages) {
  const key = process.env.OPENROUTER_KEY;
  if (!key) throw new Error('OPENROUTER_KEY not set');
  const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  }, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    timeout: 120000,
  });
  return res.data.choices[0].message.content;
}

// DeepSeek direct API
async function chatDeepSeek(model, messages) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');
  const res = await axios.post('https://api.deepseek.com/chat/completions', {
    model: model || 'deepseek-chat',
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  }, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    timeout: 120000,
  });
  return res.data.choices[0].message.content;
}

// Provider registry
const PROVIDERS = {
  // Local Ollama models
  'hermes3': { fn: chatOllama, model: 'hermes3:latest', type: 'local' },
  'qwen3:14b': { fn: chatOllama, model: 'qwen3:14b', type: 'local' },
  'gemma3:4b': { fn: chatOllama, model: 'gemma3:4b', type: 'local' },
  'phi4-mini': { fn: chatOllama, model: 'phi4-mini:latest', type: 'local' },

  // Cloud via OpenRouter
  'claude-sonnet': { fn: chatOpenRouter, model: 'anthropic/claude-sonnet-4-20250514', type: 'cloud' },
  'gpt-4o': { fn: chatOpenRouter, model: 'openai/gpt-4o', type: 'cloud' },
  'gemini-2.5-flash': { fn: chatOpenRouter, model: 'google/gemini-2.5-flash-preview', type: 'cloud' },

  // DeepSeek direct
  'deepseek': { fn: chatDeepSeek, model: 'deepseek-chat', type: 'cloud' },
};

async function chat(providerName, messages) {
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`);
  return provider.fn(provider.model, messages);
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([name, p]) => ({
    name,
    model: p.model,
    type: p.type,
  }));
}

module.exports = { chat, listProviders, PROVIDERS };
