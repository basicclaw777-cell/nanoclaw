import fs from 'fs';
import path from 'path';

// Add these imports at the top of the file
const SOCIAL_CONTENT_PATH = path.join(process.env.HOME, 'cathedral-vault', '07_Social_Content');

// Ensure the directory exists
if (!fs.existsSync(SOCIAL_CONTENT_PATH)) {
  fs.mkdirSync(SOCIAL_CONTENT_PATH, { recursive: true });
}

// Add this to track post generation state
const postGenerationState = {};

// New function to generate captions
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

// New function to generate visual direction
async function generateVisualDirection(topic) {
  const systemPrompt = `You are Paul's creative director. 
Generate visual direction for an Instagram post about ${topic}:
- Describe the best photo/clip type
- Suggest mood, lighting, and framing
- Create a detailed AI image generation prompt`;

  const result = await callCloud(systemPrompt, `Create visual direction for ${topic}`);
  return result.response;
}

// Add this to the existing bot commands
bot.onText(/\/post(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = match[1] ? match[1].trim() : null;

  if (!topic) {
    bot.sendMessage(chatId, 
      `🎬 *Post Generator*\n\n` +
      `Generate social media content for Basic Reflex.\n\n` +
      `*Usage:* /post [topic]\n\n` +
      `_Example: /post vortex training_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  bot.sendMessage(chatId, `🌀 _Generating post for "${topic}"..._`, { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');

  try {
    const captions = await generatePostCaptions(topic);
    const visualDirection = await generateVisualDirection(topic);

    // Store state for this chat
    postGenerationState[chatId] = {
      topic,
      captions,
      visualDirection
    };

    let message = `--- CAPTION OPTIONS ---\n`;
    captions.forEach((caption, index) => {
      message += `${index + 1}️⃣ ${caption}\n`;
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

// Modify the existing message handler to capture post caption selection
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

  // Rest of the existing message handler...
});
