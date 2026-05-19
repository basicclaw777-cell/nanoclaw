import Database from 'better-sqlite3';
const db = new Database(process.env.HOME + '/nanoclaw/vortex_data/knowledge-graph.db', { readonly: true });

const clusters = db.prepare(`
  SELECT cluster_id, COUNT(*) as size, GROUP_CONCAT(DISTINCT domain) as domains
  FROM clusters GROUP BY cluster_id ORDER BY size DESC LIMIT 1
`).get();

console.log('MEGA-CLUSTER:', clusters.cluster_id, '— Size:', clusters.size);
console.log('Domains:', clusters.domains);
console.log('');

const items = db.prepare(`
  SELECT domain, title, centroid_distance
  FROM clusters WHERE cluster_id = ?
  ORDER BY domain, centroid_distance ASC
`).all(clusters.cluster_id);

const byDomain = {};
for (const item of items) {
  if (!byDomain[item.domain]) byDomain[item.domain] = [];
  byDomain[item.domain].push(item);
}

for (const [domain, nuggets] of Object.entries(byDomain).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`[${domain}] (${nuggets.length} nuggets):`);
  for (const n of nuggets.slice(0, 5)) {
    console.log(`  ${n.centroid_distance.toFixed(3)} | ${n.title?.slice(0, 80)}`);
  }
  if (nuggets.length > 5) console.log(`  ... +${nuggets.length - 5} more`);
  console.log('');
}

db.close();
