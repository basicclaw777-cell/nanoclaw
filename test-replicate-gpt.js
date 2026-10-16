import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';
dotenv.config();

const API_TOKEN = process.env.REPLICATE_API_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';
const imagePath = '/Users/basicclaw777/nanoclaw/reed-lab/reed-sources/gym-empty/4 bags and window wall.jpg';
const outPath = '/Users/basicclaw777/nanoclaw/pro-photo-outbox/4 bags and window wall-gpt2-replicate.png';

const prompt = "Apply a high-end commercial retouch to the attached image. Maintain 100% exact preservation of all subjects, poses, clothing, objects, text, and background elements. Do not add, remove, or alter any content. Do not hallucinate new elements. 16:9 cinematic aspect ratio. Maximum sharpness and resolution. Simulate a 50mm f/2.8 lens on a full-frame sensor. Warm golden sports documentary color grade. Enhance wood floor grain and leather bag textures with age patina. Subtle vignette. Natural skin tones. Professional Lightroom grade of original raw file.";

// Use curl for all API calls — Node fetch has socket issues with Replicate
function curlPost(url, data) {
  const result = execSync(`curl -s -X POST "${url}" -H "Authorization: Bearer ${API_TOKEN}" -H "Content-Type: application/json" -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`, { encoding: 'utf-8', timeout: 30000 });
  return JSON.parse(result);
}

function curlGet(url) {
  const result = execSync(`curl -s "${url}" -H "Authorization: Bearer ${API_TOKEN}"`, { encoding: 'utf-8', timeout: 30000 });
  return JSON.parse(result);
}

// Step 1: Upload
console.log('1. Uploading image...');
const uploadResult = execSync(`curl -s -X POST "https://api.replicate.com/v1/files" -H "Authorization: Bearer ${API_TOKEN}" -F "content=@${imagePath}"`, { encoding: 'utf-8', timeout: 60000 });
const uploadData = JSON.parse(uploadResult);
const imageUrl = uploadData.urls?.get;
console.log('Uploaded:', imageUrl?.slice(0, 60));

// Step 2: Create prediction
console.log('2. Creating GPT Image 2 prediction...');
const prediction = curlPost('https://api.replicate.com/v1/models/openai/gpt-image-2/predictions', {
  input: { prompt, image: imageUrl, size: '1536x1024', quality: 'medium' }
});
console.log('ID:', prediction.id, 'Status:', prediction.status);

// Step 3: Poll
console.log('3. Polling...');
const pollUrl = prediction.urls?.get;
for (let i = 0; i < 40; i++) {
  execSync('sleep 5');
  try {
    const poll = curlGet(pollUrl);
    console.log(`  ${i+1}: ${poll.status}`);

    if (poll.status === 'succeeded') {
      const output = poll.output;
      const resultUrl = Array.isArray(output) ? output[0] : output;
      console.log('Output:', typeof resultUrl === 'string' ? resultUrl.slice(0, 80) : JSON.stringify(output).slice(0, 200));

      if (typeof resultUrl === 'string' && resultUrl.startsWith('http')) {
        execSync(`curl -sL "${resultUrl}" -o "${outPath}"`, { timeout: 60000 });
        const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
        console.log(`Saved: ${outPath} (${sizeMB}MB)`);
        execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto" -F chat_id=${CHAT_ID} -F photo=@"${outPath}" -F caption="GPT Image 2 via Replicate — same model as Higgsfield"`, { stdio: 'pipe' });
        console.log('Sent to Telegram!');
      }
      break;
    }

    if (poll.status === 'failed') {
      console.error('FAILED:', poll.error);
      break;
    }
  } catch (e) {
    console.log(`  ${i+1}: parse error, retrying...`);
  }
}
