// panam-review.cjs — synthesize the harvested camp into a summary + review +
// development plan for Coach Paul. Grounded in the framework doc. One DeepSeek call.
const fs = require('fs');
const path = require('path');

const DOC = path.join(process.env.HOME, 'cathedral-vault', '06_Methods', 'pandamericano-methodology-framework.md');
const OUT = path.join(process.env.HOME, 'cathedral-vault', '06_Methods', 'pandamericano-review-and-development.md');
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

const envPath = path.join(process.env.HOME, 'nanoclaw', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/); if (m && !process.env[m[1].trim()]) {
    let v = m[2].trim(); if ((v[0]==='"'&&v.slice(-1)==='"')||(v[0]==="'"&&v.slice(-1)==="'")) v=v.slice(1,-1);
    process.env[m[1].trim()] = v;
  }
}
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

async function ask(system, prompt, maxTokens) {
  if (DEEPSEEK_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.4, max_tokens: maxTokens })
      });
      const d = await res.json(); if (d.error) throw new Error(d.error.message);
      return d.choices?.[0]?.message?.content || '';
    } catch (e) { console.log('deepseek fail → local: ' + e.message); }
  }
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gemma3:4b', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], options: { temperature: 0.4, num_predict: maxTokens } })
  });
  const d = await res.json(); return d.message?.content || '';
}

(async () => {
  const framework = fs.readFileSync(DOC, 'utf8');
  const system = `You are an elite boxing coach and pedagogy analyst writing for Coach Paul (Basic Reflex, Hong Kong; Cuban-defensive style; builds transferable frameworks — boxing as a portal to wider mastery). You are reviewing a Cuban Pandamericano training camp Paul personally attended, harvested from the coaches' Spanish audio into the framework below. Be specific, grounded in the material, and genuinely useful — name days/concepts from the framework. No filler.`;
  const prompt = `Here is the harvested framework from the camp:\n\n${framework.slice(0, 12000)}\n\nWrite a document with three parts:

## 1. SUMMARY — What They Were Teaching You
The core methodology and the arc across the days. What is the spine of the Cuban method as taught here — the priorities, the sequence, the "why". Name the recurring principles (defense-first, single efficient movement, la guardia, equilibrio, the long-game "tres años" patience, the 'portal' idea, etc.).

## 2. REVIEW — Assessment of the Coaching
The pedagogy: how they teach (repetition, cueing, isolation of one element, environment). Strengths and what makes it distinctive vs. typical Western boxing instruction. Any gaps or things left implicit. Be an honest critic, not a flatterer.

## 3. DEVELOPMENT — How to Develop These Concepts
Concrete next steps for Paul: how to extend each core concept into drills, how to fold it into Basic Reflex's 10-block curriculum and Logan's teaching, and where the principles transfer beyond boxing (the portal). Make it actionable — specific drills, specific integrations.

Ground everything in the framework. Cite days where you can.`;
  console.log('synthesizing review...');
  const review = await ask(system, prompt, 4000);
  const header = `---\ntitle: "Pandamericano — Summary, Review & Development Plan"\ndomain: boxing\ntype: review\nsource: "Synthesis of pandamericano-methodology-framework.md (88GB Cuban camp harvest)"\ndate: 2026-06-15\ntags: [boxing, cuban, pandamericano, review, development, curriculum, logan, basic-reflex]\n---\n\n> Synthesis of what the Cuban Pandamericano coaches were teaching Paul, with a development plan. Grounded in the harvested framework. Companion: [[pandamericano-methodology-framework]].\n\n`;
  fs.writeFileSync(OUT, header + review);
  console.log('WROTE ' + OUT + ' (' + review.length + ' chars)');
})();
