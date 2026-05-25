import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const POSTS_PATH = path.join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/posts.json');
const REPORT_PATH = path.join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/q-drops-phase9-report.md');
const IMAGES_DATA_PATH = path.join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/q-images-catalog.json');

const raw = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
const posts = Array.isArray(raw) ? raw : raw.posts;
console.log(`=== Q Drops Phase 9: Image Forensics ===\n`);
console.log(`Total posts: ${posts.length}\n`);

// ============================================================
// Step 1: Image Catalog Construction
// ============================================================
console.log(`=== Step 1: Image Catalog ===\n`);

const catalog = [];
const boardSiteMap = {
  '/pol': { site: '4ch', archive: '4plebs.org' },
  '/cbts': { site: '8ch', archive: '8kun.top' },
  '/thestorm': { site: '8ch', archive: '8kun.top' },
  '/greatawakening': { site: '8ch', archive: '8kun.top' },
  '/qresearch': { site: '8ch', archive: '8kun.top' },
  '/patriotsfight': { site: '8ch', archive: '8kun.top' },
  '/projectdcomms': { site: '8kun', archive: '8kun.top' }
};

for (const post of posts) {
  if (!post.images || post.images.length === 0) continue;
  const meta = post.post_metadata || {};
  const board = meta.source?.board || 'unknown';
  const site = meta.source?.site || 'unknown';
  const postId = meta.post_id;
  const postTime = meta.time;

  for (const img of post.images) {
    const ext = img.file.split('.').pop().toLowerCase();
    const timestamp = img.file.match(/^(\d+)\./)?.[1] || null;

    catalog.push({
      file: img.file,
      name: img.name,
      ext,
      timestamp,
      postId,
      postNum: meta.id,
      postTime,
      board,
      site,
      tripcode: meta.tripcode || post.post_metadata?.author_id || 'unknown',
      textPreview: (post.text || '').substring(0, 100)
    });
  }
}

console.log(`  Total images cataloged: ${catalog.length}`);

// ============================================================
// Step 2: Filename Analysis
// ============================================================
console.log(`\n=== Step 2: Filename Analysis ===\n`);

// Extension distribution
const extDist = {};
for (const img of catalog) {
  extDist[img.ext] = (extDist[img.ext] || 0) + 1;
}
console.log(`  Extensions:`, extDist);

// Original vs renamed files
// 4chan/8chan pattern: timestamp.ext = original upload, anything else = renamed
const timestampPattern = /^\d{13,}\.\w+$/;
const originalUpload = catalog.filter(i => timestampPattern.test(i.file));
const renamedFiles = catalog.filter(i => !timestampPattern.test(i.file));
console.log(`  Original upload filenames (timestamp): ${originalUpload.length}`);
console.log(`  Renamed/custom filenames: ${renamedFiles.length}`);

// Name analysis - what are the files named?
const namePatterns = {
  screenshot: 0,
  photo: 0,
  meme: 0,
  document: 0,
  map: 0,
  flag: 0,
  trump: 0,
  qrelated: 0,
  news: 0,
  government: 0,
  other: 0
};

for (const img of catalog) {
  const n = img.name.toLowerCase();
  if (n.match(/screen|screenshot|capture|snip/)) namePatterns.screenshot++;
  else if (n.match(/photo|img_|dsc|dcim|pic|camera/)) namePatterns.photo++;
  else if (n.match(/meme|pepe|kek|wojak|npc/)) namePatterns.meme++;
  else if (n.match(/doc|pdf|text|letter|memo|report/)) namePatterns.document++;
  else if (n.match(/map|chart|graph|diagram/)) namePatterns.map++;
  else if (n.match(/flag|american|patriot|usa/)) namePatterns.flag++;
  else if (n.match(/trump|potus|maga|donald/)) namePatterns.trump++;
  else if (n.match(/q|anon|wwg|storm|awakening|drops/)) namePatterns.qrelated++;
  else if (n.match(/news|fox|cnn|nyt|wapo|bbc/)) namePatterns.news++;
  else if (n.match(/gov|white.?house|pentagon|congress|senate|fbi|cia|nsa|doj/)) namePatterns.government++;
  else namePatterns.other++;
}

console.log(`  Name categories:`);
for (const [cat, count] of Object.entries(namePatterns).sort((a, b) => b[1] - a[1])) {
  if (count > 0) console.log(`    ${cat}: ${count}`);
}

// ============================================================
// Step 3: Temporal Analysis of Images
// ============================================================
console.log(`\n=== Step 3: Image Temporal Analysis ===\n`);

// Extract upload timestamps from filenames
const uploadTimestamps = catalog
  .filter(i => i.timestamp)
  .map(i => ({
    ...i,
    uploadDate: new Date(parseInt(i.timestamp)),
    postDate: i.postTime ? new Date(i.postTime * 1000) : null
  }));

// Check time deltas between image creation and post time
const deltas = uploadTimestamps
  .filter(i => i.postDate)
  .map(i => ({
    ...i,
    deltaMs: i.postDate.getTime() - i.uploadDate.getTime(),
    deltaSec: (i.postDate.getTime() - i.uploadDate.getTime()) / 1000
  }));

if (deltas.length > 0) {
  const sameSession = deltas.filter(d => Math.abs(d.deltaSec) < 3600); // within 1 hour
  const reused = deltas.filter(d => d.deltaSec > 86400); // image older than 1 day
  const future = deltas.filter(d => d.deltaSec < -60); // image timestamp AFTER post (clock skew or manipulation)

  console.log(`  Images with timestamp analysis: ${deltas.length}`);
  console.log(`  Uploaded same session (<1hr): ${sameSession.length} (${(sameSession.length/deltas.length*100).toFixed(1)}%)`);
  console.log(`  Reused/older images (>1day): ${reused.length} (${(reused.length/deltas.length*100).toFixed(1)}%)`);
  console.log(`  Future timestamps (anomalous): ${future.length}`);

  // Distribution of deltas
  const deltaRanges = {
    '<1min': deltas.filter(d => Math.abs(d.deltaSec) < 60).length,
    '1-10min': deltas.filter(d => Math.abs(d.deltaSec) >= 60 && Math.abs(d.deltaSec) < 600).length,
    '10min-1hr': deltas.filter(d => Math.abs(d.deltaSec) >= 600 && Math.abs(d.deltaSec) < 3600).length,
    '1-24hr': deltas.filter(d => Math.abs(d.deltaSec) >= 3600 && Math.abs(d.deltaSec) < 86400).length,
    '1-7days': deltas.filter(d => Math.abs(d.deltaSec) >= 86400 && Math.abs(d.deltaSec) < 604800).length,
    '>7days': deltas.filter(d => Math.abs(d.deltaSec) >= 604800).length
  };
  console.log(`  Delta distribution:`);
  for (const [range, count] of Object.entries(deltaRanges)) {
    console.log(`    ${range}: ${count}`);
  }
}

// ============================================================
// Step 4: Image Name Forensics (Original Names)
// ============================================================
console.log(`\n=== Step 4: Original Filename Forensics ===\n`);

// Original names can reveal: device type, software, source
const origNames = catalog.map(i => i.name).filter((n, idx) => n !== catalog[idx].file);
const devicePatterns = {
  iPhone: /IMG_\d{4}/i,
  Android: /\d{8}_\d{6}/,
  Screenshot_iOS: /IMG_\d{4}|Photo/i,
  Screenshot_Win: /Capture|Snipping|clipboard/i,
  Screenshot_Mac: /Screen Shot|Screenshot/i,
  DSLR: /DSC_|DSCN|DSCF|P\d{7}/,
  WhatsApp: /WhatsApp Image/i,
  Photoshop: /PSD|photoshop/i,
  MSPaint: /Untitled|Drawing/i,
  Chan_Repost: /^\d{13,}\.\w+$/, // Another chan's timestamp
  Custom: /[A-Za-z_-]{5,}/ // Deliberately named
};

const deviceHits = {};
for (const img of catalog) {
  for (const [device, pattern] of Object.entries(devicePatterns)) {
    if (pattern.test(img.name)) {
      deviceHits[device] = (deviceHits[device] || 0) + 1;
    }
  }
}

console.log(`  Device/software indicators in filenames:`);
for (const [device, count] of Object.entries(deviceHits).sort((a, b) => b[1] - a[1])) {
  if (count > 0) console.log(`    ${device}: ${count}`);
}

// ============================================================
// Step 5: Unique vs Repeated Images
// ============================================================
console.log(`\n=== Step 5: Image Reuse Analysis ===\n`);

// Check for duplicate filenames (same image posted multiple times)
const fileFreq = {};
for (const img of catalog) {
  fileFreq[img.file] = (fileFreq[img.file] || 0) + 1;
}
const duplicates = Object.entries(fileFreq).filter(([_, count]) => count > 1);
const uniqueImages = Object.keys(fileFreq).length;

console.log(`  Total images: ${catalog.length}`);
console.log(`  Unique image files: ${uniqueImages}`);
console.log(`  Duplicated images: ${duplicates.length}`);
if (duplicates.length > 0) {
  console.log(`  Most reused:`);
  for (const [file, count] of duplicates.sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    const img = catalog.find(i => i.file === file);
    console.log(`    ${img.name} (${file}): ${count}x`);
  }
}

// Check for same original name with different upload timestamps (re-uploaded)
const nameFreq = {};
for (const img of catalog) {
  nameFreq[img.name] = (nameFreq[img.name] || 0) + 1;
}
const reuploadedNames = Object.entries(nameFreq).filter(([_, count]) => count > 1);
console.log(`  Same original name, different uploads: ${reuploadedNames.length}`);

// ============================================================
// Step 6: Board Distribution
// ============================================================
console.log(`\n=== Step 6: Image Distribution by Board ===\n`);

const boardDist = {};
for (const img of catalog) {
  boardDist[img.board] = (boardDist[img.board] || 0) + 1;
}
for (const [board, count] of Object.entries(boardDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${board}: ${count} images`);
}

// Images per post by board
const boardPostsWithImages = {};
for (const post of posts) {
  if (!post.images || post.images.length === 0) continue;
  const board = post.post_metadata?.source?.board || 'unknown';
  boardPostsWithImages[board] = (boardPostsWithImages[board] || 0) + 1;
}

// ============================================================
// Step 7: Content Classification via DeepSeek
// ============================================================
console.log(`\n=== Step 7: DeepSeek Image Content Classification ===\n`);

// We can't download/view images, but we CAN analyze the metadata:
// filenames, original names, post context, board, timing

// Prepare filename + context data for DeepSeek classification
const classificationSample = catalog.slice(0, 100).map(i => ({
  name: i.name,
  file: i.file,
  board: i.board,
  post: i.postId,
  context: i.textPreview
}));

const dsPrompt = `You are a forensic image analyst. I cannot show you the actual images, but I have metadata from 1,172 images embedded in anonymous intelligence-themed posts (2017-2022). Classify what you can determine from filenames, original names, and post context alone.

## SAMPLE (100 of 1,172 images):

${classificationSample.map(i => `- File: ${i.file} | Name: "${i.name}" | Board: ${i.board} | Context: "${i.context}"`).join('\n')}

## STATISTICS:
- Extensions: JPG=${extDist.jpg || 0}, PNG=${extDist.png || 0}, JPEG=${extDist.jpeg || 0}, GIF=${extDist.gif || 0}
- Original upload (timestamp filename): ${originalUpload.length} / ${catalog.length}
- iPhone-pattern names: ${deviceHits.iPhone || 0}
- Screenshot-pattern names: ${(deviceHits.Screenshot_iOS || 0) + (deviceHits.Screenshot_Win || 0) + (deviceHits.Screenshot_Mac || 0)}
- Chan repost (timestamp name): ${deviceHits.Chan_Repost || 0}
- Custom-named files: ${deviceHits.Custom || 0}
- Unique images: ${uniqueImages}, Duplicated: ${duplicates.length}

Provide structured analysis:

1. IMAGE SOURCE CLASSIFICATION: What percentage appear to be:
   a) Screenshots (of websites, tweets, news articles)
   b) Original photography (taken by poster — look for camera naming patterns)
   c) Memes/infographics (created content)
   d) Official/government documents or images
   e) Stock photos or sourced imagery
   f) Maps, charts, diagrams
   g) Cannot determine

2. ORIGINAL PHOTOGRAPHY ASSESSMENT: Which images (by filename pattern) suggest the poster had physical access to photograph something? This is the most forensically significant category.

3. DEVICE FINGERPRINTING: Based on naming conventions, what devices/software were likely used?

4. OPERATIONAL SECURITY ASSESSMENT: How careful was the poster about metadata? (renamed files vs originals, timestamp patterns, etc.)

5. FORENSIC VALUE: Without the actual images, what is the maximum forensic value of this metadata? What would examining the actual images add?`;

async function callDeepSeek(prompt) {
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a forensic digital analyst with expertise in image metadata, OSINT, and digital forensics. Provide structured, evidence-based analysis.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });
    const data = await res.json();
    if (data.error) {
      console.log(`  DeepSeek error: ${data.error.message}`);
      return null;
    }
    return data.choices[0].message.content;
  } catch (e) {
    console.log(`  DeepSeek failed: ${e.message}`);
    return null;
  }
}

const dsAnalysis = await callDeepSeek(dsPrompt);
if (dsAnalysis) {
  console.log(`  DeepSeek classification received (${dsAnalysis.length} chars)`);
} else {
  console.log(`  DeepSeek classification failed`);
}

// ============================================================
// Step 8: Air Force One / Original Photography Detection
// ============================================================
console.log(`\n=== Step 8: Original Photography Detection ===\n`);

// Q claimed to post original photos from Air Force One, White House, etc.
// Look for: camera naming patterns, iPhone patterns, unique filenames suggesting original content
const possibleOriginals = catalog.filter(i => {
  const n = i.name.toLowerCase();
  const f = i.file.toLowerCase();
  return (
    n.match(/img_\d{4}/i) || // iPhone
    n.match(/dsc[nf]?\d{4}/i) || // DSLR
    n.match(/photo_\d/i) || // Generic camera
    n.match(/\d{8}_\d{6}/) || // Android
    n.match(/p\d{7}/i) || // Panasonic
    // Custom names suggesting original content
    n.match(/air.?force|af1|marine.?one|white.?house|oval|potus|pen|desk|window|flight|plane/i) ||
    n.match(/apple/i)
  );
});

console.log(`  Possible original photographs: ${possibleOriginals.length}`);
if (possibleOriginals.length > 0) {
  console.log(`  Samples:`);
  for (const img of possibleOriginals.slice(0, 20)) {
    console.log(`    "${img.name}" (${img.file}) — Board: ${img.board}, Post: ${img.postId}`);
  }
}

// Look for Q's claimed original photos in post text
const originalPhotosPosts = posts.filter(p => {
  if (!p.text) return false;
  return p.text.match(/photo|pic|image|taken|camera|shot/i) &&
         p.text.match(/original|proof|verify|AF1|air force|white house|inside|aboard/i);
});

console.log(`\n  Posts claiming original photos: ${originalPhotosPosts.length}`);
for (const p of originalPhotosPosts.slice(0, 10)) {
  const excerpt = p.text.substring(0, 150).replace(/\n/g, ' ');
  console.log(`    Post #${p.post_metadata?.post_id}: "${excerpt}..."`);
  if (p.images?.length > 0) {
    console.log(`      Images: ${p.images.map(i => i.name).join(', ')}`);
  }
}

// ============================================================
// Step 9: Steganography Indicators (Metadata-Only)
// ============================================================
console.log(`\n=== Step 9: Steganography Indicators ===\n`);

// Without actual image files, we can only look for stego indicators in naming/context
const stegoIndicators = {
  pixelknot: 0,  // PixelKnot app
  outguess: 0,   // Outguess
  lsb: 0,        // LSB
  hidden: 0,     // Hidden message references
  steg: 0,       // Steg references in post text
  look_closer: 0 // "look closer" / "expand" / "enhance" hints
};

for (const post of posts) {
  if (!post.text) continue;
  const t = post.text.toLowerCase();
  if (t.includes('pixelknot')) stegoIndicators.pixelknot++;
  if (t.includes('outguess')) stegoIndicators.outguess++;
  if (t.match(/\blsb\b/)) stegoIndicators.lsb++;
  if (t.match(/hidden.*message|message.*hidden|secret.*image|image.*secret/)) stegoIndicators.hidden++;
  if (t.match(/steganograph|steg[oa]/)) stegoIndicators.steg++;
  if (t.match(/look closer|expand.*image|enhance|zoom in|look at the image/i)) stegoIndicators.look_closer++;
}

console.log(`  Steganography references in post text:`);
for (const [indicator, count] of Object.entries(stegoIndicators)) {
  if (count > 0) console.log(`    ${indicator}: ${count} posts`);
}

// Community stego attempts — posts referencing image analysis
const stegoDiscussion = posts.filter(p => {
  if (!p.text) return false;
  return p.text.match(/steganograph|pixelknot|hidden.*image|image.*hidden|steg[oa]/i);
});
console.log(`  Posts discussing steganography: ${stegoDiscussion.length}`);
for (const p of stegoDiscussion.slice(0, 5)) {
  const excerpt = p.text.substring(0, 150).replace(/\n/g, ' ');
  console.log(`    Post #${p.post_metadata?.post_id}: "${excerpt}..."`);
}

// ============================================================
// Step 10: Image-Text Correlation
// ============================================================
console.log(`\n=== Step 10: Image-Text Correlation ===\n`);

// How many image posts have text? How many are image-only?
const imgPosts = posts.filter(p => p.images?.length > 0);
const imgOnly = imgPosts.filter(p => !p.text || p.text.trim().length < 5);
const imgWithText = imgPosts.filter(p => p.text && p.text.trim().length >= 5);

console.log(`  Posts with images: ${imgPosts.length}`);
console.log(`  Image-only (no/minimal text): ${imgOnly.length} (${(imgOnly.length/imgPosts.length*100).toFixed(1)}%)`);
console.log(`  Image + text: ${imgWithText.length} (${(imgWithText.length/imgPosts.length*100).toFixed(1)}%)`);

// Average text length for image vs non-image posts
const avgTextImg = imgWithText.reduce((s, p) => s + p.text.length, 0) / imgWithText.length;
const nonImgPosts = posts.filter(p => !p.images || p.images.length === 0).filter(p => p.text);
const avgTextNoImg = nonImgPosts.reduce((s, p) => s + p.text.length, 0) / nonImgPosts.length;

console.log(`  Avg text length (image posts): ${avgTextImg.toFixed(0)} chars`);
console.log(`  Avg text length (non-image posts): ${avgTextNoImg.toFixed(0)} chars`);

// ============================================================
// Generate Report
// ============================================================
console.log(`\n=== Generating Phase 9 Report ===\n`);

const report = `---
title: "Q Drops Forensic Analysis - Phase 9 (Image Forensics)"
date: 2026-05-25
type: forensic-analysis
status: complete
tags: [qanon, forensics, image-analysis, metadata, steganography, digital-forensics]
---

# Q Drops - Phase 9: Image Forensics

## Summary

Metadata-level forensic analysis of 1,172 images across 1,032 posts. Without access to actual image files (only filenames, original names, board context, and timestamps), this phase focuses on what can be determined from metadata alone.

**Limitation:** This is metadata-only analysis. Full image forensics (EXIF extraction, steganography scanning, ELA, reverse image search) requires downloading the actual image files from archive sources.

## Part 1: Image Catalog

| Metric | Value |
|---|---|
| Total images | ${catalog.length} |
| Posts with images | ${imgPosts.length} |
| Unique image files | ${uniqueImages} |
| Duplicated images | ${duplicates.length} |

### Extensions
| Type | Count | % |
|---|---|---|
| JPG | ${extDist.jpg || 0} | ${((extDist.jpg || 0)/catalog.length*100).toFixed(1)}% |
| PNG | ${extDist.png || 0} | ${((extDist.png || 0)/catalog.length*100).toFixed(1)}% |
| JPEG | ${extDist.jpeg || 0} | ${((extDist.jpeg || 0)/catalog.length*100).toFixed(1)}% |
| GIF | ${extDist.gif || 0} | ${((extDist.gif || 0)/catalog.length*100).toFixed(1)}% |

**JPG/JPEG dominance (${((extDist.jpg + extDist.jpeg)/catalog.length*100).toFixed(1)}%)** is consistent with camera photos and compressed screenshots. PNG (${((extDist.png || 0)/catalog.length*100).toFixed(1)}%) suggests screenshots and infographics.

## Part 2: Filename Analysis

### Upload Pattern
| Type | Count | % |
|---|---|---|
| Original upload (timestamp filename) | ${originalUpload.length} | ${(originalUpload.length/catalog.length*100).toFixed(1)}% |
| Renamed/custom filename | ${renamedFiles.length} | ${(renamedFiles.length/catalog.length*100).toFixed(1)}% |

### Name Categories
${Object.entries(namePatterns).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([cat, count]) =>
  `| ${cat} | ${count} | ${(count/catalog.length*100).toFixed(1)}% |`
).join('\n')}

### Device/Software Indicators
${Object.entries(deviceHits).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([device, count]) =>
  `| ${device} | ${count} |`
).join('\n')}

## Part 3: Temporal Analysis

${deltas.length > 0 ? `
### Upload-to-Post Time Delta
| Range | Count | % |
|---|---|---|
${Object.entries({
  '<1min': deltas.filter(d => Math.abs(d.deltaSec) < 60).length,
  '1-10min': deltas.filter(d => Math.abs(d.deltaSec) >= 60 && Math.abs(d.deltaSec) < 600).length,
  '10min-1hr': deltas.filter(d => Math.abs(d.deltaSec) >= 600 && Math.abs(d.deltaSec) < 3600).length,
  '1-24hr': deltas.filter(d => Math.abs(d.deltaSec) >= 3600 && Math.abs(d.deltaSec) < 86400).length,
  '1-7days': deltas.filter(d => Math.abs(d.deltaSec) >= 86400 && Math.abs(d.deltaSec) < 604800).length,
  '>7days': deltas.filter(d => Math.abs(d.deltaSec) >= 604800).length
}).map(([range, count]) => `| ${range} | ${count} | ${(count/deltas.length*100).toFixed(1)}% |`).join('\n')}

**Anomalous future timestamps:** ${deltas.filter(d => d.deltaSec < -60).length}
` : 'Insufficient timestamp data for delta analysis.'}

## Part 4: Board Distribution

| Board | Images | % |
|---|---|---|
${Object.entries(boardDist).sort((a, b) => b[1] - a[1]).map(([board, count]) =>
  `| ${board} | ${count} | ${(count/catalog.length*100).toFixed(1)}% |`
).join('\n')}

## Part 5: Image Reuse

### Most Reused Images
${duplicates.length > 0 ?
  duplicates.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([file, count]) => {
    const img = catalog.find(i => i.file === file);
    return `| \`${img.name}\` | ${count}x |`;
  }).join('\n') : 'No duplicate images found.'}

## Part 6: Original Photography Detection

${possibleOriginals.length > 0 ? `
**${possibleOriginals.length} possible original photographs detected** (by filename pattern):

${possibleOriginals.slice(0, 20).map(i =>
  `| \`${i.name}\` | ${i.board} | Post #${i.postId} |`
).join('\n')}
` : 'No clear original photography patterns detected in filenames.'}

### Posts Claiming Original Photos
${originalPhotosPosts.slice(0, 10).map(p => {
  const excerpt = p.text.substring(0, 150).replace(/\n/g, ' ');
  const imgs = p.images?.map(i => i.name).join(', ') || 'none';
  return `- **Post #${p.post_metadata?.post_id}:** "${excerpt}..." Images: ${imgs}`;
}).join('\n')}

## Part 7: Steganography Indicators

### References in Post Text
${Object.entries(stegoIndicators).filter(([_, c]) => c > 0).map(([ind, count]) =>
  `| ${ind} | ${count} posts |`
).join('\n') || 'No steganography references found in post text.'}

### Steganography Discussion Posts
${stegoDiscussion.slice(0, 5).map(p => {
  const excerpt = p.text.substring(0, 150).replace(/\n/g, ' ');
  return `- Post #${p.post_metadata?.post_id}: "${excerpt}..."`;
}).join('\n') || 'No steganography discussion found.'}

## Part 8: Image-Text Correlation

| Metric | Value |
|---|---|
| Posts with images | ${imgPosts.length} |
| Image-only (no text) | ${imgOnly.length} (${(imgOnly.length/imgPosts.length*100).toFixed(1)}%) |
| Image + text | ${imgWithText.length} (${(imgWithText.length/imgPosts.length*100).toFixed(1)}%) |
| Avg text length (image posts) | ${avgTextImg.toFixed(0)} chars |
| Avg text length (non-image posts) | ${avgTextNoImg.toFixed(0)} chars |

## Part 9: DeepSeek Content Classification

${dsAnalysis || '*DeepSeek analysis unavailable*'}

## Part 10: Forensic Assessment

### What Metadata Reveals

1. **Image posting was significant.** 1,032 of 4,966 posts (20.8%) include images — the author used visual content as a deliberate communication tool, not incidentally.

2. **JPG dominance suggests camera photos and compressed screenshots** rather than generated content. PNG presence indicates screenshots and infographics.

3. **Filename patterns show operational awareness.** ${originalUpload.length > renamedFiles.length ? 'Majority are timestamp-named (original uploads), suggesting less OPSEC concern about filenames.' : 'Mix of timestamp and custom names suggests varying levels of OPSEC awareness.'}

4. **Board migration is visible in image distribution.** Posts shifted from /pol (4chan) to /qresearch (8chan/8kun), with the heaviest image use on /qresearch.

5. **Image reuse is ${duplicates.length > 20 ? 'significant' : 'minimal'}** — ${duplicates.length > 20 ? 'same images posted across multiple contexts, suggesting a curated image library.' : 'most images are unique per post.'}

### What Requires Actual Image Files

The following analyses are NOT possible with metadata alone and would require downloading the actual 1,172 images:

1. **EXIF/metadata extraction** — Camera model, GPS coordinates, software, timestamps embedded in image data. This is the highest-value forensic step.
2. **Steganography scanning** — PixelKnot, F5, LSB, outguess. Cannot be done without pixel data.
3. **Error Level Analysis (ELA)** — Detect compositing, manipulation, re-saves.
4. **Reverse image search** — Determine if images are stock photos, scraped, or genuinely original.
5. **OCR on embedded text** — Extract text from screenshots and document images.
6. **AI-generated image detection** — Not relevant for 2017-2022 timeframe (pre-DALL-E 2).

### Recommended Next Step

To complete Phase 9 fully, download images from:
- **4plebs.org** for /pol/ images (4chan archive)
- **8kun.top** for /qresearch, /patriotsfight images (8chan/8kun)

Priority targets for download: posts claiming original photography (Air Force One, White House), and any images with steganography discussion in post text.

### For Phase 10 (Cross-Domain Convergence)
- If original photos are verified (EXIF with camera data, no prior online appearance), this strengthens insider-access claims
- Image subjects should be cross-referenced against Phase 4 knowledge graph entities
- Steganography findings (if any) should be treated as separate communication layer
`;

fs.writeFileSync(REPORT_PATH, report);
console.log(`Report: ${REPORT_PATH}`);

// Save catalog
fs.writeFileSync(IMAGES_DATA_PATH, JSON.stringify({
  totalImages: catalog.length,
  uniqueImages,
  extensions: extDist,
  namePatterns,
  deviceHits,
  boardDist,
  duplicates: duplicates.slice(0, 50),
  possibleOriginals: possibleOriginals.map(i => ({ name: i.name, file: i.file, board: i.board, postId: i.postId })),
  stegoIndicators
}, null, 2));
console.log(`Catalog: ${IMAGES_DATA_PATH}`);

console.log(`\nPhase 9 complete.`);
