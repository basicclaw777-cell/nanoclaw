const http = require("http");
const path = require("path");
const { connect } = require("@lancedb/lancedb");

const VECTORS_DIR = path.join(process.env.HOME, "nanoclaw", "cathedral-vectors");

async function embedQuery(query) {
  const payload = JSON.stringify({
    model: "nomic-embed-text",
    prompt: query,
    stream: false
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 11434,
      path: "/api/embeddings",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        const parsed = JSON.parse(data);
        resolve(parsed.embedding);
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function searchVectorStore(query, limit = 5) {
  const embedding = await embedQuery(query);

  const db = await connect(VECTORS_DIR);
  const table = await db.openTable("nuggets");

  const result = await table.search(embedding).limit(limit).execute();

let rows;

if (Array.isArray(result)) {
  rows = result;
} else if (result.rows && Array.isArray(result.rows)) {
  rows = result.rows;
} else if (typeof result.toArray === "function") {
  rows = result.toArray();
} else if (typeof result.toJSON === "function") {
  rows = result.toJSON();
} else {
  rows = [];
}

return rows.map(r => ({
  text: r.text,
  score: r.score
}));
}

function formatVectorContext(results) {
  if (!results || results.length === 0) return "";

  return (
    "\n\nRelevant knowledge from Paul's vault:\n" +
    results.map((r, i) => `[${i + 1}] ${r.text}`).join("\n\n")
  );
}

module.exports = {
  searchVectorStore,
  formatVectorContext,
  embedQuery
};
