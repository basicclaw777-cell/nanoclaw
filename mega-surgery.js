import Database from 'better-sqlite3';
import fs from 'fs';

const graphDb = new Database(process.env.HOME + '/nanoclaw/vortex_data/knowledge-graph.db', { readonly: true });
const metricsDb = new Database(process.env.HOME + '/nanoclaw/vortex_data/metrics.db', { readonly: true });

// Get mega-cluster items
const megaItems = graphDb.prepare(`
  SELECT file_path, domain, title, centroid_distance
  FROM clusters WHERE cluster_id = (
    SELECT cluster_id FROM clusters GROUP BY cluster_id ORDER BY COUNT(*) DESC LIMIT 1
  ) ORDER BY centroid_distance
`).all();

console.log('Mega-cluster items:', megaItems.length);

// Get embeddings for these items
const embData = [];
for (const item of megaItems) {
  const emb = metricsDb.prepare('SELECT embedding, title, domain, file_path FROM vault_embeddings WHERE file_path = ?').get(item.file_path);
  if (emb && emb.embedding) {
    const buf = Buffer.from(emb.embedding);
    const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    embData.push({
      title: item.title || emb.title,
      domain: item.domain || emb.domain,
      dist: item.centroid_distance,
      vec: Array.from(vec)
    });
  }
}

console.log('Items with embeddings:', embData.length);

const K = 6;
const DIM = 768;

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < DIM; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// K-means++ init
let centroids = [embData[0].vec];
for (let k = 1; k < K; k++) {
  const dists = embData.map(d => {
    const maxSim = Math.max(...centroids.map(c => cosine(d.vec, c)));
    return 1 - maxSim;
  });
  const total = dists.reduce((s, d) => s + d*d, 0);
  let r = Math.random() * total;
  for (let i = 0; i < dists.length; i++) {
    r -= dists[i]*dists[i];
    if (r <= 0) { centroids.push(embData[i].vec); break; }
  }
}

// K-means iterations
let assignments = new Array(embData.length).fill(0);
for (let iter = 0; iter < 20; iter++) {
  for (let i = 0; i < embData.length; i++) {
    let bestK = 0, bestSim = -1;
    for (let k = 0; k < K; k++) {
      const sim = cosine(embData[i].vec, centroids[k]);
      if (sim > bestSim) { bestSim = sim; bestK = k; }
    }
    assignments[i] = bestK;
  }
  for (let k = 0; k < K; k++) {
    const members = embData.filter((_, i) => assignments[i] === k);
    if (members.length === 0) continue;
    const newC = new Array(DIM).fill(0);
    for (const m of members) for (let d = 0; d < DIM; d++) newC[d] += m.vec[d];
    for (let d = 0; d < DIM; d++) newC[d] /= members.length;
    centroids[k] = newC;
  }
}

// Build sub-cluster summaries
const subClusters = [];
for (let k = 0; k < K; k++) {
  const members = embData
    .map((d, i) => ({ ...d, idx: i }))
    .filter((_, i) => assignments[i] === k)
    .map(d => {
      const sim = cosine(d.vec, centroids[k]);
      return { title: d.title, domain: d.domain, dist: d.dist, sim };
    })
    .sort((a, b) => b.sim - a.sim);

  const domains = {};
  for (const m of members) domains[m.domain] = (domains[m.domain] || 0) + 1;

  subClusters.push({
    id: k,
    size: members.length,
    domains,
    core: members.slice(0, 8).map(m => `[${m.domain}] ${(m.title||'').slice(0,70)}`),
    edge: members.slice(-3).map(m => `[${m.domain}] ${(m.title||'').slice(0,70)}`)
  });
}

subClusters.sort((a, b) => b.size - a.size);

for (const sc of subClusters) {
  const topDomains = Object.entries(sc.domains).sort((a,b) => b[1]-a[1]).slice(0,3).map(([d,c]) => `${d}(${c})`).join(', ');
  console.log(`\n=== SUB-CLUSTER ${sc.id} — ${sc.size} items — ${topDomains} ===`);
  console.log('Core:');
  for (const c of sc.core) console.log('  ' + c);
  if (sc.edge.length && sc.size > 5) {
    console.log('Edge:');
    for (const e of sc.edge) console.log('  ' + e);
  }
}

// Export for visualization
const vizData = subClusters.map(sc => ({
  id: sc.id, size: sc.size, domains: sc.domains, core: sc.core
}));
const memberData = embData.map((d, i) => ({
  title: d.title, domain: d.domain, subCluster: assignments[i]
}));

fs.writeFileSync('/tmp/mega-surgery-data.json', JSON.stringify({ subClusters: vizData, members: memberData }));
console.log('\nExported to /tmp/mega-surgery-data.json');

graphDb.close();
metricsDb.close();
