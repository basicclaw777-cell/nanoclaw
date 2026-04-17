// ~/nanoclaw/cathy-router.js
// Cathy-with-hands — the tool router
//
// Cathy receives a message, reasons about which tool is best,
// dispatches it, waits for the result, synthesises with vault
// context, returns one clean response.
//
// Library module — imported by telegram-bot.js for /think command.
// Not a standalone service.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const DISPATCH = path.join(HOME, 'Cathedral', 'tools', 'dispatch.sh');
const OLLAMA_URL = 'http://localhost:11434';
const VAULT = path.join(HOME, 'cathedral-vault');

// ── Tool selection ──────────────────────────────────────────────────

// Pattern sets for each tool
const CLAUDE_PATTERNS = [
  /\b(build|create|write|edit|refactor|fix|implement|code|script|deploy)\b/i,
  /\b(file|files|directory|vault\s*write|commit|push|git)\b/i,
  /\b(architect|design|plan|spec|blueprint)\b/i,
  /\b(complex\s*reason|multi[\s-]step|chain\s*of\s*thought)\b/i,
  /\b(telegram[\s-]bot|pm2|cath[\s-]bridge|server)\b/i,
  /\b(standing\s*instruction|CLAUDE\.md)\b/i,
];

const GEMINI_PATTERNS = [
  /\b(scan\s*vault|read\s*all|search\s*across|scan\s*all)\b/i,
  /\b(research|investigate|survey|landscape|audit\s*all)\b/i,
  /\b(web\s*search|google|look\s*up|find\s*online)\b/i,
  /\b(large\s*context|many\s*files|across\s*domains)\b/i,
  /\b(compare|contrast|cross[\s-]reference\s*multiple)\b/i,
  /\b(gemini|cli\s*scan)\b/i,
];

const OLLAMA_PATTERNS = [
  /\b(private|sensitive|confidential|secret|local\s*only)\b/i,
  /\b(quick|fast|simple|brief\s*answer)\b/i,
  /\b(don'?t\s*send|keep\s*local|stays?\s*here)\b/i,
  /\b(classify|categorise|tag|label|triage)\b/i,
  /\b(ollama|local\s*model|qwen)\b/i,
];

const CATHY_DIRECT_PATTERNS = [
  /\b(what\s*do\s*you\s*think|your\s*opinion|how\s*do\s*you\s*see)\b/i,
  /\b(tell\s*me\s*about|explain|describe|summarise)\b/i,
  /\b(remember\s*when|last\s*session|yesterday)\b/i,
  /\b(vault\s*says?|in\s*the\s*vault|what'?s?\s*in\s*vault)\b/i,
  /\b(chat|talk|conversation|discuss)\b/i,
];

/**
 * Selects the best tool for a given message.
 * Returns: { tool: 'claude'|'gemini'|'ollama'|'cathy', reason: string }
 */
export function selectTool(message) {
  const msg = message.toLowerCase();

  // Score each tool
  const scores = {
    claude: 0,
    gemini: 0,
    ollama: 0,
    cathy: 0,
  };

  CLAUDE_PATTERNS.forEach(p => { if (p.test(msg)) scores.claude += 2; });
  GEMINI_PATTERNS.forEach(p => { if (p.test(msg)) scores.gemini += 2; });
  OLLAMA_PATTERNS.forEach(p => { if (p.test(msg)) scores.ollama += 2; });
  CATHY_DIRECT_PATTERNS.forEach(p => { if (p.test(msg)) scores.cathy += 2; });

  // Boost: questions are more likely cathy-direct
  if (/\?$/.test(msg.trim())) scores.cathy += 1;

  // Boost: imperative verbs with file context → claude
  if (/\b(build|create|write|fix)\b/i.test(msg) && /\b(file|vault|script|code)\b/i.test(msg)) {
    scores.claude += 3;
  }

  // Boost: "scan" or "across" with vault/domain → gemini
  if (/\b(scan|across|all)\b/i.test(msg) && /\b(vault|domain|project)\b/i.test(msg)) {
    scores.gemini += 3;
  }

  // Boost: explicit privacy → ollama
  if (/\b(private|local|sensitive)\b/i.test(msg)) {
    scores.ollama += 4;
  }

  // Find winner
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topTool, topScore] = entries[0];

  // If no patterns matched at all, default to cathy
  if (topScore === 0) {
    return { tool: 'cathy', reason: 'No specific tool signals — handling directly', score: 0 };
  }

  // If tied between tools, prefer in order: cathy > ollama > claude > gemini
  // (prefer lighter/faster when ambiguous)
  const tied = entries.filter(e => e[1] === topScore);
  const priority = ['cathy', 'ollama', 'claude', 'gemini'];
  const winner = tied.length > 1
    ? priority.find(p => tied.some(t => t[0] === p)) || topTool
    : topTool;

  const reasons = {
    claude: 'Build/code/architecture task detected',
    gemini: 'Research/scan/large-context task detected',
    ollama: 'Local/private/quick task detected',
    cathy: 'Conversational/vault-retrieval task detected',
  };

  return { tool: winner, reason: reasons[winner], score: topScore };
}

// ── Dispatch ────────────────────────────────────────────────────────

/**
 * Dispatches a prompt to a tool via dispatch.sh.
 * Returns: { output: string, outputFile: string, tool: string, durationMs: number }
 */
export function dispatchTool(tool, prompt, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proc = spawn(DISPATCH, [tool, prompt], {
      cwd: path.join(HOME, 'Cathedral', 'tools'),
      env: { ...process.env, HOME },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${tool} dispatch timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const outputFile = stdout.trim();

      // Read the output file
      let output = '';
      if (outputFile && fs.existsSync(outputFile)) {
        output = fs.readFileSync(outputFile, 'utf8').trim();
      } else {
        output = stdout.trim() || stderr.trim() || `Exit code: ${code}`;
      }

      resolve({ output, outputFile, tool, durationMs });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Vault context retrieval ─────────────────────────────────────────

/**
 * Fetches relevant vault context for synthesis.
 * Uses cath-bridge /vault/search endpoint.
 */
export async function getVaultContext(query, limit = 3) {
  try {
    const apiKey = process.env.CATH_API_KEY || 'cathedral-mcp-2026';
    const url = `http://127.0.0.1:8080/vault/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) return '';
    const data = await res.json();
    if (!data.results || data.results.length === 0) return '';

    return data.results
      .map(r => `[${r.title || r.file || 'vault'}] ${(r.content || r.snippet || '').slice(0, 300)}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

// ── Synthesis ───────────────────────────────────────────────────────

/**
 * Synthesises tool output with vault context into a clean response.
 * Phase 1: simple concatenation with context header.
 * Phase 2: LLM synthesis.
 */
export async function synthesise(toolOutput, vaultContext, originalQuery, tool) {
  // Phase 1: structured response
  let response = toolOutput;

  if (vaultContext && vaultContext.length > 10) {
    response += `\n\n---\nVault context:\n${vaultContext}`;
  }

  // Truncate for Telegram (max ~3800 chars to be safe with formatting)
  if (response.length > 3800) {
    response = response.slice(0, 3700) + '\n\n[… truncated]';
  }

  return response;
}

// ── Main router ─────────────────────────────────────────────────────

/**
 * Full router: select → dispatch → context → synthesise.
 * Returns: { tool, reason, output, vaultContext, response, durationMs }
 */
export async function route(message, callCathFn = null) {
  const selection = selectTool(message);

  // Direct Cathy path — no dispatch needed
  if (selection.tool === 'cathy') {
    let output = '';
    if (callCathFn) {
      try {
        output = await callCathFn(message);
      } catch (e) {
        output = `Cathy error: ${e.message}`;
      }
    } else {
      output = '(Cathy direct path — callCath not provided)';
    }

    return {
      tool: 'cathy',
      reason: selection.reason,
      output,
      vaultContext: '',
      response: output,
      durationMs: 0,
    };
  }

  // Dispatch to external tool
  const result = await dispatchTool(selection.tool, message);

  // Get vault context for synthesis
  const vaultContext = await getVaultContext(message);

  // Synthesise
  const response = await synthesise(result.output, vaultContext, message, selection.tool);

  return {
    tool: selection.tool,
    reason: selection.reason,
    output: result.output,
    outputFile: result.outputFile,
    vaultContext,
    response,
    durationMs: result.durationMs,
  };
}

// ── CLI test ────────────────────────────────────────────────────────
// node cathy-router.js "what should I build next?"

if (import.meta.url === `file://${process.argv[1]}`) {
  const msg = process.argv.slice(2).join(' ');
  if (!msg) {
    console.log('Usage: node cathy-router.js "<message>"');
    console.log('  --select-only  : just show tool selection, don\'t dispatch');
    process.exit(1);
  }

  if (process.argv.includes('--select-only')) {
    const sel = selectTool(msg.replace('--select-only', '').trim());
    console.log(JSON.stringify(sel, null, 2));
  } else {
    route(msg).then(r => {
      console.log(`Tool: ${r.tool} (${r.reason})`);
      console.log(`Duration: ${r.durationMs}ms`);
      console.log('---');
      console.log(r.response);
    }).catch(e => {
      console.error('Error:', e.message);
    });
  }
}
