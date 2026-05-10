/**
 * deepseek-query.js — Shared DeepSeek API query with Ollama fallback
 *
 * Use everywhere that needs smart reasoning.
 * DeepSeek for judgment. Ollama for cheap/fast/local.
 *
 * ESM.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const OLLAMA_URL = 'http://localhost:11434/api/chat';

async function queryDeepSeek(systemPrompt, userMessage, maxTokens = 300) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function queryOllama(systemPrompt, userMessage, maxTokens = 300) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.4, num_predict: maxTokens },
    }),
  });
  const data = await res.json();
  return data.message?.content || '';
}

/**
 * Smart query: DeepSeek first, Ollama fallback.
 * Use for anything that needs judgment/reasoning.
 */
export async function smartQuery(systemPrompt, userMessage, maxTokens = 300) {
  if (DEEPSEEK_API_KEY) {
    try {
      const result = await queryDeepSeek(systemPrompt, userMessage, maxTokens);
      if (result) return result;
    } catch (e) {
      console.error('[deepseek] Failed, falling back to Ollama:', e.message);
    }
  }
  return queryOllama(systemPrompt, userMessage, maxTokens);
}

/**
 * JSON query: same as smartQuery but requests JSON output.
 */
export async function smartQueryJSON(systemPrompt, userMessage, maxTokens = 500) {
  if (DEEPSEEK_API_KEY) {
    try {
      const res = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt + '\n\nRespond with valid JSON only.' },
            { role: 'user', content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (e) {
      console.error('[deepseek-json] Failed, falling back to Ollama:', e.message);
    }
  }

  // Ollama fallback with JSON format
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages: [
        { role: 'system', content: systemPrompt + '\n\nRespond with valid JSON only.' },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.3, num_predict: maxTokens },
      format: 'json',
    }),
  });
  const data = await res.json();
  try {
    return JSON.parse(data.message?.content || '{}');
  } catch(e) {
    return {};
  }
}

/**
 * Local-only query: for cheap/fast tasks that don't need DeepSeek.
 */
export { queryOllama as localQuery };
