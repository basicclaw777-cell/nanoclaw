// Cathy's view of Paul's Google Calendar. READ-ONLY: it fetches the calendar's private iCal address and writes
// a plain file Cathy can Read. Nothing is ever written back to Google; Cathy can't change the calendar.
//
// Setup (Paul does this himself; the address is a secret, Forge never handles it):
//   Google Calendar on desktop → Settings → your calendar → "Secret address in iCal format" → copy.
//   ! echo 'PASTE-ADDRESS-HERE' > ~/Cathedral/cathy/gcal.url && chmod 600 ~/Cathedral/cathy/gcal.url
//   More calendars: one address per line.
//
// Output: ~/Cathedral/cathy/calendar.md (next 14 days, HKT, for Cathy) + calendar.json.
// Runs inside cath-bridge every 15 minutes, and right before Cathy answers if the copy is >10 minutes old.
'use strict';
const fs = require('fs');
const path = require('path');
const ical = require('node-ical');

const DIR = path.join(process.env.HOME, 'Cathedral', 'cathy');
const URL_FILE = path.join(DIR, 'gcal.url');
const OUT_MD = path.join(DIR, 'calendar.md');
const OUT_JSON = path.join(DIR, 'calendar.json');
const DAYS = 14, BACK_HOURS = 12;
const TZ = 'Asia/Hong_Kong';

const hkt = (d, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(d);
const dayKey = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ });
const clean = (s) => String((s && s.val) || s || '').replace(/\s+/g, ' ').trim();

function urls() {
  try { return fs.readFileSync(URL_FILE, 'utf8').split('\n').map((s) => s.trim()).filter((s) => /^https:\/\/calendar\.google\.com\/calendar\/ical\//.test(s)); }
  catch { return []; }
}

// One calendar's events between from and to, with repeating events expanded.
function expand(data, from, to, calName) {
  const out = [];
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    const allDay = ev.datetype === 'date' || ev.start.dateOnly === true;
    const dur = (ev.end ? new Date(ev.end) - new Date(ev.start) : (allDay ? 864e5 : 36e5));
    const add = (start, src) => {
      const s = new Date(start), e = new Date(s.getTime() + dur);
      if (e < from || s > to) return;
      if (String(src.status || '').toUpperCase() === 'CANCELLED') return;
      out.push({ start: s.toISOString(), end: e.toISOString(), allDay, title: clean(src.summary) || '(no title)', location: clean(src.location), calendar: calName });
    };
    if (!ev.rrule) { add(ev.start, ev); continue; }
    const ex = new Set(Object.values(ev.exdate || {}).map((d) => new Date(d).toISOString()));
    const overrides = ev.recurrences || {};
    for (const d of ev.rrule.between(new Date(from.getTime() - dur), to, true)) {
      // rrule hands back "floating" times; node-ical stores tz-correct start, so keep the original clock time.
      const occ = new Date(d);
      const key = occ.toISOString();
      if (ex.has(key)) continue;
      const ov = overrides[key.slice(0, 10)] || overrides[key];
      if (ov) { add(ov.start, ov); continue; }
      add(occ, ev);
    }
  }
  return out;
}

let last = 0, running = null;
async function sync() {
  if (running) return running;
  running = (async () => {
    const list = urls();
    const now = new Date(), from = new Date(now - BACK_HOURS * 36e5), to = new Date(now.getTime() + DAYS * 864e5);
    if (!list.length) {
      fs.writeFileSync(OUT_MD, '# Paul\'s calendar\n\nNot connected yet. Paul pastes his Google Calendar\'s secret iCal address into ~/Cathedral/cathy/gcal.url (see the top of ~/nanoclaw/cathy-phone/gcal.cjs). Until then, ask Paul about his day.\n');
      return { ok: false, reason: 'not connected' };
    }
    const events = [], errors = [];
    for (const [i, u] of list.entries()) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = ical.sync.parseICS(await res.text());
        const name = clean(Object.values(data).find((x) => x && x.type === 'VCALENDAR')?.['WR-CALNAME']) || `calendar ${i + 1}`;
        events.push(...expand(data, from, to, name));
      } catch (e) { errors.push(`calendar ${i + 1}: ${e.message}`); } // never log the address itself
    }
    events.sort((a, b) => a.start.localeCompare(b.start));
    const md = [`# Paul's calendar (Google Calendar, read-only copy)`, '',
      `Updated ${hkt(now, { dateStyle: 'medium', timeStyle: 'short' })} HKT. Next ${DAYS} days. Classes live in PunchPass, which isn't connected yet, so this may not show every class.`, ''];
    if (errors.length) md.push(`Couldn't read: ${errors.join('; ')}`, '');
    let day = '';
    for (const e of events) {
      const k = dayKey(e.start);
      if (k !== day) { day = k; md.push('', `## ${hkt(new Date(e.start), { weekday: 'long', day: 'numeric', month: 'short' })}`); }
      const when = e.allDay ? 'all day' : `${hkt(new Date(e.start), { timeStyle: 'short' })}–${hkt(new Date(e.end), { timeStyle: 'short' })}`;
      md.push(`- ${when} · ${e.title}${e.location ? ` (${e.location})` : ''}${list.length > 1 ? ` [${e.calendar}]` : ''}`);
    }
    if (!events.length) md.push('Nothing on the calendar in the next two weeks.');
    fs.writeFileSync(OUT_MD, md.join('\n') + '\n');
    fs.writeFileSync(OUT_JSON, JSON.stringify({ updated: now.toISOString(), errors, events }, null, 2));
    last = Date.now();
    return { ok: !errors.length, events: events.length, errors };
  })().finally(() => { running = null; });
  return running;
}

const fresh = () => (Date.now() - last < 10 * 60e3 ? Promise.resolve() : sync().catch(() => {}));
function start() { sync().catch(() => {}); setInterval(() => sync().catch(() => {}), 15 * 60e3).unref(); }

module.exports = { sync, fresh, start, OUT_MD };
if (require.main === module) sync().then((r) => console.log(r)).catch((e) => { console.error(e.message); process.exit(1); });
