/**
 * Documentary Director — interview + scene generation for Coach Paul at Basic Reflex
 * ESM module, zero external dependencies.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME;

// ─── Data Loading ────────────────────────────────────────────────────────────

const GAP_MARKERS = [
  '[STORY NEEDED',
  '[DRILL DETAILS NEEDED',
  '[LIFE APPLICATION NEEDED',
  '[EXAMPLE NEEDED',
  '[COACHING STORIES NEEDED',
  '[FRAMEWORK DETAILS NEEDED',
  '[SYSTEM DETAILS NEEDED'
];

let handbookGaps = [];
let cards = [];
let coachingRules = [];
let contentGaps = [];

function loadHandbook() {
  try {
    const text = readFileSync(resolve(HOME, 'basic-reflex/docs/masters-handbook.md'), 'utf8');
    const lines = text.split('\n');
    let currentChapter = 'Unknown';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Track chapter headings
      if (line.startsWith('# ') || line.startsWith('## ')) {
        currentChapter = line.replace(/^#+\s*/, '').trim();
      }
      // Check for gap markers
      for (const marker of GAP_MARKERS) {
        if (line.includes(marker)) {
          const markerMatch = line.match(/\[([^\]]+)\]/);
          handbookGaps.push({
            marker: markerMatch ? markerMatch[0] : marker + ']',
            chapter: currentChapter,
            lineNumber: i + 1,
            context: lines.slice(Math.max(0, i - 3), i + 4).join('\n'),
            status: 'unfilled',
            questionId: null
          });
        }
      }
    }
  } catch (e) {
    handbookGaps = [];
  }
}

function loadCards() {
  try {
    const raw = readFileSync(resolve(HOME, 'basic-reflex/33-card-system.json'), 'utf8');
    const data = JSON.parse(raw);
    cards = Array.isArray(data) ? data : (data.cards || []);
  } catch (e) {
    cards = [];
  }
}

function loadCoachingRules() {
  try {
    const raw = readFileSync(resolve(HOME, 'nanoclaw/coaching-rules.json'), 'utf8');
    coachingRules = JSON.parse(raw);
  } catch (e) {
    coachingRules = [];
  }
}

// Load on import
loadHandbook();
loadCards();
loadCoachingRules();

// ─── Edge Question Bank ──────────────────────────────────────────────────────

const EDGE_QUESTIONS = [
  "What's the one thing you teach that you're not 100% sure about?",
  "Which student made you realize you were wrong about something?",
  "What would your younger self think of how you coach now?",
  "What's the biggest gap between what you preach and what you practice?",
  "If someone watched you coach for a week, what habit would they notice that you don't?",
  "What's the thing about boxing that still scares you?",
  "Which coach influenced you that you've never publicly credited?",
  "What's the hardest truth about running a gym that nobody talks about?",
  "If you could only teach ONE thing for the rest of your career, what would it be — and why isn't it what you'd expect?",
  "What do your best students have in common that has nothing to do with talent?",
  "When was the last time a student taught YOU something?",
  "What's the drill you removed from your curriculum, and why?",
  "What would your competitors say is your weakness?",
  "Is boxing actually the point, or is it a vehicle for something else?",
  "What's the thing you tell beginners that you wish someone would tell YOU?",
  "Which of your principles would you abandon first if evidence proved it wrong?",
  "What's the moment you're most proud of that nobody saw?",
  "If Basic Reflex closed tomorrow, what would survive — what's actually yours vs what's the gym's?",
  "What's the uncomfortable truth about AI helping you coach?",
  "Who did you fail as a coach, and what did it cost you?"
];

// ─── Camera Options ──────────────────────────────────────────────────────────

const CAMERAS = [
  'CAM 1 (wide, full gym)',
  'CAM 2 (ring side)',
  'CAM 3 (bag line)',
  'CAM 4 (mirror wall)',
  'CAM 5 (close-up, face)',
  'CAM 6 (detail, head height)'
];

// ─── Utility ─────────────────────────────────────────────────────────────────

let questionCounter = 0;
let sceneCounter = 0;

// Session question registry — tracks which question IDs map to which handbook gaps
const questionRegistry = new Map();

function nextQid() {
  questionCounter++;
  return `q-${String(questionCounter).padStart(3, '0')}`;
}

function nextSceneId() {
  sceneCounter++;
  return `scene-${String(sceneCounter).padStart(3, '0')}`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function pickCamera(context) {
  // Context-sensitive camera selection
  if (context === 'philosophical' || context === 'reflection') return 'CAM 5 (close-up, face)';
  if (context === 'drill' || context === 'technique') return 'CAM 6 (detail, head height)';
  if (context === 'class-wide') return 'CAM 1 (wide, full gym)';
  if (context === 'ring') return 'CAM 2 (ring side)';
  if (context === 'bag') return 'CAM 3 (bag line)';
  return pick(CAMERAS);
}

function estimateDuration(mode) {
  if (mode === 'quick') return '30-60 seconds';
  if (mode === 'edge') return '90-120 seconds';
  return '90 seconds';
}

function inferTags(text) {
  const tagMap = {
    defense: /defen[sc]e|block|parry|slip|catch/i,
    offense: /attack|punch|jab|cross|hook|uppercut|combo/i,
    footwork: /foot|step|pivot|angle|movement/i,
    mindset: /mind|mental|fear|confidence|pressure/i,
    teaching: /teach|coach|explain|student|learn/i,
    beginner: /beginner|new|first|start|fundamental/i,
    advanced: /advanced|spar|fight|competition/i,
    philosophy: /philosophy|why|purpose|meaning|life/i,
    business: /business|gym|money|client|retention/i,
    energy: /energy|fatigue|rest|recovery|intensity/i
  };
  const tags = [];
  for (const [tag, re] of Object.entries(tagMap)) {
    if (re.test(text)) tags.push(tag);
  }
  return tags.length > 0 ? tags : ['general'];
}

function inferContentPotential(source, tags) {
  const potentials = [];
  if (tags.some(t => ['beginner', 'teaching', 'drill'].includes(t))) potentials.push('instagram-reel');
  if (source === 'handbook-gap') potentials.push(`handbook-${tags[0] || 'general'}`);
  if (tags.includes('philosophy') || tags.includes('mindset')) potentials.push('long-form-content');
  if (tags.includes('teaching')) potentials.push('teaching-series');
  potentials.push('coaching-archive');
  return [...new Set(potentials)];
}

// ─── Question Generators ─────────────────────────────────────────────────────

function generateHandbookQuestion(gap) {
  const markerType = gap.marker.replace(/\[|\]/g, '').split(':')[0].trim();
  let question, followUp;

  switch (markerType) {
    case 'STORY NEEDED':
      question = `Tell me about a time when this actually happened in your gym — the ${gap.chapter.toLowerCase()} principle in action. What did the student do, and what did you see?`;
      followUp = "What made that moment stick with you, rather than all the other sessions?";
      break;
    case 'DRILL DETAILS NEEDED':
      question = `Walk me through exactly how you run this drill. Pretend I'm a new instructor watching for the first time — what would I see, step by step?`;
      followUp = "What's the common mistake people make in the first 30 seconds of this drill?";
      break;
    case 'LIFE APPLICATION NEEDED':
      question = `When a student takes this outside the gym, where does it show up in their life? Give me a real example.`;
      followUp = "Has anyone ever come back and told you it changed something specific?";
      break;
    case 'EXAMPLE NEEDED':
      question = `I need a concrete example of this in practice. Not the theory — the messy reality of it happening with a real person.`;
      followUp = "Did it work the way you expected, or did something surprise you?";
      break;
    case 'COACHING STORIES NEEDED':
      question = `What's the coaching story that captures this idea better than any explanation could?`;
      followUp = "If that student walked in tomorrow, would you coach them differently now?";
      break;
    case 'FRAMEWORK DETAILS NEEDED':
      question = `Explain this framework like you're telling a friend over coffee, not teaching a class. How do the pieces actually connect?`;
      followUp = "Where does this framework break down — when doesn't it apply?";
      break;
    case 'SYSTEM DETAILS NEEDED':
      question = `How does this system actually work day-to-day? Not the ideal — the real version, with all the adjustments you've made.`;
      followUp = "What would you change about it if you started from scratch today?";
      break;
    default:
      question = `Tell me more about what's missing here — the ${gap.chapter} section needs your voice on this.`;
      followUp = "Why hasn't this been documented yet — is it hard to put into words?";
  }

  const qid = nextQid();
  // Register this question so linkToHandbook can find the gap later
  questionRegistry.set(qid, {
    marker: gap.marker,
    chapter: gap.chapter,
    lineNumber: gap.lineNumber,
    context: gap.context
  });

  return {
    id: qid,
    question,
    followUp,
    mode: 'deep',
    source: 'handbook-gap',
    sourceRef: `${gap.chapter}, ${gap.marker}`,
    handbookMarker: gap.marker,
    suggestedCamera: pickCamera('philosophical'),
    estimatedDuration: '90 seconds',
    contentPotential: inferContentPotential('handbook-gap', inferTags(question)),
    tags: [...inferTags(question), 'handbook-fill']
  };
}

function generateCardQuestion(card) {
  const questions = [
    `Card ${card.num} — "${card.name}" — when a student unlocks this, what does it actually look like? Not the textbook version, the moment you go "they've got it."`,
    `The live thread for "${card.name}" starts with: "${card.liveThread?.openingQuestion || 'no opening set'}". Why THAT question? What are you looking for in their answer?`,
    `"${card.name}" sits in the ${card.pillar} pillar. What connects it to the cards around it — what's the thread a student follows?`,
    `If a student is stuck on "${card.name}", what's usually blocking them that they can't see?`,
    `What's the surprise moment in "${card.name}" — the thing a student discovers that you can't just tell them?`
  ];

  const question = pick(questions);
  return {
    id: nextQid(),
    question,
    followUp: `What does the next session look like after they get this?`,
    mode: 'deep',
    source: 'curriculum',
    sourceRef: `Card ${card.num}: ${card.name} (${card.pillar})`,
    handbookMarker: null,
    suggestedCamera: pickCamera('technique'),
    estimatedDuration: '90 seconds',
    contentPotential: inferContentPotential('curriculum', inferTags(question)),
    tags: [...inferTags(question), card.pillar?.toLowerCase() || 'general', `card-${card.num}`]
  };
}

function generateRuleQuestion(rule) {
  const questions = [
    `One of your coaching rules says: "${rule.rule}". Where did that come from — was it a lesson or a mistake?`,
    `You have a rule: "${rule.rule}". Has a student ever made you break it?`,
    `"${rule.rule}" — walk me through the last time this rule actually saved a session.`,
    `Tell me the origin story of this rule: "${rule.rule}". What went wrong before it existed?`
  ];

  const question = pick(questions);
  return {
    id: nextQid(),
    question,
    followUp: "Would you state that rule differently now than when you first made it?",
    mode: 'deep',
    source: 'coaching-rule',
    sourceRef: `Rule ${rule.id}: ${rule.rule}`,
    handbookMarker: null,
    suggestedCamera: pickCamera('philosophical'),
    estimatedDuration: '90 seconds',
    contentPotential: inferContentPotential('coaching-rule', inferTags(question)),
    tags: [...inferTags(question), ...(rule.conditions?.tags || [])]
  };
}

function generateContentGapQuestion(gap) {
  const question = `We haven't posted about "${gap.topic}" in a while. What's your current thinking on it — has it evolved?`;
  return {
    id: nextQid(),
    question,
    followUp: "If we had 60 seconds to capture your take on this right now, what would you say?",
    mode: 'quick',
    source: 'content-gap',
    sourceRef: `Content gap: ${gap.topic} (last posted: ${gap.lastPosted || 'never'}, platform: ${gap.platform || 'any'})`,
    handbookMarker: null,
    suggestedCamera: pickCamera('philosophical'),
    estimatedDuration: '60 seconds',
    contentPotential: [gap.platform ? `${gap.platform}-post` : 'social-post', 'coaching-archive'],
    tags: inferTags(gap.topic)
  };
}

function generateEdgeQuestion() {
  const question = pick(EDGE_QUESTIONS);
  return {
    id: nextQid(),
    question,
    followUp: "Go deeper on that — what's underneath it?",
    mode: 'edge',
    source: 'edge',
    sourceRef: 'Edge question bank',
    handbookMarker: null,
    suggestedCamera: 'CAM 5 (close-up, face)',
    estimatedDuration: '90-120 seconds',
    contentPotential: ['long-form-content', 'coaching-archive', 'documentary'],
    tags: ['philosophy', 'vulnerability', 'edge']
  };
}

// ─── Main Exports ────────────────────────────────────────────────────────────

/**
 * Generate an interview session.
 * @param {Object} options
 * @param {'deep'|'quick'|'edge'} options.mode
 * @param {string} [options.topic] - Focus topic
 * @param {string} [options.handbook_chapter] - Target specific chapter
 * @param {number} [options.card_number] - Target specific card
 */
export function generateInterviewSession(options = {}) {
  const { mode = 'deep', topic, handbook_chapter, card_number } = options;
  questionCounter = 0;

  const questions = [];
  let targetCount;

  switch (mode) {
    case 'deep': targetCount = 8 + Math.floor(Math.random() * 5); break; // 8-12
    case 'quick': targetCount = 3 + Math.floor(Math.random() * 3); break; // 3-5
    case 'edge': targetCount = 5 + Math.floor(Math.random() * 3); break; // 5-7
    default: targetCount = 8;
  }

  // Reserve 1 slot for the mandatory edge question
  const mainCount = targetCount - 1;

  // If specific card requested
  if (card_number != null) {
    const card = cards.find(c => c.num === card_number);
    if (card) questions.push(generateCardQuestion(card));
  }

  // If specific chapter requested
  if (handbook_chapter) {
    const chapterGaps = handbookGaps.filter(g =>
      g.chapter.toLowerCase().includes(handbook_chapter.toLowerCase())
    );
    if (chapterGaps.length > 0) {
      const selected = pickN(chapterGaps, Math.min(3, chapterGaps.length));
      selected.forEach(g => questions.push(generateHandbookQuestion(g)));
    }
  }

  // Fill remaining slots from mixed sources
  while (questions.length < mainCount) {
    const roll = Math.random();

    if (roll < 0.3 && handbookGaps.length > 0) {
      // Handbook gap
      const gap = pick(handbookGaps.filter(g => g.status === 'unfilled'));
      if (gap) questions.push(generateHandbookQuestion(gap));
      else questions.push(generateCardQuestion(pick(cards) || { num: 1, name: 'Basics', pillar: 'Body' }));
    } else if (roll < 0.55 && cards.length > 0) {
      // Card-based
      questions.push(generateCardQuestion(pick(cards)));
    } else if (roll < 0.75 && coachingRules.length > 0) {
      // Rule-based
      questions.push(generateRuleQuestion(pick(coachingRules)));
    } else if (roll < 0.85 && contentGaps.length > 0) {
      // Content gap
      questions.push(generateContentGapQuestion(pick(contentGaps)));
    } else if (cards.length > 0) {
      questions.push(generateCardQuestion(pick(cards)));
    } else {
      // Fallback: handbook gap or edge
      if (handbookGaps.length > 0) {
        questions.push(generateHandbookQuestion(pick(handbookGaps)));
      } else {
        questions.push(generateEdgeQuestion());
      }
    }
  }

  // Add mandatory edge question
  questions.push(generateEdgeQuestion());

  // If mode is 'edge', replace more questions with edge questions
  if (mode === 'edge') {
    const edgeCount = Math.min(3, questions.length - 1);
    for (let i = 0; i < edgeCount; i++) {
      const idx = Math.floor(Math.random() * (questions.length - 1));
      questions[idx] = generateEdgeQuestion();
    }
  }

  // If mode is 'quick', adjust durations
  if (mode === 'quick') {
    questions.forEach(q => {
      q.estimatedDuration = '30-60 seconds';
      q.mode = 'quick';
    });
  }

  // Apply topic filter if specified
  if (topic) {
    questions.forEach(q => {
      if (!q.tags.some(t => t.includes(topic.toLowerCase()))) {
        q.tags.push(topic.toLowerCase());
      }
    });
  }

  return {
    mode,
    topic: topic || null,
    questionCount: questions.length,
    estimatedTotalDuration: `${questions.length * 2}-${questions.length * 3} minutes`,
    edgeQuestionIncluded: true,
    questions
  };
}

/**
 * Generate scene directions for filming a class.
 * @param {Object} options
 * @param {'group'|'pt'|'sparring'} options.classType
 * @param {number} [options.students]
 * @param {string} [options.focus]
 */
export function generateSceneDirections(options = {}) {
  const { classType = 'group', students, focus } = options;
  sceneCounter = 0;

  const scenes = [];

  const groupScenes = [
    {
      instruction: "Capture Coach Paul walking the line during combinations — look for the moment he stops behind someone and watches without correcting. That pause IS the coaching.",
      why: "The non-correction is as interesting as the correction. It shows trust.",
      timing: 'mid-class, during combinations',
      cameras: ['CAM 3 (bag line)', 'CAM 6 (detail, head height)'],
      tags: ['teaching-moment', 'observation', 'group']
    },
    {
      instruction: "Get the whole room during a rest break — some students pacing, some hands on knees, some shadow boxing. This is where personality shows.",
      why: "Rest breaks reveal who's in their head and who's in their body.",
      timing: 'between rounds',
      cameras: ['CAM 1 (wide, full gym)', 'CAM 4 (mirror wall)'],
      tags: ['atmosphere', 'character', 'group']
    },
    {
      instruction: "Close-up on Paul's hands when he's adjusting someone's guard. Get the contact, the precision of the adjustment, the student's face changing.",
      why: "Hands tell the story of a coach's career. This is where knowledge lives physically.",
      timing: 'during technique correction',
      cameras: ['CAM 6 (detail, head height)', 'CAM 5 (close-up, face)'],
      tags: ['technique', 'teaching', 'detail']
    },
    {
      instruction: "Wide shot from the mirror wall as Paul demos a combination. Watch for the rhythm change — the moment he goes from showing to FEELING it.",
      why: "When a coach demonstrates, there's a gear shift from explanation to embodiment. That's the frame.",
      timing: 'during demonstration',
      cameras: ['CAM 4 (mirror wall)', 'CAM 1 (wide, full gym)'],
      tags: ['demonstration', 'embodiment', 'technique']
    },
    {
      instruction: "Capture the first 30 seconds after Paul calls 'time' — the collective exhale, gloves dropping, the shift from intensity to recovery.",
      why: "Transitions reveal the energy Paul creates. The group response is the evidence.",
      timing: 'end of round',
      cameras: ['CAM 1 (wide, full gym)', 'CAM 3 (bag line)'],
      tags: ['energy', 'transition', 'group']
    },
    {
      instruction: "Get Paul explaining something to one student while the rest of the class works. Audio from the individual instruction over visuals of the group continuing.",
      why: "Shows the split attention that defines coaching — personal attention inside collective energy.",
      timing: 'mid-drill',
      cameras: ['CAM 5 (close-up, face)', 'CAM 1 (wide, full gym)'],
      tags: ['teaching', 'individual-attention', 'multitasking']
    },
    {
      instruction: "End of class — students removing wraps, chatting, the energy coming down. Get Paul in the background, already thinking about the next thing.",
      why: "The cool-down conversation is where breakthroughs get named. Students process out loud here.",
      timing: 'post-class',
      cameras: ['CAM 1 (wide, full gym)', 'CAM 5 (close-up, face)'],
      tags: ['post-class', 'reflection', 'community']
    }
  ];

  const ptScenes = [
    {
      instruction: "Film the opening conversation — the 2-3 minutes before gloves go on. This is diagnosis happening in real time.",
      why: "Coach Paul reads the student before the session starts. The session is designed from this moment.",
      timing: 'pre-session',
      cameras: ['CAM 5 (close-up, face)', 'CAM 2 (ring side)'],
      tags: ['diagnosis', 'conversation', 'pt']
    },
    {
      instruction: "Capture the moment Paul changes the plan mid-session. Watch for the micro-pause, the redirect. He saw something.",
      why: "Adaptive coaching is invisible unless you know to look for it. This IS the product.",
      timing: 'mid-session',
      cameras: ['CAM 6 (detail, head height)', 'CAM 2 (ring side)'],
      tags: ['adaptation', 'reading', 'pt']
    },
    {
      instruction: "Get the pad work rhythm from behind Paul's shoulder — student's face, Paul's hands absorbing impact. The conversation happening through leather.",
      why: "Pad work is a dialogue. The student speaks with punches; Paul answers with pad position and timing.",
      timing: 'during pad work',
      cameras: ['CAM 6 (detail, head height)', 'CAM 5 (close-up, face)'],
      tags: ['pad-work', 'dialogue', 'technique']
    },
    {
      instruction: "Close on the student's eyes during a difficult combination — the moment of frustration, then the click. If it doesn't click, that's equally valuable footage.",
      why: "Learning is visible in the eyes before the body. Both struggle and breakthrough are content.",
      timing: 'during technique practice',
      cameras: ['CAM 5 (close-up, face)', 'CAM 6 (detail, head height)'],
      tags: ['learning', 'breakthrough', 'struggle']
    },
    {
      instruction: "The debrief. Paul sits with the student after. What he says, how the student responds. This is where retention happens.",
      why: "The session after the session is often more valuable than the session itself.",
      timing: 'post-session',
      cameras: ['CAM 5 (close-up, face)', 'CAM 2 (ring side)'],
      tags: ['debrief', 'reflection', 'retention']
    }
  ];

  const sparringScenes = [
    {
      instruction: "Film Paul watching from the ring apron. His body language — leaning in, the small nods, the moments he almost speaks but holds back.",
      why: "A coach watching sparring is making 100 decisions about when to intervene. That restraint is the skill.",
      timing: 'during rounds',
      cameras: ['CAM 2 (ring side)', 'CAM 5 (close-up, face)'],
      tags: ['observation', 'restraint', 'sparring']
    },
    {
      instruction: "Between rounds: get both fighters and Paul in frame. The instruction given to one, the other absorbing it. Three-way dynamic.",
      why: "Sparring coaching is three-dimensional — you're coaching the relationship, not just two individuals.",
      timing: 'between rounds',
      cameras: ['CAM 2 (ring side)', 'CAM 1 (wide, full gym)'],
      tags: ['instruction', 'dynamics', 'sparring']
    },
    {
      instruction: "The moment Paul stops the round. What he saw, how he calls it, the two fighters processing. This is the safety AND the teaching.",
      why: "When to stop is the hardest coaching decision. It reveals values.",
      timing: 'mid-round intervention',
      cameras: ['CAM 2 (ring side)', 'CAM 5 (close-up, face)'],
      tags: ['intervention', 'safety', 'judgment']
    },
    {
      instruction: "Film the touch-glove ritual at the start. The eye contact, the nod. Then contrast with the last touch-glove after — the difference in how they look at each other.",
      why: "Sparring transforms the relationship. Before and after tells the story.",
      timing: 'start and end of sparring',
      cameras: ['CAM 2 (ring side)', 'CAM 6 (detail, head height)'],
      tags: ['ritual', 'respect', 'transformation']
    }
  ];

  let sourceScenes;
  switch (classType) {
    case 'pt': sourceScenes = ptScenes; break;
    case 'sparring': sourceScenes = sparringScenes; break;
    default: sourceScenes = groupScenes;
  }

  // Select 4-6 scenes
  const count = 4 + Math.floor(Math.random() * 3);
  const selected = pickN(sourceScenes, Math.min(count, sourceScenes.length));

  for (const s of selected) {
    scenes.push({
      id: nextSceneId(),
      instruction: s.instruction,
      why: s.why,
      suggestedCameras: s.cameras,
      contentPotential: inferContentPotential('scene', s.tags),
      timing: s.timing,
      tags: [...s.tags, classType]
    });
  }

  // If focus provided, prioritize relevant scenes
  if (focus) {
    scenes.sort((a, b) => {
      const aMatch = a.tags.some(t => t.includes(focus.toLowerCase()));
      const bMatch = b.tags.some(t => t.includes(focus.toLowerCase()));
      return bMatch - aMatch;
    });
  }

  return {
    classType,
    students: students || null,
    focus: focus || null,
    sceneCount: scenes.length,
    scenes
  };
}

/**
 * Generate a shooting schedule from a class schedule.
 * @param {Object} options
 * @param {Array<{day: string, time: string, type: string, students?: number}>} options.classSchedule
 */
export function generateShootingSchedule(options = {}) {
  const { classSchedule = [] } = options;

  if (classSchedule.length === 0) {
    return { error: 'No class schedule provided', schedule: [] };
  }

  const schedule = [];

  for (const cls of classSchedule) {
    questionCounter = 0;
    sceneCounter = 0;

    // Pre-class: 1-2 interview questions
    const preClassQuestions = [];
    const preCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < preCount; i++) {
      if (handbookGaps.length > 0 && Math.random() > 0.5) {
        preClassQuestions.push(generateHandbookQuestion(pick(handbookGaps)));
      } else if (cards.length > 0) {
        preClassQuestions.push(generateCardQuestion(pick(cards)));
      } else {
        preClassQuestions.push(generateEdgeQuestion());
      }
    }

    // During class: 2-3 scene directions
    const duringScenes = generateSceneDirections({ classType: cls.type || 'group', students: cls.students });
    const selectedScenes = duringScenes.scenes.slice(0, 2 + Math.floor(Math.random() * 2));

    // Post-class: 1 reflection question
    const reflectionQuestions = [
      "What just happened in that class that surprised you?",
      "Who showed you something new today?",
      "If you could replay one moment from that session, which one — and would you change anything?",
      "What did you see today that told you something about where a student is heading?",
      "Rate that class honestly — and tell me why."
    ];
    const postQuestion = {
      id: nextQid(),
      question: pick(reflectionQuestions),
      followUp: "Will that change what you do next time?",
      mode: 'quick',
      source: 'reflection',
      sourceRef: `Post-class reflection: ${cls.day} ${cls.time}`,
      handbookMarker: null,
      suggestedCamera: 'CAM 5 (close-up, face)',
      estimatedDuration: '60 seconds',
      contentPotential: ['instagram-reel', 'coaching-archive'],
      tags: ['reflection', 'post-class', cls.type || 'group']
    };

    schedule.push({
      day: cls.day,
      time: cls.time,
      classType: cls.type || 'group',
      students: cls.students || null,
      preClass: {
        label: 'Pre-class interview (arrive 10 min early)',
        questions: preClassQuestions
      },
      duringClass: {
        label: 'During class — scene directions',
        scenes: selectedScenes
      },
      postClass: {
        label: 'Post-class reflection (catch Paul within 5 min of finish)',
        questions: [postQuestion]
      }
    });
  }

  return {
    totalDays: schedule.length,
    estimatedFootage: `${schedule.length * 45}-${schedule.length * 75} minutes raw`,
    schedule
  };
}

/**
 * Link a transcript back to a handbook gap.
 * @param {string} transcript - The filmed response transcript
 * @param {string} questionId - The question ID that produced this transcript
 * @returns {Object|null} Link object or null if not from handbook
 */
export function linkToHandbook(transcript, questionId) {
  if (!transcript || !questionId) return null;

  const datestamp = new Date().toISOString().split('T')[0];

  function buildResult(marker, chapter, lineNumber) {
    return {
      marker,
      chapter,
      lineNumber,
      draftText: `[AI-DRAFT — needs Paul's review]\n\n${transcript.trim()}\n\n---\nSource: Documentary session, question ${questionId}\nRecorded: ${datestamp}`,
      confidence: 0.7,
      needsEditing: true
    };
  }

  // 1. Check the session registry (questions generated this run)
  const registered = questionRegistry.get(questionId);
  if (registered) {
    return buildResult(registered.marker, registered.chapter, registered.lineNumber);
  }

  // 2. Check if any gap was previously linked to this question ID
  const linkedGap = handbookGaps.find(g => g.questionId === questionId);
  if (linkedGap) {
    return buildResult(linkedGap.marker, linkedGap.chapter, linkedGap.lineNumber);
  }

  // 3. Fuzzy match: look for handbook gap markers or chapter keywords in the transcript
  const lower = transcript.toLowerCase();
  const matchingGap = handbookGaps.find(g => {
    // Match if the marker content appears in the transcript
    const markerContent = g.marker.replace(/\[|\]/g, '').toLowerCase();
    if (markerContent.length > 10 && lower.includes(markerContent.slice(0, 30))) return true;
    // Match on chapter keywords
    const chapterWords = g.chapter.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const hitCount = chapterWords.filter(w => lower.includes(w)).length;
    return chapterWords.length > 0 && hitCount >= Math.ceil(chapterWords.length * 0.5);
  });

  if (matchingGap) {
    return buildResult(matchingGap.marker, matchingGap.chapter, matchingGap.lineNumber);
  }

  return null;
}

/**
 * Report on handbook gap status.
 */
export function handbookGapReport() {
  const filled = handbookGaps.filter(g => g.status === 'filled').length;
  const remaining = handbookGaps.filter(g => g.status === 'unfilled').length;

  // Group by chapter
  const chapterMap = {};
  for (const gap of handbookGaps) {
    if (!chapterMap[gap.chapter]) {
      chapterMap[gap.chapter] = [];
    }
    chapterMap[gap.chapter].push({
      marker: gap.marker,
      lineNumber: gap.lineNumber,
      status: gap.status,
      questionId: gap.questionId || null
    });
  }

  const chapters = Object.entries(chapterMap).map(([chapter, gaps]) => ({
    chapter,
    gapCount: gaps.length,
    gaps
  }));

  return {
    totalGaps: handbookGaps.length,
    filled,
    remaining,
    chapters
  };
}

/**
 * Set content gaps for the director to target.
 * @param {Array<{topic: string, lastPosted: string, platform: string}>} gaps
 */
export function setContentGaps(gaps) {
  if (Array.isArray(gaps)) {
    contentGaps = gaps;
  }
  return { accepted: contentGaps.length };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'interview': {
      const mode = arg || 'deep';
      const session = generateInterviewSession({ mode });
      console.log(JSON.stringify(session, null, 2));
      break;
    }

    case 'scenes': {
      const classType = arg || 'group';
      const scenes = generateSceneDirections({ classType });
      console.log(JSON.stringify(scenes, null, 2));
      break;
    }

    case 'gaps': {
      const report = handbookGapReport();
      console.log(JSON.stringify(report, null, 2));
      break;
    }

    case 'link': {
      const transcript = process.argv[3] || '';
      const questionId = process.argv[4] || '';
      const result = linkToHandbook(transcript, questionId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.log(`Documentary Director — Coach Paul @ Basic Reflex

Usage:
  node documentary-director.js interview [deep|quick|edge]  — Generate interview session
  node documentary-director.js scenes [group|pt|sparring]   — Generate scene directions
  node documentary-director.js gaps                         — Show handbook gap report
  node documentary-director.js link "transcript" questionId — Test handbook linker
`);
  }
}
