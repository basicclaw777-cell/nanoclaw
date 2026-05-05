const fs = require("fs");
const fetch = require("node-fetch");
const { QdrantClient } = require("@qdrant/js-client-rest");

const manifest = JSON.parse(
  fs.readFileSync("/Users/basicclaw777/nanoclaw/vector_data/nugget-manifest.json")
);

const client = new QdrantClient({
  url: "http://localhost:6333"
});

const COLLECTION = "cathedral_nuggets";

async function setupCollection() {

  try {
    await client.getCollection(COLLECTION);
    console.log("Collection already exists");
  } catch {

    await client.createCollection(COLLECTION, {
      vectors: {
        size: 768,
        distance: "Cosine"
      }
    });

    console.log("Collection created");
  }
}

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

  await setupCollection();

  let count = 0;

  for (const nugget of manifest.nuggets) {

    const vector = await embed(nugget.text);

    await client.upsert(COLLECTION, {
      points: [
        {
          id: count,
          vector: vector,
          payload: nugget
        }
      ]
    });

    count++;

    if (count % 25 === 0) {
      console.log(`Indexed ${count} nuggets`);
    }
  }

  console.log("All nuggets indexed");
}

run();
