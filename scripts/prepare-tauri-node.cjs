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
  const targetNodeExe = path.join(targetDir, 'obscura-node.exe');
  const legacyNodeExe = path.join(targetDir, 'node.exe');

  ensureDir(targetDir);
  fs.copyFileSync(sourceNodeExe, targetNodeExe);
  // Best-effort cleanup: keeping legacy node.exe can trigger Windows file lock issues
  // during Tauri resource collection.
  try {
    if (fs.existsSync(legacyNodeExe)) {
      fs.unlinkSync(legacyNodeExe);
    }
  } catch {
    // Ignore lock/remove failures; build no longer depends on this filename.
  }

  console.log(`[prepare-tauri-node] Copied ${sourceNodeExe} -> ${targetNodeExe}`);
}

main();
