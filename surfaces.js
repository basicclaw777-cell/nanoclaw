// surfaces.js — Surface renderers for the Cathedral proposal system
// Each renderer transforms a proposal/brief into a surface-specific format.
// No network calls — plain objects only. Adapters deliver later.

// ── Email Renderer ──

export const emailRenderer = {
  // Renders a proposal as a decision email
  renderDecision(proposal) {
    const domain = proposal.domain || 'general';
    const agent = proposal.agent || 'unknown';
    const confidence = proposal.confidence != null ? `${Math.round(proposal.confidence * 100)}%` : 'n/a';
    const cost = proposal.cost || 'none stated';
    const expiry = proposal.expiry ? `Expires: ${proposal.expiry}` : '';

    const subject = `[Cathedral] ${domain.toUpperCase()}: ${truncate(proposal.proposal, 60)}`;

    const body = [
      `PROPOSAL #${proposal.id} from ${agent}`,
      `Domain: ${domain}`,
      `Confidence: ${confidence}`,
      `Expected value: ${proposal.expected_value || 'not specified'}`,
      `Cost: ${cost}`,
      expiry,
      '',
      proposal.proposal,
      '',
      proposal.evidence ? `Evidence: ${proposal.evidence}` : '',
      '',
      '---',
      'Reply APPROVE / HOLD / REJECT',
    ].filter(Boolean).join('\n');

    return { subject, body, actions: ['APPROVE', 'HOLD', 'REJECT'] };
  },

  // Renders a morning brief as email
  renderBrief(briefData) {
    const date = briefData.date || new Date().toISOString().slice(0, 10);
    const subject = `[Cathedral] Morning Brief — ${date}`;

    const sections = [];
    const s = briefData.sections || {};

    if (s.overdue && s.overdue.length) {
      sections.push(`OVERDUE (${s.overdue.length}):`);
      s.overdue.forEach(p => sections.push(`  - #${p.id} ${truncate(p.proposal, 50)} — was due ${p.scheduled_end}`));
      sections.push('');
    }

    if (s.approvals_waiting && s.approvals_waiting.length) {
      sections.push(`APPROVALS WAITING (${s.approvals_waiting.length}):`);
      s.approvals_waiting.forEach(p => sections.push(`  - #${p.id} [${p.agent}] ${truncate(p.proposal, 50)}`));
      sections.push('');
    }

    if (s.deadlines_this_week && s.deadlines_this_week.length) {
      sections.push(`THIS WEEK (${s.deadlines_this_week.length}):`);
      s.deadlines_this_week.forEach(p => sections.push(`  - #${p.id} ${truncate(p.proposal, 40)} — ${p.scheduled_at}`));
      sections.push('');
    }

    if (s.students_at_risk && s.students_at_risk.length) {
      sections.push(`STUDENTS AT RISK (${s.students_at_risk.length}):`);
      s.students_at_risk.forEach(st => sections.push(`  - ${st.name}: ${st.reason || 'flagged'}`));
      sections.push('');
    }

    if (s.revenue && s.revenue.summary) {
      sections.push(`REVENUE: ${s.revenue.summary}`);
      sections.push('');
    }

    if (!sections.length) {
      sections.push('All clear. No pressure items today.');
    }

    sections.push(`---\nAction: ${briefData.reply_action || 'OPEN APPROVALS'}`);

    return { subject, body: sections.join('\n') };
  },

  // Renders an execution report
  renderReport(reportData) {
    const subject = `[Cathedral] Execution Report — ${reportData.date || new Date().toISOString().slice(0, 10)}`;
    const lines = [`Execution Report — ${reportData.date || 'today'}`];

    if (reportData.executed && reportData.executed.length) {
      lines.push('', `EXECUTED (${reportData.executed.length}):`);
      reportData.executed.forEach(p => lines.push(`  - #${p.id} [${p.agent}] ${truncate(p.proposal, 50)}`));
    }

    if (reportData.measured && reportData.measured.length) {
      lines.push('', `MEASURED (${reportData.measured.length}):`);
      reportData.measured.forEach(p => {
        const grade = p.calibration_error != null ? `cal_err=${p.calibration_error.toFixed(2)}` : '';
        lines.push(`  - #${p.id} ${p.outcome || 'no outcome'} ${grade}`);
      });
    }

    return { subject, body: lines.join('\n') };
  },
};

// ── Calendar Renderer ──

export const calendarRenderer = {
  // Renders a committed proposal as a calendar event
  renderCommitment(proposal) {
    const domain = proposal.domain || 'general';
    const agent = proposal.agent || 'unknown';
    const minutes = proposal.estimated_minutes || 30;

    const start = proposal.scheduled_at || new Date().toISOString();
    const end = proposal.scheduled_end || addMinutes(start, minutes);

    const description = [
      `Proposal #${proposal.id}`,
      `Agent: ${agent}`,
      `Domain: ${domain}`,
      '',
      proposal.proposal,
      '',
      proposal.evidence ? `Evidence: ${proposal.evidence}` : '',
    ].filter(Boolean).join('\n');

    return {
      title: `[${domain}] ${truncate(proposal.proposal, 50)}`,
      start,
      end,
      description,
      calendar: 'cathedral-commitments',
    };
  },

  // Renders a review window
  renderReview(reviewData) {
    const start = reviewData.start || new Date().toISOString();
    const end = reviewData.end || addMinutes(start, 15);

    return {
      title: `Cathedral Review: ${reviewData.title || 'Daily Review'}`,
      start,
      end,
      description: reviewData.description || 'Review pending proposals and overdue commitments.',
      calendar: 'cathedral-reviews',
    };
  },
};

// ── Telegram Renderer ──

export const telegramRenderer = {
  // Renders a proposal notification
  renderProposal(proposal) {
    const conf = proposal.confidence != null ? ` (${Math.round(proposal.confidence * 100)}%)` : '';
    const cost = proposal.cost ? `\nCost: ${proposal.cost}` : '';
    const expiry = proposal.expiry ? `\nExpires: ${proposal.expiry}` : '';

    const text = [
      `<b>PROPOSAL #${proposal.id}</b>`,
      `<i>${proposal.agent}</i> / ${proposal.domain}${conf}`,
      '',
      proposal.proposal,
      cost,
      expiry,
      '',
      proposal.evidence ? `<pre>${truncate(proposal.evidence, 200)}</pre>` : '',
    ].filter(Boolean).join('\n');

    return { text, parse_mode: 'HTML' };
  },

  // Renders a brief summary
  renderBrief(briefData) {
    const date = briefData.date || new Date().toISOString().slice(0, 10);
    const s = briefData.sections || {};
    const lines = [`<b>Morning Brief — ${date}</b>`];

    if (s.overdue && s.overdue.length) {
      lines.push('', `<b>OVERDUE (${s.overdue.length})</b>`);
      s.overdue.forEach(p => lines.push(`  #${p.id} ${esc(truncate(p.proposal, 40))}`));
    }

    if (s.approvals_waiting && s.approvals_waiting.length) {
      lines.push('', `<b>WAITING (${s.approvals_waiting.length})</b>`);
      s.approvals_waiting.forEach(p => lines.push(`  #${p.id} [${esc(p.agent)}] ${esc(truncate(p.proposal, 40))}`));
    }

    if (s.deadlines_this_week && s.deadlines_this_week.length) {
      lines.push('', `<b>THIS WEEK (${s.deadlines_this_week.length})</b>`);
      s.deadlines_this_week.forEach(p => lines.push(`  #${p.id} ${esc(truncate(p.proposal, 35))} ${p.scheduled_at ? p.scheduled_at.slice(0, 10) : ''}`));
    }

    if (s.students_at_risk && s.students_at_risk.length) {
      lines.push('', `<b>STUDENTS AT RISK (${s.students_at_risk.length})</b>`);
      s.students_at_risk.forEach(st => lines.push(`  ${esc(st.name)}: ${esc(st.reason || 'flagged')}`));
    }

    if (!lines.some(l => l.startsWith('  '))) {
      lines.push('', 'All clear.');
    }

    lines.push('', `Action: ${briefData.reply_action || 'OPEN APPROVALS'}`);

    return { text: lines.join('\n'), parse_mode: 'HTML' };
  },
};

// ── Dispatcher ──

const renderers = {
  email: emailRenderer,
  calendar: calendarRenderer,
  telegram: telegramRenderer,
};

/**
 * Dispatch a proposal/data to a named surface and render type.
 * @param {object} data - proposal or briefData or reportData
 * @param {string} surfaceName - 'email' | 'calendar' | 'telegram'
 * @param {string} renderType - method name: 'renderDecision', 'renderBrief', 'renderCommitment', etc.
 * @returns {object} rendered output (plain object, no side effects)
 */
export function deliverToSurface(data, surfaceName, renderType) {
  const renderer = renderers[surfaceName];
  if (!renderer) throw new Error(`Unknown surface: ${surfaceName}. Available: ${Object.keys(renderers).join(', ')}`);
  const method = renderer[renderType];
  if (!method) throw new Error(`Unknown render type "${renderType}" on surface "${surfaceName}". Available: ${Object.keys(renderer).join(', ')}`);
  return method.call(renderer, data);
}

// ── Utilities ──

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function addMinutes(iso, mins) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
