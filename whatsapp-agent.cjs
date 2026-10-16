/**
 * whatsapp-agent.cjs — WhatsApp Business AI agent system for Basic Reflex
 *
 * Architecture:
 *   WhatsApp Cloud API webhook → intent classification → agent routing → response
 *   Connected to PunchPass data (punchpass.db) for member lookup.
 *
 * 4 agent personas:
 *   1. Lead Agent — qualify new inquiries, offer trial, handle pricing
 *   2. Member Agent — class schedule, account queries, general questions
 *   3. Parent Agent — kids program, progress updates, enrollment
 *   4. Retention Agent — re-engage lapsed members (triggered by scanners)
 *
 * Safety: Nothing sends without Paul's review unless explicitly enabled.
 * Default: queue mode (messages go to outbox for review).
 * Auto-reply mode: toggled per-agent via /wa-auto command.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PUNCHPASS_DB = path.join(__dirname, 'vortex_data', 'punchpass.db');
const WA_STATE_PATH = path.join(__dirname, 'whatsapp-agent-state.json');
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'br-cathedral-wa-verify';

// ── State ────────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(WA_STATE_PATH, 'utf-8')); }
  catch { return { autoReply: {}, conversations: {}, stats: { received: 0, replied: 0, queued: 0 } }; }
}

function saveState(state) {
  fs.writeFileSync(WA_STATE_PATH, JSON.stringify(state, null, 2));
}

// ── PunchPass lookup ─────────────────────────────────────────────────────────

function lookupMember(phone) {
  if (!fs.existsSync(PUNCHPASS_DB)) return null;
  const db = new Database(PUNCHPASS_DB, { readonly: true });
  try {
    const cleanPhone = phone.replace(/\D/g, '').slice(-8);
    const member = db.prepare(`
      SELECT ca.first_name, ca.last_name, ca.email, ca.last_attendance, ca.attended,
             ap.pass, ap.expires_on, ap.remaining_value, ap.punches_left, ap.status as pass_status
      FROM customer_attendance ca
      LEFT JOIN active_passes ap ON ca.customer_id = ap.customer_id
      WHERE ca.customer_id LIKE '%' || ? || '%'
         OR ca.email LIKE '%' || ? || '%'
      ORDER BY ca.scraped_at DESC
      LIMIT 1
    `).get(cleanPhone, cleanPhone);
    return member;
  } catch (e) {
    console.error('[wa-agent] PunchPass lookup error:', e.message);
    return null;
  } finally {
    db.close();
  }
}

// ── Intent classification ────────────────────────────────────────────────────

const INTENT_PATTERNS = {
  lead: [
    /\b(price|pricing|cost|how much|rate|fee|trial|first time|beginner|sign up|register)\b/i,
    /\b(do you offer|what classes|when are|schedule|timetable|location|where are you|address)\b/i,
  ],
  parent: [
    /\b(kid|kids|child|children|son|daughter|youth|junior|teen|young|age \d|years old|boy|girl)\b/i,
    /\b(parent|mum|mom|dad|family|my son|my daughter|my kid|my child)\b/i,
  ],
  member: [
    /\b(class|session|cancel|reschedule|book|booking|pass|renew|punch|expire|account)\b/i,
    /\b(coach|trainer|coach paul|paul)\b/i,
  ],
  retention: [
    /\b(come back|return|miss|haven't been|long time|rejoin|reactivate|used to train|used to come|was a member|thinking of coming back|back again)\b/i,
  ],
};

function classifyIntent(message) {
  const text = message.toLowerCase();
  const scores = { lead: 0, parent: 0, member: 0, retention: 0 };

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) scores[intent]++;
    }
  }

  // Parent and retention are high-signal — boost when detected
  if (scores.parent > 0) scores.parent += 1;
  if (scores.retention > 0) scores.retention += 1;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) return 'lead';
  return sorted[0][0];
}

// ── Agent prompts ────────────────────────────────────────────────────────────

const AGENT_PROMPTS = {
  lead: `You are responding as Coach Paul from Basic Reflex boxing gym in Hong Kong.
Someone has messaged asking about the gym. You are warm, direct, and personal — never corporate.

Key info:
- Basic Reflex is a method-based boxing gym (Cuban boxing method), not a fight club
- Trial session available — just show up or book
- Classes: group sessions, private training, corporate sessions
- Location: Hong Kong (share address when asked)
- Prices: message "ask Paul directly" — don't quote specific numbers
- Kids program: ages 12-16, separate sessions
- Vibe: serious training in a supportive environment, all levels welcome

Keep responses SHORT (2-4 sentences). Sound like a real person texting, not a bot.
Sign off as "— Paul" or "Coach Paul" naturally.
If they ask something you can't answer, say "Let me check and get back to you."`,

  member: `You are responding as Coach Paul from Basic Reflex boxing gym.
This person is an existing member. Be familiar and direct.

{MEMBER_CONTEXT}

Keep responses SHORT. Help with: class schedule, pass status, booking questions, general gym queries.
If they need to renew or have account issues, tell them to message Paul directly or come by the gym.
Sign off naturally as Paul.`,

  parent: `You are responding as Coach Paul from Basic Reflex boxing gym.
This parent is asking about the kids/youth boxing program (ages 12-16).

Key info about the kids program:
- Ages 12-16
- Method-based training — builds discipline, coordination, confidence
- Not about fighting — it's about practice and skill development
- Paul personally coaches the youth sessions
- Parents can watch
- Trial session available
- Best growth program at the gym — Paul's most passionate about this

Be warm, reassuring, and enthusiastic about the youth program.
Address safety concerns proactively. Keep it SHORT (2-4 sentences).
Sign off as Coach Paul.`,

  retention: `You are responding as Coach Paul from Basic Reflex boxing gym.
This person used to train but hasn't been in a while. They're reaching out again.

{MEMBER_CONTEXT}

Be warm, zero pressure. Acknowledge the gap without guilt-tripping.
Make it easy to come back: "Just show up" or "Message me when you want to book in."
If they have an expired pass, mention you can sort them out with a new one.
SHORT responses. Personal tone. Sign off as Paul.`,
};

// ── Response generation ──────────────────────────────────────────────────────

async function generateResponse(intent, message, memberContext) {
  let systemPrompt = AGENT_PROMPTS[intent] || AGENT_PROMPTS.lead;

  if (memberContext) {
    const ctx = `Known member: ${memberContext.first_name} ${memberContext.last_name || ''}. ` +
      `Last attended: ${memberContext.last_attendance || 'unknown'}. ` +
      `Pass: ${memberContext.pass || 'none'} (${memberContext.pass_status || 'unknown'}). ` +
      `Punches left: ${memberContext.punches_left || 'N/A'}.`;
    systemPrompt = systemPrompt.replace('{MEMBER_CONTEXT}', ctx);
  } else {
    systemPrompt = systemPrompt.replace('{MEMBER_CONTEXT}', 'No member data found — treat as potential new/returning member.');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Hey, got your message. Let me get back to you shortly. — Paul";
}

// ── WhatsApp Cloud API ───────────────────────────────────────────────────────

async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log('[wa-agent] WhatsApp API not configured. Message queued only.');
    return false;
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );

  const result = await response.json();
  if (result.messages) return true;
  console.error('[wa-agent] Send failed:', JSON.stringify(result));
  return false;
}

// ── Core message handler ─────────────────────────────────────────────────────

async function handleIncoming(from, message, messageId) {
  const state = loadState();
  state.stats.received++;

  // Classify intent
  const intent = classifyIntent(message);

  // Lookup member
  const member = lookupMember(from);

  // Override intent if member found and message is generic
  const effectiveIntent = member && intent === 'lead' ? 'member' : intent;

  // Generate response
  const response = await generateResponse(effectiveIntent, message, member);

  // Store conversation
  if (!state.conversations[from]) {
    state.conversations[from] = { messages: [], intent: effectiveIntent, memberName: member?.first_name || null };
  }
  state.conversations[from].messages.push(
    { role: 'user', text: message, ts: new Date().toISOString() },
    { role: 'assistant', text: response, ts: new Date().toISOString(), intent: effectiveIntent }
  );
  // Keep last 20 messages per conversation
  if (state.conversations[from].messages.length > 20) {
    state.conversations[from].messages = state.conversations[from].messages.slice(-20);
  }

  // Auto-reply or queue
  const autoEnabled = state.autoReply[effectiveIntent] || false;

  if (autoEnabled) {
    const sent = await sendWhatsAppMessage(from, response);
    if (sent) {
      state.stats.replied++;
      console.log(`[wa-agent] Auto-replied to ${from} (${effectiveIntent}): ${response.slice(0, 60)}...`);
    } else {
      state.stats.queued++;
    }
  } else {
    state.stats.queued++;
    // Queue for Paul's review
    const queueItem = {
      id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from,
      message,
      suggestedReply: response,
      intent: effectiveIntent,
      memberName: member?.first_name || null,
      memberData: member || null,
      created: new Date().toISOString(),
      status: 'pending',
    };

    const queuePath = path.join(__dirname, 'comms-engine', 'outbox', 'wa-inbound-queue.json');
    let queue = [];
    try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8')); } catch {}
    queue.push(queueItem);
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));

    console.log(`[wa-agent] Queued for review: ${from} (${effectiveIntent}) → ${response.slice(0, 60)}...`);
  }

  saveState(state);
  return { intent: effectiveIntent, response, autoSent: autoEnabled, member: member?.first_name || null };
}

// ── Webhook handler (for cath-bridge integration) ────────────────────────────

function createWebhookHandler() {
  return {
    // GET — verification endpoint
    verify(query) {
      const mode = query['hub.mode'];
      const token = query['hub.verify_token'];
      const challenge = query['hub.challenge'];

      if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
        console.log('[wa-agent] Webhook verified');
        return { status: 200, body: challenge };
      }
      return { status: 403, body: 'Forbidden' };
    },

    // POST — incoming messages
    async receive(body) {
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages) return { status: 200, body: 'OK' };

      for (const msg of value.messages) {
        if (msg.type !== 'text') continue;
        const from = msg.from;
        const text = msg.text?.body;
        if (!text) continue;

        try {
          await handleIncoming(from, text, msg.id);
        } catch (e) {
          console.error('[wa-agent] Error handling message:', e.message);
        }
      }

      return { status: 200, body: 'OK' };
    },
  };
}

// ── Dashboard data ───────────────────────────────────────────────────────────

function getDashboardData() {
  const state = loadState();

  // Load inbound queue
  const queuePath = path.join(__dirname, 'comms-engine', 'outbox', 'wa-inbound-queue.json');
  let queue = [];
  try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8')); } catch {}

  const pending = queue.filter(q => q.status === 'pending');
  const recentConversations = Object.entries(state.conversations)
    .map(([phone, conv]) => ({
      phone,
      intent: conv.intent,
      memberName: conv.memberName,
      lastMessage: conv.messages[conv.messages.length - 1],
      messageCount: conv.messages.length,
    }))
    .sort((a, b) => (b.lastMessage?.ts || '').localeCompare(a.lastMessage?.ts || ''))
    .slice(0, 20);

  return {
    stats: state.stats,
    autoReply: state.autoReply,
    pending: pending.length,
    pendingMessages: pending.slice(0, 10),
    recentConversations,
  };
}

// ── Approve / send queued message ────────────────────────────────────────────

async function approveMessage(messageId, customReply) {
  const queuePath = path.join(__dirname, 'comms-engine', 'outbox', 'wa-inbound-queue.json');
  let queue = [];
  try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8')); } catch {}

  const item = queue.find(q => q.id === messageId);
  if (!item) return { error: 'Message not found' };

  const replyText = customReply || item.suggestedReply;
  const sent = await sendWhatsAppMessage(item.from, replyText);

  item.status = sent ? 'sent' : 'send_failed';
  item.sentAt = new Date().toISOString();
  item.finalReply = replyText;
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));

  const state = loadState();
  if (sent) state.stats.replied++;
  saveState(state);

  return { sent, to: item.from, reply: replyText };
}

// ── Toggle auto-reply per agent ──────────────────────────────────────────────

function toggleAutoReply(agent) {
  const state = loadState();
  state.autoReply[agent] = !state.autoReply[agent];
  saveState(state);
  return state.autoReply;
}

module.exports = {
  handleIncoming,
  createWebhookHandler,
  getDashboardData,
  approveMessage,
  toggleAutoReply,
  classifyIntent,
  generateResponse,
  lookupMember,
};
