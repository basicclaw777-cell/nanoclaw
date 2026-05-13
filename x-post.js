/**
 * x-post.js — X/Twitter posting via @the-convocation/twitter-scraper
 *
 * Usage:
 *   node x-post.js login USERNAME PASSWORD [EMAIL]   # First-time login
 *   node x-post.js post "text"                       # Post a tweet
 *   node x-post.js reply TWEET_ID "text"             # Reply to tweet
 *   node x-post.js thread "p1" "p2" "p3"             # Post thread
 *   node x-post.js whoami                             # Check auth
 */

import { Scraper } from '@the-convocation/twitter-scraper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, 'x-cookies.json');

async function getClient() {
  const scraper = new Scraper();
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('ERROR: Not logged in. Run: node x-post.js login USERNAME PASSWORD [EMAIL]');
    process.exit(1);
  }
  const cookieData = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  await scraper.setCookies(cookieData);
  const loggedIn = await scraper.isLoggedIn();
  if (!loggedIn) {
    console.error('ERROR: Session expired. Run: node x-post.js login USERNAME PASSWORD [EMAIL]');
    process.exit(1);
  }
  return scraper;
}

async function doLogin(username, password, email) {
  const scraper = new Scraper();
  await scraper.login(username, password, email);
  const loggedIn = await scraper.isLoggedIn();
  if (!loggedIn) {
    console.error('Login failed');
    process.exit(1);
  }
  const cookies = await scraper.getCookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log(`Logged in. Cookies saved to ${COOKIES_PATH}`);
  const profile = await scraper.getProfile(username);
  console.log(`Authenticated as: @${profile.username} (${profile.name})`);
}

async function doPost(text) {
  const scraper = await getClient();
  const result = await scraper.sendTweet(text);
  // sendTweet returns a Response object, extract tweet ID from it
  const body = await result.json();
  const tweetId = body?.data?.create_tweet?.tweet_results?.result?.rest_id;
  const output = { id: tweetId, text, url: `https://x.com/i/status/${tweetId}` };
  console.log(JSON.stringify(output));
  return output;
}

async function doReply(tweetId, text) {
  // Extract ID from URL if needed
  if (tweetId.includes('x.com') || tweetId.includes('twitter.com')) {
    tweetId = tweetId.replace(/\/$/, '').split('/').pop();
  }
  const scraper = await getClient();
  const result = await scraper.sendTweet(text, tweetId);
  const body = await result.json();
  const replyId = body?.data?.create_tweet?.tweet_results?.result?.rest_id;
  const output = { id: replyId, reply_to: tweetId, text, url: `https://x.com/i/status/${replyId}` };
  console.log(JSON.stringify(output));
  return output;
}

async function doThread(texts) {
  const scraper = await getClient();
  const results = [];
  let replyTo = null;
  for (let i = 0; i < texts.length; i++) {
    const result = replyTo
      ? await scraper.sendTweet(texts[i], replyTo)
      : await scraper.sendTweet(texts[i]);
    const body = await result.json();
    const tweetId = body?.data?.create_tweet?.tweet_results?.result?.rest_id;
    replyTo = tweetId;
    results.push({ id: tweetId, part: i + 1, text: texts[i], url: `https://x.com/i/status/${tweetId}` });
  }
  console.log(JSON.stringify(results));
  return results;
}

async function doWhoami() {
  const scraper = await getClient();
  // Get own profile via cookies — extract username from auth token cookie
  const cookies = await scraper.getCookies();
  const loggedIn = await scraper.isLoggedIn();
  const output = { logged_in: loggedIn, cookies_count: cookies.length };
  console.log(JSON.stringify(output));
  return output;
}

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd) {
  console.log('Usage: node x-post.js login|post|reply|thread|whoami');
  process.exit(1);
}

try {
  if (cmd === 'login') {
    if (args.length < 3) {
      console.error('Usage: node x-post.js login USERNAME PASSWORD [EMAIL]');
      process.exit(1);
    }
    await doLogin(args[1], args[2], args[3]);
  } else if (cmd === 'post') {
    await doPost(args[1]);
  } else if (cmd === 'reply') {
    await doReply(args[1], args[2]);
  } else if (cmd === 'thread') {
    await doThread(args.slice(1));
  } else if (cmd === 'whoami') {
    await doWhoami();
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
