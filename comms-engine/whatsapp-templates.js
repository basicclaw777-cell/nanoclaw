/**
 * whatsapp-templates.js — 11 WhatsApp message templates for Basic Reflex
 *
 * All templates return { subject, body, type, priority } objects.
 * Personalisation via template literals with member data.
 * Paul's voice: direct, warm, personal. Never corporate. Never auto-sends.
 */

// ── Template definitions ────────────────────────────────────────────────────

const TEMPLATES = {
  // ── Pass Expiry (3 templates) ──────────────────────────────────────────
  pass_expiring_soon: {
    type: 'expiry',
    priority: 'high',
    generate: (member) => ({
      subject: `Pass expiring — ${member.first_name}`,
      body: `Hey ${member.first_name}, your ${member.current_pass || 'pass'} is expiring soon. Want to renew before it runs out? Just let me know and I'll sort it. — Paul`,
      type: 'expiry',
      priority: 'high',
    }),
  },

  pass_expired: {
    type: 'expiry',
    priority: 'urgent',
    generate: (member) => ({
      subject: `Pass expired — ${member.first_name}`,
      body: `${member.first_name}, your ${member.current_pass || 'pass'} has expired. If you want to keep training, message me and we'll get you sorted. No pressure — just don't want you to lose momentum. — Paul`,
      type: 'expiry',
      priority: 'urgent',
    }),
  },

  last_punch_remaining: {
    type: 'expiry',
    priority: 'high',
    generate: (member) => {
      const punchesLeft = member.passes?.[0]?.punches_left || 1;
      return {
        subject: `Last punch — ${member.first_name}`,
        body: `${member.first_name}, you've got ${punchesLeft} session${punchesLeft === 1 ? '' : 's'} left on your ${member.current_pass || 'pass'}. Want to top up? — Paul`,
        type: 'expiry',
        priority: 'high',
      };
    },
  },

  // ── Lapsed Member Recovery (3 templates by segment) ────────────────────
  lapsed_warm: {
    type: 'lapsed',
    priority: 'high',
    generate: (member) => ({
      subject: `Miss you — ${member.name}`,
      body: `Hey ${member.name.split(' ')[0]}, haven't seen you in a bit. Everything good? The gym's here when you're ready. If you want to jump back in, just say the word. — Paul`,
      type: 'lapsed',
      priority: 'high',
    }),
  },

  lapsed_cool: {
    type: 'lapsed',
    priority: 'medium',
    generate: (member) => ({
      subject: `Checking in — ${member.name}`,
      body: `${member.name.split(' ')[0]}, it's been a while. Just checking in — no sales pitch, just wanted to see how you're doing. If you ever want to come hit pads again, you know where we are. — Paul`,
      type: 'lapsed',
      priority: 'medium',
    }),
  },

  lapsed_cold: {
    type: 'lapsed',
    priority: 'low',
    generate: (member) => ({
      subject: `Long time — ${member.name}`,
      body: `${member.name.split(' ')[0]}, been a long time. Hope life's treating you well. The gym's changed a lot — new coaches, new energy. Door's always open if you want to swing by. — Paul`,
      type: 'lapsed',
      priority: 'low',
    }),
  },

  // ── Birthday ───────────────────────────────────────────────────────────
  birthday: {
    type: 'birthday',
    priority: 'medium',
    generate: (member) => ({
      subject: `Birthday — ${member.first_name || member.name.split(' ')[0]}`,
      body: `Happy birthday ${member.first_name || member.name.split(' ')[0]}! Hope you have a great one. See you at the gym. — Paul`,
      type: 'birthday',
      priority: 'medium',
    }),
  },

  // ── Attendance / Engagement ────────────────────────────────────────────
  absence_check: {
    type: 'attendance',
    priority: 'medium',
    generate: (member) => ({
      subject: `Haven't seen you — ${member.first_name || member.name.split(' ')[0]}`,
      body: `${member.first_name || member.name.split(' ')[0]}, noticed you haven't been in for a couple weeks. Everything okay? No judgement — just checking. — Paul`,
      type: 'attendance',
      priority: 'medium',
    }),
  },

  // ── Milestone / Achievement ────────────────────────────────────────────
  milestone: {
    type: 'milestone',
    priority: 'low',
    generate: (member, data = {}) => ({
      subject: `Nice work — ${member.first_name || member.name.split(' ')[0]}`,
      body: `${member.first_name || member.name.split(' ')[0]}, ${data.milestone || 'you hit a milestone'}. Proper effort. Keep it going. — Paul`,
      type: 'milestone',
      priority: 'low',
    }),
  },

  // ── New Member Welcome ─────────────────────────────────────────────────
  welcome: {
    type: 'welcome',
    priority: 'medium',
    generate: (member) => ({
      subject: `Welcome — ${member.first_name || member.name.split(' ')[0]}`,
      body: `${member.first_name || member.name.split(' ')[0]}, welcome to Basic Reflex. Glad you're here. Any questions about classes or schedule, just message me direct. — Paul`,
      type: 'welcome',
      priority: 'medium',
    }),
  },

  // ── Trial Follow-up ────────────────────────────────────────────────────
  trial_followup: {
    type: 'trial',
    priority: 'high',
    generate: (member) => ({
      subject: `How was it — ${member.first_name || member.name.split(' ')[0]}`,
      body: `${member.first_name || member.name.split(' ')[0]}, how was your first session? Anything you want to work on? If you enjoyed it, I can help you find the right pass. — Paul`,
      type: 'trial',
      priority: 'high',
    }),
  },
};

/**
 * Generate a message from a template
 * @param {string} templateName - key from TEMPLATES
 * @param {object} member - member data object
 * @param {object} [extra] - extra data for templates that need it
 * @returns {{ subject, body, type, priority } | null}
 */
export function generateMessage(templateName, member, extra = {}) {
  const tmpl = TEMPLATES[templateName];
  if (!tmpl) return null;
  return tmpl.generate(member, extra);
}

/**
 * List all available template names
 */
export function listTemplates() {
  return Object.keys(TEMPLATES);
}

/**
 * Get template metadata (type, priority) without generating
 */
export function getTemplateInfo(templateName) {
  const tmpl = TEMPLATES[templateName];
  if (!tmpl) return null;
  return { name: templateName, type: tmpl.type, priority: tmpl.priority };
}

export default TEMPLATES;
