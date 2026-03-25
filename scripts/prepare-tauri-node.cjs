const fs = require('node:fs');
const path = require('node:path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  if (process.platform !== 'win32') {
    console.log('[prepare-tauri-node] Skip: non-Windows platform');
    return;
  }

  const sourceNodeExe = process.execPath;
  const targetDir = path.resolve(__dirname, '../build/bin');
  const targetNodeExe = path.join(targetDir, 'node.exe');

  ensureDir(targetDir);
  fs.copyFileSync(sourceNodeExe, targetNodeExe);

  console.log(`[prepare-tauri-node] Copied ${sourceNodeExe} -> ${targetNodeExe}`);
}

main();
