/**
 * provenance-stamp.js — Utility to stamp provenance metadata on vault entries.
 *
 * Archivist's suggestion (2026-05-18): every vault entry should record
 * agent_name, source_tool, timestamp, and session_id at birth.
 *
 * Usage (ESM):
 *   import { stampProvenance, injectProvenanceFrontmatter } from './provenance-stamp.js';
 *
 * Usage (CJS — from ~/Cathedral/):
 *   const stamp = require(process.env.HOME + '/nanoclaw/provenance-stamp.cjs');
 */

/**
 * Build a provenance object.
 * @param {string} agentName  — which agent/tool wrote this entry
 * @param {string} sourceTool — the system that triggered the write (e.g. 'vault-promoter', 'thought-intake', 'curiosity-loop')
 * @param {string} [sessionId] — optional session identifier
 * @returns {{ agent_name: string, source_tool: string, timestamp: string, session_id: string|null }}
 */
export function stampProvenance(agentName, sourceTool, sessionId = null) {
  return {
    agent_name: agentName || 'unknown',
    source_tool: sourceTool || 'unknown',
    timestamp: new Date().toISOString(),
    session_id: sessionId || null,
  };
}

/**
 * Inject a `provenance:` block into YAML frontmatter content.
 * If the content already has `provenance:`, it is left untouched.
 *
 * @param {string} content — full markdown file content (must start with ---)
 * @param {string} agentName
 * @param {string} sourceTool
 * @param {string} [sessionId]
 * @returns {string} — content with provenance injected into frontmatter
 */
export function injectProvenanceFrontmatter(content, agentName, sourceTool, sessionId = null) {
  // Already has provenance — don't double-stamp
  if (/^provenance:/m.test(content.slice(0, 500))) return content;

  if (!content.startsWith('---')) return content; // no frontmatter to inject into

  const prov = stampProvenance(agentName, sourceTool, sessionId);
  const yamlBlock = [
    `provenance_agent: ${prov.agent_name}`,
    `provenance_source: ${prov.source_tool}`,
    `provenance_ts: ${prov.timestamp}`,
    prov.session_id ? `provenance_session: ${prov.session_id}` : null,
  ].filter(Boolean).join('\n');

  // Insert after the opening ---
  return content.replace(/^---\n/, `---\n${yamlBlock}\n`);
}
