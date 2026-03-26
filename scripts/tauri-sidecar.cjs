#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')

let machineIdSync = null
try {
  ; ({ machineIdSync } = require('node-machine-id'))
} catch {
  machineIdSync = null
}

let shuttingDown = false
let activeLibraryPath = null
let mediaIndexById = new Map()
let cachedLibraryPath = null
let cachedScannedMedia = []
let mediaDataRevision = 0
let cachedMergedLibraryPath = null
let cachedMergedRevision = -1
let cachedMergedMedia = []
let cachedFilteredRevision = -1
let cachedFilteredKey = ''
let cachedFilteredMedia = []
const cachedLocalMetaByLibrary = new Map()
let cachedResolvedTfLibraryPath = null
let cachedResolvedTfRevision = -1
let cachedResolvedTf = { tags: [], folders: [] }
let pendingUpdateInstallerPath = null
let discordRpcModule = null
let discordClient = null
let discordReady = false
let ffmpegHwaccelAvailable = true
let networkServer = null
let networkServerPort = null
let networkServerHost = null

const DISCORD_CLIENT_ID = '1462710290322952234'

function send(message) {
  try {
    process.stdout.write(JSON.stringify(message) + '\n')
  } catch {
    // ignore
  }
}

function getPluginDir() {
  const fromEnv = process.env.OBSCURA_PLUGIN_DIR
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  return path.resolve(__dirname, '..', 'plugins')
}

function ensurePluginDir() {
  const dir = getPluginDir()
  ensureDir(dir)
  return dir
}

function getDataRoot() {
  const fromEnv = process.env.OBSCURA_SIDECAR_DATA_DIR
  if (fromEnv) return fromEnv
  return path.resolve(__dirname, '..', '.sidecar-data')
}

function appendDebugLog(line) {
  try {
    const root = getDataRoot()
    ensureDir(root)
    const target = path.join(root, 'debug-fileops.log')
    const ts = new Date().toISOString()
    fs.appendFileSync(target, `[${ts}] ${String(line || '')}\n`, 'utf8')
  } catch {
    // Ignore debug log errors.
  }
}

function getUpdateDir() {
  const dir = path.join(getDataRoot(), 'updates')
  ensureDir(dir)
  return dir
}

function getManagedBinDir() {
  const dir = path.join(getDataRoot(), 'bin')
  ensureDir(dir)
  return dir
}

function audioConfigPath() {
  return path.join(getDataRoot(), 'audio-config.json')
}

function loadAudioConfig() {
  const raw = readJsonIfExists(audioConfigPath(), {})
  return {
    selectedDevice: String(raw?.selectedDevice || 'default'),
    exclusiveMode: Boolean(raw?.exclusiveMode),
  }
}

function saveAudioConfig(config) {
  fs.writeFileSync(audioConfigPath(), JSON.stringify({
    selectedDevice: String(config?.selectedDevice || 'default'),
    exclusiveMode: Boolean(config?.exclusiveMode),
  }, null, 2), 'utf8')
}

function serverConfigPath() {
  return path.join(getDataRoot(), 'server-config.json')
}

function serverStatePath() {
  return path.join(getDataRoot(), 'server-state.json')
}

function sharedUsersPath() {
  return path.join(getDataRoot(), 'shared-users.json')
}

function createHostSecret() {
  return crypto.randomBytes(16).toString('hex')
}

function getDefaultServerConfig() {
  return {
    isEnabled: false,
    port: 53913,
    hostSecret: createHostSecret(),
    allowedIPs: [],
    maxConnections: 10,
    maxUploadSize: 100,
    maxUploadRate: 10,
    enableAuditLog: true,
    requireHttps: false,
    sslCertPath: '',
    sslKeyPath: '',
    publishLibraryPath: '',
  }
}

function loadServerConfig() {
  const configFile = serverConfigPath()
  ensureDir(path.dirname(configFile))
  const hasFile = fs.existsSync(configFile)
  const fallback = getDefaultServerConfig()
  const raw = readJsonIfExists(configFile, {})
  const merged = {
    ...fallback,
    ...(raw && typeof raw === 'object' ? raw : {}),
  }
  if (!merged.hostSecret || typeof merged.hostSecret !== 'string') {
    merged.hostSecret = createHostSecret()
  }
  if (!hasFile) {
    try {
      fs.writeFileSync(configFile, JSON.stringify(merged, null, 2), 'utf8')
    } catch {
      // ignore
    }
  }
  return merged
}

function saveServerConfig(nextConfig) {
  ensureDir(path.dirname(serverConfigPath()))
  const normalized = {
    ...getDefaultServerConfig(),
    ...(nextConfig && typeof nextConfig === 'object' ? nextConfig : {}),
  }
  if (!normalized.hostSecret || typeof normalized.hostSecret !== 'string') {
    normalized.hostSecret = createHostSecret()
  }
  fs.writeFileSync(serverConfigPath(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

function loadServerState() {
  const raw = readJsonIfExists(serverStatePath(), {})
  return {
    running: Boolean(raw?.running),
  }
}

function saveServerState(next) {
  ensureDir(path.dirname(serverStatePath()))
  const normalized = { running: Boolean(next?.running) }
  fs.writeFileSync(serverStatePath(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

function loadSharedUsers() {
  return asArray(readJsonIfExists(sharedUsersPath(), []))
}

function saveSharedUsers(users) {
  ensureDir(path.dirname(sharedUsersPath()))
  fs.writeFileSync(sharedUsersPath(), JSON.stringify(asArray(users), null, 2), 'utf8')
}

function parseRequestUrl(req) {
  try {
    return new URL(String(req?.url || '/'), 'http://localhost')
  } catch {
    return new URL('http://localhost/')
  }
}

function writeJson(res, status, payload) {
  try {
    res.writeHead(Number(status) || 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(payload ?? {}))
  } catch {
    try { res.end() } catch {}
  }
}

function resolvePublishedLibraryPath() {
  const cfg = loadServerConfig()
  const configured = String(cfg?.publishLibraryPath || '').trim()
  if (configured) return configured
  return String(activeLibraryPath || '').trim()
}

function getServerLibraryName() {
  const published = resolvePublishedLibraryPath()
  if (!published) return 'Obscura Library'
  return path.basename(published) || 'Obscura Library'
}

function getAuthFromRequest(req, urlObj) {
  const headers = req?.headers || {}
  const authHeader = String(headers.authorization || '')
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  const userTokenHeader = String(headers['x-user-token'] || '').trim()
  const accessTokenQuery = String(urlObj?.searchParams?.get('accessToken') || '').trim()
  const userTokenQuery = String(urlObj?.searchParams?.get('userToken') || '').trim()
  return {
    accessToken: bearer || accessTokenQuery,
    userToken: userTokenHeader || userTokenQuery,
  }
}

function isAuthorizedRequest(req, urlObj) {
  const config = loadServerConfig()
  const { accessToken, userToken } = getAuthFromRequest(req, urlObj)
  if (!accessToken) return false

  // Host secret can be used for local diagnostics/administrative access.
  if (String(config?.hostSecret || '').trim() && accessToken === String(config.hostSecret).trim()) {
    return true
  }

  const users = loadSharedUsers()
  return users.some((u) =>
    Boolean(u?.isActive ?? true) &&
    String(u?.accessToken || '').trim() === accessToken &&
    String(u?.userToken || '').trim() === userToken,
  )
}

function buildSyncDumpForPublishedLibrary() {
  const libraryPath = resolvePublishedLibraryPath()
  const mediaFiles = libraryPath ? readLibraryMediaIndex(libraryPath) : []
  const meta = loadLocalMetaForLibrary(libraryPath || activeLibraryPath)
  const { tags, folders } = getResolvedTagsAndFolders(meta, libraryPath || activeLibraryPath)
  const tagGroups = asArray(meta?.tagGroups)
  const auditLogs = [
    ...asArray(readJsonIfExists(libraryPath ? path.join(libraryPath, 'audit_logs.json') : null, [])),
    ...asArray(meta?.auditLogs),
  ]

  const nextMediaId = mediaFiles.reduce((acc, m) => Math.max(acc, Number(m?.id) || 0), 0) + 1
  const nextTagId = tags.reduce((acc, t) => Math.max(acc, Number(t?.id) || 0), 0) + 1
  const nextTagGroupId = tagGroups.reduce((acc, g) => Math.max(acc, Number(g?.id) || 0), 0) + 1
  const nextFolderId = folders.reduce((acc, f) => Math.max(acc, Number(f?.id) || 0), 0) + 1
  const nextCommentId = Number(meta?.nextCommentId || 1)

  return {
    nextMediaId,
    nextTagId,
    nextTagGroupId,
    nextFolderId,
    nextCommentId,
    mediaFiles,
    tags,
    tagGroups,
    folders,
    auditLogs,
  }
}

function buildMergedMediaForLibrary(libraryPath) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return []

  const mediaList = asArray(readLibraryMediaIndex(normalized))
  const meta = loadLocalMetaForLibrary(normalized)
  const byFilePath = meta?.byFilePath && typeof meta.byFilePath === 'object' ? meta.byFilePath : {}
  const hasByFilePath = Object.keys(byFilePath).length > 0
  const manualMedia = asArray(meta?.manualMedia)
  const { tags, folders } = getResolvedTagsAndFolders(meta, normalized)
  const tagById = new Map(asArray(tags).map((t) => [Number(t?.id), t]))
  const tagByName = new Map(
    asArray(tags)
      .filter((t) => typeof t?.name === 'string' && t.name.trim())
      .map((t) => [String(t.name).trim().toLowerCase(), t]),
  )
  const folderById = new Map(asArray(folders).map((f) => [Number(f?.id), f]))
  const folderByName = new Map(
    asArray(folders)
      .filter((f) => typeof f?.name === 'string' && f.name.trim())
      .map((f) => [String(f.name).trim().toLowerCase(), f]),
  )
  if (!hasByFilePath && manualMedia.length === 0) {
    return mediaList
      .map((m) => ({
        ...m,
        tags: normalizeNamedEntities(m?.tags, tagById, tagByName, 'tag'),
        folders: normalizeNamedEntities(m?.folders, folderById, folderByName, 'folder'),
      }))
      .filter((m) => !m?.permanently_deleted && !m?.is_deleted)
  }

  const merged = mediaList.map((m) => {
    const filePath = String(m?.file_path || '')
    const overlay = byFilePath[filePath] || {}
    const tagIds = asArray(overlay?.tag_ids).map((v) => Number(v)).filter(Number.isFinite)
    const folderIds = asArray(overlay?.folder_ids).map((v) => Number(v)).filter(Number.isFinite)
    return {
      ...m,
      ...overlay,
      tags: mergeNamedEntities(
        tagIds.length > 0 ? tagIds.map((id) => tagById.get(id)).filter(Boolean) : [],
        normalizeNamedEntities(m?.tags, tagById, tagByName, 'tag'),
      ),
      folders: mergeNamedEntities(
        folderIds.length > 0 ? folderIds.map((id) => folderById.get(id)).filter(Boolean) : [],
        normalizeNamedEntities(m?.folders, folderById, folderByName, 'folder'),
      ),
    }
  })

  const indexed = new Map()
  for (const item of merged) {
    indexed.set(String(item?.file_path || ''), item)
  }
  for (const manual of manualMedia) {
    const fp = String(manual?.file_path || '')
    if (!fp || indexed.has(fp)) continue
    indexed.set(fp, {
      ...manual,
      tags: normalizeNamedEntities(manual?.tags, tagById, tagByName, 'tag'),
      folders: normalizeNamedEntities(manual?.folders, folderById, folderByName, 'folder'),
    })
  }

  return [...indexed.values()].filter((m) => !m?.permanently_deleted && !m?.is_deleted)
}

function getMediaByIdForLibrary(libraryPath, mediaId) {
  const idNum = Number(mediaId)
  if (!Number.isFinite(idNum)) return null
  return buildMergedMediaForLibrary(libraryPath).find((m) => Number(m?.id) === idNum) || null
}

function sendFileResponse(res, filePath) {
  const target = String(filePath || '').trim()
  if (!target || !fs.existsSync(target)) {
    writeJson(res, 404, { error: 'File not found' })
    return
  }
  try {
    const ext = String(path.extname(target) || '').toLowerCase()
    const mimeMap = {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    }
    const contentType = mimeMap[ext] || 'application/octet-stream'
    const stat = fs.statSync(target)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    })
    fs.createReadStream(target).pipe(res)
  } catch (err) {
    writeJson(res, 500, { error: err?.message || String(err) })
  }
}

function handleNetworkRequest(req, res) {
  const method = String(req?.method || 'GET').toUpperCase()
  const urlObj = parseRequestUrl(req)
  const route = urlObj.pathname || '/'
  const libraryPath = resolvePublishedLibraryPath()

  if (method === 'GET' && route === '/api/health') {
    writeJson(res, 200, {
      ok: true,
      libraryName: getServerLibraryName(),
      version: 'obscura-sidecar',
    })
    return
  }

  if (method === 'GET' && route === '/api/profile') {
    if (!isAuthorizedRequest(req, urlObj)) {
      writeJson(res, 401, { error: 'Unauthorized' })
      return
    }
    writeJson(res, 200, {
      nickname: 'Local User',
      iconUrl: '',
    })
    return
  }

  if (method === 'GET' && route === '/api/users') {
    if (!isAuthorizedRequest(req, urlObj)) {
      writeJson(res, 401, { error: 'Unauthorized' })
      return
    }
    writeJson(res, 200, loadSharedUsers())
    return
  }

  if (method === 'GET' && route === '/api/sync/dump') {
    if (!isAuthorizedRequest(req, urlObj)) {
      writeJson(res, 401, { error: 'Unauthorized' })
      return
    }
    writeJson(res, 200, buildSyncDumpForPublishedLibrary())
    return
  }

  if (!isAuthorizedRequest(req, urlObj)) {
    writeJson(res, 401, { error: 'Unauthorized' })
    return
  }

  if (method === 'GET' && route === '/api/tags') {
    const meta = loadLocalMetaForLibrary(libraryPath)
    const { tags } = getResolvedTagsAndFolders(meta, libraryPath)
    writeJson(res, 200, tags)
    return
  }

  if (method === 'GET' && route === '/api/tag-groups') {
    const meta = loadLocalMetaForLibrary(libraryPath)
    writeJson(res, 200, asArray(meta?.tagGroups))
    return
  }

  if (method === 'GET' && route === '/api/folders') {
    const meta = loadLocalMetaForLibrary(libraryPath)
    const { folders } = getResolvedTagsAndFolders(meta, libraryPath)
    writeJson(res, 200, folders)
    return
  }

  if (method === 'GET' && route === '/api/media') {
    const all = buildMergedMediaForLibrary(libraryPath)
    const limit = Math.max(1, Number(urlObj.searchParams.get('limit')) || all.length || 100)
    const offset = Math.max(0, Number(urlObj.searchParams.get('offset')) || 0)
    const pageSlice = all.slice(offset, offset + limit)
    writeJson(res, 200, { media: pageSlice, total: all.length })
    return
  }

  if (method === 'GET' && route.startsWith('/api/search/media')) {
    const query = String(urlObj.searchParams.get('query') || '').toLowerCase().trim()
    const all = buildMergedMediaForLibrary(libraryPath)
    const results = all
      .filter((m) => {
        if (!query) return true
        const hay = `${String(m?.file_name || '')} ${String(m?.title || '')}`.toLowerCase()
        return hay.includes(query)
      })
      .slice(0, 300)
      .map((m) => ({
        id: Number(m?.id),
        file_name: String(m?.file_name || ''),
        title: String(m?.title || ''),
        thumbnail_path: String(m?.thumbnail_path || ''),
      }))
    writeJson(res, 200, { results })
    return
  }

  if (method === 'GET' && route.startsWith('/api/stream/')) {
    const id = Number(route.split('/').pop())
    const media = getMediaByIdForLibrary(libraryPath, id)
    sendFileResponse(res, media?.file_path)
    return
  }

  if (method === 'GET' && route.startsWith('/api/thumbnails/')) {
    const id = Number(route.split('/').pop())
    const media = getMediaByIdForLibrary(libraryPath, id)
    sendFileResponse(res, media?.thumbnail_path)
    return
  }

  writeJson(res, 404, { error: 'Not found' })
}

function startNetworkServer() {
  if (networkServer && networkServer.listening) {
    return Promise.resolve({ success: true })
  }

  const config = loadServerConfig()
  const port = Number(config?.port || 53913)
  const listenPort = Number.isFinite(port) && port > 0 ? port : 53913

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        handleNetworkRequest(req, res)
      } catch (err) {
        writeJson(res, 500, { error: err?.message || String(err) })
      }
    })
    server.on('error', () => {
      if (networkServer === server) {
        networkServer = null
        networkServerPort = null
        networkServerHost = null
        saveServerState({ running: false })
      }
    })

    const onFailure = (err) => {
      networkServer = null
      networkServerPort = null
      networkServerHost = null
      saveServerState({ running: false })
      resolve({ success: false, error: err?.message || String(err) })
    }

    const onSuccess = (host) => {
      networkServer = server
      networkServerPort = listenPort
      networkServerHost = host
      saveServerState({ running: true })
      resolve({ success: true })
    }

    const tryListen = (host, options) =>
      new Promise((listenResolve, listenReject) => {
        const onError = (err) => {
          server.off('listening', onListening)
          listenReject(err)
        }
        const onListening = () => {
          server.off('error', onError)
          listenResolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        if (options) {
          server.listen(options)
        } else {
          server.listen(listenPort, host)
        }
      })

    ; (async () => {
      try {
        await tryListen('::', { port: listenPort, host: '::', ipv6Only: false })
        onSuccess('::')
      } catch (ipv6Err) {
        const code = String(ipv6Err?.code || '')
        if (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL' && code !== 'EINVAL') {
          onFailure(ipv6Err)
          return
        }
        try {
          await tryListen('0.0.0.0')
          onSuccess('0.0.0.0')
        } catch (ipv4Err) {
          onFailure(ipv4Err)
        }
      }
    })
  })
}

function stopNetworkServer() {
  if (!networkServer) {
    saveServerState({ running: false })
    networkServerPort = null
    networkServerHost = null
    return Promise.resolve({ success: true })
  }

  return new Promise((resolve) => {
    try {
      networkServer.close((err) => {
        networkServer = null
        networkServerPort = null
        networkServerHost = null
        saveServerState({ running: false })
        if (err) {
          resolve({ success: false, error: err?.message || String(err) })
          return
        }
        resolve({ success: true })
      })
    } catch (err) {
      networkServer = null
      networkServerPort = null
      networkServerHost = null
      saveServerState({ running: false })
      resolve({ success: false, error: err?.message || String(err) })
    }
  })
}

async function ensureDiscordClient() {
  if (discordClient && discordReady) return true

  if (!discordRpcModule) {
    try {
      discordRpcModule = require('discord-rpc')
    } catch {
      return false
    }
  }

  try {
    if (!discordClient) {
      discordClient = new discordRpcModule.Client({ transport: 'ipc' })
      discordClient.on('ready', () => {
        discordReady = true
      })
      discordClient.on('disconnected', () => {
        discordReady = false
        discordClient = null
      })
    }

    if (!discordReady) {
      const loginPromise = discordClient.login({ clientId: DISCORD_CLIENT_ID })
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('discord login timeout')), 5000)
      })
      await Promise.race([loginPromise, timeoutPromise])
      discordReady = true
    }
    return true
  } catch {
    discordReady = false
    return false
  }
}

async function clearDiscordActivitySafe() {
  if (!discordClient || !discordReady) return false
  try {
    await discordClient.clearActivity()
    return true
  } catch {
    return false
  }
}

async function destroyDiscordClient() {
  if (!discordClient) return
  try {
    await discordClient.destroy()
  } catch {
    // ignore
  } finally {
    discordClient = null
    discordReady = false
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function safePluginId(pluginId) {
  return String(pluginId || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

function hashPath(inputPath) {
  return crypto.createHash('sha256').update(String(inputPath)).digest('hex')
}

function getHardwareId() {
  if (typeof machineIdSync === 'function') {
    try {
      const machineId = machineIdSync(true)
      return crypto.createHash('sha256').update(machineId).digest('hex')
    } catch {
      // Fall through to hostname/user fallback.
    }
  }

  const fallbackSource = `${os.hostname()}::${os.userInfo().username || 'unknown-user'}`
  return crypto.createHash('sha256').update(fallbackSource).digest('hex')
}

function generateUserTokenFromHardwareId(hardwareId) {
  return crypto
    .createHash('sha256')
    .update(String(hardwareId || '') + 'obscura_user_token_salt_v1')
    .digest('hex')
}

function generateAccessToken() {
  return crypto.randomBytes(24).toString('hex')
}

function isWindows() {
  return process.platform === 'win32'
}

function spawnDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

function toPowerShellLiteral(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`
}

function runPowerShell(command) {
  const proc = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  })
  if (proc.error) {
    throw proc.error
  }
  if (proc.status !== 0) {
    throw new Error(String(proc.stderr || proc.stdout || `PowerShell exited with ${proc.status}`))
  }
}

function openPathWithDefaultFileManager(targetPath) {
  const target = String(targetPath || '').trim()
  if (!target) throw new Error('file manager target is empty')
  const child = spawn('cmd.exe', ['/c', 'start', '', target], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

function getExistingParentDir(inputPath) {
  let current = String(inputPath || '').trim()
  while (current) {
    try {
      if (fs.existsSync(current)) {
        const stat = fs.statSync(current)
        return stat.isDirectory() ? current : path.dirname(current)
      }
    } catch {
      // Keep walking upward.
    }
    const parent = path.dirname(current)
    if (!parent || parent === current) break
    current = parent
  }
  return ''
}

async function copyFileToClipboard(filePath) {
  const targetPath = String(filePath || '').trim()
  if (!targetPath) {
    throw new Error('filePath is required')
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error('file does not exist')
  }

  if (!isWindows()) {
    throw new Error('file clipboard copy is currently supported on Windows only')
  }

  const escapedPath = targetPath.replace(/'/g, "''")
  return await new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `Set-Clipboard -LiteralPath '${escapedPath}'`,
    ], {
      windowsHide: true,
    })

    ps.on('close', (code) => {
      resolve(code === 0)
    })

    ps.on('error', () => {
      resolve(false)
    })
  })
}

function decodeDataUrl(dataUrl) {
  const raw = String(dataUrl || '')
  const match = raw.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('invalid data url')
  }
  const mime = String(match[1] || '').toLowerCase()
  const base64 = match[2] || ''
  const bytes = Buffer.from(base64, 'base64')
  let extension = 'bin'
  if (mime === 'image/png') extension = 'png'
  if (mime === 'image/jpeg') extension = 'jpg'
  if (mime === 'image/webp') extension = 'webp'
  return { mime, bytes, extension }
}

function normalizeInputFilePath(inputPath) {
  let raw = String(inputPath || '').trim()
  if (!raw) return ''
  appendDebugLog(`normalizeInputFilePath raw=${raw}`)
  raw = raw.replace(/^"+|"+$/g, '')

  if (/^media:\/\//i.test(raw)) {
    const noScheme = raw.slice('media://'.length)
    const decoded = decodeURIComponent(noScheme)
    const driveLike = decoded.match(/^([A-Za-z])\/(.*)$/)
    if (driveLike) {
      const normalized = path.normalize(`${driveLike[1]}:/${driveLike[2]}`)
      appendDebugLog(`normalizeInputFilePath media-> ${normalized}`)
      return normalized
    }
    const normalized = path.normalize(decoded)
    appendDebugLog(`normalizeInputFilePath media-decoded-> ${normalized}`)
    return normalized
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      if (parsed.hostname === 'asset.localhost') {
        let decoded = decodeURIComponent(parsed.pathname || '')
        decoded = decoded.replace(/^\/+/, '')
        const driveLike = decoded.match(/^([A-Za-z])\/(.*)$/)
        if (driveLike) {
          const normalized = path.normalize(`${driveLike[1]}:/${driveLike[2]}`)
          appendDebugLog(`normalizeInputFilePath asset-> ${normalized}`)
          return normalized
        }
        const normalized = path.normalize(decoded)
        appendDebugLog(`normalizeInputFilePath asset-decoded-> ${normalized}`)
        return normalized
      }
    } catch {
      // Fall through and return raw path.
    }
  }

  const normalized = path.normalize(raw)
  appendDebugLog(`normalizeInputFilePath plain-> ${normalized}`)
  return normalized
}

function getFfmpegExecutablePath() {
  const fromEnv = String(process.env.FFMPEG_PATH || '').trim()
  if (fromEnv) return fromEnv
  const managed = path.join(getManagedBinDir(), isWindows() ? 'ffmpeg.exe' : 'ffmpeg')
  if (fs.existsSync(managed)) return managed
  return 'ffmpeg'
}

function getFfmpegInfo() {
  const ffmpegPath = getFfmpegExecutablePath()
  try {
    const proc = spawnSync(ffmpegPath, ['-version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    })
    if (proc.error) {
      return { version: '', path: ffmpegPath, error: proc.error.message || String(proc.error) }
    }
    const output = String(proc.stdout || proc.stderr || '')
    const firstLine = output.split(/\r?\n/)[0] || ''
    const match = firstLine.match(/ffmpeg version\s+([^\s]+)/i)
    return {
      version: match ? match[1] : '',
      path: ffmpegPath,
    }
  } catch (err) {
    return { version: '', path: ffmpegPath, error: err?.message || String(err) }
  }
}

function getFfprobeExecutablePath() {
  const ffmpegPath = getFfmpegExecutablePath()
  const ext = path.extname(ffmpegPath)
  const base = path.basename(ffmpegPath, ext)
  if (/^ffmpeg$/i.test(base)) {
    return path.join(path.dirname(ffmpegPath), `ffprobe${ext}`)
  }
  const managed = path.join(getManagedBinDir(), isWindows() ? 'ffprobe.exe' : 'ffprobe')
  if (fs.existsSync(managed)) return managed
  return 'ffprobe'
}

function isImagePath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)
}

function isAudioPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)
}

function findSiblingThumbnailPath(filePath) {
  const sourcePath = String(filePath || '').trim()
  if (!sourcePath || sourcePath.startsWith('http')) return ''
  try {
    const dir = path.dirname(sourcePath)
    const ext = path.extname(sourcePath)
    const base = path.basename(sourcePath, ext)
    if (!dir || !base) return ''

    const candidates = [
      `${base}_thumbnail.png`,
      `${base}_thumbnail.jpg`,
      `${base}_thumbnail.jpeg`,
      `${base}_thumbnail.webp`,
      `${base}_thumbnail.avif`,
      `${base}.thumbnail.png`,
      `${base}.thumbnail.jpg`,
      `${base}.thumbnail.jpeg`,
      `${base}.thumbnail.webp`,
      `${base}.thumbnail.avif`,
    ]

    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate)
      if (fs.existsSync(fullPath)) return fullPath
    }
  } catch {
    // Ignore thumbnail lookup errors and fall back to existing path.
  }
  return ''
}

function extractThumbnailWithFfmpeg(filePath, outputPath) {
  const ffmpegPath = getFfmpegExecutablePath()
  ensureDir(path.dirname(outputPath))
  try {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath)
    }
  } catch {
    // Ignore stale thumbnail cleanup failures.
  }

  const runExtract = (args) => {
    const proc = spawnSync(ffmpegPath, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
    })
    return proc.status === 0 && fs.existsSync(outputPath)
  }

  const embeddedStreamSpecifier = getEmbeddedArtworkStreamSpecifier(filePath)
  if (embeddedStreamSpecifier) {
    const ok = runExtract([
      '-y',
      '-i', filePath,
      '-map', embeddedStreamSpecifier,
      '-frames:v', '1',
      '-vf', 'scale=320:-1:flags=lanczos',
      outputPath,
    ])
    if (ok) return true
  }

  const seekPoints = ['1.000', '0.100', '0.000', '3.000']
  for (const seek of seekPoints) {
    const ok = runExtract([
      '-y',
      '-ss', seek,
      '-i', filePath,
      '-frames:v', '1',
      '-vf', 'scale=320:-1:flags=lanczos',
      outputPath,
    ])
    if (ok) return true
  }
  return false
}

function getEmbeddedArtworkStreamSpecifier(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ffprobePath = getFfprobeExecutablePath()
  try {
    const proc = spawnSync(ffprobePath, [
      '-v', 'error',
      '-show_streams',
      '-print_format', 'json',
      filePath,
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    })
    if (proc.error || proc.status !== 0) return ''
    const data = JSON.parse(String(proc.stdout || '{}'))
    const streams = asArray(data?.streams)
    const artwork = streams.find((stream) => {
      if (!stream || String(stream.codec_type) !== 'video') return false
      if (Number(stream?.disposition?.attached_pic) === 1) return true
      const comment = String(stream?.tags?.comment || '').toLowerCase()
      const title = String(stream?.tags?.title || '').toLowerCase()
      return comment.includes('cover') || title.includes('cover')
    })
    const index = Number(artwork?.index)
    return Number.isFinite(index) ? `0:${index}` : ''
  } catch {
    return ''
  }
}

function captureFrameDataUrlWithFfmpeg(filePath, timeSeconds) {
  const ffmpegPath = getFfmpegExecutablePath()
  const seek = Number.isFinite(Number(timeSeconds)) ? Math.max(0, Number(timeSeconds)) : 0
  const proc = spawnSync(ffmpegPath, [
    '-ss', String(seek),
    '-i', filePath,
    '-frames:v', '1',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    'pipe:1',
  ], {
    windowsHide: true,
    timeout: 30000,
  })
  if (proc.status !== 0) {
    const stderr = String(proc.stderr || '').trim()
    throw new Error(stderr || 'ffmpeg failed to capture frame')
  }
  const bytes = Buffer.isBuffer(proc.stdout) ? proc.stdout : Buffer.from(proc.stdout || '')
  if (!bytes || bytes.length === 0) {
    throw new Error('ffmpeg returned empty frame')
  }
  return `data:image/jpeg;base64,${bytes.toString('base64')}`
}

function getFfmpegHwaccelArgs(enableGpuAcceleration) {
  if (!enableGpuAcceleration) return []
  if (isWindows()) return ['-hwaccel', 'd3d11va']
  if (process.platform === 'darwin') return ['-hwaccel', 'videotoolbox']
  return ['-hwaccel', 'auto']
}

function captureFrameDataUrlWithFfmpegWithHwaccel(filePath, timeSeconds, enableGpuAcceleration) {
  const ffmpegPath = getFfmpegExecutablePath()
  const seek = Number.isFinite(Number(timeSeconds)) ? Math.max(0, Number(timeSeconds)) : 0
  const baseArgs = [
    '-ss', String(seek),
    '-i', filePath,
    '-frames:v', '1',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    'pipe:1',
  ]
  const hwaccelArgs = (enableGpuAcceleration && ffmpegHwaccelAvailable)
    ? getFfmpegHwaccelArgs(true)
    : []
  const candidates = hwaccelArgs.length > 0
    ? [[...hwaccelArgs, ...baseArgs], baseArgs]
    : [baseArgs]

  let lastError = 'ffmpeg failed to capture frame'
  for (const args of candidates) {
    const proc = spawnSync(ffmpegPath, args, {
      windowsHide: true,
      timeout: 30000,
    })
    if (proc.status === 0) {
      const bytes = Buffer.isBuffer(proc.stdout) ? proc.stdout : Buffer.from(proc.stdout || '')
      if (bytes && bytes.length > 0) {
        return `data:image/jpeg;base64,${bytes.toString('base64')}`
      }
      lastError = 'ffmpeg returned empty frame'
      continue
    }
    const stderr = String(proc.stderr || '').trim()
    if (hwaccelArgs.length > 0 && args === candidates[0]) {
      ffmpegHwaccelAvailable = false
    }
    if (stderr) lastError = stderr
  }
  throw new Error(lastError)
}

function generatePreviewImages(filePath, previewsDir, intervalSeconds) {
  const ffmpegPath = getFfmpegExecutablePath()
  ensureDir(previewsDir)
  const pattern = path.join(previewsDir, 'preview_%05d.jpg')
  const interval = Math.max(0.2, Number(intervalSeconds) || 1)
  const proc = spawnSync(ffmpegPath, [
    '-y',
    '-i', filePath,
    '-vf', `fps=1/${interval},scale=320:-1`,
    '-q:v', '4',
    pattern,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
  })
  if (proc.status !== 0) return []
  return asArray(fs.readdirSync(previewsDir))
    .filter((f) => f.startsWith('preview_') && f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(previewsDir, f))
}

function normalizeVersion(input) {
  const raw = String(input || '').trim()
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/)
  if (match) return `${match[1]}.${match[2]}.${match[3]}`
  const short = raw.match(/(\d+)\.(\d+)/)
  if (short) return `${short[1]}.${short[2]}.0`
  return ''
}

function compareVersions(a, b) {
  const pa = normalizeVersion(a).split('.').map((v) => Number(v) || 0)
  const pb = normalizeVersion(b).split('.').map((v) => Number(v) || 0)
  for (let i = 0; i < 3; i += 1) {
    const av = pa[i] || 0
    const bv = pb[i] || 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

async function fetchLatestGithubRelease(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'obscura-tauri-sidecar' },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }
  const releases = await response.json()
  const latest = asArray(releases).find((release) => !release?.draft)
  if (!latest) throw new Error('No release found')
  return latest
}

function chooseInstallerAsset(release) {
  const assets = asArray(release?.assets)
  if (assets.length === 0) return null
  const windowsAsset = assets.find((asset) => {
    const name = String(asset?.name || '').toLowerCase()
    return (name.endsWith('.exe') || name.endsWith('.msi')) && !name.includes('blockmap')
  })
  return windowsAsset || assets[0]
}

async function downloadFileWithProgress(url, targetPath, onProgress) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'obscura-tauri-sidecar' },
    signal: AbortSignal.timeout(600000),
  })
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`)
  }
  const total = Number(response.headers.get('content-length') || 0)
  ensureDir(path.dirname(targetPath))

  const tempPath = `${targetPath}.tmp`
  const writer = fs.createWriteStream(tempPath)
  let received = 0
  for await (const chunk of response.body) {
    writer.write(chunk)
    received += chunk.length
    if (typeof onProgress === 'function' && total > 0) {
      onProgress(received, total)
    }
  }
  await new Promise((resolve, reject) => {
    writer.end(() => resolve())
    writer.on('error', reject)
  })
  fs.renameSync(tempPath, targetPath)
  return targetPath
}

function findFileRecursively(rootDir, fileNameLower) {
  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase() === fileNameLower) {
        return fullPath
      }
    }
  }
  return null
}

function extractZipWindows(zipPath, outDir) {
  if (!isWindows()) {
    throw new Error('zip extraction is supported on Windows only')
  }
  ensureDir(outDir)
  const escapedZip = String(zipPath).replace(/'/g, "''")
  const escapedOut = String(outDir).replace(/'/g, "''")
  const ps = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Force -LiteralPath '${escapedZip}' -DestinationPath '${escapedOut}'`,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000,
  })
  if (ps.status !== 0) {
    throw new Error(ps.stderr || ps.stdout || 'Expand-Archive failed')
  }
}

async function fetchWithCertFallback(url, options) {
  let insecureTlsFallback = false
  try {
    const response = await fetch(url, options)
    return { response, insecureTlsFallback }
  } catch (err) {
    const causeText = err?.cause?.message || String(err?.cause || '')
    const isCertError =
      causeText.includes('unable to get local issuer certificate') ||
      causeText.includes('self signed certificate') ||
      causeText.includes('certificate')

    if (!isCertError) throw err

    insecureTlsFallback = true
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    try {
      const response = await fetch(url, options)
      return { response, insecureTlsFallback }
    } finally {
      if (prev === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev
      }
    }
  }
}

function normalizeConnectionError(err) {
  const message = err?.message || String(err)
  const cause = err?.cause?.message || String(err?.cause || '')
  const combined = `${message} ${cause}`.toLowerCase()

  if (combined.includes('certificate')) {
    return 'TLS certificate error.'
  }
  if (combined.includes('econnrefused')) {
    return 'Connection refused.'
  }
  if (combined.includes('etimedout') || combined.includes('timeout')) {
    return 'Connection timed out.'
  }
  if (combined.includes('fetch failed')) {
    return 'Cannot reach server.'
  }
  return message
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '')
}

function parseAuthTokens(rawToken, fallbackUserToken) {
  const token = String(rawToken || '')
  let userToken = String(fallbackUserToken || '')
  let accessToken = token

  if (token.includes(':')) {
    const parts = token.split(':')
    userToken = parts[0] || ''
    accessToken = parts[1] || ''
  }

  return { userToken, accessToken }
}

function authHeaders(rawToken, fallbackUserToken) {
  const { userToken, accessToken } = parseAuthTokens(rawToken, fallbackUserToken)
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-User-Token': userToken,
  }
}

async function callRemoteApi(baseUrl, token, endpointPath, method, body, fallbackUserToken) {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) {
    throw new Error('Remote URL is required')
  }

  const headers = authHeaders(token, fallbackUserToken)
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const { response } = await fetchWithCertFallback(`${normalized}${endpointPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

async function downloadRemoteFile(url, targetPath) {
  const { response } = await fetchWithCertFallback(url, {
    method: 'GET',
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  ensureDir(path.dirname(targetPath))
  fs.writeFileSync(targetPath, bytes)
  return targetPath
}

function remoteCachePath(remoteId) {
  const safeRemoteId = String(remoteId || '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeRemoteId) {
    throw new Error('remoteId is required')
  }
  return path.join(getDataRoot(), 'RemoteCaches', safeRemoteId)
}

function mediaDataPath(mediaId, pluginId) {
  const root = getDataRoot()
  const safeId = safePluginId(pluginId)
  const dir = path.join(root, 'plugin-media', safeId)
  ensureDir(dir)
  return path.join(dir, `${String(mediaId)}.json`)
}

function associatedDataPath(mediaFilePath) {
  const root = getDataRoot()
  const dir = path.join(root, 'associated')
  ensureDir(dir)
  const fileHash = hashPath(mediaFilePath)
  return path.join(dir, `${fileHash}.json`)
}

function readJsonIfExists(filePath, fallbackValue) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallbackValue
    const raw = fs.readFileSync(filePath, 'utf8')
    const normalized = String(raw || '').replace(/^\uFEFF/, '').trim()
    if (!normalized) return fallbackValue
    return JSON.parse(normalized)
  } catch {
    return fallbackValue
  }
}

function getActiveLibraryDataPath(fileName) {
  if (!activeLibraryPath) return null
  return path.join(activeLibraryPath, fileName)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

const LIBRARY_INDEX_VERSION = 2
const LIBRARY_INDEX_FILE = '.obscura-media-index.json'
const LIBRARY_INDEX_BACKUP_FILE = '.obscura-media-index.backup.json'
const LEGACY_MEDIA_CACHE_FILE = 'media_cache.json'
const INDEX_PACKED_FIELDS = [
  'id',
  'file_path',
  'file_name',
  'title',
  'file_type',
  'thumbnail_path',
  'file_size',
  'created_at',
  'modified_date',
  'updated_at',
  'added_date',
  'duration',
  'width',
  'height',
  'rating',
  'framerate',
  'audio_bitrate',
  'format_name',
  'codec_id',
  'audio_codec',
  'video_codec',
  'artist',
  'artists',
  'description',
  'url',
  'is_deleted',
  'last_played_at',
  'permanently_deleted',
]

function getLibraryMediaIndexPath(libraryPath) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return null
  return path.join(normalized, LIBRARY_INDEX_FILE)
}

function getLibraryMediaIndexBackupPath(libraryPath) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return null
  return path.join(normalized, LIBRARY_INDEX_BACKUP_FILE)
}

function packIndexItems(items) {
  return asArray(items).map((item) => INDEX_PACKED_FIELDS.map((field) => item?.[field]))
}

function unpackIndexItems(rawItems, fields) {
  const keys = Array.isArray(fields) && fields.length > 0 ? fields : INDEX_PACKED_FIELDS
  return asArray(rawItems)
    .filter((row) => Array.isArray(row))
    .map((row) => {
      const item = {}
      for (let i = 0; i < keys.length; i += 1) {
        const key = String(keys[i] || '').trim()
        if (!key) continue
        const value = row[i]
        if (value !== undefined) item[key] = value
      }
      return item
    })
}

function normalizeIndexedMediaItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const filePath = String(raw.file_path || '').trim()
  if (!filePath) return null
  return {
    ...raw,
    id: Number.isFinite(Number(raw.id)) ? Number(raw.id) : toMediaId(filePath),
    file_path: filePath,
    file_name: String(raw.file_name || path.basename(filePath)),
  }
}

function normalizeIndexedMediaList(media) {
  return asArray(media)
    .map((item) => normalizeIndexedMediaItem(item))
    .filter(Boolean)
}

function readLibraryMediaIndex(libraryPath) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return []

  const indexPath = getLibraryMediaIndexPath(normalized)
  const indexRaw = readJsonIfExists(indexPath, null)
  if (Array.isArray(indexRaw)) {
    return normalizeIndexedMediaList(indexRaw)
  }
  if (indexRaw && typeof indexRaw === 'object' && Array.isArray(indexRaw.items) && !Array.isArray(indexRaw.fields)) {
    return normalizeIndexedMediaList(indexRaw.items)
  }
  if (indexRaw && typeof indexRaw === 'object' && Array.isArray(indexRaw.items) && Array.isArray(indexRaw.fields)) {
    return normalizeIndexedMediaList(unpackIndexItems(indexRaw.items, indexRaw.fields))
  }
  const backupPath = getLibraryMediaIndexBackupPath(normalized)
  const backupRaw = readJsonIfExists(backupPath, null)
  if (Array.isArray(backupRaw)) {
    return normalizeIndexedMediaList(backupRaw)
  }
  if (backupRaw && typeof backupRaw === 'object' && Array.isArray(backupRaw.items) && !Array.isArray(backupRaw.fields)) {
    return normalizeIndexedMediaList(backupRaw.items)
  }
  if (backupRaw && typeof backupRaw === 'object' && Array.isArray(backupRaw.items) && Array.isArray(backupRaw.fields)) {
    return normalizeIndexedMediaList(unpackIndexItems(backupRaw.items, backupRaw.fields))
  }
  // Backward compatibility: older libraries may only have media_cache.json.
  const legacyRaw = readJsonIfExists(path.join(normalized, LEGACY_MEDIA_CACHE_FILE), null)
  if (Array.isArray(legacyRaw)) {
    const normalizedLegacy = normalizeIndexedMediaList(legacyRaw)
    if (normalizedLegacy.length > 0) {
      // Migrate to the new index format for faster subsequent loads.
      writeLibraryMediaIndex(normalized, normalizedLegacy)
    }
    return normalizedLegacy
  }
  if (legacyRaw && typeof legacyRaw === 'object' && Array.isArray(legacyRaw.items)) {
    const normalizedLegacy = normalizeIndexedMediaList(legacyRaw.items)
    if (normalizedLegacy.length > 0) {
      writeLibraryMediaIndex(normalized, normalizedLegacy)
    }
    return normalizedLegacy
  }
  return []
}

function writeLibraryMediaIndex(libraryPath, media) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return
  const items = normalizeIndexedMediaList(media)
  const packedItems = packIndexItems(items)
  const payload = {
    version: LIBRARY_INDEX_VERSION,
    libraryPath: normalized,
    count: items.length,
    updatedAt: new Date().toISOString(),
    fields: INDEX_PACKED_FIELDS,
    items: packedItems,
  }
  const indexPath = getLibraryMediaIndexPath(normalized)
  const backupPath = getLibraryMediaIndexBackupPath(normalized)
  if (indexPath) {
    const tmpPath = `${indexPath}.tmp`
    try {
      if (backupPath && fs.existsSync(indexPath)) {
        try {
          fs.copyFileSync(indexPath, backupPath)
        } catch {
          // ignore backup copy failure
        }
      }
      fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf8')
      fs.renameSync(tmpPath, indexPath)
    } catch {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      } catch {
        // ignore cleanup failure
      }
    }
  }
  // Backward-compatible cache for existing versions/tools.
  try {
    fs.writeFileSync(path.join(normalized, LEGACY_MEDIA_CACHE_FILE), JSON.stringify(items), 'utf8')
  } catch {
    // ignore legacy cache write failure
  }
}

function mediaIdentityKey(media) {
  const filePath = String(media?.file_path || '').trim()
  if (filePath) return `fp:${filePath}`
  const idNum = Number(media?.id)
  if (Number.isFinite(idNum)) return `id:${idNum}`
  return ''
}

function upsertLibraryMediaIndex(libraryPath, items) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return []
  const base =
    cachedLibraryPath === normalized
      ? asArray(cachedScannedMedia)
      : readLibraryMediaIndex(normalized)
  const merged = new Map()
  for (const item of base) {
    const key = mediaIdentityKey(item)
    if (!key) continue
    merged.set(key, item)
  }
  for (const item of asArray(items)) {
    const normalizedItem = normalizeIndexedMediaItem(item)
    if (!normalizedItem) continue
    const key = mediaIdentityKey(normalizedItem)
    if (!key) continue
    merged.set(key, normalizedItem)
  }
  const next = [...merged.values()]
  writeLibraryMediaIndex(normalized, next)
  setCachedScannedMedia(normalized, next)
  return next
}

function setCachedScannedMedia(libraryPath, media) {
  cachedLibraryPath = String(libraryPath || '').trim() || null
  cachedScannedMedia = asArray(media)
  mediaDataRevision += 1
  cachedMergedLibraryPath = null
  cachedMergedRevision = -1
  cachedMergedMedia = []
  cachedFilteredRevision = -1
  cachedFilteredKey = ''
  cachedFilteredMedia = []
  cachedResolvedTfLibraryPath = null
  cachedResolvedTfRevision = -1
  cachedResolvedTf = { tags: [], folders: [] }
}

function clearCachedScannedMedia() {
  cachedLibraryPath = null
  cachedScannedMedia = []
  mediaDataRevision += 1
  cachedMergedLibraryPath = null
  cachedMergedRevision = -1
  cachedMergedMedia = []
  cachedFilteredRevision = -1
  cachedFilteredKey = ''
  cachedFilteredMedia = []
  cachedResolvedTfLibraryPath = null
  cachedResolvedTfRevision = -1
  cachedResolvedTf = { tags: [], folders: [] }
}

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v',
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
])
const DEFAULT_SCAN_LIMIT = 200000
const SKIP_SCAN_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.obscura-thumbnails',
  '.sidecar-data',
  '$recycle.bin',
  'system volume information',
])

function isSidecarThumbnailFileName(fileName) {
  const name = String(fileName || '')
  // Keep originals, but skip generated sidecar thumbnail files.
  // Examples:
  //   foo_thumbnail.png
  //   foo.thumbnail.jpg
  return /(?:_thumbnail|\.thumbnail)\.(png|jpe?g|webp|avif)$/i.test(name)
}

function toMediaId(filePath) {
  const hex = crypto.createHash('sha1').update(String(filePath)).digest('hex').slice(0, 12)
  return parseInt(hex, 16)
}

function scanLocalMediaFiles(rootDir, limit = DEFAULT_SCAN_LIMIT) {
  const out = []
  const stack = [rootDir]
  const metadataJsonCache = new Map()

  while (stack.length > 0 && out.length < limit) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        const dirName = String(entry.name || '').toLowerCase()
        if (SKIP_SCAN_DIR_NAMES.has(dirName)) continue
        stack.push(fullPath)
        continue
      }
      if (entry.isSymbolicLink()) continue
      if (!entry.isFile()) continue
      if (isSidecarThumbnailFileName(entry.name)) continue

      const ext = path.extname(entry.name).toLowerCase()
      if (!MEDIA_EXTENSIONS.has(ext)) continue

      let stat = null
      try {
        stat = fs.statSync(fullPath)
      } catch {
        stat = null
      }

      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)
      const isAudio = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)
      const fileType = isImage ? 'image' : isAudio ? 'audio' : 'video'
      const siblingThumb = findSiblingThumbnailPath(fullPath)

      const item = {
        id: toMediaId(fullPath),
        file_name: entry.name,
        title: path.basename(entry.name, ext),
        file_type: fileType,
        file_path: fullPath,
        thumbnail_path: siblingThumb || (isImage ? fullPath : ''),
        file_size: stat?.size || 0,
        created_at: stat?.ctime ? new Date(stat.ctime).toISOString() : '',
        modified_date: stat?.mtime ? new Date(stat.mtime).toISOString() : '',
        is_deleted: false,
        last_played_at: null,
        tags: [],
        folders: [],
      }

      const metadataEntry = resolveMetadataEntryForFile(fullPath, metadataJsonCache)
      if (metadataEntry) {
        applyMetadataOverlayFromEntry(item, item, metadataEntry)

        const toFiniteNumber = (value) => {
          const n = Number(value)
          return Number.isFinite(n) ? n : undefined
        }
        const duration = toFiniteNumber(metadataEntry.duration)
        const width = toFiniteNumber(metadataEntry.width ?? metadataEntry.resolutionWidth)
        const height = toFiniteNumber(metadataEntry.height ?? metadataEntry.resolutionHeight)
        const framerate = toFiniteNumber(metadataEntry.framerate ?? metadataEntry.frame_rate)
        const audioBitrate = toFiniteNumber(
          metadataEntry.audio_bitrate ??
          metadataEntry.audioBitrate ??
          metadataEntry.audioBitRate
        )
        const rating = toFiniteNumber(metadataEntry.rating ?? metadataEntry.star)
        const fileSize = toFiniteNumber(metadataEntry.file_size ?? metadataEntry.size)
        const formatName = (typeof metadataEntry.format_name === 'string' ? metadataEntry.format_name : (typeof metadataEntry.formatName === 'string' ? metadataEntry.formatName : '')).trim()
        const codecId = (typeof metadataEntry.codec_id === 'string' ? metadataEntry.codec_id : (typeof metadataEntry.codecId === 'string' ? metadataEntry.codecId : '')).trim()

        if (duration !== undefined) item.duration = duration
        if (width !== undefined) item.width = width
        if (height !== undefined) item.height = height
        if (framerate !== undefined) item.framerate = framerate
        if (audioBitrate !== undefined) item.audio_bitrate = audioBitrate
        if (rating !== undefined) item.rating = rating
        if (fileSize !== undefined && fileSize > 0) item.file_size = fileSize
        if (formatName) item.format_name = formatName
        if (codecId) item.codec_id = codecId
        if (typeof metadataEntry.thumbnail_path === 'string' && metadataEntry.thumbnail_path.trim()) {
          item.thumbnail_path = metadataEntry.thumbnail_path.trim()
        }
        if (Array.isArray(metadataEntry.tags)) {
          item.tags = metadataEntry.tags
        }
        if (Array.isArray(metadataEntry.folders)) {
          item.folders = metadataEntry.folders
        }
        if (typeof metadataEntry.last_played_at === 'string') {
          item.last_played_at = metadataEntry.last_played_at
        }
        if (typeof metadataEntry.is_deleted === 'boolean') {
          item.is_deleted = metadataEntry.is_deleted
        }
      }

      out.push(item)

      if (out.length >= limit) break
    }
  }

  return out
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function scanLocalMediaFilesAsync(rootDir, limit = DEFAULT_SCAN_LIMIT, onPulse) {
  const out = []
  const stack = [rootDir]
  const metadataJsonCache = new Map()
  let processedEntries = 0

  while (stack.length > 0 && out.length < limit) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        const dirName = String(entry.name || '').toLowerCase()
        if (SKIP_SCAN_DIR_NAMES.has(dirName)) continue
        stack.push(fullPath)
        continue
      }
      if (entry.isSymbolicLink()) continue
      if (!entry.isFile()) continue
      if (isSidecarThumbnailFileName(entry.name)) continue

      const ext = path.extname(entry.name).toLowerCase()
      if (!MEDIA_EXTENSIONS.has(ext)) continue

      let stat = null
      try {
        stat = fs.statSync(fullPath)
      } catch {
        stat = null
      }

      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)
      const isAudio = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)
      const fileType = isImage ? 'image' : isAudio ? 'audio' : 'video'
      const siblingThumb = findSiblingThumbnailPath(fullPath)

      const item = {
        id: toMediaId(fullPath),
        file_name: entry.name,
        title: path.basename(entry.name, ext),
        file_type: fileType,
        file_path: fullPath,
        thumbnail_path: siblingThumb || (isImage ? fullPath : ''),
        file_size: stat?.size || 0,
        created_at: stat?.ctime ? new Date(stat.ctime).toISOString() : '',
        modified_date: stat?.mtime ? new Date(stat.mtime).toISOString() : '',
        is_deleted: false,
        last_played_at: null,
        tags: [],
        folders: [],
      }

      const metadataEntry = resolveMetadataEntryForFile(fullPath, metadataJsonCache)
      if (metadataEntry) {
        applyMetadataOverlayFromEntry(item, item, metadataEntry)
        const toFiniteNumber = (value) => {
          const n = Number(value)
          return Number.isFinite(n) ? n : undefined
        }
        const duration = toFiniteNumber(metadataEntry.duration)
        const width = toFiniteNumber(metadataEntry.width ?? metadataEntry.resolutionWidth)
        const height = toFiniteNumber(metadataEntry.height ?? metadataEntry.resolutionHeight)
        const framerate = toFiniteNumber(metadataEntry.framerate ?? metadataEntry.frame_rate)
        const audioBitrate = toFiniteNumber(
          metadataEntry.audio_bitrate ??
          metadataEntry.audioBitrate ??
          metadataEntry.audioBitRate
        )
        const rating = toFiniteNumber(metadataEntry.rating ?? metadataEntry.star)
        const fileSize = toFiniteNumber(metadataEntry.file_size ?? metadataEntry.size)
        const formatName = (typeof metadataEntry.format_name === 'string' ? metadataEntry.format_name : (typeof metadataEntry.formatName === 'string' ? metadataEntry.formatName : '')).trim()
        const codecId = (typeof metadataEntry.codec_id === 'string' ? metadataEntry.codec_id : (typeof metadataEntry.codecId === 'string' ? metadataEntry.codecId : '')).trim()

        if (duration !== undefined) item.duration = duration
        if (width !== undefined) item.width = width
        if (height !== undefined) item.height = height
        if (framerate !== undefined) item.framerate = framerate
        if (audioBitrate !== undefined) item.audio_bitrate = audioBitrate
        if (rating !== undefined) item.rating = rating
        if (fileSize !== undefined && fileSize > 0) item.file_size = fileSize
        if (formatName) item.format_name = formatName
        if (codecId) item.codec_id = codecId
        if (typeof metadataEntry.thumbnail_path === 'string' && metadataEntry.thumbnail_path.trim()) {
          item.thumbnail_path = metadataEntry.thumbnail_path.trim()
        }
        if (Array.isArray(metadataEntry.tags)) item.tags = metadataEntry.tags
        if (Array.isArray(metadataEntry.folders)) item.folders = metadataEntry.folders
        if (typeof metadataEntry.last_played_at === 'string') item.last_played_at = metadataEntry.last_played_at
        if (typeof metadataEntry.is_deleted === 'boolean') item.is_deleted = metadataEntry.is_deleted
      }

      out.push(item)
      if (out.length >= limit) break
      processedEntries += 1

      if (processedEntries % 250 === 0) {
        if (typeof onPulse === 'function') {
          onPulse({ processed: processedEntries, found: out.length, queued: stack.length })
        }
        await nextTick()
      }
    }

    if (processedEntries % 250 === 0) {
      await nextTick()
    }
  }

  if (typeof onPulse === 'function') {
    onPulse({ processed: processedEntries, found: out.length, queued: stack.length })
  }
  return out
}

function normalizeMetadataPathKey(input) {
  return String(input || '')
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase()
}

function getDirectoryMetadataRaw(filePath, cache) {
  const dir = path.dirname(String(filePath || ''))
  if (!dir) return null
  if (cache && cache.has(dir)) return cache.get(dir)
  let metadataPath = path.join(dir, 'metadata.json')
  if (!fs.existsSync(metadataPath)) {
    try {
      const hit = asArray(fs.readdirSync(dir)).find((name) => /^metadata\.json$/i.test(String(name || '')))
      if (hit) metadataPath = path.join(dir, String(hit))
    } catch {
      // Ignore directory read errors.
    }
  }
  const raw = readJsonIfExists(metadataPath, null)
  if (cache) cache.set(dir, raw)
  return raw
}

function asMetadataCandidates(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === 'object')
  if (typeof raw !== 'object') return []

  const direct = []
  const values = Object.values(raw).filter((item) => item && typeof item === 'object')
  const containerKeys = ['media', 'items', 'files', 'videos', 'entries', 'data', 'list']

  if (
    raw.file_name != null ||
    raw.filename != null ||
    raw.filePath != null ||
    raw.file_path != null ||
    raw.artist != null ||
    raw.description != null ||
    raw.url != null
  ) {
    direct.push(raw)
  }

  for (const key of containerKeys) {
    const entry = raw[key]
    if (Array.isArray(entry)) {
      direct.push(...entry.filter((item) => item && typeof item === 'object'))
    } else if (entry && typeof entry === 'object') {
      direct.push(entry)
    }
  }

  return [...direct, ...values]
}

function resolveMetadataEntryForFile(filePath, cache) {
  const raw = getDirectoryMetadataRaw(filePath, cache)
  if (!raw) return null

  const normalizedFilePath = normalizeMetadataPathKey(filePath)
  const fileName = path.basename(String(filePath || ''))
  const baseName = path.basename(fileName, path.extname(fileName))
  const normalizedFileName = normalizeMetadataPathKey(fileName)
  const normalizedBaseName = normalizeMetadataPathKey(baseName)

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const byExactName = raw[fileName] || raw[baseName]
    if (byExactName && typeof byExactName === 'object') {
      return byExactName
    }
  }

  const candidates = asMetadataCandidates(raw)
  if (candidates.length === 0) return null

  let best = null
  let bestScore = -1
  for (const entry of candidates) {
    const nameKey = normalizeMetadataPathKey(
      entry?.file_name ||
      entry?.filename ||
      entry?.file ||
      entry?.name ||
      entry?.title ||
      '',
    )
    const pathKey = normalizeMetadataPathKey(entry?.file_path || entry?.path || entry?.absolute_path || '')
    let score = 0
    if (pathKey && (pathKey === normalizedFilePath || pathKey.endsWith(`/${normalizedFileName}`))) score += 100
    if (nameKey && nameKey === normalizedFileName) score += 60
    if (nameKey && nameKey === normalizedBaseName) score += 45
    if (!nameKey && !pathKey) score += 1
    if (score > bestScore) {
      best = entry
      bestScore = score
    }
  }
  if (bestScore <= 0) {
    // Fallback for single-file metadata.json that doesn't include filename/path keys.
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw
    }
    return null
  }
  return best
}

function applyMetadataOverlayFromEntry(item, overlay, entry) {
  if (!entry || typeof entry !== 'object') return

  const stringOrEmpty = (value) => (typeof value === 'string' ? value.trim() : '')
  const toFiniteNumber = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }

  const artist =
    stringOrEmpty(entry.artist) ||
    stringOrEmpty(entry.uploader) ||
    stringOrEmpty(entry.author) ||
    stringOrEmpty(entry.creator) ||
    stringOrEmpty(entry.channel)
  const description =
    stringOrEmpty(entry.description) ||
    stringOrEmpty(entry.desc) ||
    stringOrEmpty(entry.caption)
  const url =
    stringOrEmpty(entry.url) ||
    stringOrEmpty(entry.URL) ||
    stringOrEmpty(entry.source_url) ||
    stringOrEmpty(entry.webpage_url) ||
    stringOrEmpty(entry.original_url)
  const title =
    stringOrEmpty(entry.title) ||
    stringOrEmpty(entry.name)

  const audioBitrate = toFiniteNumber(entry.audio_bitrate ?? entry.audioBitrate ?? entry.audioBitRate)
  const framerate = toFiniteNumber(entry.framerate ?? entry.frame_rate ?? entry.fps)
  const formatNameRaw =
    stringOrEmpty(entry.format_name) ||
    stringOrEmpty(entry.formatName) ||
    stringOrEmpty(entry.container) ||
    stringOrEmpty(entry.format)
  const codecIdRaw =
    stringOrEmpty(entry.codec_id) ||
    stringOrEmpty(entry.codecId) ||
    stringOrEmpty(entry.codec) ||
    stringOrEmpty(entry.video_codec) ||
    stringOrEmpty(entry.videoCodec) ||
    stringOrEmpty(entry.audio_codec) ||
    stringOrEmpty(entry.audioCodec)
  const audioCodec = stringOrEmpty(entry.audio_codec) || stringOrEmpty(entry.audioCodec)
  const videoCodec = stringOrEmpty(entry.video_codec) || stringOrEmpty(entry.videoCodec)
  const formatName = normalizeFormatLabel(
    formatNameRaw,
    item?.file_path || overlay?.file_path || entry?.file_path || '',
    ''
  )
  const codecId = normalizeCodecLabel(codecIdRaw)

  if (artist) {
    overlay.artist = artist
    item.artist = artist
  }
  if (description) {
    overlay.description = description
    item.description = description
  }
  if (url) {
    overlay.url = url
    item.url = url
  }
  if (title) {
    overlay.title = title
    item.title = title
  }
  if (audioBitrate !== undefined && audioBitrate > 0) {
    overlay.audio_bitrate = audioBitrate
    item.audio_bitrate = audioBitrate
  }
  if (framerate !== undefined && framerate > 0) {
    overlay.framerate = framerate
    item.framerate = framerate
  }
  if (formatName) {
    overlay.format_name = formatName
    item.format_name = formatName
  }
  if (codecId) {
    overlay.codec_id = codecId
    item.codec_id = codecId
  }
  if (audioCodec) {
    overlay.audio_codec = audioCodec
    item.audio_codec = audioCodec
  }
  if (videoCodec) {
    overlay.video_codec = videoCodec
    item.video_codec = videoCodec
  }
}

function localMetaPathForLibrary(libraryPath) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return null
  const root = getDataRoot()
  const dir = path.join(root, 'local-meta')
  ensureDir(dir)
  return path.join(dir, `${hashPath(normalized)}.json`)
}

function localMetaPath() {
  return localMetaPathForLibrary(activeLibraryPath)
}

function loadLocalMetaFromPath(metaPath) {
  const raw = readJsonIfExists(metaPath, {})
  const byFilePath = raw?.byFilePath && typeof raw.byFilePath === 'object' ? raw.byFilePath : {}
  const tags = Array.isArray(raw?.tags) ? raw.tags : []
  const folders = Array.isArray(raw?.folders) ? raw.folders : []
  const tagGroups = Array.isArray(raw?.tagGroups) ? raw.tagGroups : []
  const tagGroupById = raw?.tagGroupById && typeof raw.tagGroupById === 'object' ? raw.tagGroupById : {}
  const commentsByMedia = raw?.commentsByMedia && typeof raw.commentsByMedia === 'object' ? raw.commentsByMedia : {}
  const auditLogs = Array.isArray(raw?.auditLogs) ? raw.auditLogs : []
  const manualMedia = Array.isArray(raw?.manualMedia) ? raw.manualMedia : []
  const deletedTagIds = Array.isArray(raw?.deletedTagIds) ? raw.deletedTagIds : []
  const deletedFolderIds = Array.isArray(raw?.deletedFolderIds) ? raw.deletedFolderIds : []
  const nextTagId = Number.isFinite(raw?.nextTagId) ? raw.nextTagId : 1
  const nextTagGroupId = Number.isFinite(raw?.nextTagGroupId) ? raw.nextTagGroupId : 1
  const nextCommentId = Number.isFinite(raw?.nextCommentId) ? raw.nextCommentId : 1
  const nextFolderId = Number.isFinite(raw?.nextFolderId) ? raw.nextFolderId : 1
  return {
    byFilePath,
    tags,
    folders,
    tagGroups,
    tagGroupById,
    commentsByMedia,
    auditLogs,
    manualMedia,
    deletedTagIds,
    deletedFolderIds,
    nextTagId,
    nextTagGroupId,
    nextCommentId,
    nextFolderId,
  }
}

function loadLocalMetaForLibrary(libraryPath) {
  const normalized = String(libraryPath || '').trim()
  if (!normalized) return loadLocalMetaFromObject({})
  if (cachedLocalMetaByLibrary.has(normalized)) {
    return cachedLocalMetaByLibrary.get(normalized)
  }
  const loaded = loadLocalMetaFromPath(localMetaPathForLibrary(normalized))
  cachedLocalMetaByLibrary.set(normalized, loaded)
  return loaded
}

function loadLocalMeta() {
  return loadLocalMetaFromPath(localMetaPath())
}

function saveLocalMetaForLibrary(libraryPath, meta) {
  const normalized = String(libraryPath || '').trim()
  const target = localMetaPathForLibrary(normalized)
  if (!target) return
  const normalizedMeta = loadLocalMetaFromObject(meta)
  fs.writeFileSync(target, JSON.stringify(normalizedMeta, null, 2), 'utf8')
  if (normalized) {
    cachedLocalMetaByLibrary.set(normalized, normalizedMeta)
  }
  if (normalized && normalized === String(activeLibraryPath || '').trim()) {
    mediaDataRevision += 1
    cachedMergedLibraryPath = null
    cachedMergedRevision = -1
    cachedMergedMedia = []
    cachedFilteredRevision = -1
    cachedFilteredKey = ''
    cachedFilteredMedia = []
    cachedResolvedTfLibraryPath = null
    cachedResolvedTfRevision = -1
    cachedResolvedTf = { tags: [], folders: [] }
  }
}

function saveLocalMeta(meta) {
  saveLocalMetaForLibrary(activeLibraryPath, meta)
}

function appendAuditLog(entry) {
  try {
    const meta = loadLocalMeta()
    const current = asArray(meta.auditLogs)
    const item = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      userNickname: 'Local User',
      action: String(entry?.action || 'unknown'),
      targetId: entry?.targetId ?? '',
      targetName: String(entry?.targetName || ''),
      description: String(entry?.description || ''),
      details: entry?.details ?? undefined,
      timestamp: new Date().toISOString(),
    }
    meta.auditLogs = [item, ...current].slice(0, 2000)
    saveLocalMeta(meta)
  } catch {
    // Ignore audit log failures.
  }
}

function loadLocalMetaFromObject(input) {
  const raw = input || {}
  return {
    byFilePath: raw?.byFilePath && typeof raw.byFilePath === 'object' ? raw.byFilePath : {},
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    folders: Array.isArray(raw?.folders) ? raw.folders : [],
    tagGroups: Array.isArray(raw?.tagGroups) ? raw.tagGroups : [],
    tagGroupById: raw?.tagGroupById && typeof raw.tagGroupById === 'object' ? raw.tagGroupById : {},
    commentsByMedia: raw?.commentsByMedia && typeof raw.commentsByMedia === 'object' ? raw.commentsByMedia : {},
    auditLogs: Array.isArray(raw?.auditLogs) ? raw.auditLogs : [],
    manualMedia: Array.isArray(raw?.manualMedia) ? raw.manualMedia : [],
    deletedTagIds: Array.isArray(raw?.deletedTagIds) ? raw.deletedTagIds : [],
    deletedFolderIds: Array.isArray(raw?.deletedFolderIds) ? raw.deletedFolderIds : [],
    nextTagId: Number.isFinite(raw?.nextTagId) ? raw.nextTagId : 1,
    nextTagGroupId: Number.isFinite(raw?.nextTagGroupId) ? raw.nextTagGroupId : 1,
    nextCommentId: Number.isFinite(raw?.nextCommentId) ? raw.nextCommentId : 1,
    nextFolderId: Number.isFinite(raw?.nextFolderId) ? raw.nextFolderId : 1,
  }
}

function getResolvedTagsAndFolders(meta, libraryPath) {
  const resolvedLibraryPath = String(libraryPath || activeLibraryPath || '').trim()
  if (
    resolvedLibraryPath &&
    resolvedLibraryPath === cachedResolvedTfLibraryPath &&
    cachedResolvedTfRevision === mediaDataRevision
  ) {
    return cachedResolvedTf
  }
  const deletedTagIds = new Set(asArray(meta?.deletedTagIds).map((v) => Number(v)).filter(Number.isFinite))
  const baseTags = asArray(readJsonIfExists(resolvedLibraryPath ? path.join(resolvedLibraryPath, 'tags.json') : null, []))
    .filter((t) => !deletedTagIds.has(Number(t?.id)))
  const deletedFolderIds = new Set(asArray(meta?.deletedFolderIds).map((v) => Number(v)).filter(Number.isFinite))
  const baseFolders = asArray(readJsonIfExists(resolvedLibraryPath ? path.join(resolvedLibraryPath, 'folders.json') : null, []))
    .filter((f) => !deletedFolderIds.has(Number(f?.id)))
  const libraryMedia =
    resolvedLibraryPath && cachedLibraryPath === resolvedLibraryPath
      ? asArray(cachedScannedMedia)
      : asArray(readLibraryMediaIndex(resolvedLibraryPath))
  const discoveredTags = collectNamedEntitiesFromMedia(libraryMedia, 'tag')
  const discoveredFolders = collectNamedEntitiesFromMedia(libraryMedia, 'folder')
  const fallbackTags = collectNamedEntitiesFromLibraryMetadata(resolvedLibraryPath, 'tag')
  const fallbackFolders = collectNamedEntitiesFromLibraryMetadata(resolvedLibraryPath, 'folder')
  const tags = [
    ...baseTags,
    ...asArray(meta?.tags).filter((t) => !deletedTagIds.has(Number(t?.id))),
    ...discoveredTags.filter((t) => !deletedTagIds.has(Number(t?.id))),
    ...fallbackTags.filter((t) => !deletedTagIds.has(Number(t?.id))),
  ]
  const folders = [
    ...baseFolders,
    ...asArray(meta?.folders).filter((f) => !deletedFolderIds.has(Number(f?.id))),
    ...discoveredFolders.filter((f) => !deletedFolderIds.has(Number(f?.id))),
    ...fallbackFolders.filter((f) => !deletedFolderIds.has(Number(f?.id))),
  ]

  const uniqueById = (arr) => {
    const map = new Map()
    for (const item of arr) {
      const id = Number(item?.id)
      if (!Number.isFinite(id)) continue
      map.set(id, item)
    }
    return [...map.values()]
  }

  const tagGroupMapRaw = meta?.tagGroupById && typeof meta.tagGroupById === 'object' ? meta.tagGroupById : {}
  const tagGroupMap = new Map(
    Object.entries(tagGroupMapRaw)
      .map(([k, v]) => [Number(k), v == null ? null : Number(v)])
      .filter(([k]) => Number.isFinite(k)),
  )

  const resolvedTags = uniqueById(tags).map((tag) => {
    const idNum = Number(tag?.id)
    if (!Number.isFinite(idNum)) return tag
    if (!tagGroupMap.has(idNum)) return tag
    return {
      ...tag,
      groupId: tagGroupMap.get(idNum),
    }
  })

  const result = {
    tags: resolvedTags,
    folders: uniqueById(folders),
  }
  if (resolvedLibraryPath) {
    cachedResolvedTfLibraryPath = resolvedLibraryPath
    cachedResolvedTfRevision = mediaDataRevision
    cachedResolvedTf = result
  }
  return result
}

function toSyntheticNamedId(kind, name) {
  const hex = hashPath(`${String(kind || 'item')}::${String(name || '').toLowerCase()}`).slice(0, 10)
  return -Math.abs(parseInt(hex || '1', 16))
}

function collectNamedEntitiesFromMedia(mediaList, kind) {
  const sourceKey = kind === 'folder' ? 'folders' : 'tags'
  const out = []
  const seen = new Set()

  for (const media of asArray(mediaList)) {
    for (const value of asArray(media?.[sourceKey])) {
      const rawName =
        typeof value === 'string'
          ? value
          : (value && typeof value === 'object' && typeof value.name === 'string' ? value.name : '')
      const name = String(rawName || '').trim()
      if (!name) continue
      const normalized = name.toLowerCase()
      if (seen.has(normalized)) continue
      seen.add(normalized)

      const explicitId = Number(value?.id)
      if (Number.isFinite(explicitId)) {
        out.push({ ...value, id: explicitId, name })
        continue
      }

      if (kind === 'folder') {
        out.push({ id: toSyntheticNamedId(kind, name), name, parent_id: null, order_index: 0 })
      } else {
        out.push({ id: toSyntheticNamedId(kind, name), name })
      }
    }
  }

  return out
}

function collectNamedEntitiesFromLibraryMetadata(libraryPath, kind) {
  const normalizedLibraryPath = String(libraryPath || '').trim()
  if (!normalizedLibraryPath) return []

  const imagesRoot = path.join(normalizedLibraryPath, 'images')
  if (!fs.existsSync(imagesRoot)) return []

  const out = []
  const seen = new Set()
  let dirs = []
  try {
    dirs = fs.readdirSync(imagesRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const sourceKey = kind === 'folder' ? 'folders' : 'tags'
  for (const dir of dirs) {
    if (!dir?.isDirectory?.()) continue
    const metadataPath = path.join(imagesRoot, dir.name, 'metadata.json')
    const raw = readJsonIfExists(metadataPath, null)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue

    for (const value of asArray(raw?.[sourceKey])) {
      const rawName =
        typeof value === 'string'
          ? value
          : (value && typeof value === 'object' && typeof value.name === 'string' ? value.name : '')
      const name = String(rawName || '').trim()
      if (!name) continue
      const normalizedName = name.toLowerCase()
      if (seen.has(normalizedName)) continue
      seen.add(normalizedName)

      const explicitId = Number(value?.id)
      if (Number.isFinite(explicitId)) {
        out.push({ ...value, id: explicitId, name })
      } else if (kind === 'folder') {
        out.push({ id: toSyntheticNamedId(kind, name), name, parent_id: null, order_index: 0 })
      } else {
        out.push({ id: toSyntheticNamedId(kind, name), name })
      }
    }
  }

  return out
}

function normalizeNamedEntities(values, byId, byName, kind) {
  const out = []
  const seen = new Set()

  for (const value of asArray(values)) {
    let resolved = null
    const idNum = Number(value?.id)
    if (Number.isFinite(idNum)) {
      resolved = byId.get(idNum) || value
    }

    if (!resolved) {
      const rawName =
        typeof value === 'string'
          ? value
          : (value && typeof value === 'object' && typeof value.name === 'string' ? value.name : '')
      const name = String(rawName || '').trim()
      if (!name) continue
      resolved = byName.get(name.toLowerCase()) || { id: toSyntheticNamedId(kind, name), name }
    }

    const resolvedId = Number(resolved?.id)
    const resolvedName = String(resolved?.name || '').trim()
    const dedupeKey = Number.isFinite(resolvedId) ? `id:${resolvedId}` : `name:${resolvedName.toLowerCase()}`
    if (!resolvedName && !Number.isFinite(resolvedId)) continue
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push(resolved)
  }

  return out
}

function mergeNamedEntities(primary, secondary) {
  const out = []
  const seen = new Set()
  for (const item of [...asArray(primary), ...asArray(secondary)]) {
    const idNum = Number(item?.id)
    const name = String(item?.name || '').trim()
    const key = Number.isFinite(idNum) ? `id:${idNum}` : `name:${name.toLowerCase()}`
    if (!name && !Number.isFinite(idNum)) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function mergeMediaWithMeta(mediaList, libraryPath) {
  const resolvedLibraryPath = String(libraryPath || activeLibraryPath || '').trim()
  const meta = resolvedLibraryPath ? loadLocalMetaForLibrary(resolvedLibraryPath) : loadLocalMeta()
  const byFilePath = meta.byFilePath || {}
  const hasByFilePath = byFilePath && typeof byFilePath === 'object' && Object.keys(byFilePath).length > 0
  const manualMedia = asArray(meta.manualMedia)
  const { tags, folders } = getResolvedTagsAndFolders(meta, resolvedLibraryPath)
  const tagById = new Map(tags.map((t) => [Number(t.id), t]))
  const tagByName = new Map(
    tags
      .filter((t) => typeof t?.name === 'string' && t.name.trim())
      .map((t) => [String(t.name).trim().toLowerCase(), t]),
  )
  const folderById = new Map(folders.map((f) => [Number(f.id), f]))
  const folderByName = new Map(
    folders
      .filter((f) => typeof f?.name === 'string' && f.name.trim())
      .map((f) => [String(f.name).trim().toLowerCase(), f]),
  )
  if (!hasByFilePath && manualMedia.length === 0) {
    return asArray(mediaList)
      .map((m) => ({
        ...m,
        tags: normalizeNamedEntities(m?.tags, tagById, tagByName, 'tag'),
        folders: normalizeNamedEntities(m?.folders, folderById, folderByName, 'folder'),
      }))
      .filter((m) => !m?.permanently_deleted)
  }

  const scannedOrCached = asArray(mediaList)
    .map((m) => {
      const filePath = String(m?.file_path || '')
      const overlay = byFilePath[filePath] || {}
      const tagIds = asArray(overlay.tag_ids).map((v) => Number(v)).filter(Number.isFinite)
      const folderIds = asArray(overlay.folder_ids).map((v) => Number(v)).filter(Number.isFinite)
      const resolvedTags = mergeNamedEntities(
        tagIds.length > 0 ? tagIds.map((id) => tagById.get(id)).filter(Boolean) : [],
        normalizeNamedEntities(m?.tags, tagById, tagByName, 'tag'),
      )
      const resolvedFolders = mergeNamedEntities(
        folderIds.length > 0 ? folderIds.map((id) => folderById.get(id)).filter(Boolean) : [],
        normalizeNamedEntities(m?.folders, folderById, folderByName, 'folder'),
      )
      const merged = {
        ...m,
        ...overlay,
        tags: resolvedTags,
        folders: resolvedFolders,
      }
      return merged
    })

  const indexed = new Map()
  for (const m of scannedOrCached) {
    indexed.set(String(m?.file_path || ''), m)
  }

  for (const manual of manualMedia) {
    const fp = String(manual?.file_path || '')
    if (!fp || indexed.has(fp)) continue
    const overlay = byFilePath[fp] || {}
    indexed.set(fp, {
      ...manual,
      ...overlay,
      tags: normalizeNamedEntities(manual?.tags, tagById, tagByName, 'tag'),
      folders: normalizeNamedEntities(manual?.folders, folderById, folderByName, 'folder'),
    })
  }

  return [...indexed.values()].filter((m) => !m?.permanently_deleted)
}

function getAllMediaForActiveLibrary() {
  if (
    activeLibraryPath &&
    cachedMergedLibraryPath === activeLibraryPath &&
    cachedMergedRevision === mediaDataRevision
  ) {
    return cachedMergedMedia
  }

  if (activeLibraryPath && cachedLibraryPath === activeLibraryPath) {
    const merged = mergeMediaWithMeta(cachedScannedMedia, activeLibraryPath)
    cachedMergedLibraryPath = activeLibraryPath
    cachedMergedRevision = mediaDataRevision
    cachedMergedMedia = merged
    return merged
  }

  // Never block startup/UI on a full filesystem scan.
  // If index is missing, return empty and wait for explicit refresh/import.
  const allMedia = activeLibraryPath ? readLibraryMediaIndex(activeLibraryPath) : []
  if (!Array.isArray(allMedia) || allMedia.length === 0) {
    if (activeLibraryPath) {
      setCachedScannedMedia(activeLibraryPath, [])
    }
    cachedMergedLibraryPath = activeLibraryPath
    cachedMergedRevision = mediaDataRevision
    cachedMergedMedia = []
    return []
  }

  if (activeLibraryPath) {
    setCachedScannedMedia(activeLibraryPath, allMedia)
  }
  const merged = mergeMediaWithMeta(allMedia, activeLibraryPath)
  cachedMergedLibraryPath = activeLibraryPath
  cachedMergedRevision = mediaDataRevision
  cachedMergedMedia = merged
  return merged
}

function getMediaById(mediaId) {
  const idNum = Number(mediaId)
  if (!Number.isFinite(idNum)) return null
  if (mediaIndexById.has(idNum)) return mediaIndexById.get(idNum)
  const all = getAllMediaForActiveLibrary()
  const found = all.find((m) => Number(m?.id) === idNum) || null
  if (found) {
    mediaIndexById.set(idNum, found)
  }
  return found
}

function getUniqueTargetPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath
  const dir = path.dirname(targetPath)
  const ext = path.extname(targetPath)
  const base = path.basename(targetPath, ext)
  let index = 1
  while (true) {
    const candidate = path.join(dir, `${base} (${index})${ext}`)
    if (!fs.existsSync(candidate)) return candidate
    index += 1
  }
}

function normalizeNamedList(values) {
  return [...new Set(asArray(values)
    .map((value) => {
      if (typeof value === 'string') return value.trim()
      if (value && typeof value === 'object') {
        const name = typeof value.name === 'string' ? value.name : ''
        return name.trim()
      }
      return ''
    })
    .filter(Boolean))]
}

function ensureTagIdsByName(targetMeta, targetLibraryPath, names) {
  const requested = normalizeNamedList(names)
  if (requested.length === 0) return []

  const { tags: resolvedTags } = getResolvedTagsAndFolders(targetMeta, targetLibraryPath)
  const tags = asArray(targetMeta.tags)
  const byName = new Map(resolvedTags
    .filter((tag) => tag && typeof tag.name === 'string')
    .map((tag) => [String(tag.name).trim().toLowerCase(), Number(tag.id)]))
  const allKnownIds = new Set(resolvedTags.map((tag) => Number(tag.id)).filter(Number.isFinite))
  let nextTagId = Math.max(Number(targetMeta.nextTagId) || 1, (allKnownIds.size > 0 ? Math.max(...allKnownIds) + 1 : 1))
  const ids = []

  for (const name of requested) {
    const key = name.toLowerCase()
    let id = byName.get(key)
    if (!Number.isFinite(id)) {
      id = nextTagId
      nextTagId += 1
      const newTag = { id, name }
      tags.push(newTag)
      byName.set(key, id)
    }
    ids.push(id)
  }

  targetMeta.tags = tags
  targetMeta.nextTagId = nextTagId
  return [...new Set(ids.filter(Number.isFinite))]
}

function ensureFolderIdsByName(targetMeta, targetLibraryPath, names) {
  const requested = normalizeNamedList(names)
  if (requested.length === 0) return []

  const { folders: resolvedFolders } = getResolvedTagsAndFolders(targetMeta, targetLibraryPath)
  const folders = asArray(targetMeta.folders)
  const byName = new Map(resolvedFolders
    .filter((folder) => folder && typeof folder.name === 'string')
    .map((folder) => [String(folder.name).trim().toLowerCase(), Number(folder.id)]))
  const allKnownIds = new Set(resolvedFolders.map((folder) => Number(folder.id)).filter(Number.isFinite))
  let nextFolderId = Math.max(Number(targetMeta.nextFolderId) || 1, (allKnownIds.size > 0 ? Math.max(...allKnownIds) + 1 : 1))
  const ids = []

  for (const name of requested) {
    const key = name.toLowerCase()
    let id = byName.get(key)
    if (!Number.isFinite(id)) {
      id = nextFolderId
      nextFolderId += 1
      const newFolder = { id, name, parent_id: null, order_index: 0 }
      folders.push(newFolder)
      byName.set(key, id)
    }
    ids.push(id)
  }

  targetMeta.folders = folders
  targetMeta.nextFolderId = nextFolderId
  return [...new Set(ids.filter(Number.isFinite))]
}

function buildTransferredOverlay(media, settings, targetMeta, targetLibraryPath) {
  const cfg = settings && typeof settings === 'object' ? settings : {}
  const overlay = {}

  if (cfg.keepRatings && Number.isFinite(Number(media?.rating))) {
    overlay.rating = Number(media.rating)
  }
  if (cfg.keepArtists) {
    const artist = typeof media?.artist === 'string' && media.artist.trim()
      ? media.artist.trim()
      : normalizeNamedList(media?.artists).join(', ')
    if (artist) overlay.artist = artist
  }
  if (cfg.keepDescription && typeof media?.description === 'string') {
    overlay.description = media.description
  }
  if (cfg.keepUrl && typeof media?.url === 'string') {
    overlay.url = media.url
  }
  if (cfg.keepComments && Array.isArray(media?.comments)) {
    overlay.comments = media.comments
  }
  if (cfg.keepThumbnails && typeof media?.thumbnail_path === 'string' && media.thumbnail_path.trim()) {
    overlay.thumbnail_path = media.thumbnail_path
  }
  if (cfg.keepTags) {
    const tagIds = ensureTagIdsByName(targetMeta, targetLibraryPath, media?.tags)
    if (tagIds.length > 0) overlay.tag_ids = tagIds
  }
  if (cfg.keepFolders) {
    const folderIds = ensureFolderIdsByName(targetMeta, targetLibraryPath, media?.folders)
    if (folderIds.length > 0) overlay.folder_ids = folderIds
  }

  return overlay
}

function refreshMediaRecordFromLibraryFile(media, meta, metadataJsonCache) {
  const source = media && typeof media === 'object' ? media : {}
  const filePath = String(source?.file_path || '').trim()
  if (!filePath || !fs.existsSync(filePath)) return null

  let stat = null
  try {
    stat = fs.statSync(filePath)
  } catch {
    stat = null
  }
  if (!stat || !stat.isFile()) return null

  const ext = path.extname(filePath).toLowerCase()
  if (!MEDIA_EXTENSIONS.has(ext)) return null

  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)
  const isAudio = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)
  const fileType = isImage ? 'image' : isAudio ? 'audio' : 'video'
  const fileName = String(source?.file_name || path.basename(filePath)).replace(/[\\/:*?"<>|]/g, '_')
  const fileDir = path.dirname(filePath)
  const fileBaseName = path.basename(fileName, path.extname(fileName))

  let thumbnailPath = ''
  const siblingThumb = findSiblingThumbnailPath(filePath)
  if (isImage) {
    thumbnailPath = filePath
  } else if (fileType === 'video') {
    const generatedThumbPath = siblingThumb && fs.existsSync(siblingThumb)
      ? siblingThumb
      : path.join(fileDir, `${fileBaseName}_thumbnail.png`)
    try {
      if (extractThumbnailWithFfmpeg(filePath, generatedThumbPath)) {
        thumbnailPath = generatedThumbPath
      }
    } catch {
      // Keep metadata refresh working even if thumbnail extraction fails.
    }
    if (!thumbnailPath && siblingThumb && fs.existsSync(siblingThumb)) {
      thumbnailPath = siblingThumb
    }
  }

  const probed = probeMediaMetadata(filePath)
  const item = {
    ...source,
    id: Number.isFinite(Number(source?.id)) ? Number(source.id) : toMediaId(filePath),
    uniqueId: source?.uniqueId ?? path.basename(fileDir),
    file_name: fileName,
    title: String(source?.title || path.basename(fileName, path.extname(fileName))),
    file_type: fileType,
    file_path: filePath,
    thumbnail_path: thumbnailPath,
    file_size: stat.size || 0,
    created_date: stat.birthtime ? new Date(stat.birthtime).toISOString() : String(source?.created_date || ''),
    created_at: stat.ctime ? new Date(stat.ctime).toISOString() : String(source?.created_at || ''),
    modified_date: stat.mtime ? new Date(stat.mtime).toISOString() : String(source?.modified_date || ''),
    rating: Number.isFinite(Number(source?.rating)) ? Number(source.rating) : 0,
    duration: Number.isFinite(Number(probed?.duration)) ? Number(probed.duration) : null,
    width: Number.isFinite(Number(probed?.width)) ? Number(probed.width) : undefined,
    height: Number.isFinite(Number(probed?.height)) ? Number(probed.height) : undefined,
    framerate: Number.isFinite(Number(probed?.framerate)) ? Number(probed.framerate) : undefined,
    audio_bitrate: Number.isFinite(Number(probed?.audio_bitrate)) ? Number(probed.audio_bitrate) : undefined,
    video_bitrate: Number.isFinite(Number(probed?.video_bitrate)) ? Number(probed.video_bitrate) : undefined,
    format_name: typeof probed?.format_name === 'string' ? probed.format_name : undefined,
    codec_id: typeof probed?.codec_id === 'string' ? probed.codec_id : undefined,
    audio_codec: typeof probed?.audio_codec === 'string' ? probed.audio_codec : undefined,
    video_codec: typeof probed?.video_codec === 'string' ? probed.video_codec : undefined,
    artist: typeof probed?.artist === 'string' ? probed.artist : source?.artist,
    description: typeof probed?.description === 'string' ? probed.description : source?.description,
    url: typeof probed?.url === 'string' ? probed.url : source?.url,
    is_deleted: Boolean(source?.is_deleted),
    last_played_at: source?.last_played_at ?? null,
    tags: Array.isArray(source?.tags) ? source.tags : [],
    folders: Array.isArray(source?.folders) ? source.folders : [],
    comments: Array.isArray(source?.comments) ? source.comments : [],
    import_source_path: source?.import_source_path || filePath,
  }

  const overlay = meta.byFilePath[filePath] && typeof meta.byFilePath[filePath] === 'object'
    ? { ...meta.byFilePath[filePath] }
    : {}
  if (thumbnailPath) overlay.thumbnail_path = thumbnailPath
  if (Number.isFinite(Number(probed?.duration))) overlay.duration = Number(probed.duration)
  if (Number.isFinite(Number(probed?.width))) overlay.width = Number(probed.width)
  if (Number.isFinite(Number(probed?.height))) overlay.height = Number(probed.height)
  if (Number.isFinite(Number(probed?.framerate))) overlay.framerate = Number(probed.framerate)
  if (Number.isFinite(Number(probed?.audio_bitrate))) overlay.audio_bitrate = Number(probed.audio_bitrate)
  if (Number.isFinite(Number(probed?.video_bitrate))) overlay.video_bitrate = Number(probed.video_bitrate)
  if (typeof probed?.format_name === 'string' && probed.format_name.trim()) overlay.format_name = probed.format_name.trim()
  if (typeof probed?.codec_id === 'string' && probed.codec_id.trim()) overlay.codec_id = probed.codec_id.trim()
  if (typeof probed?.audio_codec === 'string' && probed.audio_codec.trim()) overlay.audio_codec = probed.audio_codec.trim()
  if (typeof probed?.video_codec === 'string' && probed.video_codec.trim()) overlay.video_codec = probed.video_codec.trim()
  if (typeof probed?.artist === 'string' && probed.artist.trim()) overlay.artist = probed.artist.trim()
  if (typeof probed?.description === 'string' && probed.description.trim()) overlay.description = probed.description.trim()
  if (typeof probed?.url === 'string' && probed.url.trim()) overlay.url = probed.url.trim()

  const metadataEntry = resolveMetadataEntryForFile(filePath, metadataJsonCache)
  if (metadataEntry) {
    applyMetadataOverlayFromEntry(item, overlay, metadataEntry)
    if (Array.isArray(metadataEntry.tags)) {
      item.tags = metadataEntry.tags
    }
    if (Array.isArray(metadataEntry.folders)) {
      item.folders = metadataEntry.folders
    }
    if (Array.isArray(metadataEntry.comments)) {
      item.comments = metadataEntry.comments
    }
    if (typeof metadataEntry.last_played_at === 'string') {
      item.last_played_at = metadataEntry.last_played_at
    }
    if (typeof metadataEntry.is_deleted === 'boolean') {
      item.is_deleted = metadataEntry.is_deleted
    }
  }
  if (probed) {
    if (typeof probed.format_name === 'string' && probed.format_name.trim()) {
      item.format_name = probed.format_name.trim()
      overlay.format_name = probed.format_name.trim()
    }
    if (typeof probed.codec_id === 'string' && probed.codec_id.trim()) {
      item.codec_id = probed.codec_id.trim()
      overlay.codec_id = probed.codec_id.trim()
    }
    if (typeof probed.audio_codec === 'string' && probed.audio_codec.trim()) {
      item.audio_codec = probed.audio_codec.trim()
      overlay.audio_codec = probed.audio_codec.trim()
    }
    if (typeof probed.video_codec === 'string' && probed.video_codec.trim()) {
      item.video_codec = probed.video_codec.trim()
      overlay.video_codec = probed.video_codec.trim()
    }
  }

  const resolvedTagIds = ensureTagIdsByName(meta, activeLibraryPath, item.tags)
  if (resolvedTagIds.length > 0) {
    overlay.tag_ids = resolvedTagIds
  }
  const resolvedFolderIds = ensureFolderIdsByName(meta, activeLibraryPath, item.folders)
  if (resolvedFolderIds.length > 0) {
    overlay.folder_ids = resolvedFolderIds
  }

  meta.byFilePath[filePath] = overlay
  try {
    fs.writeFileSync(path.join(fileDir, 'metadata.json'), JSON.stringify(item, null, 2), 'utf8')
  } catch {
    // metadata.json write errors should not abort refresh
  }

  return { item, overlay }
}

function probeMediaMetadata(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null

  const normalizeFormatLabel = (input, srcPath, longName) => {
    const raw = String(input || '').trim().toLowerCase()
    const ext = String(path.extname(String(srcPath || '')) || '').replace(/^\./, '').toLowerCase()
    const full = String(longName || '').trim()
    if (raw.includes('mp4') || ext === 'mp4' || ext === 'm4v') return 'MPEG-4'
    if (raw.includes('matroska') || ext === 'mkv') return 'Matroska'
    if (raw.includes('webm') || ext === 'webm') return 'WebM'
    if (raw.includes('mpegts') || raw === 'ts' || ext === 'ts') return 'MPEG-TS'
    if (full) return full
    if (!raw) return ''
    const preferred = raw.split(',').map((v) => v.trim()).find((v) => v && v !== 'mov') || ''
    return preferred || raw
  }

  const normalizeCodecTag = (tag) => {
    const raw = String(tag || '').trim().toLowerCase()
    if (!raw) return ''
    if (raw === '[0][0][0][0]' || raw === '0x00000000') return ''
    return raw
  }

  const normalizeCodecLabel = (codec) => {
    return String(codec || '').trim().toLowerCase()
  }

  const ffprobePath = getFfprobeExecutablePath()
  try {
    const proc = spawnSync(ffprobePath, [
      '-v', 'error',
      '-show_streams',
      '-show_format',
      '-print_format', 'json',
      filePath,
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    })
    if (proc.error || proc.status !== 0) return null
    const stdout = String(proc.stdout || '')
    const data = JSON.parse(stdout || '{}')
    const streams = asArray(data?.streams)
    const videoStream = streams.find((stream) => stream && String(stream.codec_type) === 'video') || null
    const audioStream = streams.find((stream) => stream && String(stream.codec_type) === 'audio') || null
    const durationRaw = data?.format?.duration ?? videoStream?.duration
    const duration = Number(durationRaw)
    const width = Number(videoStream?.width)
    const height = Number(videoStream?.height)
    const videoBitrate = Number(videoStream?.bit_rate ?? 0)
    const formatBitrate = Number(data?.format?.bit_rate ?? 0)
    const audioBitrateRaw =
      audioStream?.bit_rate ??
      audioStream?.tags?.BPS ??
      audioStream?.tags?.BPS_eng ??
      ((!videoStream && !audioStream) ? data?.format?.bit_rate : undefined)
    let audioBitrate = Number(audioBitrateRaw)
    if ((!Number.isFinite(audioBitrate) || audioBitrate <= 0) && Number.isFinite(formatBitrate) && formatBitrate > 0) {
      if (Number.isFinite(videoBitrate) && videoBitrate > 0 && formatBitrate > videoBitrate) {
        audioBitrate = formatBitrate - videoBitrate
      } else if (!videoStream && !audioStream) {
        audioBitrate = formatBitrate
      }
    }
    const formatName = normalizeFormatLabel(
      data?.format?.format_name || '',
      filePath,
      data?.format?.format_long_name || '',
    )
    const codecId = normalizeCodecLabel(
      normalizeCodecTag(videoStream?.codec_tag_string) ||
      normalizeCodecTag(audioStream?.codec_tag_string) ||
      videoStream?.codec_name ||
      audioStream?.codec_name ||
      '',
    )
    const audioCodec = normalizeCodecLabel(audioStream?.codec_name || '')
    const videoCodec = normalizeCodecLabel(videoStream?.codec_name || '')
    let framerate
    const frameRateRaw = String(videoStream?.r_frame_rate || '')
    if (frameRateRaw.includes('/')) {
      const [numRaw, denRaw] = frameRateRaw.split('/')
      const num = Number(numRaw)
      const den = Number(denRaw)
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        framerate = num / den
      }
    }

    const combinedTags = {}
    const addTags = (tags) => {
      if (!tags || typeof tags !== 'object') return
      for (const [key, value] of Object.entries(tags)) {
        const lowKey = String(key || '').toLowerCase()
        const text = String(value || '').trim()
        if (!text) continue
        if (!combinedTags[lowKey] || String(combinedTags[lowKey]).length < text.length) {
          combinedTags[lowKey] = text
        }
      }
    }
    addTags(data?.format?.tags)
    for (const stream of streams) {
      addTags(stream?.tags)
    }

    const getTag = (keys) => {
      for (const key of keys) {
        const value = combinedTags[String(key).toLowerCase()]
        if (value) return String(value).trim()
      }
      return undefined
    }

    let artist = getTag(['artist', 'uploader', 'performer', 'composer'])
    let description = getTag(['description', 'synopsis', 'comment'])
    let comment = getTag(['comment', 'url'])
    let url

    let partId = combinedTags.part_id || combinedTags.episode_id || combinedTags.title
    if (!partId) {
      for (const value of Object.values(combinedTags)) {
        const text = String(value || '')
        if (!text) continue
        try {
          if (text.trim().startsWith('{')) {
            const parsed = JSON.parse(text)
            if (parsed && (parsed.Part_ID || parsed.part_id)) {
              partId = parsed.Part_ID || parsed.part_id
              break
            }
          }
        } catch {
          // Ignore JSON parse failures in embedded tag strings.
        }
        const match = text.match(/["']?Part_ID["']?\s*[:=]\s*["']?([a-zA-Z0-9]+)["']?/i)
        if (match && match[1]) {
          partId = match[1]
          break
        }
      }
    }
    if (!partId) {
      const inStdout = stdout.match(/["']?Part_ID["']?\s*[:=]\s*["']?([a-zA-Z0-9]+)["']?/i)
      if (inStdout && inStdout[1]) {
        partId = inStdout[1]
      }
    }
    if (!partId) {
      const fileName = path.basename(String(filePath || ''))
      const fromName = fileName.match(/(sm|nm|so)\d+/i)
      if (fromName && fromName[0]) {
        partId = fromName[0]
      }
    }

    const textToSearch = [comment, description].filter(Boolean).join('\n')
    const urlMatch = textToSearch.match(/https?:\/\/[^\s]+/)
    if (urlMatch && urlMatch[0]) {
      url = urlMatch[0]
      if (description && description.trim() === url) description = undefined
      if (comment && comment.trim() === url) comment = undefined
    } else if (partId) {
      url = `https://www.nicovideo.jp/watch/${partId}`
    }
    if (description && comment && description.trim() === comment.trim()) {
      description = undefined
    }
    if (description && url && description.trim() === String(url).trim()) {
      description = undefined
    }

    return {
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
      duration: Number.isFinite(duration) ? duration : undefined,
      framerate: Number.isFinite(Number(framerate)) ? Number(framerate) : undefined,
      audio_bitrate: Number.isFinite(audioBitrate) && audioBitrate > 0 ? audioBitrate : undefined,
      video_bitrate: Number.isFinite(videoBitrate) && videoBitrate > 0 ? videoBitrate : undefined,
      format_name: formatName || undefined,
      codec_id: codecId || undefined,
      audio_codec: audioCodec || undefined,
      video_codec: videoCodec || undefined,
      artist: artist || undefined,
      description: description || undefined,
      comment: comment || undefined,
      url: url || undefined,
    }
  } catch {
    return null
  }
}

function getMetadataJsonPathForFile(filePath) {
  const normalized = String(filePath || '').trim()
  if (!normalized) return null
  return path.join(path.dirname(normalized), 'metadata.json')
}

function syncMetadataJsonForMedia(media, overlay, meta) {
  try {
    const filePath = String(media?.file_path || '').trim()
    const metadataPath = getMetadataJsonPathForFile(filePath)
    if (!metadataPath) return

    const baseRaw = readJsonIfExists(metadataPath, null)
    const base = baseRaw && typeof baseRaw === 'object' && !Array.isArray(baseRaw) ? { ...baseRaw } : {}
    const merged = { ...media, ...overlay }
    const { tags, folders } = getResolvedTagsAndFolders(meta)
    const tagById = new Map(asArray(tags).map((t) => [Number(t?.id), t]))
    const tagByName = new Map(
      asArray(tags)
        .filter((t) => typeof t?.name === 'string' && t.name.trim())
        .map((t) => [String(t.name).trim().toLowerCase(), t]),
    )
    const folderById = new Map(asArray(folders).map((f) => [Number(f?.id), f]))
    const folderByName = new Map(
      asArray(folders)
        .filter((f) => typeof f?.name === 'string' && f.name.trim())
        .map((f) => [String(f.name).trim().toLowerCase(), f]),
    )

    const tagIds = asArray(overlay?.tag_ids).map((v) => Number(v)).filter(Number.isFinite)
    const folderIds = asArray(overlay?.folder_ids).map((v) => Number(v)).filter(Number.isFinite)
    const resolvedTags = tagIds.length > 0
      ? tagIds.map((id) => tagById.get(id)).filter(Boolean)
      : normalizeNamedEntities(merged?.tags, tagById, tagByName, 'tag')
    const resolvedFolders = folderIds.length > 0
      ? folderIds.map((id) => folderById.get(id)).filter(Boolean)
      : normalizeNamedEntities(merged?.folders, folderById, folderByName, 'folder')

    const payload = {
      ...base,
      ...merged,
      file_path: filePath,
      file_name: String(merged?.file_name || path.basename(filePath)),
      tags: resolvedTags,
      folders: resolvedFolders,
    }
    delete payload.tag_ids
    delete payload.folder_ids

    fs.writeFileSync(metadataPath, JSON.stringify(payload, null, 2), 'utf8')
  } catch {
    // metadata.json sync failures should not break in-app updates.
  }
}

function updateMediaMetaById(mediaId, updater) {
  const idNum = Number(mediaId)
  if (!Number.isFinite(idNum)) return null
  const media = mediaIndexById.get(idNum) || getMediaById(idNum)
  if (!media) return null
  const filePath = String(media.file_path || '')
  if (!filePath) return null

  const meta = loadLocalMeta()
  if (!meta.byFilePath || typeof meta.byFilePath !== 'object') {
    meta.byFilePath = {}
  }
  const current = meta.byFilePath[filePath] || {}
  const next = updater({ ...current }, { ...media })
  meta.byFilePath[filePath] = next
  saveLocalMeta(meta)

  const merged = { ...media, ...next }
  syncMetadataJsonForMedia(merged, next, meta)
  mediaIndexById.set(idNum, merged)
  return merged
}

function applyMediaFilters(media, filters) {
  const list = asArray(media)
  const opts = filters && typeof filters === 'object' ? filters : {}
  const query = String(opts.searchQuery || '').trim().toLowerCase()
  if (!query) return list

  return list.filter((item) => {
    const haystacks = [
      item?.file_name,
      item?.title,
      item?.description,
      item?.url,
      item?.artist,
      asArray(item?.artists).join(' '),
      asArray(item?.tags).map((t) => (typeof t === 'string' ? t : t?.name)).join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystacks.includes(query)
  })
}

function applyMediaSort(media, filters) {
  const list = [...asArray(media)]
  const sortOrder = String(filters?.sortOrder || 'name')
  const sortDirection = String(filters?.sortDirection || 'desc')
  const direction = sortDirection === 'asc' ? 1 : -1

  const keyMap = {
    name: (m) => String(m?.title || m?.file_name || ''),
    rating: (m) => Number(m?.rating || 0),
    added: (m) => String(m?.added_date || m?.created_at || ''),
    updated: (m) => String(m?.modified_date || m?.updated_at || ''),
  }
  const keyFn = keyMap[sortOrder] || keyMap.name

  list.sort((a, b) => {
    const av = keyFn(a)
    const bv = keyFn(b)
    if (av < bv) return -1 * direction
    if (av > bv) return 1 * direction
    return 0
  })

  return list
}

function emitLibraryLoadProgress(requestId, current, total, phase, extra) {
  const safeTotal = Number(total)
  const safeCurrent = Number(current)
  const normalizedTotal = Number.isFinite(safeTotal) && safeTotal > 0 ? safeTotal : 100
  const normalizedCurrent = Number.isFinite(safeCurrent)
    ? Math.max(0, Math.min(normalizedTotal, safeCurrent))
    : 0
  const payload = {
    requestId,
    current: normalizedCurrent,
    total: normalizedTotal,
    percentage: Math.round((normalizedCurrent / normalizedTotal) * 100),
    phase: String(phase || ''),
  }
  if (extra && typeof extra === 'object') {
    Object.assign(payload, extra)
  }
  send({ id: null, ok: true, event: 'library-load-progress', payload })
}

function parseMetadata(code, fileName) {
  const metadata = {
    name: fileName,
    description: '',
    version: '1.0.0',
    author: '',
  }

  const lines = code.split('\n')
  for (let i = 0; i < Math.min(lines.length, 80); i += 1) {
    const line = lines[i].trim()
    if (!line.startsWith('//')) break
    const match = line.match(/^\/\/\s*@([a-zA-Z0-9_-]+)\s+(.+)$/)
    if (!match) continue
    const key = match[1]
    const value = match[2]
    if (key === 'name') metadata.name = value
    if (key === 'description' || key === 'desc') metadata.description = value
    if (key === 'version') metadata.version = value
    if (key === 'author') metadata.author = value
  }

  return metadata
}

function getPluginScripts() {
  const dir = getPluginDir()
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
  return files.map((fileName) => {
    const fullPath = path.join(dir, fileName)
    const code = fs.readFileSync(fullPath, 'utf8')
    const id = fileName.replace(/\.js$/i, '')
    const metadata = parseMetadata(code, fileName)
    return {
      id,
      fileName,
      name: metadata.name,
      code,
      metadata,
    }
  })
}

function handleRequest(req) {
  const id = req?.id ?? null
  const method = req?.method
  const params = req?.params || {}

  if (method === 'ping') {
    send({ id, ok: true, result: { pong: true, ts: Date.now() } })
    return
  }

  if (method === 'status') {
    send({ id, ok: true, result: { status: 'ready', pid: process.pid } })
    return
  }

  if (method === 'get_server_config') {
    try {
      const config = loadServerConfig()
      send({ id, ok: true, result: config })
    } catch (err) {
      send({ id, ok: false, error: `get_server_config failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_server_config') {
    ; (async () => {
      try {
        const current = loadServerConfig()
        const updates = params?.updates && typeof params.updates === 'object' ? params.updates : {}
        const prevPort = Number(current?.port || 53913)
        const next = saveServerConfig({ ...current, ...updates })
        const nextPort = Number(next?.port || 53913)
        const running = Boolean(networkServer && networkServer.listening)
        if (running && prevPort !== nextPort) {
          await stopNetworkServer()
          await startNetworkServer()
        }
        send({ id, ok: true, result: next })
      } catch (err) {
        send({ id, ok: false, error: `update_server_config failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'reset_host_secret') {
    try {
      const current = loadServerConfig()
      const next = saveServerConfig({ ...current, hostSecret: createHostSecret() })
      send({ id, ok: true, result: next.hostSecret })
    } catch (err) {
      send({ id, ok: false, error: `reset_host_secret failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'start_server') {
    ; (async () => {
      try {
        const current = loadServerConfig()
        saveServerConfig({ ...current, isEnabled: true })
        const result = await startNetworkServer()
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: true, result: { success: false, error: err?.message || String(err) } })
      }
    })()
    return
  }

  if (method === 'stop_server') {
    ; (async () => {
      try {
        const current = loadServerConfig()
        saveServerConfig({ ...current, isEnabled: false })
        const result = await stopNetworkServer()
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: true, result: { success: false, error: err?.message || String(err) } })
      }
    })()
    return
  }

  if (method === 'get_server_status') {
    try {
      const running = Boolean(networkServer && networkServer.listening)
      if (!running) {
        saveServerState({ running: false })
      }
      send({ id, ok: true, result: running })
    } catch (err) {
      send({ id, ok: true, result: false })
    }
    return
  }

  if (method === 'get_shared_users') {
    try {
      send({ id, ok: true, result: loadSharedUsers() })
    } catch (err) {
      send({ id, ok: false, error: `get_shared_users failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'add_shared_user') {
    try {
      const user = params?.user && typeof params.user === 'object' ? params.user : {}
      const users = loadSharedUsers()
      const now = new Date().toISOString()
      const providedAccessToken = String(user.accessToken || '').trim()
      const newUser = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        userToken: String(user.userToken || ''),
        accessToken: providedAccessToken || generateAccessToken(),
        nickname: String(user.nickname || ''),
        hardwareId: String(user.hardwareId || ''),
        permissions: asArray(user.permissions),
        createdAt: now,
        lastAccessAt: now,
        isActive: Boolean(user.isActive ?? true),
        ipAddress: user.ipAddress ? String(user.ipAddress) : undefined,
        iconUrl: user.iconUrl ? String(user.iconUrl) : undefined,
      }
      users.push(newUser)
      saveSharedUsers(users)
      send({ id, ok: true, result: newUser })
    } catch (err) {
      send({ id, ok: false, error: `add_shared_user failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'delete_shared_user') {
    try {
      const userId = String(params?.userId || '')
      const users = loadSharedUsers().filter((u) => String(u?.id) !== userId)
      saveSharedUsers(users)
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `delete_shared_user failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_shared_user') {
    try {
      const userId = String(params?.userId || '')
      const updates = params?.updates && typeof params.updates === 'object' ? params.updates : {}
      const users = loadSharedUsers().map((u) => {
        if (String(u?.id) !== userId) return u
        return { ...u, ...updates }
      })
      saveSharedUsers(users)
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_shared_user failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'discord_update_activity') {
    ; (async () => {
      try {
        const enabled = params?.enabled !== false
        if (!enabled) {
          await clearDiscordActivitySafe()
          send({ id, ok: true, result: true })
          return
        }

        const activity = params?.activity && typeof params.activity === 'object' ? params.activity : {}
        const ready = await ensureDiscordClient()
        if (!ready || !discordClient) {
          send({ id, ok: true, result: false })
          return
        }

        await discordClient.setActivity({
          details: typeof activity.details === 'string' ? activity.details : undefined,
          state: typeof activity.state === 'string' ? activity.state : undefined,
          startTimestamp: Number.isFinite(Number(activity.startTimestamp)) ? Number(activity.startTimestamp) : undefined,
          endTimestamp: Number.isFinite(Number(activity.endTimestamp)) ? Number(activity.endTimestamp) : undefined,
          largeImageKey: typeof activity.largeImageKey === 'string' ? activity.largeImageKey : 'app_icon',
          largeImageText: typeof activity.largeImageText === 'string' ? activity.largeImageText : 'Obscura',
          smallImageKey: typeof activity.smallImageKey === 'string' ? activity.smallImageKey : undefined,
          smallImageText: typeof activity.smallImageText === 'string' ? activity.smallImageText : undefined,
          instance: false,
        })
        send({ id, ok: true, result: true })
      } catch {
        send({ id, ok: true, result: false })
      }
    })()
    return
  }

  if (method === 'discord_clear_activity') {
    ; (async () => {
      try {
        const ok = await clearDiscordActivitySafe()
        send({ id, ok: true, result: ok })
      } catch {
        send({ id, ok: true, result: false })
      }
    })()
    return
  }

  if (method === 'set_active_library') {
    const libraryPath = String(params?.libraryPath || '').trim()
    activeLibraryPath = libraryPath || null
    clearCachedScannedMedia()
    mediaIndexById = new Map()
    send({ id, ok: true, result: true })
    return
  }

  if (method === 'create_library_dir') {
    try {
      const rawName = String(params?.name || '').trim()
      const parentPath = String(params?.parentPath || '').trim()
      if (!rawName || !parentPath) {
        send({ id, ok: false, error: 'create_library_dir requires name and parentPath' })
        return
      }
      const withExt = rawName.toLowerCase().endsWith('.library') ? rawName : `${rawName}.library`
      // Windows-invalid chars and trailing dots/spaces break folder creation on some machines.
      const safeName = withExt
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/[. ]+$/g, '')
        .trim()
      if (!safeName) {
        send({ id, ok: false, error: 'invalid library name' })
        return
      }
      const target = path.join(parentPath, safeName)
      ensureDir(target)
      send({ id, ok: true, result: target })
    } catch (err) {
      send({ id, ok: false, error: `create_library_dir failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'get_active_library') {
    if (!activeLibraryPath) {
      send({ id, ok: true, result: null })
      return
    }
    send({
      id,
      ok: true,
      result: {
        name: path.basename(activeLibraryPath),
        path: activeLibraryPath,
      },
    })
    return
  }

  if (method === 'get_media_files') {
    try {
      const rawFilters = params?.filters && typeof params.filters === 'object' ? { ...params.filters } : {}
      const fastPreview =
        Boolean(params?.fastPreview) ||
        Boolean(rawFilters?.__fastPreview) ||
        Boolean(rawFilters?.__obscuraFastPreview)
      delete rawFilters.__fastPreview
      delete rawFilters.__obscuraFastPreview
      const filters = rawFilters
      const hasPaging =
        params &&
        typeof params === 'object' &&
        params.page !== undefined &&
        params.limit !== undefined
      const limitRaw = Number(params?.limit)
      const pageRaw = Number(params?.page)
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 100

      emitLibraryLoadProgress(id, 3, 100, 'read-index')
      const merged = getAllMediaForActiveLibrary()
      emitLibraryLoadProgress(id, 45, 100, 'index-ready', { totalItems: asArray(merged).length })

      let filtered = []
      if (fastPreview) {
        filtered = asArray(merged)
        emitLibraryLoadProgress(id, 70, 100, 'preview-ready', { previewMode: true })
      } else {
        const filterCacheKey = JSON.stringify({
          activeLibraryPath: String(activeLibraryPath || ''),
          filters,
        })
        if (cachedFilteredRevision === mediaDataRevision && cachedFilteredKey === filterCacheKey) {
          filtered = cachedFilteredMedia
        } else {
          filtered = applyMediaSort(applyMediaFilters(merged, filters), filters)
          cachedFilteredRevision = mediaDataRevision
          cachedFilteredKey = filterCacheKey
          cachedFilteredMedia = filtered
        }
        emitLibraryLoadProgress(id, 88, 100, 'filter-ready')
      }
      mediaIndexById = new Map(asArray(filtered).map((m) => [Number(m?.id), m]))
      if (!hasPaging) {
        emitLibraryLoadProgress(id, 100, 100, 'done', { count: asArray(filtered).length, previewMode: fastPreview })
        send({ id, ok: true, result: filtered })
        return
      }

      const start = (page - 1) * limit
      const media = asArray(filtered).slice(start, start + limit)
      emitLibraryLoadProgress(id, 100, 100, 'done', {
        count: asArray(filtered).length,
        returned: media.length,
        page,
        limit,
        previewMode: fastPreview,
      })
      send({
        id,
        ok: true,
        result: {
          media,
          total: asArray(filtered).length,
          page,
          limit,
        },
      })
    } catch (err) {
      send({ id, ok: false, error: `get_media_files failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'refresh_library') {
    ; (async () => {
      try {
        send({ id: null, ok: true, event: 'refresh-progress', payload: { current: 0, total: 100 } })
        if (activeLibraryPath) {
          const imagesRoot = path.join(activeLibraryPath, 'images')
          const scanRoot = fs.existsSync(imagesRoot) ? imagesRoot : activeLibraryPath
          const scannedRaw = await scanLocalMediaFilesAsync(scanRoot, DEFAULT_SCAN_LIMIT, (pulse) => {
            const progress = Math.min(30, Math.floor((Number(pulse?.processed || 0) / 25000) * 30))
            send({ id: null, ok: true, event: 'refresh-progress', payload: { current: progress, total: 100 } })
          })
          send({ id: null, ok: true, event: 'refresh-progress', payload: { current: 30, total: 100 } })
          writeLibraryMediaIndex(activeLibraryPath, scannedRaw)

          const meta = loadLocalMeta()
          const metadataJsonCache = new Map()
          if (!meta.byFilePath || typeof meta.byFilePath !== 'object') {
            meta.byFilePath = {}
          }
          const refreshed = []
          const total = Math.max(scannedRaw.length, 1)

          for (let i = 0; i < scannedRaw.length; i += 1) {
            const media = scannedRaw[i]
            const rebuilt = refreshMediaRecordFromLibraryFile(media, meta, metadataJsonCache)
            refreshed.push(rebuilt?.item || media)
            const progress = 30 + Math.floor(((i + 1) / total) * 70)
            send({ id: null, ok: true, event: 'refresh-progress', payload: { current: Math.min(progress, 100), total: 100 } })
          }

          saveLocalMeta(meta)
          writeLibraryMediaIndex(activeLibraryPath, refreshed)
          setCachedScannedMedia(activeLibraryPath, refreshed)
          const scanned = mergeMediaWithMeta(refreshed, activeLibraryPath)
          mediaIndexById = new Map(asArray(scanned).map((m) => [Number(m?.id), m]))
          send({ id: null, ok: true, event: 'refresh-progress', payload: { current: 100, total: 100 } })
        } else {
          clearCachedScannedMedia()
          mediaIndexById = new Map()
          send({ id: null, ok: true, event: 'refresh-progress', payload: { current: 100, total: 100 } })
        }
        send({ id, ok: true, result: true })
      } catch (err) {
        send({ id, ok: false, error: `refresh_library failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'get_media_file') {
    try {
      const mediaId = Number(params?.id)
      if (!Number.isFinite(mediaId)) {
        send({ id, ok: true, result: null })
        return
      }

      let media = mediaIndexById.get(mediaId) || null
      if (!media && activeLibraryPath) {
        const scanned = getAllMediaForActiveLibrary()
        media = scanned.find((m) => Number(m?.id) === mediaId) || null
      }

      send({ id, ok: true, result: media })
    } catch (err) {
      send({ id, ok: false, error: `get_media_file failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'generate_thumbnail') {
    try {
      const mediaId = Number(params?.mediaId)
      const sourcePath = String(params?.filePath || getMediaById(mediaId)?.file_path || '').trim()
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        send({ id, ok: true, result: null })
        return
      }

      const siblingThumb = findSiblingThumbnailPath(sourcePath)
      if (siblingThumb) {
        if (Number.isFinite(mediaId)) {
          updateMediaMetaById(mediaId, (prev) => ({ ...prev, thumbnail_path: siblingThumb }))
        }
        send({ id, ok: true, result: siblingThumb })
        return
      }

      if (isImagePath(sourcePath)) {
        if (Number.isFinite(mediaId)) {
          updateMediaMetaById(mediaId, (prev) => ({ ...prev, thumbnail_path: sourcePath }))
        }
        send({ id, ok: true, result: sourcePath })
        return
      }

      if (isAudioPath(sourcePath)) {
        send({ id, ok: true, result: null })
        return
      }

      const thumbRoot = activeLibraryPath
        ? path.join(activeLibraryPath, '.obscura-thumbnails')
        : path.join(getDataRoot(), 'thumbnails')
      ensureDir(thumbRoot)
      const thumbName = Number.isFinite(mediaId)
        ? `${mediaId}.jpg`
        : `${hashPath(sourcePath).slice(0, 16)}.jpg`
      const thumbPath = path.join(thumbRoot, thumbName)

      if (fs.existsSync(thumbPath)) {
        if (Number.isFinite(mediaId)) {
          updateMediaMetaById(mediaId, (prev) => ({ ...prev, thumbnail_path: thumbPath }))
        }
        send({ id, ok: true, result: thumbPath })
        return
      }

      const ok = extractThumbnailWithFfmpeg(sourcePath, thumbPath)
      if (ok && Number.isFinite(mediaId)) {
        updateMediaMetaById(mediaId, (prev) => ({ ...prev, thumbnail_path: thumbPath }))
      }
      send({ id, ok: true, result: ok ? thumbPath : null })
    } catch (err) {
      send({ id, ok: false, error: `generate_thumbnail failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'generate_previews') {
    try {
      const mediaId = Number(params?.mediaId)
      const interval = Math.max(0.2, Number(params?.interval || 1))
      const media = getMediaById(mediaId)
      const sourcePath = String(media?.file_path || '').trim()
      if (!sourcePath || !fs.existsSync(sourcePath) || isAudioPath(sourcePath) || isImagePath(sourcePath)) {
        send({ id, ok: true, result: [] })
        return
      }

      const previewsDir = path.join(getDataRoot(), 'previews', `${mediaId}_${interval}s`)
      if (fs.existsSync(previewsDir)) {
        const existing = asArray(fs.readdirSync(previewsDir))
          .filter((f) => f.startsWith('preview_') && f.endsWith('.jpg'))
          .sort()
          .map((f) => path.join(previewsDir, f))
        if (existing.length > 0) {
          send({ id, ok: true, result: existing })
          return
        }
      }

      const files = generatePreviewImages(sourcePath, previewsDir, interval)
      send({ id, ok: true, result: files })
    } catch (err) {
      send({ id, ok: false, error: `generate_previews failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'get_tags') {
    try {
      const meta = loadLocalMetaForLibrary(activeLibraryPath)
      const { tags } = getResolvedTagsAndFolders(meta, activeLibraryPath)
      send({ id, ok: true, result: tags })
    } catch (err) {
      send({ id, ok: false, error: `get_tags failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'create_tag') {
    try {
      const name = String(params?.name || '').trim()
      if (!name) {
        send({ id, ok: false, error: 'create_tag requires name' })
        return
      }
      const meta = loadLocalMeta()
      const { tags } = getResolvedTagsAndFolders(meta)
      const maxId = tags.reduce((acc, t) => Math.max(acc, Number(t?.id) || 0), 0)
      const nextId = Math.max(Number(meta.nextTagId || 1), maxId + 1)
      const newTag = { id: nextId, name }
      meta.tags = [...asArray(meta.tags), newTag]
      meta.deletedTagIds = asArray(meta.deletedTagIds).map(Number).filter((id) => id !== nextId)
      meta.nextTagId = nextId + 1
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'tag:create',
        targetId: nextId,
        targetName: name,
        description: `Created tag "${name}"`,
      })
      send({ id, ok: true, result: newTag })
    } catch (err) {
      send({ id, ok: false, error: `create_tag failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'delete_tag') {
    try {
      const tagId = Number(params?.id)
      const meta = loadLocalMeta()
      meta.tags = asArray(meta.tags).filter((t) => Number(t?.id) !== tagId)
      meta.deletedTagIds = [...new Set([...asArray(meta.deletedTagIds).map(Number).filter(Number.isFinite), tagId])]
      for (const [fp, entry] of Object.entries(meta.byFilePath || {})) {
        const current = entry && typeof entry === 'object' ? entry : {}
        current.tag_ids = asArray(current.tag_ids).map(Number).filter((id) => id !== tagId)
        meta.byFilePath[fp] = current
      }
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'tag:delete',
        targetId: tagId,
        targetName: String(tagId),
        description: `Deleted tag #${tagId}`,
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `delete_tag failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'add_tag_to_media') {
    try {
      const mediaId = Number(params?.mediaId)
      const tagId = Number(params?.tagId)
      updateMediaMetaById(mediaId, (prev) => {
        const current = asArray(prev.tag_ids).map(Number).filter(Number.isFinite)
        const next = new Set(current)
        next.add(tagId)
        return { ...prev, tag_ids: [...next] }
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `add_tag_to_media failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'add_tags_to_media') {
    try {
      const mediaIds = asArray(params?.mediaIds).map(Number).filter(Number.isFinite)
      const tagIds = asArray(params?.tagIds).map(Number).filter(Number.isFinite)
      for (const mediaId of mediaIds) {
        updateMediaMetaById(mediaId, (prev) => {
          const current = asArray(prev.tag_ids).map(Number).filter(Number.isFinite)
          const next = new Set(current)
          for (const tagId of tagIds) next.add(tagId)
          return { ...prev, tag_ids: [...next] }
        })
      }
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `add_tags_to_media failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'remove_tag_from_media') {
    try {
      const mediaId = Number(params?.mediaId)
      const tagId = Number(params?.tagId)
      updateMediaMetaById(mediaId, (prev) => ({
        ...prev,
        tag_ids: asArray(prev.tag_ids).map(Number).filter((id) => id !== tagId),
      }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `remove_tag_from_media failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'get_tag_groups') {
    try {
      const meta = loadLocalMeta()
      send({ id, ok: true, result: asArray(meta.tagGroups) })
    } catch (err) {
      send({ id, ok: false, error: `get_tag_groups failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'create_tag_group') {
    try {
      const name = String(params?.name || '').trim()
      if (!name) {
        send({ id, ok: false, error: 'create_tag_group requires name' })
        return
      }
      const meta = loadLocalMeta()
      const groups = asArray(meta.tagGroups)
      const maxId = groups.reduce((acc, g) => Math.max(acc, Number(g?.id) || 0), 0)
      const nextId = Math.max(Number(meta.nextTagGroupId || 1), maxId + 1)
      const group = { id: nextId, name }
      meta.tagGroups = [...groups, group]
      meta.nextTagGroupId = nextId + 1
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'tag-group:create',
        targetId: nextId,
        targetName: name,
        description: `Created tag group "${name}"`,
      })
      send({ id, ok: true, result: group })
    } catch (err) {
      send({ id, ok: false, error: `create_tag_group failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'delete_tag_group') {
    try {
      const groupId = Number(params?.id)
      const meta = loadLocalMeta()
      meta.tagGroups = asArray(meta.tagGroups).filter((g) => Number(g?.id) !== groupId)
      const nextMap = {}
      for (const [tagId, mappedGroupId] of Object.entries(meta.tagGroupById || {})) {
        const n = mappedGroupId == null ? null : Number(mappedGroupId)
        if (n === groupId) {
          nextMap[tagId] = null
        } else {
          nextMap[tagId] = n
        }
      }
      meta.tagGroupById = nextMap
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'tag-group:delete',
        targetId: groupId,
        targetName: String(groupId),
        description: `Deleted tag group #${groupId}`,
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `delete_tag_group failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'rename_tag_group') {
    try {
      const groupId = Number(params?.id)
      const newName = String(params?.newName || '').trim()
      const meta = loadLocalMeta()
      meta.tagGroups = asArray(meta.tagGroups).map((g) =>
        Number(g?.id) === groupId ? { ...g, name: newName || g?.name || '' } : g,
      )
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'tag-group:rename',
        targetId: groupId,
        targetName: newName,
        description: `Renamed tag group #${groupId} to "${newName}"`,
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `rename_tag_group failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_tag_group') {
    try {
      const tagId = Number(params?.tagId)
      const groupId = params?.groupId == null ? null : Number(params.groupId)
      const meta = loadLocalMeta()
      const map = meta.tagGroupById && typeof meta.tagGroupById === 'object' ? { ...meta.tagGroupById } : {}
      map[String(tagId)] = groupId
      meta.tagGroupById = map
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'tag-group:update-tag',
        targetId: tagId,
        targetName: String(tagId),
        description: `Assigned tag #${tagId} to group ${groupId == null ? 'none' : `#${groupId}`}`,
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_tag_group failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'add_comment') {
    try {
      const mediaId = Number(params?.mediaId)
      const text = String(params?.text || '').trim()
      const time = Number(params?.time || 0)
      if (!Number.isFinite(mediaId) || !text) {
        send({ id, ok: false, error: 'add_comment requires mediaId and text' })
        return
      }
      const meta = loadLocalMeta()
      const commentsByMedia = meta.commentsByMedia && typeof meta.commentsByMedia === 'object'
        ? { ...meta.commentsByMedia }
        : {}
      const key = String(mediaId)
      const list = asArray(commentsByMedia[key])
      const nextCommentId = Math.max(1, Number(meta.nextCommentId || 1))
      const item = {
        id: nextCommentId,
        mediaId,
        text,
        time: Number.isFinite(time) ? time : 0,
        createdAt: new Date().toISOString(),
      }
      commentsByMedia[key] = [...list, item]
      meta.commentsByMedia = commentsByMedia
      meta.nextCommentId = nextCommentId + 1
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'comment:add',
        targetId: mediaId,
        targetName: String(mediaId),
        description: `Added comment to media #${mediaId}`,
      })
      send({ id, ok: true, result: item })
    } catch (err) {
      send({ id, ok: false, error: `add_comment failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'get_comments') {
    try {
      const mediaId = Number(params?.mediaId)
      const meta = loadLocalMeta()
      const commentsByMedia = meta.commentsByMedia && typeof meta.commentsByMedia === 'object'
        ? meta.commentsByMedia
        : {}
      const list = asArray(commentsByMedia[String(mediaId)])
      send({ id, ok: true, result: list })
    } catch (err) {
      send({ id, ok: false, error: `get_comments failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'get_audit_logs') {
    try {
      const meta = loadLocalMeta()
      const fromLibrary = asArray(readJsonIfExists(getActiveLibraryDataPath('audit_logs.json'), []))
      const fromMeta = asArray(meta.auditLogs)
      send({ id, ok: true, result: [...fromLibrary, ...fromMeta] })
    } catch (err) {
      send({ id, ok: false, error: `get_audit_logs failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'get_folders') {
    try {
      const meta = loadLocalMetaForLibrary(activeLibraryPath)
      const { folders } = getResolvedTagsAndFolders(meta, activeLibraryPath)
      send({ id, ok: true, result: folders })
    } catch (err) {
      send({ id, ok: false, error: `get_folders failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'create_folder') {
    try {
      const name = String(params?.name || '').trim()
      const parentId = params?.parentId == null ? null : Number(params.parentId)
      if (!name) {
        send({ id, ok: false, error: 'create_folder requires name' })
        return
      }
      const meta = loadLocalMeta()
      const { folders } = getResolvedTagsAndFolders(meta)
      const maxId = folders.reduce((acc, f) => Math.max(acc, Number(f?.id) || 0), 0)
      const nextId = Math.max(Number(meta.nextFolderId || 1), maxId + 1)
      const newFolder = {
        id: nextId,
        name,
        parentId,
        orderIndex: asArray(meta.folders).length,
      }
      meta.folders = [...asArray(meta.folders), newFolder]
      meta.deletedFolderIds = asArray(meta.deletedFolderIds).map(Number).filter((id) => id !== nextId)
      meta.nextFolderId = nextId + 1
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'folder:create',
        targetId: nextId,
        targetName: name,
        description: `Created folder "${name}"`,
      })
      send({ id, ok: true, result: newFolder })
    } catch (err) {
      send({ id, ok: false, error: `create_folder failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'delete_folder') {
    try {
      const folderId = Number(params?.id)
      const meta = loadLocalMeta()
      meta.folders = asArray(meta.folders).filter((f) => Number(f?.id) !== folderId)
      meta.deletedFolderIds = [...new Set([...asArray(meta.deletedFolderIds).map(Number).filter(Number.isFinite), folderId])]
      for (const [fp, entry] of Object.entries(meta.byFilePath || {})) {
        const current = entry && typeof entry === 'object' ? entry : {}
        current.folder_ids = asArray(current.folder_ids).map(Number).filter((id) => id !== folderId)
        meta.byFilePath[fp] = current
      }
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'folder:delete',
        targetId: folderId,
        targetName: String(folderId),
        description: `Deleted folder #${folderId}`,
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `delete_folder failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'rename_folder') {
    try {
      const folderId = Number(params?.id)
      const newName = String(params?.newName || '').trim()
      const meta = loadLocalMeta()
      meta.folders = asArray(meta.folders).map((f) =>
        Number(f?.id) === folderId ? { ...f, name: newName || f.name } : f,
      )
      saveLocalMeta(meta)
      appendAuditLog({
        action: 'folder:rename',
        targetId: folderId,
        targetName: newName,
        description: `Renamed folder #${folderId} to "${newName}"`,
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `rename_folder failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'add_folder_to_media') {
    try {
      const mediaId = Number(params?.mediaId)
      const folderId = Number(params?.folderId)
      updateMediaMetaById(mediaId, (prev) => {
        const current = asArray(prev.folder_ids).map(Number).filter(Number.isFinite)
        const next = new Set(current)
        next.add(folderId)
        return { ...prev, folder_ids: [...next] }
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `add_folder_to_media failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'remove_folder_from_media') {
    try {
      const mediaId = Number(params?.mediaId)
      const folderId = Number(params?.folderId)
      updateMediaMetaById(mediaId, (prev) => ({
        ...prev,
        folder_ids: asArray(prev.folder_ids).map(Number).filter((id) => id !== folderId),
      }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `remove_folder_from_media failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_folder_structure') {
    try {
      const updates = asArray(params?.updates)
      const meta = loadLocalMeta()
      const byId = new Map(asArray(meta.folders).map((f) => [Number(f?.id), { ...f }]))
      for (const u of updates) {
        const idNum = Number(u?.id)
        const existing = byId.get(idNum)
        if (!existing) continue
        existing.parentId = u?.parentId == null ? null : Number(u.parentId)
        existing.orderIndex = Number(u?.orderIndex || 0)
        byId.set(idNum, existing)
      }
      meta.folders = [...byId.values()]
      saveLocalMeta(meta)
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_folder_structure failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'get_hardware_id') {
    send({ id, ok: true, result: getHardwareId() })
    return
  }

  if (method === 'generate_user_token') {
    const hardwareId = String(params?.hardwareId || getHardwareId())
    send({
      id,
      ok: true,
      result: generateUserTokenFromHardwareId(hardwareId),
    })
    return
  }

  if (method === 'get_plugin_scripts') {
    try {
      send({ id, ok: true, result: getPluginScripts() })
    } catch (err) {
      send({ id, ok: false, error: `plugin read failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'plugin_fetch') {
    ; (async () => {
      try {
        const url = params?.url
        if (!url || typeof url !== 'string') {
          send({ id, ok: false, error: 'plugin_fetch requires url' })
          return
        }

        const options = params?.options && typeof params.options === 'object'
          ? { ...params.options }
          : {}

        // Preserve Electron plugin-fetch behavior: return text or json body.
        const { response, insecureTlsFallback } = await fetchWithCertFallback(url, options)
        const contentType = response.headers.get('content-type') || ''
        let data
        if (contentType.includes('application/json')) {
          data = await response.json()
        } else {
          data = await response.text()
        }

        send({
          id,
          ok: true,
          result: {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            data,
            insecureTlsFallback,
          },
        })
      } catch (err) {
        send({
          id,
          ok: true,
          result: {
            ok: false,
            status: 0,
            statusText: err?.message || 'fetch failed',
            details: {
              message: err?.message || null,
              cause: err?.cause?.message || String(err?.cause || ''),
              code: err?.code || null,
            },
            error: true,
          },
        })
      }
    })()
    return
  }

  if (method === 'test_connection') {
    ; (async () => {
      try {
        const baseUrl = String(params?.url || '').replace(/\/$/, '')
        const token = String(params?.token || '')
        let userToken = String(params?.userToken || '')
        let accessToken = token

        if (!baseUrl) {
          send({ id, ok: true, result: { success: false, message: 'URL is required' } })
          return
        }

        if (token.includes(':')) {
          const parts = token.split(':')
          userToken = parts[0] || ''
          accessToken = parts[1] || ''
        }

        const healthUrl = `${baseUrl}/api/health`
        const { response: healthResponse } = await fetchWithCertFallback(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        })

        if (!healthResponse.ok) {
          send({
            id,
            ok: true,
            result: {
              success: false,
              message: `Status: ${healthResponse.status} ${healthResponse.statusText}`,
            },
          })
          return
        }

        const healthData = await healthResponse.json().catch(() => ({}))
        const profileUrl = `${baseUrl}/api/profile`
        const { response: profileResponse } = await fetchWithCertFallback(profileUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-User-Token': userToken,
          },
        })

        if (profileResponse.ok) {
          send({
            id,
            ok: true,
            result: {
              success: true,
              libraryName: healthData?.libraryName || 'Remote Library',
            },
          })
          return
        }

        if (profileResponse.status === 401 || profileResponse.status === 403) {
          send({
            id,
            ok: true,
            result: { success: false, message: 'Authentication failed. Verify access token and user token.' },
          })
          return
        }

        send({
          id,
          ok: true,
          result: {
            success: false,
            message: `Status: ${profileResponse.status} ${profileResponse.statusText}`,
          },
        })
      } catch (err) {
        send({
          id,
          ok: true,
          result: {
            success: false,
            message: normalizeConnectionError(err),
          },
        })
      }
    })()
    return
  }

  if (method === 'save_plugin_media_data') {
    try {
      const mediaId = params?.mediaId
      const pluginId = params?.pluginId
      const data = params?.data
      if (mediaId === undefined || !pluginId) {
        send({ id, ok: false, error: 'save_plugin_media_data requires mediaId and pluginId' })
        return
      }
      const target = mediaDataPath(mediaId, pluginId)
      fs.writeFileSync(target, JSON.stringify(data ?? null, null, 2), 'utf8')
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `save_plugin_media_data failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'load_plugin_media_data') {
    try {
      const mediaId = params?.mediaId
      const pluginId = params?.pluginId
      if (mediaId === undefined || !pluginId) {
        send({ id, ok: false, error: 'load_plugin_media_data requires mediaId and pluginId' })
        return
      }
      const target = mediaDataPath(mediaId, pluginId)
      if (!fs.existsSync(target)) {
        send({ id, ok: true, result: null })
        return
      }
      const raw = fs.readFileSync(target, 'utf8')
      send({ id, ok: true, result: JSON.parse(raw) })
    } catch (err) {
      send({ id, ok: false, error: `load_plugin_media_data failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'save_associated_data') {
    try {
      const mediaFilePath = params?.mediaFilePath
      const data = params?.data
      if (!mediaFilePath) {
        send({ id, ok: false, error: 'save_associated_data requires mediaFilePath' })
        return
      }
      const target = associatedDataPath(mediaFilePath)
      fs.writeFileSync(
        target,
        JSON.stringify({ mediaFilePath, data: data ?? null }, null, 2),
        'utf8',
      )
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `save_associated_data failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'load_associated_data') {
    try {
      const mediaFilePath = params?.mediaFilePath
      if (!mediaFilePath) {
        send({ id, ok: false, error: 'load_associated_data requires mediaFilePath' })
        return
      }
      const target = associatedDataPath(mediaFilePath)
      if (!fs.existsSync(target)) {
        send({ id, ok: true, result: null })
        return
      }
      const raw = fs.readFileSync(target, 'utf8')
      const parsed = JSON.parse(raw)
      send({ id, ok: true, result: parsed?.data ?? null })
    } catch (err) {
      send({ id, ok: false, error: `load_associated_data failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'install_plugins') {
    try {
      const filePaths = Array.isArray(params?.filePaths) ? params.filePaths : []
      const pluginDir = ensurePluginDir()
      const installed = []
      const skipped = []

      for (const src of filePaths) {
        if (typeof src !== 'string' || !src.toLowerCase().endsWith('.js')) {
          continue
        }

        const fileName = path.basename(src)
        const dest = path.join(pluginDir, fileName)

        if (!fs.existsSync(src)) {
          skipped.push(fileName)
          continue
        }

        if (fs.existsSync(dest)) {
          skipped.push(fileName)
          continue
        }

        fs.copyFileSync(src, dest)
        installed.push(fileName)
      }

      send({ id, ok: true, result: { installed, skipped } })
    } catch (err) {
      send({ id, ok: false, error: `install_plugins failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'uninstall_plugin') {
    try {
      const pluginId = safePluginId(params?.pluginId)
      if (!pluginId) {
        send({ id, ok: true, result: { success: false, error: 'Invalid plugin ID' } })
        return
      }
      const pluginDir = ensurePluginDir()
      const target = path.join(pluginDir, `${pluginId}.js`)
      if (!fs.existsSync(target)) {
        send({
          id,
          ok: true,
          result: { success: false, error: `Plugin file not found: ${pluginId}.js` },
        })
        return
      }

      fs.unlinkSync(target)
      send({ id, ok: true, result: { success: true } })
    } catch (err) {
      send({
        id,
        ok: true,
        result: { success: false, error: err?.message || String(err) },
      })
    }
    return
  }

  if (method === 'file_open_path') {
    try {
      const filePath = normalizeInputFilePath(params?.filePath)
      if (!filePath) {
        send({ id, ok: false, error: 'file_open_path requires filePath' })
        return
      }

      if (isWindows()) {
        const resolved = path.resolve(filePath)
        if (fs.existsSync(resolved)) {
          openPathWithDefaultFileManager(resolved)
        } else {
          spawnDetached('cmd', ['/c', 'start', '', resolved])
        }
      } else {
        spawnDetached('xdg-open', [filePath])
      }
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `file_open_path failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'file_show_item_in_folder') {
    try {
      const filePath = normalizeInputFilePath(params?.filePath)
      appendDebugLog(`file_show_item_in_folder input=${String(params?.filePath || '')}`)
      appendDebugLog(`file_show_item_in_folder normalized=${filePath}`)
      if (!filePath) {
        appendDebugLog('file_show_item_in_folder fail: empty filePath')
        send({ id, ok: false, error: 'file_show_item_in_folder requires filePath' })
        return
      }

      if (isWindows()) {
        const resolved = path.resolve(filePath)
        let targetDir = resolved
        appendDebugLog(`file_show_item_in_folder resolved=${resolved} exists=${fs.existsSync(resolved)}`)
        if (fs.existsSync(resolved)) {
          const stat = fs.statSync(resolved)
          targetDir = stat.isDirectory() ? resolved : path.dirname(resolved)
          appendDebugLog(`file_show_item_in_folder stat.isDirectory=${stat.isDirectory()} targetDir=${targetDir}`)
        } else {
          targetDir = getExistingParentDir(resolved) || path.dirname(resolved)
          appendDebugLog(`file_show_item_in_folder fallback targetDir=${targetDir} exists=${fs.existsSync(targetDir)}`)
        }
        appendDebugLog(`file_show_item_in_folder shell_open_default_manager=${targetDir}`)
        openPathWithDefaultFileManager(targetDir)
      } else {
        const dirPath = getExistingParentDir(filePath) || path.dirname(filePath)
        appendDebugLog(`file_show_item_in_folder xdg_open=${dirPath}`)
        spawnDetached('xdg-open', [dirPath])
      }
      send({ id, ok: true, result: true })
    } catch (err) {
      appendDebugLog(`file_show_item_in_folder error=${err?.message || String(err)}`)
      send({ id, ok: false, error: `file_show_item_in_folder failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'file_open_with') {
    try {
      const filePath = normalizeInputFilePath(params?.filePath)
      if (!filePath) {
        send({ id, ok: false, error: 'file_open_with requires filePath' })
        return
      }

      if (isWindows()) {
        spawnDetached('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', filePath])
      } else {
        spawnDetached('xdg-open', [filePath])
      }
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `file_open_with failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'file_copy_to_clipboard') {
    ; (async () => {
      try {
        const filePath = normalizeInputFilePath(params?.filePath)
        const copied = await copyFileToClipboard(filePath)
        if (!copied) {
          send({ id, ok: false, error: 'file_copy_to_clipboard failed' })
          return
        }
        send({ id, ok: true, result: true })
      } catch (err) {
        send({ id, ok: false, error: `file_copy_to_clipboard failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'save_data_url_file') {
    try {
      const dataUrl = String(params?.dataUrl || '')
      const outputPath = String(params?.outputPath || '').trim()
      if (!dataUrl || !outputPath) {
        send({ id, ok: false, error: 'save_data_url_file requires dataUrl and outputPath' })
        return
      }
      const { bytes } = decodeDataUrl(dataUrl)
      ensureDir(path.dirname(outputPath))
      fs.writeFileSync(outputPath, bytes)
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `save_data_url_file failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'capture_frame_data_url') {
    try {
      const filePath = normalizeInputFilePath(params?.filePath)
      const timeSeconds = Number(params?.timeSeconds)
      const enableGpuAcceleration = params?.enableGpuAcceleration !== false
      if (!filePath) {
        send({ id, ok: false, error: 'capture_frame_data_url requires filePath' })
        return
      }
      if (!fs.existsSync(filePath)) {
        send({ id, ok: false, error: 'capture_frame_data_url file does not exist' })
        return
      }
      const dataUrl = captureFrameDataUrlWithFfmpegWithHwaccel(filePath, timeSeconds, enableGpuAcceleration)
      send({ id, ok: true, result: dataUrl })
    } catch (err) {
      send({ id, ok: false, error: `capture_frame_data_url failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'set_captured_thumbnail') {
    try {
      const mediaId = Number(params?.mediaId)
      const dataUrl = String(params?.dataUrl || '')
      if (!Number.isFinite(mediaId) || !dataUrl) {
        send({ id, ok: false, error: 'set_captured_thumbnail requires mediaId and dataUrl' })
        return
      }
      const media = getMediaById(mediaId)
      if (!media) {
        send({ id, ok: true, result: null })
        return
      }
      const { bytes, extension } = decodeDataUrl(dataUrl)
      const thumbDir = path.join(getDataRoot(), 'thumbnails')
      ensureDir(thumbDir)
      const thumbPath = path.join(thumbDir, `${mediaId}-${Date.now()}.${extension}`)
      fs.writeFileSync(thumbPath, bytes)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, thumbnail_path: thumbPath }))
      send({ id, ok: true, result: thumbPath })
    } catch (err) {
      send({ id, ok: false, error: `set_captured_thumbnail failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'audio_get_devices') {
    try {
      if (!isWindows()) {
        send({ id, ok: true, result: [{ name: 'default', description: 'Default audio output' }] })
        return
      }
      const ps = spawnSync('powershell', [
        '-NoProfile',
        '-Command',
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $base='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render'; if (!(Test-Path $base)) { @() | ConvertTo-Json -Depth 3; exit 0 }; Get-ChildItem $base | ForEach-Object { $endpoint = Get-ItemProperty $_.PSPath; $propsPath = Join-Path $_.PSPath 'Properties'; $props = if (Test-Path $propsPath) { Get-ItemProperty $propsPath } else { $null }; $desc = if ($props) { [string]$props.'{a45c254e-df1c-4efd-8020-67d146a850e0},2' } else { '' }; [PSCustomObject]@{ name = [string]$_.PSChildName; description = $desc; state = [int]($endpoint.DeviceState) } } | Where-Object { $_.state -eq 1 -or $_.state -eq 4 -or $_.state -eq 5 } | ConvertTo-Json -Depth 3",
      ], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
      })
      if (ps.status !== 0) {
        send({ id, ok: true, result: [{ name: 'default', description: 'Default audio output' }] })
        return
      }

      const payload = String(ps.stdout || '').trim()
      if (!payload) {
        send({ id, ok: true, result: [{ name: 'default', description: 'Default audio output' }] })
        return
      }

      const parsed = JSON.parse(payload)
      const rawList = (Array.isArray(parsed) ? parsed : [parsed])
        .filter(Boolean)
        .map((item, index) => ({
          name: String(item?.name || `device-${index}`),
          description: String(item?.description || '').trim() || `Audio Output ${index + 1}`,
        }))
      const seen = new Set()
      const list = []
      for (const item of rawList) {
        const key = String(item.description || '').toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        list.push(item)
      }

      if (list.length === 0) {
        send({ id, ok: true, result: [{ name: 'default', description: 'Default audio output' }] })
        return
      }
      send({ id, ok: true, result: list })
    } catch {
      send({ id, ok: true, result: [{ name: 'default', description: 'Default audio output' }] })
    }
    return
  }

  if (method === 'audio_set_device') {
    try {
      const config = loadAudioConfig()
      config.selectedDevice = String(params?.deviceName || 'default')
      saveAudioConfig(config)
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `audio_set_device failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'audio_set_exclusive') {
    try {
      const config = loadAudioConfig()
      config.exclusiveMode = Boolean(params?.enabled)
      saveAudioConfig(config)
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `audio_set_exclusive failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'remote_get_cache_path') {
    try {
      const target = remoteCachePath(params?.remoteId)
      send({ id, ok: true, result: target })
    } catch (err) {
      send({ id, ok: false, error: `remote_get_cache_path failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'remote_sync_library') {
    ; (async () => {
      try {
        const baseUrl = normalizeBaseUrl(params?.url)
        const token = String(params?.token || '')
        const remoteId = params?.remoteId
        const userToken = String(params?.userToken || '')
        const dbDump = await callRemoteApi(baseUrl, token, '/api/sync/dump', 'GET', undefined, userToken)
        const cacheDir = remoteCachePath(remoteId)
        ensureDir(cacheDir)

        fs.writeFileSync(path.join(cacheDir, 'database.json'), JSON.stringify({
          nextMediaId: dbDump.nextMediaId,
          nextTagId: dbDump.nextTagId,
          nextTagGroupId: dbDump.nextTagGroupId,
          nextFolderId: dbDump.nextFolderId,
          nextCommentId: dbDump.nextCommentId,
        }, null, 2))
        fs.writeFileSync(path.join(cacheDir, 'media_cache.json'), JSON.stringify(dbDump.mediaFiles || [], null, 2))
        fs.writeFileSync(path.join(cacheDir, 'tags.json'), JSON.stringify(dbDump.tags || [], null, 2))
        fs.writeFileSync(path.join(cacheDir, 'tag_folders.json'), JSON.stringify(dbDump.tagGroups || [], null, 2))
        fs.writeFileSync(path.join(cacheDir, 'folders.json'), JSON.stringify(dbDump.folders || [], null, 2))
        fs.writeFileSync(path.join(cacheDir, 'audit_logs.json'), JSON.stringify(dbDump.auditLogs || [], null, 2))

        send({ id, ok: true, result: { success: true, message: 'Sync completed successfully.' } })
      } catch (err) {
        send({
          id,
          ok: true,
          result: {
            success: false,
            message: err?.message || String(err),
          },
        })
      }
    })()
    return
  }

  if (method === 'remote_search_media_files') {
    ; (async () => {
      try {
        const url = normalizeBaseUrl(params?.url)
        const token = String(params?.token || '')
        const query = String(params?.query || '')
        const targets = params?.targets
        const userToken = String(params?.userToken || '')
        let queryParams = `query=${encodeURIComponent(query)}`
        if (targets !== undefined) {
          queryParams += `&targets=${encodeURIComponent(JSON.stringify(targets))}`
        }

        const response = await callRemoteApi(
          url,
          token,
          `/api/search/media?${queryParams}`,
          'GET',
          undefined,
          userToken,
        )

        send({ id, ok: true, result: response?.results || response || [] })
      } catch (err) {
        send({ id, ok: false, error: `remote_search_media_files failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_get_shared_users') {
    ; (async () => {
      try {
        const baseUrl = normalizeBaseUrl(params?.url)
        const userToken = String(params?.userToken || '')
        const accessToken = String(params?.accessToken || '')
        if (!baseUrl) {
          send({ id, ok: false, error: 'remote_get_shared_users requires url' })
          return
        }

        const { response } = await fetchWithCertFallback(`${baseUrl}/api/users`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-User-Token': userToken,
          },
          signal: AbortSignal.timeout(15000),
        })

        if (!response.ok) {
          send({ id, ok: false, error: `API Error: ${response.status} ${response.statusText}` })
          return
        }

        const data = await response.json().catch(() => [])
        send({ id, ok: true, result: Array.isArray(data) ? data : [] })
      } catch (err) {
        send({ id, ok: false, error: `remote_get_shared_users failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_rename_media') {
    ; (async () => {
      try {
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          `/api/media/${Number(params?.id)}`,
          'PUT',
          { fileName: String(params?.newName || '') },
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_rename_media failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_delete_media') {
    ; (async () => {
      try {
        const permanent = params?.options?.permanent ? 'true' : 'false'
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          `/api/media/${Number(params?.id)}?permanent=${permanent}`,
          'DELETE',
          undefined,
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_delete_media failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_update_media') {
    ; (async () => {
      try {
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          `/api/media/${Number(params?.id)}`,
          'PUT',
          params?.updates || {},
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_update_media failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_create_tag') {
    ; (async () => {
      try {
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          '/api/tags',
          'POST',
          { name: String(params?.name || '') },
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_create_tag failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_delete_tag') {
    ; (async () => {
      try {
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          `/api/tags/${Number(params?.id)}`,
          'DELETE',
          undefined,
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_delete_tag failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_add_tag_to_media') {
    ; (async () => {
      try {
        const payload = {
          mediaId: params?.mediaId,
          tagId: params?.tagId,
          mediaIds: params?.mediaIds,
          tagIds: params?.tagIds,
        }
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          '/api/tags/media',
          'POST',
          payload,
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_add_tag_to_media failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_remove_tag_from_media') {
    ; (async () => {
      try {
        const mediaId = Number(params?.mediaId)
        const tagId = Number(params?.tagId)
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          `/api/tags/media?mediaId=${mediaId}&tagId=${tagId}`,
          'DELETE',
          undefined,
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_remove_tag_from_media failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_add_media_parent') {
    ; (async () => {
      try {
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          '/api/relations/media',
          'POST',
          { childId: Number(params?.childId), parentId: Number(params?.parentId) },
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_add_media_parent failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_remove_media_parent') {
    ; (async () => {
      try {
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          '/api/relations/media',
          'DELETE',
          { childId: Number(params?.childId), parentId: Number(params?.parentId) },
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_remove_media_parent failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_update_profile') {
    ; (async () => {
      try {
        const result = await callRemoteApi(
          normalizeBaseUrl(params?.url),
          String(params?.token || ''),
          '/api/profile',
          'PUT',
          { nickname: params?.nickname, iconUrl: params?.iconUrl },
          String(params?.userToken || ''),
        )
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: `remote_update_profile failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'remote_upload_media') {
    ; (async () => {
      try {
        const url = normalizeBaseUrl(params?.url)
        const token = String(params?.token || '')
        const userToken = String(params?.userToken || '')
        const filePaths = asArray(params?.filePaths).filter((v) => typeof v === 'string' && v.trim().length > 0)
        const metadata = params?.metadata && typeof params.metadata === 'object' ? params.metadata : {}
        if (!url) {
          send({ id, ok: true, result: { success: false, message: 'Remote URL is required.' } })
          return
        }
        if (filePaths.length === 0) {
          send({ id, ok: true, result: { success: false, message: 'No files to upload.' } })
          return
        }

        const form = new FormData()
        for (const filePath of filePaths) {
          if (!fs.existsSync(filePath)) continue
          const buffer = fs.readFileSync(filePath)
          const fileName = path.basename(filePath)
          form.append('files', new Blob([buffer]), fileName)
        }
        form.append('metadata', JSON.stringify(metadata))

        const headers = authHeaders(token, userToken)
        const { response } = await fetchWithCertFallback(`${url}/api/upload`, {
          method: 'POST',
          headers,
          body: form,
          signal: AbortSignal.timeout(120000),
        })

        if (!response.ok) {
          throw new Error(`upload failed: ${response.status} ${response.statusText}`)
        }

        const payload = await response.json().catch(() => null)
        send({ id, ok: true, result: { success: true, results: payload?.imported || [] } })
      } catch (err) {
        send({
          id,
          ok: true,
          result: { success: false, message: err?.message || String(err) },
        })
      }
    })()
    return
  }

  if (method === 'remote_download_media') {
    ; (async () => {
      try {
        const downloadUrl = String(params?.url || '')
        const filename = path.basename(String(params?.filename || 'download.bin')) || 'download.bin'
        const downloadDir = String(params?.downloadDir || '').trim()
        if (!downloadUrl || !downloadDir) {
          send({ id, ok: true, result: { success: false, message: 'url and downloadDir are required.' } })
          return
        }
        const finalPath = path.join(downloadDir, filename)
        await downloadRemoteFile(downloadUrl, finalPath)
        send({ id, ok: true, result: { success: true, path: finalPath } })
      } catch (err) {
        send({
          id,
          ok: true,
          result: { success: false, message: err?.message || String(err) },
        })
      }
    })()
    return
  }

  if (method === 'search_media_files') {
    try {
      const query = String(params?.query || '').trim().toLowerCase()
      const baseList = getAllMediaForActiveLibrary()

      if (!query) {
        send({ id, ok: true, result: baseList.slice(0, 200) })
        return
      }

      const results = baseList.filter((m) => {
        const text = [
          m?.file_name,
          m?.title,
          m?.description,
          m?.artist,
          m?.url,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return text.includes(query)
      })

      send({ id, ok: true, result: results.slice(0, 200) })
    } catch (err) {
      send({ id, ok: false, error: `search_media_files failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'check_for_updates') {
    ; (async () => {
      try {
        const currentVersion = normalizeVersion(params?.currentVersion || '')
        const release = await fetchLatestGithubRelease('84kb', 'Obscura')
        const latestVersion = normalizeVersion(release?.tag_name || release?.name || '')
        const asset = chooseInstallerAsset(release)
        const available = currentVersion
          ? compareVersions(latestVersion, currentVersion) > 0
          : Boolean(latestVersion)

        send({
          id,
          ok: true,
          result: {
            available,
            version: latestVersion || undefined,
            url: asset?.browser_download_url || '',
            name: asset?.name || '',
            releaseNotes: release?.body || '',
          },
        })
      } catch (err) {
        send({
          id,
          ok: true,
          result: {
            available: false,
            message: err?.message || String(err),
          },
        })
      }
    })()
    return
  }

  if (method === 'download_update') {
    ; (async () => {
      try {
        const providedUrl = String(params?.url || '').trim()
        let downloadUrl = providedUrl
        let assetName = String(params?.name || '').trim()

        if (!downloadUrl) {
          const release = await fetchLatestGithubRelease('84kb', 'Obscura')
          const asset = chooseInstallerAsset(release)
          if (!asset?.browser_download_url) {
            throw new Error('No downloadable installer asset found')
          }
          downloadUrl = String(asset.browser_download_url)
          assetName = String(asset.name || '')
        }

        const fileName = assetName || path.basename(new URL(downloadUrl).pathname) || 'Obscura-Update.exe'
        const targetPath = path.join(getUpdateDir(), fileName)
        send({ id: null, ok: true, event: 'update-status', payload: { status: 'download-progress', info: { percent: 0 } } })
        await downloadFileWithProgress(downloadUrl, targetPath, (received, total) => {
          const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((received / total) * 100))) : 0
          send({
            id: null,
            ok: true,
            event: 'update-status',
            payload: { status: 'download-progress', info: { percent } },
          })
        })
        pendingUpdateInstallerPath = targetPath
        send({
          id,
          ok: true,
          result: {
            success: true,
            path: targetPath,
          },
        })
      } catch (err) {
        send({
          id,
          ok: true,
          result: {
            success: false,
            message: err?.message || String(err),
          },
        })
      }
    })()
    return
  }

  if (method === 'quit_and_install') {
    try {
      const installerPath = String(params?.path || pendingUpdateInstallerPath || '').trim()
      if (!installerPath) {
        send({ id, ok: true, result: false })
        return
      }
      if (!fs.existsSync(installerPath)) {
        send({ id, ok: true, result: false })
        return
      }
      if (isWindows()) {
        spawnDetached(installerPath, [])
      } else {
        spawnDetached('xdg-open', [installerPath])
      }
      send({ id, ok: true, result: true })
    } catch {
      send({ id, ok: true, result: false })
    }
    return
  }

  if (method === 'ffmpeg_info') {
    try {
      send({ id, ok: true, result: getFfmpegInfo() })
    } catch (err) {
      send({ id, ok: false, error: `ffmpeg_info failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'ffmpeg_check_update') {
    ; (async () => {
      try {
        const info = getFfmpegInfo()
        const response = await fetch('https://www.gyan.dev/ffmpeg/builds/release-version', {
          method: 'GET',
          signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) {
          throw new Error(`ffmpeg version check failed: ${response.status}`)
        }
        const remoteRaw = String(await response.text()).trim()
        const remoteVersion = normalizeVersion(remoteRaw)
        const localVersion = normalizeVersion(info.version)
        const available = remoteVersion ? compareVersions(remoteVersion, localVersion) > 0 : false
        send({
          id,
          ok: true,
          result: {
            available,
            version: remoteVersion || undefined,
            url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
          },
        })
      } catch (err) {
        send({ id, ok: false, error: `ffmpeg_check_update failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'ffmpeg_update') {
    ; (async () => {
      try {
        const downloadUrl = String(params?.url || '').trim() || 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
        const tempDir = path.join(getDataRoot(), 'tmp')
        ensureDir(tempDir)
        const zipPath = path.join(tempDir, 'ffmpeg-release-essentials.zip')
        const extractDir = path.join(tempDir, 'ffmpeg-extract')
        send({ id: null, ok: true, event: 'ffmpeg-update-progress', payload: 5 })
        await downloadFileWithProgress(downloadUrl, zipPath, (received, total) => {
          const progress = total > 0 ? 5 + Math.round((received / total) * 70) : 40
          send({ id: null, ok: true, event: 'ffmpeg-update-progress', payload: Math.max(5, Math.min(75, progress)) })
        })
        send({ id: null, ok: true, event: 'ffmpeg-update-progress', payload: 80 })
        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true })
        }
        extractZipWindows(zipPath, extractDir)
        const ffmpegExe = findFileRecursively(extractDir, 'ffmpeg.exe')
        const ffprobeExe = findFileRecursively(extractDir, 'ffprobe.exe')
        if (!ffmpegExe || !ffprobeExe) {
          throw new Error('ffmpeg binaries were not found in downloaded archive')
        }
        const managedDir = getManagedBinDir()
        fs.copyFileSync(ffmpegExe, path.join(managedDir, 'ffmpeg.exe'))
        fs.copyFileSync(ffprobeExe, path.join(managedDir, 'ffprobe.exe'))
        send({ id: null, ok: true, event: 'ffmpeg-update-progress', payload: 100 })
        send({ id, ok: true, result: true })
      } catch (err) {
        send({ id, ok: false, error: `ffmpeg_update failed: ${err?.message || String(err)}` })
      }
    })()
    return
  }

  if (method === 'backfill_metadata') {
    try {
      const media = getAllMediaForActiveLibrary()
      const meta = loadLocalMeta()
      if (!meta.byFilePath || typeof meta.byFilePath !== 'object') {
        meta.byFilePath = {}
      }
      let count = 0
      for (const item of media) {
        const filePath = String(item?.file_path || '')
        if (!filePath || filePath.startsWith('http') || !fs.existsSync(filePath)) continue

        const current = meta.byFilePath[filePath] && typeof meta.byFilePath[filePath] === 'object'
          ? { ...meta.byFilePath[filePath] }
          : {}
        const hasWidth = Number.isFinite(Number(current.width ?? item?.width))
        const hasHeight = Number.isFinite(Number(current.height ?? item?.height))
        const hasDuration = Number.isFinite(Number(current.duration ?? item?.duration))
        if (hasWidth && hasHeight && hasDuration) continue

        const probed = probeMediaMetadata(filePath)
        if (!probed) continue

        let changed = false
        if (!hasWidth && Number.isFinite(Number(probed.width))) {
          current.width = Number(probed.width)
          changed = true
        }
        if (!hasHeight && Number.isFinite(Number(probed.height))) {
          current.height = Number(probed.height)
          changed = true
        }
        if (!hasDuration && Number.isFinite(Number(probed.duration))) {
          current.duration = Number(probed.duration)
          changed = true
        }

        if (changed) {
          meta.byFilePath[filePath] = current
          count += 1
        }
      }
      saveLocalMeta(meta)
      send({ id, ok: true, result: count })
    } catch (err) {
      send({ id, ok: false, error: `backfill_metadata failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'add_media_parent') {
    try {
      const childId = Number(params?.childId)
      const parentId = Number(params?.parentId)
      if (!Number.isFinite(childId) || !Number.isFinite(parentId)) {
        send({ id, ok: true, result: true })
        return
      }
      updateMediaMetaById(childId, (prev) => {
        const next = { ...prev }
        const ids = new Set(asArray(next.parent_ids).map((v) => Number(v)).filter(Number.isFinite))
        ids.add(parentId)
        next.parent_ids = [...ids]
        return next
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `add_media_parent failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'remove_media_parent') {
    try {
      const childId = Number(params?.childId)
      const parentId = Number(params?.parentId)
      if (!Number.isFinite(childId) || !Number.isFinite(parentId)) {
        send({ id, ok: true, result: true })
        return
      }
      updateMediaMetaById(childId, (prev) => {
        const next = { ...prev }
        const ids = asArray(next.parent_ids)
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v !== parentId)
        next.parent_ids = ids
        return next
      })
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `remove_media_parent failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'export_media') {
    try {
      const mediaId = Number(params?.mediaId)
      const media = getMediaById(mediaId)
      if (!media) {
        send({ id, ok: true, result: { success: false, message: 'Media not found.' } })
        return
      }
      const sourcePath = String(media?.file_path || '')
      if (!sourcePath || sourcePath.startsWith('http')) {
        send({ id, ok: true, result: { success: false, message: 'Only local files can be exported.' } })
        return
      }
      if (!fs.existsSync(sourcePath)) {
        send({ id, ok: true, result: { success: false, message: 'Source file does not exist.' } })
        return
      }

      const requestedOutputPath = String(params?.outputPath || '').trim()
      let targetPath = requestedOutputPath
      if (!targetPath) {
        const exportDir = path.join(os.homedir(), 'Downloads', 'ObscuraExports')
        ensureDir(exportDir)
        targetPath = getUniqueTargetPath(path.join(exportDir, path.basename(sourcePath)))
      } else {
        ensureDir(path.dirname(targetPath))
      }

      fs.copyFileSync(sourcePath, targetPath)
      try {
        const sourceStat = fs.statSync(sourcePath)
        fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime)
      } catch {
        // Keep export success if timestamp sync fails.
      }
      send({ id, ok: true, result: { success: true, path: targetPath } })
    } catch (err) {
      send({ id, ok: true, result: { success: false, message: err?.message || String(err) } })
    }
    return
  }

  if (method === 'copy_media_to_library') {
    try {
      const mediaIds = asArray(params?.mediaIds).map((v) => Number(v)).filter(Number.isFinite)
      const libraryPath = String(params?.libraryPath || '').trim()
      const settings = params?.settings && typeof params.settings === 'object' ? params.settings : {}
      if (!libraryPath) {
        send({ id, ok: true, result: { success: false, message: 'libraryPath is required.' } })
        return
      }

      const itemsToTransfer = []
      for (const mediaId of mediaIds) {
        const media = getMediaById(mediaId)
        if (!media || media?.is_deleted) continue
        const sourcePath = String(media?.file_path || '')
        if (!sourcePath || sourcePath.startsWith('http') || !fs.existsSync(sourcePath)) continue
        itemsToTransfer.push({ media, sourcePath })
      }

      if (itemsToTransfer.length === 0) {
        send({ id, ok: true, result: { success: false, message: 'No valid media files found to transfer.' } })
        return
      }

      ensureDir(libraryPath)
      const targetMeta = loadLocalMetaForLibrary(libraryPath)
      if (!targetMeta.byFilePath || typeof targetMeta.byFilePath !== 'object') {
        targetMeta.byFilePath = {}
      }
      let copied = 0
      let failed = 0

      for (const item of itemsToTransfer) {
        try {
          const targetPath = getUniqueTargetPath(path.join(libraryPath, path.basename(item.sourcePath)))
          fs.copyFileSync(item.sourcePath, targetPath)
          const overlay = buildTransferredOverlay(item.media, settings, targetMeta, libraryPath)
          if (Object.keys(overlay).length > 0) {
            targetMeta.byFilePath[targetPath] = overlay
          }
          copied += 1
        } catch {
          failed += 1
        }
      }
      saveLocalMetaForLibrary(libraryPath, targetMeta)

      const success = failed === 0
      if (success) {
        send({ id, ok: true, result: { success: true, copied } })
        return
      }
      send({
        id,
        ok: true,
        result: {
          success: false,
          error: `Copied ${copied} file(s), failed ${failed} file(s).`,
          copied,
          failed,
        },
      })
    } catch (err) {
      send({ id, ok: true, result: { success: false, error: err?.message || String(err) } })
    }
    return
  }

  if (method === 'check_import_duplicates') {
    try {
      const filePaths = asArray(params?.filePaths).filter((p) => typeof p === 'string')
      const allMedia = getAllMediaForActiveLibrary().filter((m) => !m?.is_deleted && !m?.permanently_deleted)
      const results = []
      for (const filePath of filePaths) {
        const normalized = String(filePath)
        const stat = fs.existsSync(normalized) ? fs.statSync(normalized) : null
        const fileName = path.basename(normalized)
        const existing = allMedia.find((m) =>
          String(m?.file_path || '') === normalized ||
          String(m?.import_source_path || '') === normalized ||
          (String(m?.file_name || '') === fileName && Number(m?.file_size || 0) === Number(stat?.size || 0)),
        )
        if (existing) {
          results.push({
            newFile: { path: normalized, file_name: fileName, file_size: stat?.size || 0 },
            existing,
          })
        }
      }
      send({ id, ok: true, result: results })
    } catch (err) {
      send({ id, ok: false, error: `check_import_duplicates failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'check_entry_duplicates') {
    try {
      const mediaId = Number(params?.mediaId)
      const allMedia = getAllMediaForActiveLibrary().filter((m) => !m?.is_deleted && !m?.permanently_deleted)
      const target = allMedia.find((m) => Number(m?.id) === mediaId)
      if (!target) {
        send({ id, ok: true, result: [] })
        return
      }
      const fileName = String(target.file_name || '')
      const fileSize = Number(target.file_size || 0)
      const duplicates = allMedia
        .filter((m) => Number(m?.id) !== mediaId)
        .filter((m) =>
          (fileName && String(m?.file_name || '') === fileName) ||
          (fileSize > 0 && Number(m?.file_size || 0) === fileSize),
        )
        .map((existingMedia) => ({ newMedia: target, existingMedia }))
      send({ id, ok: true, result: duplicates })
    } catch (err) {
      send({ id, ok: false, error: `check_entry_duplicates failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'find_library_duplicates') {
    try {
      const criteria = params?.criteria && typeof params.criteria === 'object'
        ? params.criteria
        : { name: true, size: true, duration: false, modified: false }
      const allMedia = getAllMediaForActiveLibrary().filter((m) => !m?.is_deleted && !m?.permanently_deleted)
      const groups = new Map()
      for (const m of allMedia) {
        const keys = []
        if (criteria.name) keys.push(`n:${String(m?.file_name || '').toLowerCase()}`)
        if (criteria.size) keys.push(`s:${Number(m?.file_size || 0)}`)
        if (criteria.duration) keys.push(`d:${Number(m?.duration || 0)}`)
        if (criteria.modified) keys.push(`m:${String(m?.modified_date || '')}`)
        const key = keys.join('|')
        if (!key) continue
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(m)
      }
      const result = []
      for (const [, group] of groups) {
        if (group.length > 1) result.push(group)
      }
      send({ id, ok: true, result })
    } catch (err) {
      send({ id, ok: false, error: `find_library_duplicates failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'refresh_media_metadata') {
    try {
      const targetIds = new Set(asArray(params?.ids).map((v) => Number(v)).filter(Number.isFinite))
      const allMedia = getAllMediaForActiveLibrary()
      const meta = loadLocalMeta()
      const metadataJsonCache = new Map()
      if (!meta.byFilePath || typeof meta.byFilePath !== 'object') {
        meta.byFilePath = {}
      }

      let processed = 0
      const refreshedById = new Map()
      const targets = targetIds.size > 0
        ? allMedia.filter((m) => targetIds.has(Number(m?.id)))
        : allMedia

      for (const media of targets) {
        const rebuilt = refreshMediaRecordFromLibraryFile(media, meta, metadataJsonCache)
        if (rebuilt) {
          processed += 1
          refreshedById.set(Number(rebuilt.item?.id), rebuilt.item)
        }
      }

      saveLocalMeta(meta)
      if (activeLibraryPath) {
        const currentMedia = readLibraryMediaIndex(activeLibraryPath)
        const refreshedItems = currentMedia.map((item) => (
          refreshedById.has(Number(item?.id))
            ? (refreshedById.get(Number(item?.id)) || item)
            : item
        ))
        writeLibraryMediaIndex(activeLibraryPath, refreshedItems)
        setCachedScannedMedia(activeLibraryPath, refreshedItems)
        mediaIndexById = new Map(asArray(mergeMediaWithMeta(refreshedItems, activeLibraryPath)).map((m) => [Number(m?.id), m]))
      }
      send({ id, ok: true, result: processed })
    } catch (err) {
      send({ id, ok: false, error: `refresh_media_metadata failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'scan_filesystem_orphans') {
    try {
      const allMedia = getAllMediaForActiveLibrary()
      const orphans = allMedia
        .filter((m) => {
          const fp = String(m?.file_path || '')
          return fp && !fp.startsWith('http') && !fs.existsSync(fp)
        })
        .map((m) => ({
          type: 'empty_orphan',
          path: String(m?.file_path || ''),
          file_path: String(m?.file_path || ''),
          name: String(m?.file_name || ''),
          size: Number(m?.file_size || 0),
          reason: 'File missing',
        }))
      send({ id, ok: true, result: orphans })
    } catch (err) {
      send({ id, ok: false, error: `scan_filesystem_orphans failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'delete_filesystem_files') {
    try {
      const paths = asArray(params?.paths).filter((p) => typeof p === 'string')
      let count = 0
      for (const target of paths) {
        try {
          if (fs.existsSync(target)) {
            const stat = fs.statSync(target)
            if (stat.isDirectory()) {
              fs.rmSync(target, { recursive: true, force: true })
            } else {
              fs.unlinkSync(target)
            }
          }
          count += 1
        } catch {
          // ignore per-file errors
        }
      }
      send({ id, ok: true, result: count })
    } catch (err) {
      send({ id, ok: false, error: `delete_filesystem_files failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'import_media') {
    try {
      if (!activeLibraryPath) {
        send({ id, ok: false, error: 'import_media failed: active library is not set' })
        return
      }
      const filePaths = [...new Set(
        asArray(params?.filePaths)
          .filter((p) => typeof p === 'string' && p.trim().length > 0)
          .map((p) => String(p).trim()),
      )]
      const importOptions = params?.options && typeof params.options === 'object' ? params.options : {}
      const shouldDeleteSource = Boolean(importOptions.deleteSource)
      const meta = loadLocalMeta()
      const metadataJsonCache = new Map()
      if (!meta.byFilePath || typeof meta.byFilePath !== 'object') {
        meta.byFilePath = {}
      }
      const imported = []
      const total = filePaths.length
      let current = 0

      for (const sourcePathRaw of filePaths) {
        current += 1
        const sourcePath = String(sourcePathRaw || '').trim()
        const sourceBaseName = path.basename(sourcePath)
        send({
          id: null,
          ok: true,
          event: 'import-progress',
          payload: {
            id: 'manual-import',
            current,
            total,
            fileName: sourceBaseName,
            step: 'Analyzing',
            percentage: Math.round((current / Math.max(total, 1)) * 100),
          },
        })

        if (!sourcePath || !fs.existsSync(sourcePath)) continue
        let stat = null
        try {
          stat = fs.statSync(sourcePath)
        } catch {
          stat = null
        }
        if (!stat || !stat.isFile()) continue

        const ext = path.extname(sourcePath).toLowerCase()
        if (!MEDIA_EXTENSIONS.has(ext)) continue
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)
        const isAudio = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)
        const fileType = isImage ? 'image' : isAudio ? 'audio' : 'video'

        const uniqueId = crypto.randomBytes(6).toString('hex')
        const destDir = path.join(activeLibraryPath, 'images', uniqueId)
        ensureDir(destDir)

        const sourceNameSanitized = sourceBaseName.replace(/[\\/:*?"<>|]/g, '_')
        const destPath = path.join(destDir, sourceNameSanitized)
        fs.copyFileSync(sourcePath, destPath)
        try {
          fs.utimesSync(destPath, stat.atime, stat.mtime)
        } catch {
          // Keep import success if timestamp sync fails.
        }

        const siblingThumbSource = findSiblingThumbnailPath(sourcePath)
        let thumbnailPath = isImage ? destPath : ''
        const destBaseName = path.basename(sourceNameSanitized, path.extname(sourceNameSanitized))
        if (siblingThumbSource && fs.existsSync(siblingThumbSource)) {
          const thumbExt = path.extname(siblingThumbSource) || '.png'
          const copiedThumbPath = path.join(destDir, `${destBaseName}_thumbnail${thumbExt}`)
          try {
            fs.copyFileSync(siblingThumbSource, copiedThumbPath)
            thumbnailPath = copiedThumbPath
          } catch {
            // Fallback logic below.
          }
        }
        if (fileType === 'video') {
          if (!thumbnailPath) {
            const generatedThumbPath = path.join(destDir, `${destBaseName}_thumbnail.png`)
            try {
              if (extractThumbnailWithFfmpeg(destPath, generatedThumbPath)) {
                thumbnailPath = generatedThumbPath
              }
            } catch {
              // Continue import even if thumbnail generation fails.
            }
          }
        }

        const probed = probeMediaMetadata(destPath)
        const item = {
          id: toMediaId(destPath),
          uniqueId: uniqueId,
          file_name: sourceNameSanitized,
          title: path.basename(sourceNameSanitized, path.extname(sourceNameSanitized)),
          file_type: fileType,
          file_path: destPath,
          thumbnail_path: thumbnailPath,
          file_size: stat?.size || 0,
          created_date: stat?.birthtime ? new Date(stat.birthtime).toISOString() : '',
          created_at: stat?.ctime ? new Date(stat.ctime).toISOString() : '',
          modified_date: stat?.mtime ? new Date(stat.mtime).toISOString() : '',
          rating: 0,
          duration: Number.isFinite(Number(probed?.duration)) ? Number(probed.duration) : null,
          width: Number.isFinite(Number(probed?.width)) ? Number(probed.width) : undefined,
          height: Number.isFinite(Number(probed?.height)) ? Number(probed.height) : undefined,
          framerate: Number.isFinite(Number(probed?.framerate)) ? Number(probed.framerate) : undefined,
          audio_bitrate: Number.isFinite(Number(probed?.audio_bitrate)) ? Number(probed.audio_bitrate) : undefined,
          video_bitrate: Number.isFinite(Number(probed?.video_bitrate)) ? Number(probed.video_bitrate) : undefined,
          format_name: typeof probed?.format_name === 'string' ? probed.format_name : undefined,
          codec_id: typeof probed?.codec_id === 'string' ? probed.codec_id : undefined,
          audio_codec: typeof probed?.audio_codec === 'string' ? probed.audio_codec : undefined,
          video_codec: typeof probed?.video_codec === 'string' ? probed.video_codec : undefined,
          artist: typeof probed?.artist === 'string' ? probed.artist : undefined,
          description: typeof probed?.description === 'string' ? probed.description : undefined,
          url: typeof probed?.url === 'string' ? probed.url : undefined,
          is_deleted: false,
          last_played_at: null,
          tags: [],
          folders: [],
          comments: [],
          import_source_path: sourcePath,
        }

        const overlay = meta.byFilePath[destPath] && typeof meta.byFilePath[destPath] === 'object'
          ? { ...meta.byFilePath[destPath] }
          : {}
        if (thumbnailPath) overlay.thumbnail_path = thumbnailPath
        if (Number.isFinite(Number(probed?.duration))) overlay.duration = Number(probed.duration)
        if (Number.isFinite(Number(probed?.width))) overlay.width = Number(probed.width)
        if (Number.isFinite(Number(probed?.height))) overlay.height = Number(probed.height)
        if (Number.isFinite(Number(probed?.framerate))) overlay.framerate = Number(probed.framerate)
        if (Number.isFinite(Number(probed?.audio_bitrate))) overlay.audio_bitrate = Number(probed.audio_bitrate)
        if (Number.isFinite(Number(probed?.video_bitrate))) overlay.video_bitrate = Number(probed.video_bitrate)
        if (typeof probed?.format_name === 'string' && probed.format_name.trim()) overlay.format_name = probed.format_name.trim()
        if (typeof probed?.codec_id === 'string' && probed.codec_id.trim()) overlay.codec_id = probed.codec_id.trim()
        if (typeof probed?.audio_codec === 'string' && probed.audio_codec.trim()) overlay.audio_codec = probed.audio_codec.trim()
        if (typeof probed?.video_codec === 'string' && probed.video_codec.trim()) overlay.video_codec = probed.video_codec.trim()
        if (typeof probed?.artist === 'string' && probed.artist.trim()) overlay.artist = probed.artist.trim()
        if (typeof probed?.description === 'string' && probed.description.trim()) overlay.description = probed.description.trim()
        if (typeof probed?.url === 'string' && probed.url.trim()) overlay.url = probed.url.trim()
        const metadataEntry = resolveMetadataEntryForFile(sourcePath, metadataJsonCache)
        if (metadataEntry) {
          applyMetadataOverlayFromEntry(item, overlay, metadataEntry)
        }
        if (probed) {
          if (typeof probed.format_name === 'string' && probed.format_name.trim()) {
            item.format_name = probed.format_name.trim()
            overlay.format_name = probed.format_name.trim()
          }
          if (typeof probed.codec_id === 'string' && probed.codec_id.trim()) {
            item.codec_id = probed.codec_id.trim()
            overlay.codec_id = probed.codec_id.trim()
          }
          if (typeof probed.audio_codec === 'string' && probed.audio_codec.trim()) {
            item.audio_codec = probed.audio_codec.trim()
            overlay.audio_codec = probed.audio_codec.trim()
          }
          if (typeof probed.video_codec === 'string' && probed.video_codec.trim()) {
            item.video_codec = probed.video_codec.trim()
            overlay.video_codec = probed.video_codec.trim()
          }
        }
        meta.byFilePath[destPath] = overlay

        try {
          fs.writeFileSync(path.join(destDir, 'metadata.json'), JSON.stringify(item, null, 2), 'utf8')
        } catch {
          // metadata.json write errors should not abort import
        }

        meta.manualMedia.push(item)
        imported.push(item)

        if (shouldDeleteSource) {
          try {
            if (fs.existsSync(sourcePath)) {
              fs.unlinkSync(sourcePath)
            }
          } catch {
            // Keep import result even if source cleanup fails.
          }
        }
      }

      saveLocalMeta(meta)
      if (activeLibraryPath && imported.length > 0) {
        upsertLibraryMediaIndex(activeLibraryPath, imported)
      }
      send({
        id: null,
        ok: true,
        event: 'import-progress',
        payload: {
          id: 'manual-import',
          current: total,
          total,
          fileName: '',
          step: 'Completed',
          percentage: 100,
        },
      })
      send({ id, ok: true, result: imported })
    } catch (err) {
      send({ id, ok: false, error: `import_media failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'scan_folder') {
    try {
      const folderPath = String(params?.folderPath || '').trim()
      if (!folderPath) {
        send({ id, ok: false, error: 'scan_folder requires folderPath' })
        return
      }
      const scanned = scanLocalMediaFiles(folderPath)
      send({ id, ok: true, result: scanned })
    } catch (err) {
      send({ id, ok: false, error: `scan_folder failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'rename_media') {
    try {
      const mediaId = Number(params?.mediaId)
      const newName = String(params?.newName || '').trim()
      if (!newName) {
        send({ id, ok: true, result: null })
        return
      }
      const ext = path.extname(newName)
      const updated = updateMediaMetaById(mediaId, (prev) => ({
        ...prev,
        title: ext ? path.basename(newName, ext) : newName,
        file_name: newName,
      }))
      send({ id, ok: true, result: updated })
    } catch (err) {
      send({ id, ok: false, error: `rename_media failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_rating') {
    try {
      const mediaId = Number(params?.mediaId)
      const rating = Number(params?.rating || 0)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, rating }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_rating failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_artist') {
    try {
      const mediaId = Number(params?.mediaId)
      const artist = params?.artist == null ? null : String(params.artist)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, artist }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_artist failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_description') {
    try {
      const mediaId = Number(params?.mediaId)
      const description = params?.description == null ? null : String(params.description)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, description }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_description failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_url') {
    try {
      const mediaId = Number(params?.mediaId)
      const url = params?.url == null ? null : String(params.url)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, url }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_url failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'update_last_played') {
    try {
      const mediaId = Number(params?.mediaId)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, last_played_at: new Date().toISOString() }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `update_last_played failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'move_to_trash') {
    try {
      const mediaId = Number(params?.mediaId)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, is_deleted: true }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `move_to_trash failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'restore_from_trash') {
    try {
      const mediaId = Number(params?.mediaId)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, is_deleted: false }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `restore_from_trash failed: ${err?.message || String(err)}` })
    }
    return
  }

  if (method === 'delete_permanently') {
    try {
      const mediaId = Number(params?.mediaId)
      updateMediaMetaById(mediaId, (prev) => ({ ...prev, is_deleted: true, permanently_deleted: true }))
      send({ id, ok: true, result: true })
    } catch (err) {
      send({ id, ok: false, error: `delete_permanently failed: ${err?.message || String(err)}` })
    }
    return
  }

  send({ id, ok: false, error: `unknown method: ${String(method)}` })
}

process.stdin.setEncoding('utf8')
let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let idx = buffer.indexOf('\n')

  while (idx !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line.length > 0) {
      try {
        handleRequest(JSON.parse(line))
      } catch (err) {
        send({ id: null, ok: false, error: `invalid json: ${err?.message || String(err)}` })
      }
    }
    idx = buffer.indexOf('\n')
  }
})

process.stdin.on('end', () => {
  if (shuttingDown) return
  shuttingDown = true
  stopNetworkServer().finally(() => {
    destroyDiscordClient().finally(() => process.exit(0))
  })
})

process.on('SIGTERM', () => {
  if (shuttingDown) return
  shuttingDown = true
  stopNetworkServer().finally(() => {
    destroyDiscordClient().finally(() => process.exit(0))
  })
})

process.on('SIGINT', () => {
  if (shuttingDown) return
  shuttingDown = true
  stopNetworkServer().finally(() => {
    destroyDiscordClient().finally(() => process.exit(0))
  })
})

try {
  const initialServerConfig = loadServerConfig()
  if (initialServerConfig?.isEnabled) {
    void startNetworkServer()
  }
} catch {
  // ignore startup server bootstrap errors
}

send({ id: null, ok: true, event: 'ready', pid: process.pid })

  function normalizeFormatLabel(input, filePath, formatLongName) {
    const raw = String(input || '').trim().toLowerCase()
    const longName = String(formatLongName || '').trim()
    const ext = String(path.extname(String(filePath || '')) || '').replace(/^\./, '').toLowerCase()

    if (raw.includes('mp4') || ext === 'mp4' || ext === 'm4v') return 'MPEG-4'
    if (raw.includes('matroska') || ext === 'mkv') return 'Matroska'
    if (raw.includes('webm') || ext === 'webm') return 'WebM'
    if (raw.includes('mpegts') || raw === 'ts' || ext === 'ts') return 'MPEG-TS'

    if (longName) return longName
    if (!raw) return ''

    const first = raw.split(',').map((v) => v.trim()).find(Boolean) || raw
    return first
  }

  function normalizeCodecLabel(codec) {
    return String(codec || '').trim().toLowerCase()
  }
