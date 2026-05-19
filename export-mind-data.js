import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database(process.env.HOME + '/nanoclaw/vortex_data/knowledge-graph.db', { readonly: true });

const allItems = db.prepare('SELECT cluster_id, domain, title, centroid_distance FROM clusters ORDER BY cluster_id, centroid_distance').all();

const clusters = {};
for (const item of allItems) {
  if (!clusters[item.cluster_id]) clusters[item.cluster_id] = { items: [], domains: {} };
  clusters[item.cluster_id].items.push(item);
  clusters[item.cluster_id].domains[item.domain] = (clusters[item.cluster_id].domains[item.domain] || 0) + 1;
}

const output = Object.entries(clusters).map(([id, c]) => ({
  id: parseInt(id),
  size: c.items.length,
  domainCount: Object.keys(c.domains).length,
  domains: c.domains,
  coreItems: c.items.slice(0, 10).map(i => ({ title: i.title, domain: i.domain, dist: i.centroid_distance })),
  avgDist: c.items.reduce((s, i) => s + i.centroid_distance, 0) / c.items.length
}));

const bridges = db.prepare(`
  SELECT source_domain, target_domain, source_title, target_title, similarity
  FROM connections WHERE is_cross_domain = 1
  ORDER BY similarity DESC LIMIT 80
`).all();

fs.writeFileSync('/tmp/mind-map-data.json', JSON.stringify({ clusters: output, bridges }));
console.log('Exported:', output.length, 'clusters,', bridges.length, 'bridges');
db.close();
