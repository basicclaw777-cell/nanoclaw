import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CHANNELS_DIR = new URL('.', import.meta.url).pathname;
const HEALTH_FILE = join(CHANNELS_DIR, 'channels-health.json');

const CHANNELS = {
  'patent-miner': {
    band: 'research',
    phase: 0,
    domains: ['patents', 'tesla', 'schauberger', 'rife', 'moray', 'energy', 'frequency', 'suppression', 'technology'],
    description: 'Patent database excavation for suppressed/overlooked technologies'
  },
  'phd-miner': {
    band: 'research',
    phase: 0,
    domains: ['academic', 'dissertations', 'sports-science', 'motor-learning', 'pedagogy', 'neuroscience', 'physics', 'mathematics', 'geometry', 'coaching-science', 'biomechanics', 'habit-formation', 'cognitive-load', 'deliberate-practice', 'process-design', 'behavioral-science'],
    description: 'PhD dissertations and academic papers for overlooked research'
  },
  'soviet-miner': {
    band: 'research',
    phase: 0,
    domains: ['soviet', 'declassified', 'torsion', 'psychotronics', 'scalar', 'frequency', 'weapons', 'cold-war'],
    description: 'Declassified Soviet-era scientific research'
  },
  'clinical-miner': {
    band: 'research',
    phase: 0,
    domains: ['clinical', 'trials', 'frequency-therapy', 'biofield', 'resonance', 'medicine', 'retracted', 'regulatory'],
    description: 'Clinical trial databases and frequency/resonance therapeutic evidence'
  },
  'gold-extraction': {
    band: 'intelligence',
    phase: 1,
    domains: ['convergence', 'cross-domain', 'ratios', 'geometry', 'patterns', 'suppression', 'behavioral-nudge', 'routine-science'],
    description: 'Convergence detection across all research channels',
    feedsFrom: ['patent-miner', 'phd-miner', 'soviet-miner', 'clinical-miner']
  },
  'buzz-monitor': {
    band: 'intelligence',
    phase: 0,
    domains: ['social', 'news', 'forums', 'signals', 'emerging', 'whistleblower'],
    description: 'Social/news monitoring for Cathedral research domain signals'
  },
  'property-scout': {
    band: 'intelligence',
    phase: 0,
    domains: ['property', 'hong-kong', 'real-estate', 'market', 'investment'],
    description: 'HK property intelligence and opportunity detection'
  },
  'world-pulse': {
    band: 'intelligence',
    phase: 0,
    domains: ['geopolitics', 'markets', 'macro', 'supply-chain', 'economics', 'hong-kong'],
    description: 'Global macro intelligence — markets, geopolitics, supply chains'
  },
  'cathedral-university': {
    band: 'knowledge',
    phase: 2,
    domains: ['education', 'courses', 'knowledge', 'onboarding', 'freshness', 'curriculum', 'routine-science', 'checklist-theory', 'process-design', 'habit-formation', 'deliberate-practice'],
    description: '10 schools, 79 courses — structured learning architecture'
  },
  'vault-graph': {
    band: 'knowledge',
    phase: 1,
    domains: ['knowledge-graph', 'connections', 'vault', 'nuggets', 'clustering', 'orphans'],
    description: 'Knowledge graph — connections between vault nuggets'
  },
  'relay-threads': {
    band: 'knowledge',
    phase: 1,
    domains: ['research', 'relay', 'deep-dive', 'structured', 'conversation', 'rigour'],
    description: 'Deep-dive structured research conversations'
  },
  'reed-studio': {
    band: 'creative',
    phase: 1,
    domains: ['visual', 'content', 'openart', 'style', 'batch', 'design', 'instagram'],
    description: 'Visual content direction — 10 proven styles, batch production'
  },
  'animation-lab': {
    band: 'creative',
    phase: 2,
    domains: ['animation', 'video', 'higgsfield', 'frames', 'motion', 'logan-animation', 'video-capture', 'editing', 'multicam'],
    description: 'Animation + video production pipeline — Higgsfield, frame sheets, multicam, AI editing'
  },
  'logan-stories': {
    band: 'creative',
    phase: 1,
    domains: ['logan', 'eli5', 'explainer', 'stories', 'kids', 'icons', 'stick-figure'],
    description: 'Logan as ELI5 character — simplifies anything, present in every domain'
  },
  'maya-social': {
    band: 'business',
    phase: 0,
    domains: ['social-media', 'competitors', 'trends', 'audience', 'marketing', 'instagram', 'br-brand'],
    description: 'Social intelligence — competitors, trends, BR presence'
  },
  'first-visit-conversion': {
    band: 'business',
    phase: 1,
    domains: ['conversion', 'crm', 'follow-up', 'onboarding', 'retention', 'lapsed', 'boxing-gym', 'beginner', 'coaching', 'sessions', 'billing'],
    description: 'First visit → second visit conversion + session tracking. CRM median=0 finding'
  }
};

const PROJECT_TAGS = {
  'combo-cards': ['pedagogy', 'curriculum', 'boxing-gym', 'motor-learning', 'eli5'],
  'coaching-whiteboard': ['coaching', 'crm', 'boxing-gym', 'sessions', 'retention'],
  'beginner-week': ['onboarding', 'beginner', 'conversion', 'boxing-gym', 'br-brand'],
  'br-website': ['marketing', 'br-brand', 'design', 'content', 'instagram'],
  'br90-grant': ['boxing-gym', 'pedagogy', 'curriculum', 'education', 'hong-kong'],
  'gym-eyes': ['motor-learning', 'coaching', 'visual', 'sports-science', 'neuroscience'],
  'logan-vectors': ['logan', 'stick-figure', 'visual', 'icons', 'design'],
  'crop-circles': ['geometry', 'patterns', 'mathematics', 'convergence', 'cross-domain'],
  'ngp-research': ['geometry', 'physics', 'mathematics', 'convergence', 'tesla'],
  'cosmology': ['physics', 'suppression', 'convergence', 'ancient', 'mathematics'],
  'aether-universe': ['physics', 'frequency', 'energy', 'tesla', 'suppression'],
  'property-search': ['property', 'hong-kong', 'investment', 'market'],
  'trading': ['markets', 'macro', 'economics', 'geopolitics'],
  'cathedral-platform': ['knowledge-graph', 'vault', 'education', 'courses', 'relay'],
  'animation-production': ['animation', 'video', 'logan-animation', 'motion', 'frames'],
  'first-visit': ['conversion', 'crm', 'follow-up', 'onboarding', 'beginner', 'boxing-gym'],
  'kids-programme': ['kids', 'pedagogy', 'boxing-gym', 'eli5', 'logan', 'curriculum'],
  'workshop-bundle': ['pedagogy', 'education', 'content', 'boxing-gym', 'marketing'],
  'gym-studio': ['video-capture', 'multicam', 'editing', 'transcription', 'coaching', 'sessions', 'boxing-gym', 'content', 'coaching-science', 'biomechanics'],
  'class-journal': ['coaching', 'sessions', 'boxing-gym', 'transcription', 'coaching-science'],
  'drill-plans': ['pedagogy', 'curriculum', 'boxing-gym', 'motor-learning', 'coaching', 'eli5', 'coaching-science']
};

function routeProject(projectSlug) {
  const tags = PROJECT_TAGS[projectSlug];
  if (!tags) return { error: `Unknown project: ${projectSlug}`, channels: [] };

  const scores = {};

  for (const [channelSlug, channel] of Object.entries(CHANNELS)) {
    let score = 0;
    const matchedDomains = [];

    for (const tag of tags) {
      if (channel.domains.includes(tag)) {
        score++;
        matchedDomains.push(tag);
      }
    }

    if (score > 0) {
      scores[channelSlug] = {
        score,
        matchedDomains,
        phase: channel.phase,
        band: channel.band,
        description: channel.description
      };
    }
  }

  const sorted = Object.entries(scores)
    .sort((a, b) => b[1].score - a[1].score);

  const primary = sorted.filter(([, v]) => v.score >= 2).map(([k, v]) => ({ channel: k, ...v }));
  const secondary = sorted.filter(([, v]) => v.score === 1).map(([k, v]) => ({ channel: k, ...v }));

  return { project: projectSlug, tags, primary, secondary };
}

function routeTags(tags) {
  const scores = {};

  for (const [channelSlug, channel] of Object.entries(CHANNELS)) {
    let score = 0;
    const matchedDomains = [];

    for (const tag of tags) {
      if (channel.domains.includes(tag)) {
        score++;
        matchedDomains.push(tag);
      }
    }

    if (score > 0) {
      scores[channelSlug] = { score, matchedDomains, phase: channel.phase, band: channel.band };
    }
  }

  return Object.entries(scores)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([k, v]) => ({ channel: k, ...v }));
}

function loadHealth() {
  if (existsSync(HEALTH_FILE)) {
    return JSON.parse(readFileSync(HEALTH_FILE, 'utf8'));
  }
  const health = {};
  for (const [slug, ch] of Object.entries(CHANNELS)) {
    health[slug] = {
      phase: ch.phase,
      lastRun: null,
      lastPlaceholder: null,
      totalRuns: 0,
      totalApproved: 0,
      totalRejected: 0,
      approvalRate: null,
      status: ch.phase === 0 ? 'not-built' : 'idle',
      stale: false
    };
  }
  writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 2));
  return health;
}

function updateHealth(channelSlug, update) {
  const health = loadHealth();
  if (!health[channelSlug]) return { error: `Unknown channel: ${channelSlug}` };

  const ch = health[channelSlug];
  if (update.ran) {
    ch.lastRun = new Date().toISOString();
    ch.totalRuns++;
    ch.status = 'ran';
  }
  if (update.placeholder) {
    ch.lastPlaceholder = new Date().toISOString();
    ch.status = 'placeholder-ready';
  }
  if (update.approved !== undefined) {
    if (update.approved) ch.totalApproved++;
    else ch.totalRejected++;
    ch.approvalRate = ch.totalApproved / (ch.totalApproved + ch.totalRejected);
  }
  if (update.phase !== undefined) {
    ch.phase = update.phase;
  }

  const STALE_DAYS = 7;
  if (ch.lastRun) {
    const daysSince = (Date.now() - new Date(ch.lastRun).getTime()) / (1000 * 60 * 60 * 24);
    ch.stale = daysSince > STALE_DAYS;
  }

  writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 2));
  return ch;
}

function getChannelStatus() {
  const health = loadHealth();
  const summary = {
    total: Object.keys(CHANNELS).length,
    byPhase: { 0: 0, 1: 0, 2: 0, 3: 0 },
    stale: [],
    ready: [],
    notBuilt: []
  };

  for (const [slug, ch] of Object.entries(health)) {
    summary.byPhase[ch.phase]++;
    if (ch.stale) summary.stale.push(slug);
    if (ch.status === 'placeholder-ready') summary.ready.push(slug);
    if (ch.phase === 0) summary.notBuilt.push(slug);
  }

  return { health, summary };
}

export {
  CHANNELS,
  PROJECT_TAGS,
  routeProject,
  routeTags,
  loadHealth,
  updateHealth,
  getChannelStatus
};

const isMain = process.argv[1]?.endsWith('channel-router.js');
if (isMain && process.argv[2] === 'route') {
  const target = process.argv[3];
  if (PROJECT_TAGS[target]) {
    console.log(JSON.stringify(routeProject(target), null, 2));
  } else {
    const tags = target.split(',');
    console.log(JSON.stringify(routeTags(tags), null, 2));
  }
} else if (isMain && process.argv[2] === 'status') {
  console.log(JSON.stringify(getChannelStatus(), null, 2));
} else if (isMain && process.argv[2] === 'init') {
  loadHealth();
  console.log('channels-health.json initialized');
} else if (isMain) {
  console.log('Usage:');
  console.log('  node channel-router.js route <project-slug>');
  console.log('  node channel-router.js route <tag1,tag2,tag3>');
  console.log('  node channel-router.js status');
  console.log('  node channel-router.js init');
  console.log('\nProjects:', Object.keys(PROJECT_TAGS).join(', '));
}
