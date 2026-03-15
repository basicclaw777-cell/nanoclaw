import http from 'http';
import path from 'path';
import { connect } from '@lancedb/lancedb';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VECTORS_DIR = path.join(process.env.HOME, 'nanoclaw', 'cathedral-vectors');

/**
 * Embeds a query using nomic-embed-text via Ollama
 * @param {string} query - The text to embed
 * @returns {Promise<number[]>} - The embedding vector
 */
export async function embedQuery(query) {
  const payload = JSON.stringify({
    model: 'nomic-embed-text',
    prompt: query,
    stream: false
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.embedding) {
            resolve(parsed.embedding);
          } else {
            reject(new Error('No embedding in response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Embedding request timeout'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Searches the cathedral vectors for semantically similar nuggets
 * @param {string} query - The query to search for
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array<{text: string, score: number}>>} - Matching nuggets with scores
 */
export async function searchVectorStore(query, limit = 5) {
  try {
    console.log(`🔍 Searching vector store for: "${query}"`);
    
    // Get embedding for the query
    const embedding = await embedQuery(query);
    
    // Connect to LanceDB
    const db = await connect(VECTORS_DIR);
    const table = await db.openTable("nuggets");
    
    // Search for similar vectors
    const results = await table.search(embedding)
      .limit(limit)
      .execute();
    
    return results.map(item => ({
      text: item.text,
      score: item.score
    }));
  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
}

/**
 * Formats vector search results into context for the LLM
 * @param {Array<{text: string, score: number}>} results - Search results
 * @returns {string} - Formatted context
 */
export function formatVectorContext(results) {
  if (!results || results.length === 0) {
    return "";
  }
  
  return `\n\nRelevant knowledge from Paul's vault:\n${results.map((r, i) => 
    `[${i+1}] ${r.text}`
  ).join('\n\n')}`;
}
