// obsidian-formatter.cjs
// Converts all cathedral vault files to proper Obsidian format with wikilinks
const fs = require('fs');
const path = require('path');

const VAULT_DIR = '/Users/basicclaw777/cathedral-vault/02_Refined_Gold';

// Tag categories for auto-linking
const TAG_TO_CONCEPT = {
  'perception': 'Perception',
  'wisdom': 'Wisdom',
  'truth': 'Truth',
  'truth-detection': 'Truth Detection',
  'pattern-recognition': 'Pattern Recognition',
  'fear': 'Fear',
  'resilience': 'Resilience',
  'stoicism': 'Stoicism',
  'consciousness': 'Consciousness',
  'identity': 'Identity',
  'exposure': 'Exposure',
  'presence': 'Presence',
  'karmic-justice': 'Karmic Justice',
  'art-philosophy': 'Art Philosophy',
  'analysis': 'Analysis',
};

// Known concepts to auto-wikilink when found in text
const KNOWN_CONCEPTS = [
  'Saper Vedere', 'IntegrityOS', 'OmissionOS', 'Hungry Ghost',
  'Sacred Geometry', 'Natural Law', 'The Cathedral', 'Sfumato',
  'Forensic Audit', '30/30 Grid', 'Sovereign Lexicon',
  'Silence as Negative Space', 'Recursive Rescue'
];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function extractTagsFromText(text) {
  const tags = [];
  // Extract hashtags
  const hashMatches = text.match(/#[\w-]+/g) || [];
  hashMatches.forEach(t => tags.push(t.replace('#', '')));
  return [...new Set(tags)];
}

function addWikilinks(text) {
  let result = text;
  KNOWN_CONCEPTS.forEach(concept => {
    // Don't double-wikilink
    if (!result.includes(`[[${concept}]]`)) {
      result = result.replace(new RegExp(concept, 'g'), `[[${concept}]]`);
    }
  });
  return result;
}

function formatExistingMarkdown(content, filename) {
  // Already good markdown — just upgrade it
  const tags = extractTagsFromText(content);
  
  // Extract category if present
  const categoryMatch = content.match(/\*\*Category:\*\*\s*(.+)/);
  const category = categoryMatch ? categoryMatch[1].trim() : 'Insight';
  
  // Extract dots to connect
  const dotsSection = content.match(/## Dots to Connect\n([\s\S]*?)(?=\n##|$)/);
  let wikilinks = '';
  if (dotsSection) {
    const dots = dotsSection[1].match(/- (.+)/g) || [];
    wikilinks = dots.map(d => `[[${d.replace('- ', '').trim()}]]`).join(' | ');
  }

  // Build frontmatter
  const frontmatter = `---
tags: [${tags.join(', ')}]
category: ${category}
connections: ${wikilinks || 'none'}
vault_section: Refined_Gold
---\n\n`;

  // Remove old hashtag lines, replace dots section with wikilinks
  let body = content
    .replace(/\*\*Category:\*\*.*\n/, '')
    .replace(/## Tags\n.*\n?/g, '')
    .replace(/## Dots to Connect\n[\s\S]*?(?=\n##|---|\*Extracted)/,
      `## Connected Ideas\n${wikilinks}\n\n`);

  // Add wikilinks for known concepts
  body = addWikilinks(body);

  return frontmatter + body;
}

function convertJsonNugget(nugget, index) {
  // Pull content from the messy JSON fields
  const content = nugget.content || '';
  const category = nugget.category || 'Insight';
  
  // Clean up the content — remove field prefixes like "core_concept": "..."
  let cleanContent = content
    .replace(/^"[\w_]+":\s*"?/, '')
    .replace(/",$/, '')
    .replace(/^"/, '')
    .replace(/"$/, '')
    .trim();

  // Extract any tags from content
  const tagMatches = content.match(/"tags":\s*\[(.*?)\]/);
  let tags = nugget.tags || [];
  if (tagMatches) {
    const extracted = tagMatches[1].match(/"([\w-]+)"/g) || [];
    tags = [...tags, ...extracted.map(t => t.replace(/"/g, ''))];
  }

  // Auto-detect themes from content
  if (content.match(/truth|lie|geometry|proportion/i)) tags.push('truth', 'perception');
  if (content.match(/fear|shadow|dark/i)) tags.push('fear');
  if (content.match(/wisdom|master|insight/i)) tags.push('wisdom');
  if (content.match(/integrity|omission/i)) tags.push('integrity');
  tags = [...new Set(tags)].filter(t => t && t.length > 1);

  // Generate a title from content if the current one is a field name
  let title = nugget.title || '';
  if (title.startsWith('"') || title.includes('_')) {
    // Extract first meaningful sentence
    title = cleanContent.split('.')[0].substring(0, 60).trim();
  }
  title = title.replace(/^"/, '').replace(/"$/, '').trim();

  // Add wikilinks
  cleanContent = addWikilinks(cleanContent);

  return { title, content: cleanContent, category, tags };
}

function processJsonFile(rawContent, filename) {
  let nuggets;
  try {
    nuggets = JSON.parse(rawContent);
  } catch(e) {
    console.log(`  ⚠️  Could not parse JSON in ${filename}, trying partial...`);
    return null;
  }

  if (!Array.isArray(nuggets)) return null;

  // Filter out noise (questions, meta-commentary)
  const meaningful = nuggets.filter(n => {
    const c = (n.content || '').toLowerCase();
    return c.length > 50 && 
           !c.startsWith('how does this') &&
           !c.startsWith('would you like') &&
           !c.includes('what specific');
  });

  // Group by theme and create one file per meaningful nugget
  const files = [];
  meaningful.forEach((nugget, i) => {
    const converted = convertJsonNugget(nugget, i);
    if (!converted.title || converted.title.length < 5) return;

    const slug = slugify(converted.title.substring(0, 40));
    const mdContent = `---
tags: [${converted.tags.join(', ')}]
category: ${converted.category}
vault_section: Refined_Gold
source: my-first-real-chat
---

# ${converted.title}

**Category:** ${converted.category}

## Core Insight
${converted.content}

## Connected Ideas
${KNOWN_CONCEPTS
  .filter(c => converted.content.includes(`[[${c}]]`))
  .map(c => `[[${c}]]`)
  .join(' | ') || '_See vault graph for connections_'}

---
*Extracted from: my-first-real-chat.txt*
`;
    files.push({ slug, content: mdContent, title: converted.title });
  });

  return files;
}

async function main() {
  console.log('🏛️  OBSIDIAN VAULT FORMATTER');
  console.log('============================\n');

  const files = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.md'));
  console.log(`📁 Found ${files.length} files to process\n`);

  let upgraded = 0;
  let expanded = 0;

  for (const file of files) {
    const filePath = path.join(VAULT_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Detect if it's a JSON dump
    const trimmed = content.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      console.log(`📦 Converting JSON: ${file}`);
      const nuggetFiles = processJsonFile(trimmed, file);
      
      if (nuggetFiles && nuggetFiles.length > 0) {
        // Rename original to _archive
        fs.renameSync(filePath, filePath.replace('.md', '_archive.md'));
        
        // Write individual nugget files
        nuggetFiles.forEach(nf => {
          const newPath = path.join(VAULT_DIR, `${nf.slug}.md`);
          fs.writeFileSync(newPath, nf.content);
          expanded++;
        });
        console.log(`  ✅ Expanded into ${nuggetFiles.length} individual nugget files`);
      }
    } else {
      // Good markdown — just upgrade with frontmatter + wikilinks
      console.log(`✨ Upgrading: ${file}`);
      const upgraded_content = formatExistingMarkdown(content, file);
      fs.writeFileSync(filePath, upgraded_content);
      upgraded++;
      console.log(`  ✅ Added frontmatter + wikilinks`);
    }
  }

  console.log('\n📊 RESULTS');
  console.log('==========');
  console.log(`✨ Upgraded: ${upgraded} existing files`);
  console.log(`📦 Expanded: ${expanded} new nugget files from JSON`);
  console.log(`\n🏛️  Your vault is ready for Obsidian!`);
  console.log(`\nNext: Open Obsidian → Open folder as vault → /Users/basicclaw777/cathedral-vault`);
}

main().catch(console.error);
