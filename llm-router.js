/**
 * LLM Router — local-first model routing with API fallback.
 *
 * Strategy per tier:
 *   local-only  → Ollama only, fail if down
 *   local-first → try Ollama, fallback to API
 *   api-first   → try API, fallback to Ollama
 *   api-only    → API only, fail if down
 *
 * Usage:
 *   import { llm, llmCall } from './llm-router.js';
 *
 *   // Task-aware routing (recommended)
 *   const result = await llm('summarize', system, prompt);
 *
 *   // Direct tier override
 *   const result = await llm('HEAVY', system, prompt, { maxTokens: 1000 });
 *
 *   // Legacy-compatible (drop-in for llm-fallback.js)
 *   const result = await llmCall(system, prompt, maxTokens);
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const ENV_PATH = join(HOME, 'nanoclaw', '.env');
const CONFIG_PATH = join(HOME, 'nanoclaw', 'llm-config.json');
const SPEND_LOG = join(HOME, 'Cathedral', 'agents', 'token-spend-log.jsonl');

if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val;
    }
  }
}

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch {
  config = null;
}

function getProfile() {
  if (!config) return null;
  return config.profiles[config.hardware] || null;
}

function getTierConfig(taskOrTier) {
  const profile = getProfile();
  if (!profile) return { strategy: 'api-first', local_model: 'hermes3', api_model: 'deepseek-chat', timeout_ms: 60000 };

  const tier = profile.tiers[taskOrTier] || profile.tiers[config.task_tiers?.[taskOrTier]] || profile.tiers['MEDIUM'];
  return {
    strategy: tier.strategy,
    local_model: tier.local_model || profile.local_models.default,
    api_model: tier.api_model || 'deepseek-chat',
    timeout_ms: tier.timeout_ms || 60000
  };
}

let apiDead = false;
let apiDeadUntil = 0;

async function callOllama(model, system, prompt, maxTokens, timeoutMs) {
  const ollamaUrl = config?.ollama_url || 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { num_predict: maxTokens || 300, temperature: 0.3 }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[llm-router] Ollama ${res.status} (${model})`);
      return null;
    }
    const data = await res.json();
    const content = data.message?.content || null;
    const tokens = data.eval_count || (content ? Math.ceil(content.length / 4) : 0);
    return { content, provider: 'ollama', model, tokens };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error(`[llm-router] Ollama timeout (${model}, ${timeoutMs}ms)`);
    } else {
      console.error(`[llm-router] Ollama error (${model}): ${err.message}`);
    }
    return null;
  }
}

async function callDeepSeek(model, system, prompt, maxTokens, timeoutMs) {
  if (!DEEPSEEK_KEY) return null;
  if (apiDead && Date.now() < apiDeadUntil) return null;

  const deepseekUrl = config?.deepseek_url || 'https://api.deepseek.com/chat/completions';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(deepseekUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens || 300,
        temperature: 0.3
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text();
      if (body.includes('Insufficient Balance') || body.includes('insufficient_quota')) {
        apiDead = true;
        apiDeadUntil = Date.now() + 3600000;
        console.error('[llm-router] DeepSeek balance empty — local-only for 1h');
        return null;
      }
      console.error(`[llm-router] DeepSeek ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || null;
    const usage = data.usage || {};
    logSpend('llm-router', model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
    return { content, provider: 'deepseek', model, tokens: usage.completion_tokens || 0 };
  } catch (err) {
    clearTimeout(timeout);
    console.error(`[llm-router] DeepSeek error: ${err.message}`);
    return null;
  }
}

function logSpend(agent, model, inputTokens, outputTokens) {
  try {
    const entry = { ts: new Date().toISOString(), agent, model, input_tokens: inputTokens, output_tokens: outputTokens };
    appendFileSync(SPEND_LOG, JSON.stringify(entry) + '\n');
  } catch {}
}

/**
 * Route an LLM call by task name or tier.
 *
 * @param {string} taskOrTier - task name (e.g. 'summarize') or tier ('LIGHT'/'MEDIUM'/'HEAVY'/'FRONTIER')
 * @param {string|null} system - system prompt
 * @param {string} prompt - user prompt
 * @param {object} [opts] - { maxTokens, temperature, callerName }
 * @returns {Promise<{content: string|null, provider: string, model: string, tokens: number}>}
 */
export async function llm(taskOrTier, system, prompt, opts = {}) {
  const maxTokens = opts.maxTokens || 300;
  const tier = getTierConfig(taskOrTier);
  const callerName = opts.callerName || 'unknown';

  let result = null;

  switch (tier.strategy) {
    case 'local-only':
      result = await callOllama(tier.local_model, system, prompt, maxTokens, tier.timeout_ms);
      break;

    case 'local-first':
      result = await callOllama(tier.local_model, system, prompt, maxTokens, tier.timeout_ms);
      if (!result?.content) {
        console.log(`[llm-router] ${callerName}: local miss, falling back to API`);
        result = await callDeepSeek(tier.api_model, system, prompt, maxTokens, tier.timeout_ms);
      }
      break;

    case 'api-first':
      result = await callDeepSeek(tier.api_model, system, prompt, maxTokens, tier.timeout_ms);
      if (!result?.content) {
        console.log(`[llm-router] ${callerName}: API miss, falling back to local`);
        result = await callOllama(tier.local_model, system, prompt, maxTokens, tier.timeout_ms);
      }
      break;

    case 'api-only':
      result = await callDeepSeek(tier.api_model, system, prompt, maxTokens, tier.timeout_ms);
      break;
  }

  if (!result?.content) {
    console.error(`[llm-router] ${callerName}: all providers failed for ${taskOrTier}`);
    return { content: null, provider: 'none', model: 'none', tokens: 0 };
  }

  return result;
}

/**
 * Legacy-compatible drop-in for llm-fallback.js llmCall().
 * Routes as MEDIUM tier (local-first).
 */
export async function llmCall(system, prompt, maxTokens) {
  return llm('MEDIUM', system, prompt, { maxTokens });
}

/**
 * Direct Ollama call — for when you know you want local.
 */
export async function ollamaCall(model, system, prompt, maxTokens) {
  return callOllama(model, system, prompt, maxTokens || 300, 120000);
}

/**
 * Direct DeepSeek call — for when you know you want API.
 */
export async function deepseekCall(system, prompt, maxTokens) {
  return callDeepSeek('deepseek-chat', system, prompt, maxTokens || 300, 90000);
}
