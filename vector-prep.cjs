const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const CONFIG = {
    vaultDir: '/Users/basicclaw777/cathedral-vault/02_Refined_Gold',
    outputDir: '/Users/basicclaw777/nanoclaw/vector_data/nuggets',
    metadataFile: '/Users/basicclaw777/nanoclaw/vector_data/nugget-manifest.json'
};

const thinkingModeMap = {
  boxing: "tactical",
  business: "strategic",
  philosophy: "conceptual",
  universe: "pattern"
};

async function run() {

    await fs.mkdir(CONFIG.outputDir, { recursive: true });

    const files = await fs.readdir(CONFIG.vaultDir);
    const nuggetFiles = files.filter(f => f.endsWith('.md'));

    console.log(`📁 Found ${nuggetFiles.length} files`);

    const allNuggets = [];

    for (const file of nuggetFiles) {

        const filePath = path.join(CONFIG.vaultDir, file);
        const content = await fs.readFile(filePath, 'utf8');

        const nuggetRegex = /## Nugget \d+ \(depth: (\d+)%\)\n([\s\S]*?)(?=\n## Nugget|\n---|$)/g;

        let match;

        while ((match = nuggetRegex.exec(content)) !== null) {

            const depth = parseInt(match[1]);
            const text = match[2].trim();

            if (text.length < 20) continue;

            const nuggetId = crypto
                .createHash('md5')
                .update(text)
                .digest('hex')
                .substring(0,8);

            const folderMatch = content.match(/folder:\s*(.*)/);
            const folder = folderMatch ? folderMatch[1].trim() : "unknown";

            const nugget = {
                id: `${file}_${nuggetId}`,
                text: text,
                depth: depth,
                folder: folder,
                thinking_mode: thinkingModeMap[folder] || "general",
                source_file: file,
                length: text.length,
                wordCount: text.split(/\s+/).length
            };

            allNuggets.push(nugget);

            const nuggetPath = path.join(CONFIG.outputDir, `${nugget.id}.txt`);
            await fs.writeFile(nuggetPath, text);
        }
    }

    const manifest = {
        generated: new Date().toISOString(),
        totalNuggets: allNuggets.length,
        nuggets: allNuggets
    };

    await fs.writeFile(
        CONFIG.metadataFile,
        JSON.stringify(manifest,null,2)
    );

    console.log("✅ Nugget extraction complete");
    console.log(`Total nuggets: ${allNuggets.length}`);
}

run();
