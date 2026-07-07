/**
 * state-bus.js — Shared state blackboard.
 *
 * Each organ reads shared state, writes its own observations.
 * No direct coupling between organs. The bus is the meeting point.
 *
 * State is organized into six namespaces:
 *   world       — environment/market/external data
 *   agent       — health, confidence, status
 *   mission     — objectives, intent, identity config
 *   performance — metrics, history, W/L
 *   policy      — constraints, rules, blocks
 *   resource    — budgets, capacity, limits
 *
 * Backed by JSON files in each agent's directory.
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';

const NAMESPACES = ['world', 'agent', 'mission', 'performance', 'policy', 'resource'];

export class StateBus {

  constructor(agentDir, agentId) {
    this.agentDir = agentDir;
    this.agentId = agentId;
    this.stateDir = path.join(agentDir, 'state');
    this.cache = {};

    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  _filePath(namespace) {
    return path.join(this.stateDir, `${namespace}.json`);
  }

  /**
   * Read a namespace. Returns cached if fresh, reads from disk otherwise.
   */
  read(namespace) {
    if (!NAMESPACES.includes(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}. Valid: ${NAMESPACES.join(', ')}`);
    }

    const filePath = this._filePath(namespace);
    if (!fs.existsSync(filePath)) return {};

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.cache[namespace] = data;
      return data;
    } catch {
      return this.cache[namespace] || {};
    }
  }

  /**
   * Write to a namespace. Merges with existing state (shallow).
   * Each write is tagged with the organ that wrote it.
   */
  write(namespace, data, organ) {
    if (!NAMESPACES.includes(namespace)) {
      throw new Error(`Unknown namespace: ${namespace}. Valid: ${NAMESPACES.join(', ')}`);
    }

    const existing = this.read(namespace);
    const merged = {
      ...existing,
      ...data,
      _lastWriter: organ,
      _lastWritten: new Date().toISOString(),
    };

    fs.writeFileSync(this._filePath(namespace), JSON.stringify(merged, null, 2));
    this.cache[namespace] = merged;
    return merged;
  }

  /**
   * Read all namespaces at once. Returns full shared state snapshot.
   */
  snapshot() {
    const state = {};
    for (const ns of NAMESPACES) {
      state[ns] = this.read(ns);
    }
    return state;
  }

  /**
   * Check when a namespace was last written.
   */
  lastUpdated(namespace) {
    const data = this.read(namespace);
    return data._lastWritten || null;
  }
}

export { NAMESPACES };
