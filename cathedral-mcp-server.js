#!/usr/bin/env node
/**
 * cathedral-mcp-server.js
 * MCP server exposing:
 *   - Vault endpoints (read/write/search/list) via cath-bridge HTTP
 *   - Combination Validator (direct import)
 *   - Rhythm Engine (direct import)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  validatePunchCombo,
  validateDefenseChain,
  validateFootworkChain,
  validateIntegratedSequence,
  validateDefenseToCounter,
  PUNCHES,
  DEFENSES,
  FOOTWORK,
} from './combination-validator.js';

import {
  generateFromRudiment,
  generateClickTrack,
  listRudiments,
  RUDIMENTS,
} from './rhythm-engine.js';

const BASE_URL = 'http://localhost:8080';
const API_KEY  = 'cathedral-mcp-2026';

const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key':    API_KEY,
};

// -- Helpers ------------------------------------------------------------------

async function vaultFetch(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...HEADERS, ...options.headers } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// -- Server -------------------------------------------------------------------

const server = new Server(
  { name: 'cathedral-vault', version: '2.0.0' },
  { capabilities: { tools: {} } },
);

// -- Tool definitions ---------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Vault tools ──────────────────────────────────────────────────────────
    {
      name: 'vault_read',
      description: 'Read a vault file by relative path',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path inside the vault, e.g. "notes/foo.md"' },
        },
        required: ['path'],
      },
    },
    {
      name: 'vault_write',
      description: 'Write or append content to a vault file',
      inputSchema: {
        type: 'object',
        properties: {
          path:    { type: 'string',  description: 'Relative path inside the vault' },
          content: { type: 'string',  description: 'Content to write' },
          append:  { type: 'boolean', description: 'Append instead of overwrite (default false)' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'vault_search',
      description: 'Semantic search across vault notes',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          top_k: { type: 'number', description: 'Max results to return (default 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'vault_list',
      description: 'List markdown files in a vault folder',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Relative folder path (default: vault root)' },
        },
      },
    },

    // ── Combination Validator tools ──────────────────────────────────────────
    {
      name: 'validate_combo',
      description: 'Validate a boxing punch combination for biomechanical validity using weight-state relay rules. Returns per-transition verdicts, weight trace, and suggestions.',
      inputSchema: {
        type: 'object',
        properties: {
          punches: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of punch names: jab, cross, lead_hook, rear_hook, lead_uppercut, rear_uppercut, lead_body, rear_body, jab_body, overhand',
          },
        },
        required: ['punches'],
      },
    },
    {
      name: 'validate_defense',
      description: 'Validate a defensive chain for axis compatibility. Same-axis chains compound instability.',
      inputSchema: {
        type: 'object',
        properties: {
          defenses: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of defense names: slip_left, slip_right, duck, pull_back, bob_weave_left, bob_weave_right, parry, catch, shoulder_roll',
          },
        },
        required: ['defenses'],
      },
    },
    {
      name: 'validate_footwork',
      description: 'Validate a footwork chain for rhythm compatibility.',
      inputSchema: {
        type: 'object',
        properties: {
          atoms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of footwork atoms: step, snap, pop, reset, beat',
          },
        },
        required: ['atoms'],
      },
    },
    {
      name: 'validate_integrated',
      description: 'Validate a full defense-to-counter sequence: checks defense loads the counter, weight compatibility, and follow-up combination validity.',
      inputSchema: {
        type: 'object',
        properties: {
          defense: { type: 'string', description: 'Defensive action name' },
          counter_combo: {
            type: 'array',
            items: { type: 'string' },
            description: 'Punch sequence starting from the counter punch',
          },
        },
        required: ['defense', 'counter_combo'],
      },
    },
    {
      name: 'list_punches',
      description: 'List all valid punches with their properties (hand, trajectory, weight exit, power level).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_defenses',
      description: 'List all valid defenses with their axis, weight exit, and loaded counters.',
      inputSchema: { type: 'object', properties: {} },
    },

    // ── Rhythm Engine tools ──────────────────────────────────────────────────
    {
      name: 'generate_rudiment',
      description: 'Generate a boxing combination from a drum rudiment. Maps sticking patterns to punches using weight-state-aware selection.',
      inputSchema: {
        type: 'object',
        properties: {
          rudiment: {
            type: 'string',
            description: 'Rudiment name: paradiddle, inverted_paradiddle, single_stroke_roll, double_stroke_roll, flam, drag, flam_tap, swiss_army_triplet, five_stroke_roll, half_time_shuffle',
          },
          level: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Skill level (default: intermediate). Beginner = straight punches only.',
          },
        },
        required: ['rudiment'],
      },
    },
    {
      name: 'generate_click_track',
      description: 'Generate a click track timing array for a rudiment at a given BPM. Returns millisecond-accurate event list.',
      inputSchema: {
        type: 'object',
        properties: {
          rudiment: { type: 'string', description: 'Rudiment name' },
          bpm:      { type: 'number', description: 'Beats per minute (default: 80)' },
          repeats:  { type: 'number', description: 'Number of pattern repeats (default: 4)' },
        },
        required: ['rudiment'],
      },
    },
    {
      name: 'list_rudiments',
      description: 'List all available drum rudiments with their boxing combination mappings.',
      inputSchema: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Skill level filter (default: intermediate)',
          },
        },
      },
    },
    // ── Memory (Mem0) tools ────────────────���───────────────────────────────
    {
      name: 'memory_search',
      description: 'Search working memory for relevant context. Use before suggesting ideas to check what Paul has already rejected or decided.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Semantic search query against memory' },
          limit: { type: 'number', description: 'Max results (default: 5)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'memory_add',
      description: 'Add a memory. Types: "rejected" (Paul said no), "rationale" (why something was built this way), "pattern" (working style/session insight).',
      inputSchema: {
        type: 'object',
        properties: {
          text:  { type: 'string', description: 'The memory to store' },
          type:  { type: 'string', enum: ['rejected', 'rationale', 'pattern', 'general'], description: 'Memory type' },
        },
        required: ['text'],
      },
    },
    {
      name: 'memory_context',
      description: 'Get pre-session context: recent memories, standing rejections, key rationale, working patterns. Call at session start.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'memory_forget',
      description: 'Delete a memory by ID. Sovereignty = deletion rights.',
      inputSchema: {
        type: 'object',
        properties: {
          memory_id: { type: 'string', description: 'Memory ID to delete' },
        },
        required: ['memory_id'],
      },
    },
    {
      name: 'memory_list',
      description: 'List all stored memories.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

// -- Mem0 helper (calls Python bridge) ----------------------------------------

import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

const MEM0_PYTHON = path.join(process.env.HOME, 'cathedral-venv', 'bin', 'python3');
const MEM0_SCRIPT = path.join(process.env.HOME, 'nanoclaw', 'mem0-bridge.py');

async function mem0(cmd, ...args) {
  try {
    const { stdout } = await execFileAsync(MEM0_PYTHON, [MEM0_SCRIPT, cmd, ...args], { timeout: 60000 });
    // Filter out spaCy/fastembed warnings
    const cleaned = stdout.split('\n').filter(l => !l.includes('spaCy') && !l.includes('fastembed') && !l.includes('Failed to load')).join('\n');
    return cleaned.trim();
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// -- Tool dispatch ------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Vault ──────────────────────────────────────────────────────────────
      case 'vault_read': {
        const url = `${BASE_URL}/vault/read?path=${encodeURIComponent(args.path)}`;
        return ok(await vaultFetch(url));
      }
      case 'vault_write': {
        const data = await vaultFetch(`${BASE_URL}/vault/write`, {
          method: 'POST',
          body: JSON.stringify({ path: args.path, content: args.content, append: args.append ?? false }),
        });
        return ok(data);
      }
      case 'vault_search': {
        const params = new URLSearchParams({ q: args.query });
        if (args.top_k) params.set('top_k', String(args.top_k));
        return ok(await vaultFetch(`${BASE_URL}/vault/search?${params}`));
      }
      case 'vault_list': {
        const params = args.folder ? `?folder=${encodeURIComponent(args.folder)}` : '';
        return ok(await vaultFetch(`${BASE_URL}/vault/list${params}`));
      }

      // ── Combination Validator ──────────────────────────────────────────────
      case 'validate_combo':
        return ok(validatePunchCombo(args.punches));

      case 'validate_defense':
        return ok(validateDefenseChain(args.defenses));

      case 'validate_footwork':
        return ok(validateFootworkChain(args.atoms));

      case 'validate_integrated':
        return ok(validateIntegratedSequence(args.defense, args.counter_combo));

      case 'list_punches':
        return ok(Object.fromEntries(
          Object.entries(PUNCHES).map(([k, v]) => [k, { ...v }])
        ));

      case 'list_defenses':
        return ok(Object.fromEntries(
          Object.entries(DEFENSES).map(([k, v]) => [k, { ...v }])
        ));

      // ── Rhythm Engine ──────────────────────────────────────────────────────
      case 'generate_rudiment':
        return ok(generateFromRudiment(args.rudiment, { level: args.level }));

      case 'generate_click_track':
        return ok(generateClickTrack(args.rudiment, args.bpm, args.repeats));

      case 'list_rudiments':
        return ok(listRudiments(args.level));

      // ── Memory (Mem0) ──────────────────────────────────────────────────────
      case 'memory_search': {
        const result = await mem0('search', args.query);
        return ok(result);
      }

      case 'memory_add': {
        const memType = args.type || 'general';
        const result = await mem0('add', args.text, memType);
        return ok(result);
      }

      case 'memory_context': {
        const result = await mem0('context');
        try { return ok(JSON.parse(result)); } catch { return ok(result); }
      }

      case 'memory_forget': {
        const result = await mem0('forget', args.memory_id);
        return ok(result);
      }

      case 'memory_list': {
        const result = await mem0('list');
        return ok(result);
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(e.message);
  }
});

// -- Start --------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
