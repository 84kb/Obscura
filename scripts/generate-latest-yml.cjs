const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function findNewestInstaller(nsisDir) {
  if (!fs.existsSync(nsisDir)) return null
  const files = fs
    .readdirSync(nsisDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /-setup\.exe$/i.test(name))

  if (files.length === 0) return null

  files.sort((a, b) => {
    const aStat = fs.statSync(path.join(nsisDir, a))
    const bStat = fs.statSync(path.join(nsisDir, b))
    return bStat.mtimeMs - aStat.mtimeMs
  })
  return files[0]
}

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512')
  const data = fs.readFileSync(filePath)
  hash.update(data)
  return hash.digest('base64')
}

function buildLatestYml({ version, fileName, sha512, size }) {
  const releaseDate = new Date().toISOString()
  const safeVersion = String(version || '').trim()
  const safeName = String(fileName || '').trim()
  return [
    `version: ${safeVersion}`,
    'files:',
    `  - url: ${safeName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${safeName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n')
}

function main() {
  const root = path.resolve(__dirname, '..')
  const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json')
  const tauriConf = readJson(tauriConfPath)
  const version = String(tauriConf?.version || '').trim()
  if (!version) {
    console.error('[latest.yml] version is missing in src-tauri/tauri.conf.json')
    process.exitCode = 1
    return
  }

  const nsisDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
  const installerName = findNewestInstaller(nsisDir)
  if (!installerName) {
    console.error(`[latest.yml] NSIS installer not found in: ${nsisDir}`)
    process.exitCode = 1
    return
  }

  const installerPath = path.join(nsisDir, installerName)
  const stat = fs.statSync(installerPath)
  const sha512 = sha512Base64(installerPath)
  const latestYml = buildLatestYml({
    version,
    fileName: installerName,
    sha512,
    size: stat.size,
  })

  const outputPath = path.join(nsisDir, 'latest.yml')
  fs.writeFileSync(outputPath, latestYml, 'utf8')
  console.log(`[latest.yml] generated: ${outputPath}`)
}

main()
