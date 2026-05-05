const { exec } = require('child_process');
const chokidar = require('chokidar');

// Watch raw-chats folder
const watcher = chokidar.watch('/Users/basicclaw777/raw-chats', {
  ignored: /(^|[\/\\])\../,
  persistent: true
});

console.log('🏛️  Cathedral is watching for new chats...');

watcher.on('add', path => {
  console.log(`📁 New file detected: ${path}`);
  
  // Run harvester
  exec('node ~/nanoclaw/vortex-ready-harvester.cjs', (err, stdout) => {
    console.log(stdout);
    
    // Then run analyst
    exec('node ~/nanoclaw/vortex-analyst.js', (err, stdout) => {
      console.log(stdout);
      console.log('🏛️  Cathedral update complete');
    });
  });
});
