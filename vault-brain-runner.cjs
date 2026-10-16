// CJS wrapper — PM2 can't run ESM directly
process.on('uncaughtException', (e) => {
  console.error('[vault-brain] Uncaught:', e.message, e.stack);
});
process.on('unhandledRejection', (e) => {
  console.error('[vault-brain] Unhandled:', e?.message || e);
});

import('./vault-brain.js').then(mod => {
  console.log('[vault-brain] Starting watcher via PM2...');
  mod.startBrainWatcher();
}).catch(e => {
  console.error('[vault-brain] Import failed:', e.message, e.stack);
});
