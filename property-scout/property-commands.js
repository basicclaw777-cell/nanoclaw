import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASTE_PATH = path.join(__dirname, 'taste-memory.json');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  } catch { return null; }
}

function readTaste() {
  try {
    return JSON.parse(fs.readFileSync(TASTE_PATH, 'utf8'));
  } catch { return { interactions: [], last_displayed: { listings: [], golden: [], timestamp: null } }; }
}

function writeTaste(taste) {
  fs.writeFileSync(TASTE_PATH, JSON.stringify(taste, null, 2));
}

function saveDisplayed(items, type) {
  const taste = readTaste();
  taste.last_displayed[type] = items.map((item, i) => ({
    index: i + 1,
    id: item.id || item.source_url || item.address,
    address: item.address || item.building,
    district: item.district || item.golden_zone,
    sqft: item.sqft,
    price_per_sqft: item.price_per_sqft,
    lane: item.lane || null,
    type: type
  }));
  taste.last_displayed.timestamp = new Date().toISOString();
  writeTaste(taste);
}

function findDisplayedItem(query) {
  const taste = readTaste();
  const all = [...(taste.last_displayed.listings || []), ...(taste.last_displayed.golden || [])];
  const num = parseInt(query);
  if (!isNaN(num)) {
    return all.find(item => item.index === num);
  }
  const q = query.toLowerCase();
  return all.find(item =>
    (item.address || '').toLowerCase().includes(q) ||
    (item.district || '').toLowerCase().includes(q)
  );
}

function tasteSignalCount(listingId) {
  const taste = readTaste();
  const signals = taste.interactions.filter(i => i.listing_id === listingId);
  return { likes: signals.filter(s => s.signal === 'like').length, passes: signals.filter(s => s.signal === 'pass').length };
}

function findTasteMatches(listing) {
  const taste = readTaste();
  const liked = taste.interactions.filter(i => i.signal === 'like');
  if (!liked.length) return [];

  const matches = [];
  for (const like of liked) {
    if (like.snapshot.district && listing.district &&
        like.snapshot.district.toLowerCase() === listing.district.toLowerCase()) {
      matches.push(`same district as "${like.snapshot.address}" (${like.date})`);
    }
    if (like.snapshot.sqft && listing.sqft) {
      const diff = Math.abs(like.snapshot.sqft - listing.sqft) / like.snapshot.sqft;
      if (diff < 0.2) {
        matches.push(`similar size to "${like.snapshot.address}" (${like.snapshot.sqft}sqft)`);
      }
    }
  }
  return [...new Set(matches)].slice(0, 2);
}

function buildMarketPulse() {
  const pulse = readJSON('global-pulse.json');
  if (!pulse?.markets) return 'Global pulse data not available.';

  let msg = `*Property Intelligence — ${pulse.scan_date || 'Latest'}*\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  const markets = pulse.markets;
  const order = ['hk', 'thailand', 'uk', 'portugal', 'japan', 'dubai', 'us', 'australia', 'singapore'];

  for (const key of order) {
    const m = markets[key];
    if (!m) continue;
    const yoyIcon = m.price_yoy_pct >= 0 ? '▲' : '▼';
    const yoyAbs = Math.abs(m.price_yoy_pct || 0);
    msg += `${m.flag || ''} *${m.name}*\n`;
    msg += `  Price: ${yoyIcon} ${yoyAbs}% YoY | Yield: ${m.rental_yield_pct || '?'}%`;
    if (m.mortgage_rate_pct) msg += ` | Rate: ${m.mortgage_rate_pct}%`;
    msg += '\n';
    if (m.contrarian_signal && m.contrarian_signal !== 'Neutral — no divergence detected') {
      msg += `  _${m.contrarian_signal}_\n`;
    }
    msg += '\n';
  }

  return msg;
}

function buildHKDeep() {
  const pulse = readJSON('global-pulse.json');
  const listings = readJSON('listings.json');
  const golden = readJSON('golden-zone-units.json');

  let msg = `*HK Property Deep View*\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  if (pulse?.markets?.hk) {
    const hk = pulse.markets.hk;
    msg += `*Market State*\n`;
    msg += `Price Index: ${hk.price_index} (${hk.price_yoy_pct >= 0 ? '+' : ''}${hk.price_yoy_pct}% YoY)\n`;
    msg += `Rental Yield: ${hk.rental_yield_pct}%\n`;
    msg += `Mortgage Rate: ${hk.mortgage_rate_pct}%\n`;
    msg += `Yield-Rate Spread: ${(hk.rental_yield_pct - hk.mortgage_rate_pct).toFixed(1)}pp\n`;
    msg += `Transactions: ${hk.transactions_mom_pct >= 0 ? '+' : ''}${hk.transactions_mom_pct}% MoM\n`;
    msg += `Sentiment: ${hk.sentiment > 0 ? 'Positive' : hk.sentiment < -0.3 ? 'Negative' : 'Neutral'} (${hk.sentiment})\n\n`;

    if (hk.contrarian_alerts?.length) {
      msg += `*Signals*\n`;
      for (const alert of hk.contrarian_alerts) {
        msg += `• ${alert}\n`;
      }
      msg += '\n';
    }
  }

  if (golden?.length) {
    saveDisplayed(golden, 'golden');
    const top5 = golden.slice(0, 5);
    msg += `*Top Golden Zone Units (${golden.length} tracked)*\n`;
    top5.forEach((u, i) => {
      const taste = findTasteMatches(u);
      const tasteTag = taste.length ? ` 💛` : '';
      msg += `${i + 1}. ${u.address} — $${(u.price / 1000000).toFixed(2)}M ($${u.price_per_sqft}/sqft)${tasteTag}\n`;
      if (taste.length) msg += `   _${taste[0]}_\n`;
    });
    msg += '\n';
  }

  const hkListings = listings?.filter(l => l.lane !== 'thai_condo' && l.lane !== 'thai_villa' && l.lane !== 'thai_house');
  if (hkListings?.length) {
    msg += `*HK Watchlist (${hkListings.length} active)*\n`;
    const hot = hkListings.filter(l => l.status === 'hot' || l.status === 'watch').slice(0, 5);
    hot.forEach((l, i) => {
      const tag = l.status === 'hot' ? '🔥' : '👀';
      const taste = findTasteMatches(l);
      const tasteTag = taste.length ? ' 💛' : '';
      msg += `${tag} ${i + 1}. ${l.address || l.building || 'Unknown'} — $${l.price_per_sqft}/sqft${tasteTag}\n`;
    });
  }

  msg += `\n_/like [n] · /pass [n] · /note [n] [text]_`;
  return msg;
}

function buildOpportunities() {
  const listings = readJSON('listings.json');
  const golden = readJSON('golden-zone-units.json');
  const pulse = readJSON('global-pulse.json');

  let msg = `*Opportunities Flagged*\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  if (pulse?.markets) {
    const yields = Object.entries(pulse.markets)
      .filter(([, m]) => m.rental_yield_pct)
      .map(([k, m]) => ({ key: k, name: m.name, flag: m.flag, yield: m.rental_yield_pct, yoy: m.price_yoy_pct }))
      .sort((a, b) => b.yield - a.yield);

    msg += `*Yield Ranking*\n`;
    for (const y of yields.slice(0, 6)) {
      msg += `${y.flag || ''} ${y.name}: ${y.yield}% yield (price ${y.yoy >= 0 ? '+' : ''}${y.yoy}% YoY)\n`;
    }
    msg += '\n';
  }

  const hot = listings?.filter(l => l.status === 'hot') || [];
  if (hot.length) {
    msg += `*Hot Listings (${hot.length})*\n`;
    hot.forEach((l, i) => {
      const taste = findTasteMatches(l);
      const tasteTag = taste.length ? ' 💛' : '';
      msg += `🔥 ${l.address || l.building} — $${l.price_per_sqft}/sqft (${l.sqft}sqft)${tasteTag}\n`;
      if (taste.length) msg += `   _${taste[0]}_\n`;
      if (l.source) msg += `   Source: ${l.source}\n`;
    });
    msg += '\n';
  }

  if (pulse?.markets) {
    const alerts = Object.entries(pulse.markets)
      .filter(([, m]) => m.contrarian_alerts?.length)
      .flatMap(([, m]) => m.contrarian_alerts.map(a => `${m.flag} ${a}`));

    if (alerts.length) {
      msg += `*Contrarian Signals*\n`;
      for (const a of alerts) {
        msg += `• ${a}\n`;
      }
    }
  }

  return msg;
}

function buildFullReport() {
  return buildMarketPulse() + `${'─'.repeat(28)}\n\n` + buildHKDeep() + `${'─'.repeat(28)}\n\n` + buildOpportunities();
}

function buildTasteSummary() {
  const taste = readTaste();
  const interactions = taste.interactions;
  if (!interactions.length) return '*No taste signals yet.*\n\nUse /like [n], /pass [n], or /note [n] [text] after viewing listings.';

  const liked = interactions.filter(i => i.signal === 'like');
  const passed = interactions.filter(i => i.signal === 'pass');
  const noted = interactions.filter(i => i.signal === 'note');

  let msg = `*Property Taste Memory*\n`;
  msg += `${'─'.repeat(28)}\n`;
  msg += `${interactions.length} signals (${liked.length} liked, ${passed.length} passed, ${noted.length} noted)\n\n`;

  if (liked.length) {
    msg += `*Liked*\n`;
    for (const l of liked.slice(-10)) {
      msg += `💛 ${l.snapshot.address} ($${l.snapshot.price_per_sqft}/sqft, ${l.snapshot.sqft}sqft)\n`;
      if (l.note) msg += `   "${l.note}"\n`;
      msg += `   _${l.date}_\n`;
    }
    msg += '\n';

    const districts = {};
    const sqfts = [];
    const ppfs = [];
    for (const l of liked) {
      if (l.snapshot.district) districts[l.snapshot.district] = (districts[l.snapshot.district] || 0) + 1;
      if (l.snapshot.sqft) sqfts.push(l.snapshot.sqft);
      if (l.snapshot.price_per_sqft) ppfs.push(l.snapshot.price_per_sqft);
    }
    if (Object.keys(districts).length) {
      const sorted = Object.entries(districts).sort((a, b) => b[1] - a[1]);
      msg += `*Your pattern (from your signals, not AI opinion):*\n`;
      msg += `Districts: ${sorted.map(([d, c]) => `${d} (${c}x)`).join(', ')}\n`;
      if (sqfts.length) msg += `Size range: ${Math.min(...sqfts)}–${Math.max(...sqfts)} sqft\n`;
      if (ppfs.length) msg += `Price range: $${Math.min(...ppfs)}–$${Math.max(...ppfs)}/sqft\n`;
      msg += '\n';
    }
  }

  if (passed.length) {
    msg += `*Passed*\n`;
    for (const p of passed.slice(-5)) {
      msg += `⛔ ${p.snapshot.address}`;
      if (p.note) msg += ` — "${p.note}"`;
      msg += '\n';
    }
    msg += '\n';
  }

  if (noted.length) {
    msg += `*Notes*\n`;
    for (const n of noted.slice(-5)) {
      msg += `📝 ${n.snapshot.address}: "${n.note}" _(${n.date})_\n`;
    }
  }

  return msg;
}

export function registerPropertyCommands(bot) {
  bot.onText(/^\/property(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildMarketPulse(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[property]', e.message); }
  });

  bot.onText(/^\/hkmarket(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildHKDeep(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[hkmarket]', e.message); }
  });

  bot.onText(/^\/opportunities(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildOpportunities(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[opportunities]', e.message); }
  });

  bot.onText(/^\/propertyreport(?:@\w+)?\s*$/i, async (msg) => {
    try {
      const report = buildFullReport();
      const chunks = [];
      let current = '';
      for (const line of report.split('\n')) {
        if ((current + '\n' + line).length > 4000) {
          chunks.push(current);
          current = line;
        } else {
          current += (current ? '\n' : '') + line;
        }
      }
      if (current) chunks.push(current);
      for (const chunk of chunks) {
        await bot.sendMessage(msg.chat.id, chunk, { parse_mode: 'Markdown' });
      }
    } catch (e) { console.error('[propertyreport]', e.message); }
  });

  bot.onText(/^\/like(?:@\w+)?\s+(.+)/i, async (msg, match) => {
    try {
      const parts = match[1].trim().split(/\s+/);
      const query = parts[0];
      const note = parts.slice(1).join(' ') || null;
      const item = findDisplayedItem(query);
      if (!item) {
        await bot.sendMessage(msg.chat.id, 'No match. Run /hkmarket first, then /like [number].', { parse_mode: 'Markdown' });
        return;
      }
      const taste = readTaste();
      taste.interactions.push({
        listing_id: item.id,
        date: new Date().toISOString().split('T')[0],
        signal: 'like',
        note,
        snapshot: { address: item.address, district: item.district, sqft: item.sqft, price_per_sqft: item.price_per_sqft, lane: item.lane }
      });
      writeTaste(taste);
      let reply = `💛 Liked: ${item.address}`;
      if (note) reply += `\nNote: "${note}"`;
      reply += `\n_${taste.interactions.filter(i => i.signal === 'like').length} total likes_`;
      await bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
    } catch (e) { console.error('[like]', e.message); }
  });

  bot.onText(/^\/pass(?:@\w+)?\s+(.+)/i, async (msg, match) => {
    try {
      const parts = match[1].trim().split(/\s+/);
      const query = parts[0];
      const note = parts.slice(1).join(' ') || null;
      const item = findDisplayedItem(query);
      if (!item) {
        await bot.sendMessage(msg.chat.id, 'No match. Run /hkmarket first, then /pass [number].', { parse_mode: 'Markdown' });
        return;
      }
      const taste = readTaste();
      taste.interactions.push({
        listing_id: item.id,
        date: new Date().toISOString().split('T')[0],
        signal: 'pass',
        note,
        snapshot: { address: item.address, district: item.district, sqft: item.sqft, price_per_sqft: item.price_per_sqft, lane: item.lane }
      });
      writeTaste(taste);
      let reply = `⛔ Passed: ${item.address}`;
      if (note) reply += `\nReason: "${note}"`;
      await bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
    } catch (e) { console.error('[pass]', e.message); }
  });

  bot.onText(/^\/note(?:@\w+)?\s+(\S+)\s+(.+)/i, async (msg, match) => {
    try {
      const query = match[1].trim();
      const note = match[2].trim();
      const item = findDisplayedItem(query);
      if (!item) {
        await bot.sendMessage(msg.chat.id, 'No match. Run /hkmarket first, then /note [number] [text].', { parse_mode: 'Markdown' });
        return;
      }
      const taste = readTaste();
      taste.interactions.push({
        listing_id: item.id,
        date: new Date().toISOString().split('T')[0],
        signal: 'note',
        note,
        snapshot: { address: item.address, district: item.district, sqft: item.sqft, price_per_sqft: item.price_per_sqft, lane: item.lane }
      });
      writeTaste(taste);
      await bot.sendMessage(msg.chat.id, `📝 Noted on ${item.address}: "${note}"`, { parse_mode: 'Markdown' });
    } catch (e) { console.error('[note]', e.message); }
  });

  bot.onText(/^\/taste(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildTasteSummary(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[taste]', e.message); }
  });
}
