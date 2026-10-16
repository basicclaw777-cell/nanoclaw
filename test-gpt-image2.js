import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';
dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

const imagePath = '/Users/basicclaw777/nanoclaw/reed-lab/reed-sources/gym-empty/4 bags and window wall.jpg';
const outPath = '/Users/basicclaw777/nanoclaw/pro-photo-outbox/4 bags and window wall-gpt-image2.png';

// Same prompt that worked on Higgsfield GPT Image 2
const prompt = "Apply a high-end commercial retouch to the attached image. Maintain 100% exact preservation of all subjects, poses, clothing, objects, text, and background elements. Do not add, remove, or alter any content. Do not hallucinate new elements. 16:9 cinematic aspect ratio. Maximum sharpness and resolution. Simulate a 50mm f/2.8 lens on a full-frame sensor. Warm golden sports documentary color grade. Enhance wood floor grain and leather bag textures with age patina. Subtle vignette. Natural skin tones. Professional Lightroom grade of original raw file.";

console.log('Calling GPT Image 2 edit API...');
const formData = new FormData();
formData.append('model', 'gpt-image-2');
formData.append('prompt', prompt);
formData.append('image', new Blob([fs.readFileSync(imagePath)], { type: 'image/jpeg' }), '4bags.jpg');
formData.append('size', '1536x1024');  // closest to 16:9
formData.append('quality', 'medium');

const resp = await fetch('https://api.openai.com/v1/images/edits', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}` },
  body: formData
});

if (!resp.ok) {
  const err = await resp.text();
  console.error('Failed:', resp.status, err.slice(0, 500));
  process.exit(1);
}

const data = await resp.json();
console.log('Response received');

// GPT Image 2 returns base64 or URL
const imageData = data.data?.[0];
if (imageData?.b64_json) {
  fs.writeFileSync(outPath, Buffer.from(imageData.b64_json, 'base64'));
} else if (imageData?.url) {
  const imgResp = await fetch(imageData.url);
  fs.writeFileSync(outPath, Buffer.from(await imgResp.arrayBuffer()));
} else {
  console.error('No image in response:', JSON.stringify(data).slice(0, 300));
  process.exit(1);
}

const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
console.log(`Saved: ${outPath} (${sizeMB}MB)`);

execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto" -F chat_id=${CHAT_ID} -F photo=@"${outPath}" -F caption="GPT Image 2 direct API — same model as Higgsfield, no middleman"`, { stdio: 'pipe' });
console.log('Sent to Telegram!');
