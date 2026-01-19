import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logError } from './error-logger'

export interface RemoteLibrary {
    id: string
    name: string
    url: string
    token: string
    lastConnectedAt?: string
}

export interface AutoImportPath {
    id: string
    path: string
    targetLibraryId: string // This will be the library PATH
    enabled: boolean
}

export interface AutoImportConfig {
    enabled: boolean
    watchPaths: AutoImportPath[]
}

export interface LibraryViewSettings {
    sortOrder: string
    sortDirection: 'asc' | 'desc'
}

export interface ClientConfig {
    downloadPath: string
    theme: 'dark' | 'light' | 'system'
    language: 'ja' | 'en'
    remoteLibraries: RemoteLibrary[]
    myUserToken?: string
    nickname?: string
    iconUrl?: string
    autoImport: AutoImportConfig
    thumbnailMode: 'speed' | 'quality'
    discordRichPresenceEnabled: boolean
    libraryViewSettings: { [libraryId: string]: LibraryViewSettings }
}

const defaultConfig: ClientConfig = {
    downloadPath: '',
    theme: 'dark',
    language: 'ja',
    remoteLibraries: [],
    myUserToken: undefined,
    nickname: undefined,
    iconUrl: undefined,
    autoImport: {
        enabled: false,
        watchPaths: []
    },
    thumbnailMode: 'speed',
    discordRichPresenceEnabled: false,
    libraryViewSettings: {}
}

const homeDir = app ? app.getPath('home') : '.'
const configDir = path.join(homeDir, '.obscura')
const configPath = path.join(configDir, 'client-config.json')

let clientConfig: ClientConfig = { ...defaultConfig }

// 初期化時にデフォルトのダウンロードパスを設定（app.getPathを使用するため）
export function initClientSettings() {
    const downloads = app ? app.getPath('downloads') : '.'
    defaultConfig.downloadPath = path.join(downloads, 'Obscura')
    loadClientConfig()
}

export function getConfig(): ClientConfig {
    return { ...clientConfig }
}

export function updateConfig(updates: Partial<ClientConfig>) {
    clientConfig = { ...clientConfig, ...updates }
    saveClientConfig()
    return clientConfig
}

function loadClientConfig() {
    try {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true })
        }

        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8')
            const loaded = JSON.parse(data)

            // マージ（新しい設定項目がある場合に対応）
            const loadedConfig = { ...defaultConfig, ...loaded }

            // Migration: watchPath -> watchPaths
            if (loaded.autoImport && loaded.autoImport.watchPath && (!loaded.autoImport.watchPaths || loaded.autoImport.watchPaths.length === 0)) {
                loadedConfig.autoImport.watchPaths = []
            } else if (loaded.autoImport && !loaded.autoImport.watchPaths) {
                loadedConfig.autoImport.watchPaths = []
            }

            // Ensure thumbnailMode exists (if old config didn't have it)
            if (!loadedConfig.thumbnailMode) {
                loadedConfig.thumbnailMode = 'speed'
            }

            clientConfig = loadedConfig
            saveClientConfig()
        } else {
            clientConfig = { ...defaultConfig }
            saveClientConfig()
        }
    } catch (error) {
        logError('settings', 'Failed to load client config', error)
        clientConfig = { ...defaultConfig }
    }
}

function saveClientConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(clientConfig, null, 2), 'utf-8')
    } catch (error) {
        logError('settings', 'Failed to save client config', error)
    }
}
