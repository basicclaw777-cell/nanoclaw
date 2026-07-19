/**
 * brand-invariant.js — BR Brand Constitutional Guard
 *
 * Executable invariant: BR palette is ONLY black / gold #f7b408 / white.
 * Burgundy #8B2020 and olive #6B7C47 are AI-hallucinated — block on sight.
 *
 * Import this in any generator/builder that produces BR-branded output.
 */

const BR_PALETTE = {
  black: '#000000',
  gold: '#f7b408',
  white: '#ffffff',
};

const BANNED_COLORS = [
  { hex: '#8b2020', name: 'burgundy', origin: 'AI-hallucinated (never real)' },
  { hex: '#8B2020', name: 'burgundy', origin: 'AI-hallucinated (never real)' },
  { hex: '#6b7c47', name: 'olive', origin: 'AI-hallucinated (never real)' },
  { hex: '#6B7C47', name: 'olive', origin: 'AI-hallucinated (never real)' },
];

const BANNED_WORDS = ['burgundy', 'olive green', 'maroon'];

/**
 * Check a string (HTML, CSS, prompt) for brand violations.
 * Returns { clean: boolean, violations: string[] }
 */
function checkBrandCompliance(content) {
  if (!content || typeof content !== 'string') return { clean: true, violations: [] };

  const lower = content.toLowerCase();
  const violations = [];

  for (const banned of BANNED_COLORS) {
    if (lower.includes(banned.hex.toLowerCase())) {
      violations.push(`Found ${banned.name} (${banned.hex}) — ${banned.origin}`);
    }
  }

  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      violations.push(`Found banned color word "${word}" — use gold #f7b408 instead`);
    }
  }

  return { clean: violations.length === 0, violations };
}

/**
 * Replace all banned colors with gold #f7b408.
 * Use on output before shipping.
 */
function enforceBrandPalette(content) {
  if (!content || typeof content !== 'string') return content;

  let fixed = content;
  fixed = fixed.replace(/#8[Bb]2020/g, '#f7b408');
  fixed = fixed.replace(/#6[Bb]7[Cc]47/g, '#f7b408');
  fixed = fixed.replace(/burgundy/gi, 'gold');

  return fixed;
}

export { BR_PALETTE, BANNED_COLORS, checkBrandCompliance, enforceBrandPalette };
