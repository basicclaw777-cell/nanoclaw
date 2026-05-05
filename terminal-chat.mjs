import readline from 'readline';
import https from 'https';

const OPENROUTER_KEY = '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';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\n\x1b[36mYou: \x1b[0m'
});

async function askClaude(question) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: 'You are the Manager of an AI team with Researcher and Analyst agents. Help the user with their knowledgebase.' },
        { role: 'user', content: question }
      ],
      max_tokens: 1000
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'http://localhost',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let response = '';
      res.on('data', (chunk) => response += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(response);
          console.log('\n\x1b[32mAI Manager:\x1b[0m', parsed.choices[0].message.content);
          rl.prompt();
        } catch (e) {
          console.error('Error:', e);
          rl.prompt();
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

console.log('\n\x1b[35m🤖 AI Management Team Ready!\x1b[0m');
console.log('Type your questions (or "exit" to quit)\n');
rl.prompt();

rl.on('line', async (line) => {
  if (line.toLowerCase() === 'exit') {
    console.log('Goodbye!');
    process.exit(0);
  }
  await askClaude(line);
}).on('close', () => {
  process.exit(0);
});
