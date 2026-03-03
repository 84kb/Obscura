#!/usr/bin/env node

const { spawnSync } = require('node:child_process')

function parsePortArg() {
  const raw = process.argv[2]
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`[free-port] invalid port: ${raw || '(empty)'}`)
    process.exit(1)
  }
  return port
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
  })
}

function freePortWindows(port) {
  const proc = run('powershell', [
    '-NoProfile',
    '-Command',
    `$ErrorActionPreference='SilentlyContinue'; Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq ${port} } | Select-Object -ExpandProperty OwningProcess`,
  ])
  if (proc.status !== 0) {
    return
  }

  const lines = String(proc.stdout || '').split(/\r?\n/)
  const pids = new Set()
  for (const line of lines) {
    const pid = Number(line.trim() || 0)
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid)
    }
  }

  for (const pid of pids) {
    const killed = run('taskkill', ['/PID', String(pid), '/F'])
    if (killed.status === 0) {
      console.log(`[free-port] killed PID ${pid} on tcp/${port}`)
    }
  }
}

function freePortUnix(port) {
  const proc = run('lsof', ['-ti', `tcp:${port}`])
  if (proc.status !== 0) {
    return
  }
  const pids = String(proc.stdout || '')
    .split(/\r?\n/)
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0)

  const uniq = Array.from(new Set(pids))
  for (const pid of uniq) {
    const killed = run('kill', ['-9', String(pid)])
    if (killed.status === 0) {
      console.log(`[free-port] killed PID ${pid} on tcp/${port}`)
    }
  }
}

function main() {
  const port = parsePortArg()
  if (process.platform === 'win32') {
    freePortWindows(port)
    return
  }
  freePortUnix(port)
}

main()
