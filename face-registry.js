// face-registry.js — Node.js bridge to face-registry.py
// ESM module. Imported by telegram-bot.js.
// Provides /enroll, /members, /whoisthis commands.

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

const HOME = process.env.HOME;
const PYTHON = path.join(HOME, 'cathedral-venv', 'bin', 'python3');
const SCRIPT = path.join(HOME, 'Cathedral', 'face-registry.py');

async function runRegistry(args) {
  try {
    const { stdout } = await execFileAsync(PYTHON, [SCRIPT, ...args], {
      timeout: 30000,
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' }
    });
    return JSON.parse(stdout.trim());
  } catch (e) {
    return { status: 'error', message: e.message.slice(0, 200) };
  }
}

export async function enrollMember(name, imagePath) {
  return runRegistry(['enroll', name, imagePath]);
}

export async function identifyFaces(imagePath) {
  return runRegistry(['identify', imagePath]);
}

export async function identifyFromVideo(videoPath, sampleSeconds = 5) {
  return runRegistry(['identify-video', videoPath, String(sampleSeconds)]);
}

export async function listMembers() {
  return runRegistry(['list']);
}

export async function deleteMember(name) {
  return runRegistry(['delete', name]);
}

export function formatMemberListTelegram(result) {
  if (result.status !== 'ok') return `Error: ${result.message}`;
  if (result.count === 0) return '*Face Registry*\n\nNo members enrolled.\nUse /enroll [name] (reply to photo) to add a member.';

  let msg = `*Face Registry* — ${result.count} members\n\n`;
  for (const m of result.members) {
    msg += `  ${m.name} (enrolled ${m.enrolled.split('T')[0]})\n`;
  }
  msg += '\n*Commands:*\n';
  msg += '/enroll [name] — reply to photo to enroll\n';
  msg += '/members — list enrolled members\n';
  msg += '/unenroll [name] — remove member';
  return msg;
}

export function formatIdentifyTelegram(result) {
  if (result.status !== 'ok') return `Error: ${result.message}`;
  if (!result.faces || result.faces.length === 0) return 'No faces detected in image.';

  let msg = `*Face ID* — ${result.total_detected || result.faces.length} face(s)\n\n`;
  for (const face of result.faces) {
    if (face.name === 'unknown') {
      msg += `  ? Unknown`;
      if (face.best_guess) msg += ` (closest: ${face.best_guess}, dist ${face.best_distance})`;
      msg += '\n';
    } else {
      const pct = Math.round(face.confidence * 100);
      msg += `  ${face.name} (${pct}% match)\n`;
    }
  }
  return msg;
}

export default {
  enrollMember,
  identifyFaces,
  identifyFromVideo,
  listMembers,
  deleteMember,
  formatMemberListTelegram,
  formatIdentifyTelegram
};
