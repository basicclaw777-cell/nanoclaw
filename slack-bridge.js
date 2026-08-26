/**
 * slack-bridge.js — Bridges Slack into the Cathedral Telegram bot.
 *
 * Connects to Slack via Bolt (Socket Mode). Messages from Slack are
 * dispatched to command handlers and responses are sent back to Slack.
 *
 * Usage: import { startSlack, isSlackMessage, sendSlack } from './slack-bridge.js';
 *        Call startSlack(commandRouter) after bot startup.
 *
 * CJS-compatible ESM (nanoclaw repo = ESM).
 */

import dotenv from 'dotenv';
dotenv.config();

import pkg from '@slack/bolt';
const { App } = pkg;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_MAX = 3900; // Slack limit is 4000, leave margin

let slackApp = null;
let botUserId = null;

/**
 * Split long text into chunks that fit Slack's message limit.
 */
function chunkText(text, max = SLACK_MAX) {
  if (text.length <= max) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= max) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n\n', max);
    if (cut < max * 0.3) cut = remaining.lastIndexOf('\n', max);
    if (cut < max * 0.3) cut = max;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  return chunks;
}

/**
 * Convert Telegram Markdown to Slack mrkdwn.
 * Telegram uses *bold* and _italic_ — Slack uses *bold* and _italic_ too,
 * but code blocks and other formatting differ slightly.
 */
function telegramToSlack(text) {
  if (!text) return '';
  return text
    .replace(/```(\w+)?\n/g, '```\n') // strip language hints from code blocks
    .replace(/`([^`]+)`/g, '`$1`');   // inline code stays the same
}

/**
 * Send a message to a Slack channel. Handles chunking for long messages.
 */
export async function sendSlack(channel, text, opts = {}) {
  if (!slackApp || !text) return;
  text = telegramToSlack(String(text));
  const chunks = chunkText(text);
  for (const chunk of chunks) {
    try {
      await slackApp.client.chat.postMessage({
        channel,
        text: chunk,
        ...(opts.thread_ts ? { thread_ts: opts.thread_ts } : {}),
      });
    } catch (err) {
      console.error(`[slack-bridge] Send failed: ${err.message}`);
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 300));
  }
}

/**
 * Send a file/image to Slack.
 */
export async function sendSlackFile(channel, filePath, caption = '') {
  if (!slackApp) return;
  const fs = await import('fs');
  if (!fs.existsSync(filePath)) {
    if (caption) await sendSlack(channel, `[Image unavailable] ${caption}`);
    return;
  }
  try {
    const path = await import('path');
    await slackApp.client.filesUploadV2({
      channel_id: channel,
      file: fs.createReadStream(filePath),
      filename: path.basename(filePath),
      initial_comment: caption || undefined,
    });
  } catch (err) {
    console.error(`[slack-bridge] File upload failed: ${err.message}`);
    if (caption) await sendSlack(channel, `[File send failed] ${caption}`);
  }
}

/**
 * Start the Slack bridge.
 *
 * @param {Function} commandRouter - async function(text, channel, respond)
 *   where respond(text) sends a reply back to the Slack channel.
 *   The router should handle /commands and general messages.
 */
export async function startSlack(commandRouter) {
  if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
    console.log('[slack-bridge] No Slack tokens configured — skipping.');
    return null;
  }

  try {
    slackApp = new App({
      token: SLACK_BOT_TOKEN,
      appToken: SLACK_APP_TOKEN,
      socketMode: true,
    });

    // Get bot user ID for filtering own messages
    const authResult = await slackApp.client.auth.test();
    botUserId = authResult.user_id;
    console.log(`[slack-bridge] Bot user: ${authResult.user} (${botUserId})`);

    // Listen to all messages
    slackApp.message(async ({ message, say }) => {
      // Skip bot's own messages
      if (message.subtype === 'bot_message') return;
      if (message.user === botUserId) return;
      if (!message.text) return;

      let text = message.text;

      // Strip bot mention if present (Slack wraps @mentions as <@UBOTID>)
      if (botUserId) {
        text = text.replace(new RegExp(`<@${botUserId}>\\s*`, 'g'), '').trim();
      }

      if (!text) return;

      const channel = message.channel;
      const threadTs = message.thread_ts || message.ts;

      console.log(`[slack-bridge] Message from ${message.user} in ${channel}: ${text.slice(0, 100)}`);

      // Build respond function that sends back to same channel/thread
      const respond = async (reply) => {
        await sendSlack(channel, reply, { thread_ts: threadTs });
      };

      try {
        await commandRouter(text, channel, respond, {
          user: message.user,
          thread_ts: threadTs,
          channel,
        });
      } catch (err) {
        console.error(`[slack-bridge] Router error: ${err.message}`);
        await respond(`Error: ${err.message}`);
      }
    });

    await slackApp.start();
    console.log('[slack-bridge] Slack connected (Socket Mode)');
    return slackApp;
  } catch (err) {
    console.error(`[slack-bridge] Failed to start: ${err.message}`);
    return null;
  }
}

export function getSlackApp() { return slackApp; }
export function getSlackBotUserId() { return botUserId; }
