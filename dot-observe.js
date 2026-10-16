import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { sendSlackBlocks, updateSlackMessage, registerSlackAction } from './slack-bridge.js';

const require = createRequire(import.meta.url);
const { Dot } = require('../Cathedral/cathedral-memory/lib/dot.js');

// Bot lacks channels:manage — using cathedral-channel until Paul creates #dot-observations
const DOT_CHANNEL = 'C0BSL8U56G4';

let dot;
function getDot() {
    if (!dot) dot = new Dot();
    return dot;
}

const REL_COLORS = {
    MATCHES: '#2196F3',
    EXTENDS: '#4CAF50',
    CONTRADICTS: '#f44336',
    INSPIRES: '#9C27B0',
    QUESTIONS: '#FF9800',
    DUPLICATES: '#607D8B',
};

function buildObservationBlocks(obs) {
    const blocks = [];

    blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: `DOT #${obs.id}`, emoji: true }
    });

    const meta = [];
    if (obs.source) meta.push(`*Source:* ${obs.source}`);
    if (obs.state) meta.push(`*State:* ${obs.state}`);
    if (obs.created_at) meta.push(`*${obs.created_at}*`);
    if (meta.length) {
        blocks.push({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: meta.join('  ·  ') }]
        });
    }

    if (obs.raw_text) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: obs.raw_text.slice(0, 2900) }
        });
    }

    const parts = (obs.interpretation || '').split('\n\nWHY: ');
    const interp = parts[0] || '';
    const why = parts[1] || '';

    if (interp) {
        blocks.push({ type: 'divider' });
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Interpretation:*\n${interp.slice(0, 2900)}` }
        });
    }

    if (why) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `> *WHY:* ${why.slice(0, 2900)}` }
        });
    }

    const scores = [];
    if (obs.relevance != null) scores.push(`Relevance: ${(obs.relevance * 100).toFixed(0)}%`);
    if (obs.novelty != null) scores.push(`Novelty: ${(obs.novelty * 100).toFixed(0)}%`);
    if (obs.confidence != null) scores.push(`Confidence: ${(obs.confidence * 100).toFixed(0)}%`);
    if (scores.length) {
        blocks.push({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: scores.join('  ·  ') }]
        });
    }

    if (obs.links && obs.links.length > 0) {
        const linkText = obs.links.slice(0, 5).map(l =>
            `• *${l.relationship}* → ${l.title || `chunk #${l.chunk_id}`}`
        ).join('\n');
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Connections:*\n${linkText}` }
        });
    }

    blocks.push({ type: 'divider' });
    blocks.push({
        type: 'actions',
        elements: [
            {
                type: 'button',
                text: { type: 'plain_text', text: 'YES — Useful', emoji: true },
                style: 'primary',
                action_id: `dot_useful_${obs.id}`,
                value: String(obs.id),
            },
            {
                type: 'button',
                text: { type: 'plain_text', text: 'NO — Dismiss', emoji: true },
                style: 'danger',
                action_id: `dot_dismiss_${obs.id}`,
                value: String(obs.id),
            },
            {
                type: 'button',
                text: { type: 'plain_text', text: 'Promote to Knowledge', emoji: true },
                action_id: `dot_promote_${obs.id}`,
                value: String(obs.id),
            },
        ]
    });

    return blocks;
}

function buildUpdatedBlocks(obs, action) {
    const blocks = [];

    blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: `DOT #${obs.id}`, emoji: true }
    });

    const statusMap = {
        useful: 'Marked USEFUL',
        dismissed: 'DISMISSED',
        promoted: 'PROMOTED to Knowledge',
    };

    blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `*${statusMap[action] || action}*  ·  ${obs.source}  ·  ${obs.created_at}` }]
    });

    const parts = (obs.interpretation || '').split('\n\nWHY: ');
    const interp = parts[0] || '';
    if (interp) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: interp.slice(0, 2900) }
        });
    }

    if (action === 'useful') {
        blocks.push({
            type: 'actions',
            elements: [{
                type: 'button',
                text: { type: 'plain_text', text: 'Promote to Knowledge', emoji: true },
                action_id: `dot_promote_${obs.id}`,
                value: String(obs.id),
            }]
        });
    }

    return blocks;
}

async function postToSlack(obs) {
    const blocks = buildObservationBlocks(obs);
    const fallback = `DOT #${obs.id}: ${(obs.raw_text || obs.interpretation || '').slice(0, 100)}`;
    const result = await sendSlackBlocks(DOT_CHANNEL, blocks, fallback);
    if (result && result.ts) {
        console.log(`[dot-slack] Posted DOT #${obs.id} to ${DOT_CHANNEL} (ts: ${result.ts})`);
    }
    return result;
}

function setupDotActions() {
    registerSlackAction('dot', async (action, body) => {
        const actionId = action.action_id || '';
        const obsId = parseInt(action.value);
        if (isNaN(obsId)) return;

        const d = getDot();
        const channel = body.channel?.id || body.container?.channel_id;
        const messageTs = body.message?.ts || body.container?.message_ts;

        let updateAction;

        if (actionId.startsWith('dot_useful_')) {
            d.markUseful(obsId);
            updateAction = 'useful';
        } else if (actionId.startsWith('dot_dismiss_')) {
            d.dismiss(obsId);
            updateAction = 'dismissed';
        } else if (actionId.startsWith('dot_promote_')) {
            d.promote(obsId, 'slack');
            updateAction = 'promoted';
        }

        if (updateAction && channel && messageTs) {
            const obs = d.getObservation(obsId);
            if (obs) {
                const updatedBlocks = buildUpdatedBlocks(obs, updateAction);
                await updateSlackMessage(channel, messageTs, updatedBlocks,
                    `DOT #${obsId} — ${updateAction}`);
            }
        }
    });
}

export function registerDotCommands(bot, isPaulFn) {
    const send = (chatId, text, opts = {}) => bot.sendMessage(chatId, text, opts).catch(e => console.error('[dot] send error:', e.message));

    setupDotActions();

    bot.onText(/^\/observe(?:@\w+)?(?:\s+([\s\S]+))?$/i, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPaulFn(chatId)) return;

        const text = (match[1] || '').trim();
        if (!text) {
            await send(chatId, 'Send text, URL, or photo with /observe caption.');
            return;
        }

        await send(chatId, '👁 Observing...');

        try {
            const d = getDot();
            const result = await d.observe({
                source: 'telegram',
                rawText: text,
                sourceUrl: extractUrl(text),
            });

            const reply = formatObservation(result);
            await send(chatId, reply, { parse_mode: 'Markdown' });

            await postToSlack(result);
        } catch (err) {
            console.error('[dot-observe] Error:', err);
            await send(chatId, `Dot error: ${err.message}`);
        }
    });

    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const caption = (msg.caption || '').trim();

        if (!caption.toLowerCase().startsWith('/observe')) return;
        if (!isPaulFn(chatId)) return;

        const text = caption.replace(/^\/observe\s*/i, '').trim();
        await send(chatId, '👁 Observing image...');

        try {
            const photoFile = msg.photo[msg.photo.length - 1];
            const fileLink = await bot.getFileLink(photoFile.file_id);
            const stamp = Date.now();
            const localPath = `/tmp/dot-obs-${stamp}.jpg`;

            const resp = await fetch(fileLink);
            const buffer = Buffer.from(await resp.arrayBuffer());
            fs.writeFileSync(localPath, buffer);

            const d = getDot();
            const result = await d.observe({
                source: 'telegram',
                rawText: text || null,
                imagePath: localPath,
                sourceUrl: extractUrl(text),
            });

            const reply = formatObservation(result);
            await send(chatId, reply, { parse_mode: 'Markdown' });

            await postToSlack(result);

            try { fs.unlinkSync(localPath); } catch {}
        } catch (err) {
            console.error('[dot-observe] Photo error:', err);
            await send(chatId, `Dot error: ${err.message}`);
        }
    });

    bot.onText(/^\/dot(?:@\w+)?$/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!isPaulFn(chatId)) return;

        try {
            const d = getDot();
            const stats = d.stats();
            const feed = d.getFeed(3);

            let reply = `*CATHEDRAL DOT*\n\nTotal: ${stats.total} | Surfaced: ${stats.surfaced} | Promoted: ${stats.promoted}\nUseful: ${stats.useful_yes || 0} YES / ${stats.useful_no || 0} NO\n\n`;

            if (feed.length > 0) {
                reply += '*Recent:*\n';
                for (const obs of feed) {
                    const parts = (obs.interpretation || '').split('\n\nWHY: ');
                    const interp = parts[0] || obs.raw_text || '(no interpretation)';
                    reply += `\n• [${obs.source}] ${interp.slice(0, 100)}...\n`;
                }
                reply += `\n🔗 http://localhost:7778`;
            } else {
                reply += 'No observations yet. Send /observe + text or photo.';
            }

            await send(chatId, reply, { parse_mode: 'Markdown' });
        } catch (err) {
            await send(chatId, `Dot error: ${err.message}`);
        }
    });
}

function extractUrl(text) {
    if (!text) return null;
    const match = text.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : null;
}

function formatObservation(obs) {
    if (!obs) return 'Observation failed.';

    const parts = (obs.interpretation || '').split('\n\nWHY: ');
    const interp = parts[0] || '';
    const why = parts[1] || '';

    let msg = `*DOT #${obs.id}*\n\n`;

    if (interp) msg += `${interp}\n\n`;

    if (obs.relevance != null) {
        msg += `Relevance: ${(obs.relevance * 100).toFixed(0)}%`;
        msg += ` · Novelty: ${(obs.novelty * 100).toFixed(0)}%\n`;
    }

    if (why) msg += `\n_${why}_\n`;

    if (obs.links && obs.links.length > 0) {
        msg += '\n*Connections:*\n';
        for (const l of obs.links.slice(0, 5)) {
            msg += `→ ${l.relationship} · ${l.title}\n`;
        }
    }

    msg += `\nState: ${obs.state}`;
    msg += `\n🔗 http://localhost:7778`;

    return msg;
}
