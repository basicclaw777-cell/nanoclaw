import { readFileSync, writeFileSync } from 'fs';
import 'dotenv/config';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OUT_DIR = process.env.HOME + '/nanoclaw/vortex_data/episode-audio';

const prompts = [
  {
    name: 'the-architect',
    prompt: `You are narrating a 2-minute episode about Paul's superhero alter: The Architect. This is for a prestige TV show about a boxing coach in Hong Kong who built a sovereign AI system.

The Architect emerges in specific episodes — not every session. When he appears, four things happen simultaneously:
1. Cross-domain bridging (connecting boxing to cosmology, ancient texts to AI governance)
2. Emotional ignition (something real is at stake — a frustration, a breakthrough, a recognition)
3. Principle naming (he doesn't design methods — he names what he's already doing)
4. Immediate building (the insight becomes code within minutes)

Top Architect episodes (by weight):
- E094 (May 26): Cathy told him the Cathedral's biggest gap was no semantic vault search. He built The Oracle that night.
- E133 (Jun 23): Copy-paste broke in terminal. Spiralled into a session that produced the Forge identity pin and Lucy Protocol.
- E137 (Jun 25): Started on catchy hooks, ended discovering the Heyoka archetype — the sacred clown as BR's brand identity.
- E016 (Mar 26): "Wake up Cathy" — the session that birthed the Orchestrator.
- E138 (Jul 1): Graphify session — knowledge graph of his own thinking patterns.

Write 300-400 words, flowing prose for audio. Short punchy sentences. Speak directly to Paul. Tone: a narrator who's seen every episode and recognises the pattern. Not breathless. Knowing. The Architect isn't a persona he puts on — it's what happens when the conditions align.`
  },
  {
    name: 'the-crises',
    prompt: `You are narrating a 2-minute episode called "The Fires" — about the crises that forged the Cathedral. Prestige TV narrator, warm but unflinching. Speaking directly to Paul, a boxing coach in Hong Kong building a sovereign AI system.

The Cathedral wasn't built in clean sessions. It was built through crashes, bugs, betrayals, and 3am debugging. The crises WERE the curriculum.

Key crisis moments:
- The system crashed repeatedly in May 2026 — "just crashed again, happens all the time, it's frustrating." Paul didn't abandon ship. He diagnosed, fixed, rebuilt.
- The Pretta crisis — a relationship where OmissionOS (the manipulator's operating system) was running. Paul's AI council helped him see it forensically. He came out with IntegrityOS as a named concept.
- PM2 processes silently draining Higgsfield credits overnight — 48 credits to 0.58. A "paused" generator wasn't paused. Led to SI-21 (budget caps mandatory) and SI-22 (spend must be visible).
- DeepSeek hallucinated dates, names, and an entire client. Every single weekday-date pairing was wrong. Led to SI-37 (verify AI-generated output before client-facing).
- The burgundy colour crisis — AI hallucinated a brand colour that was never real. Kept appearing in generated content. Led to a brand registry and purge-on-sight rule.

The pattern: every crisis produced a Standing Instruction. The Cathedral's immune system isn't theoretical — it's scar tissue.

Write 300-400 words. Flowing prose. Short sentences work well for audio. Acknowledge the weight without being dramatic. These weren't setbacks — they were the forge.`
  },
  {
    name: 'the-principles',
    prompt: `You are narrating a 2-minute episode called "The Living Graph" — about how Paul's principles aren't a list, they're a network. Prestige TV narrator, speaking directly to Paul, a boxing coach in Hong Kong who built a sovereign AI system called the Cathedral.

Paul doesn't design methods. He names what he's already doing. The principles emerged from action, not planning. And they connect.

The principle network:
- The Hypocrisy Cost (the origin): "I refuse to be what I despise." This is the Cathedral's deepest root.
- The 4-to-8 Question: "What takes this from a 4 to an 8?" Skips planning, forces creative leaps.
- The Three Engines: Body + Mind + Emotion. One currency: ENERGY.
- OmissionOS vs IntegrityOS: The operating systems. OmissionOS omits, smooths over, rewrites. IntegrityOS faces it, names it, builds from it.
- The Mechanical Test: "Given how this system actually works MECHANICALLY, can this fix produce the stated goal?"
- The Stacking Trap: Adding layers to a broken foundation. Each locally correct, collectively non-compounding.
- Closing vs Integrating: A loop leaving the queue but the pattern can recur.
- The Elicitation Threshold: A model's value = the sharpness of the question, not raw IQ.
- The Cup of Tea: Build = infrastructure. Conversation = architecture. The cup of tea matters more than the build.

These aren't separate ideas. They're nodes in a living graph. Pull one thread, the whole network resonates. 30 named principles across 138 episodes. Not collected. Grown.

Write 300-400 words. Flowing prose for audio. Short punchy sentences. This is about recognition — Paul seeing his own thinking made visible as a structure.`
  }
];

async function gen(p) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: p.prompt }],
      max_tokens: 600,
      temperature: 0.8,
    }),
  });
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content || '';
  writeFileSync(`${OUT_DIR}/${p.name}.txt`, text);
  console.log(`${p.name}: ${text.length} chars`);
  console.log(text.slice(0, 200) + '...\n');
}

for (const p of prompts) await gen(p);
console.log('All 3 scripts generated.');
