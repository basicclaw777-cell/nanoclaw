import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
dotenv.config({ path: '/Users/basicclaw777/nanoclaw/.env' });

const API_KEY = process.env.LEONARDO_API_KEY;
const API_BASE = 'https://cloud.leonardo.ai/api/rest/v1';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

const imagePath = '/Users/basicclaw777/nanoclaw/reed-lab/reed-sources/gym-empty/4 bags and window wall.jpg';

// Step 1: Upload image
console.log('1. Getting presigned upload URL...');
const initResp = await fetch(`${API_BASE}/init-image`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ extension: 'jpg' })
});
const initData = await initResp.json();
const { url: uploadUrl, fields, id: imageId } = initData?.uploadInitImage || {};
console.log('Image ID:', imageId);

console.log('2. Uploading to S3...');
const fileData = fs.readFileSync(imagePath);
const formData = new FormData();
const parsedFields = JSON.parse(typeof fields === 'string' ? fields : JSON.stringify(fields));
for (const [key, value] of Object.entries(parsedFields)) formData.append(key, value);
formData.append('file', new Blob([fileData], { type: 'image/jpeg' }), path.basename(imagePath));
const uploadResp = await fetch(uploadUrl, { method: 'POST', body: formData });
console.log('Upload:', uploadResp.status);

// Step 3: Generate — try Phoenix 2.0 with alchemy
console.log('3. Generating img2img with Phoenix 2.0...');
const prompt = "Color grade only. Contrast +10. Shadows +15. Temperature 5400K. Saturation +5. Sharpening +60. Clarity +30. Subtle vignette. Do not change any content in the image.";

let generationId;

// Attempt 1: Phoenix 2.0 + alchemy
let genResp = await fetch(`${API_BASE}/generations`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt, height: 768, width: 1360, num_images: 1,
    init_image_id: imageId, init_strength: 0.1,
    modelId: "de7d3faf-762f-48e0-b3b7-9d27a2d6c8e9", alchemy: true
  })
});

if (!genResp.ok) {
  console.log('Phoenix 2.0 failed, trying without model ID...');
  // Attempt 2: Default model
  genResp = await fetch(`${API_BASE}/generations`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt, height: 768, width: 1360, num_images: 1,
      init_image_id: imageId, init_strength: 0.1
    })
  });
}

if (!genResp.ok) {
  const err = await genResp.text();
  console.error('All attempts failed:', genResp.status, err.slice(0, 500));
  process.exit(1);
}

const genData = await genResp.json();
console.log('Response:', JSON.stringify(genData, null, 2).slice(0, 400));
generationId = genData?.sdGenerationJob?.generationId;
console.log('Generation ID:', generationId);

// Step 4: Poll for result
console.log('4. Polling...');
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const pollResp = await fetch(`${API_BASE}/generations/${generationId}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  const pollData = await pollResp.json();
  const gen = pollData?.generations_by_pk;
  const status = gen?.status;
  console.log(`  Poll ${i+1}: ${status}`);

  if (status === 'COMPLETE') {
    const images = gen?.generated_images;
    if (images?.length > 0) {
      const resultUrl = images[0].url;
      console.log('Result URL:', resultUrl.slice(0, 80));
      const outPath = '/Users/basicclaw777/nanoclaw/pro-photo-outbox/4 bags and window wall-leonardo.png';
      const imgResp = await fetch(resultUrl);
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      fs.writeFileSync(outPath, imgBuf);
      console.log('Saved:', outPath, `(${(imgBuf.length/1024/1024).toFixed(1)}MB)`);
      execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto" -F chat_id=${CHAT_ID} -F photo=@"${outPath}" -F caption="Leonardo test 2 - strength 0.1, color grade only prompt"`, { stdio: 'pipe' });
      console.log('Sent to Telegram!');
    }
    break;
  }
  if (status === 'FAILED') { console.error('FAILED'); break; }
}
