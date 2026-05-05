const fetch = require("node-fetch");
const { QdrantClient } = require("@qdrant/js-client-rest");

const client = new QdrantClient({
  url: "http://localhost:6333"
});

const COLLECTION = "cathedral_nuggets";

async function embed(text) {

  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "nomic-embed-text",
      prompt: text
    })
  });

  const data = await response.json();
  return data.embedding;
}

async function run() {

  const query = process.argv.slice(2).join(" ");

  if (!query) {
    console.log("Usage: node search.cjs \"your query\"");
    return;
  }

  const vector = await embed(query);

  const results = await client.search(COLLECTION, {
    vector: vector,
    limit: 5
  });

  console.log("\n🔎 Query:", query);
  console.log("\nTop results:\n");

  results.forEach((r, i) => {
    console.log(`Result ${i+1}`);
    console.log("Score:", r.score.toFixed(3));
    console.log("Folder:", r.payload.folder);
    console.log("Depth:", r.payload.depth);
    console.log(r.payload.text);
    console.log("\n-----------------\n");
  });
}

run();

