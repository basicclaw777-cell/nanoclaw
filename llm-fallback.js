import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const ENV_PATH = join(HOME, 'nanoclaw', '.env');

if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val;
    }
  }
}

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434/api/chat';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const OLLAMA_MODEL = 'hermes3';

let deepseekDead = false;

async function callDeepSeekApi(system, prompt, maxTokens) {
  if (!DEEPSEEK_KEY || deepseekDead) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens || 300,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text();
      if (body.includes('Insufficient Balance') || body.includes('insufficient_quota')) {
        deepseekDead = true;
        console.error('[llm-fallback] DeepSeek balance empty — switching to Ollama for this run');
        return null;
      }
      console.error(`[llm-fallback] DeepSeek ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error(`[llm-fallback] DeepSeek error: ${err.message}`);
    return null;
  }
}

async function callOllamaApi(system, prompt, maxTokens) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: { num_predict: maxTokens || 300, temperature: 0.3 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[llm-fallback] Ollama ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.message?.content || null;
  } catch (err) {
    console.error(`[llm-fallback] Ollama error: ${err.message}`);
    return null;
  }
}

export async function llmCall(system, prompt, maxTokens) {
  const result = await callDeepSeekApi(system, prompt, maxTokens);
  if (result) return { content: result, provider: 'deepseek' };
  const fallback = await callOllamaApi(system, prompt, maxTokens);
  if (fallback) return { content: fallback, provider: 'ollama' };
  return { content: null, provider: 'none' };
}
