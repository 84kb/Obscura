#!/usr/bin/env node

const { spawnSync } = require('node:child_process')

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
  })
}

function killWindows() {
  // Ignore errors if process does not exist.
  run('taskkill', ['/IM', 'obscura-tauri.exe', '/F'])
}

function killUnix() {
  run('pkill', ['-f', 'obscura-tauri'])
}

if (process.platform === 'win32') {
  killWindows()
} else {
  killUnix()
}

