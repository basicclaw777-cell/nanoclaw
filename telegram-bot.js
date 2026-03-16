import fs from 'fs';
import path from 'path';
import TelegramBot from 'node-telegram-bot-api';

const token = process.env.TELEGRAM_TOKEN;

// Placeholder functions - these should be implemented with actual logic
async function searchVectorStore(topic) {
  return []; // Placeholder
}

function formatVectorContext(vectorResults) {
  return vectorResults.join('\n'); // Placeholder
}

async function callCloud(systemPrompt, description) {
  return { response: 'Placeholder response' }; // Placeholder
}

const SOCIAL_CONTENT_PATH = path.join(process.env.HOME, 'cathedral-vault', '07_Social_Content');

// Ensure the directory exists
if (!fs.existsSync(SOCIAL_CONTENT_PATH)) {
  fs.mkdirSync(SOCIAL_CONTENT_PATH, { recursive: true });
}

// Initialize bot
const bot = new TelegramBot(token, {
  polling: true
});

// Track post generation state
const postGenerationState = {};

// Generate captions
async function generatePostCaptions(topic) {
  const vectorResults = await searchVectorStore(topic);
  const vectorContext = formatVectorContext(vectorResults);

  const systemPrompt = `You are Paul from Basic Reflex, a boxing gym owner and philosopher in Hong Kong. 
Generate 3 Instagram captions about ${topic} using these contextual nuggets:
${vectorContext}

Your captions must:
- Reflect Paul's philosophical, direct voice
- Include IntegrityOS, Saper Vedere, vortex flow, or Wu Wang concepts
- End with 3-5 hashtags including #BasicReflex and #BoxingHK
- Vary in length and depth: short/punchy, educational, philosophical`;

  const result = await callCloud(systemPrompt, `Generate 3 Instagram captions about ${topic}`);
  
  // Parse the response into captions
  const captions = result.response.split(/\n\n/).filter(c => c.trim().length > 10).slice(0, 3);
  
  return captions;
}

// Generate visual direction
async function generateVisualDirection(topic) {
  const systemPrompt = `You are Paul's creative director. 
Generate visual direction for an Instagram post about ${topic}:
- Describe the best photo/clip type
- Suggest mood, lighting, and framing
- Create a detailed AI image generation prompt`;

  const result = await callCloud(systemPrompt, `Create visual direction for ${topic}`);
  return result.response;
}

// Post command handler
bot.onText(/\/post (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = match[1];

  try {
    // Generate captions and visual direction
    const captions = await generatePostCaptions(topic);
    const visualDirection = await generateVisualDirection(topic);

    // Store state for this chat
    postGenerationState[chatId] = {
      topic,
      captions,
      visualDirection
    };

    // Construct message with captions
    let message = `📝 Post Captions for "${topic}":\n\n`;
    captions.forEach((caption, index) => {
      message += `${index + 1}. ${caption}\n\n`;
    });

    message += `\n--- VISUAL DIRECTION ---\n${visualDirection}`;

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['1', '2', '3']],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    });

  } catch (error) {
    console.error('Post generation error:', error);
    bot.sendMessage(chatId, `⚠️ Post generation failed: ${error.message}`);
  }
});

// Caption selection handler
bot.on('message', async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const postState = postGenerationState[chatId];

  // Check if this is a caption selection for a recently generated post
  if (postState && ['1', '2', '3'].includes(msg.text)) {
    const index = parseInt(msg.text) - 1;
    const selectedCaption = postState.captions[index];
    const topic = postState.topic;
    const visualDirection = postState.visualDirection;

    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0];
    const filename = `${today}-${topic.replace(/\s+/g, '-')}-caption.md`;
    const filepath = path.join(SOCIAL_CONTENT_PATH, filename);

    // Write to file
    const fileContent = 
      `# ${topic.toUpperCase()} POST\n\n` +
      `## Caption\n\n${selectedCaption}\n\n` +
      `## Visual Direction\n\n${visualDirection}`;

    fs.writeFileSync(filepath, fileContent);

    // Clear the state and send confirmation
    delete postGenerationState[chatId];

    bot.sendMessage(chatId, 
      `✅ Saved to vault: ${filename}\n` +
      `🌀 Ready to post on Basic Reflex social channels.`, 
      { 
        reply_markup: { remove_keyboard: true } 
      }
    );

    return;
  }
});
