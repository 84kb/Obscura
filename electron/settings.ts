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

export interface AutoImportConfig {
    enabled: boolean
    watchPath: string
    targetLibraryId?: string
}

export interface ClientConfig {
    downloadPath: string
    theme: 'dark' | 'light' | 'system'
    language: 'ja' | 'en'
    remoteLibraries: RemoteLibrary[]
    myUserToken?: string  // 自分のマシン用ユーザートークン（一度生成したら変更しない）
    autoImport: AutoImportConfig
}

const defaultConfig: ClientConfig = {
    downloadPath: '', // 初期化時に設定
    theme: 'dark',
    language: 'ja',
    remoteLibraries: [],
    myUserToken: undefined,
    autoImport: {
        enabled: false,
        watchPath: ''
    }
}

const configDir = path.join(app.getPath('home'), '.obscura')
const configPath = path.join(configDir, 'client-config.json')

let clientConfig: ClientConfig = { ...defaultConfig }

// 初期化時にデフォルトのダウンロードパスを設定（app.getPathを使用するため）
export function initClientSettings() {
    defaultConfig.downloadPath = path.join(app.getPath('downloads'), 'Obscura')
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
            clientConfig = { ...defaultConfig, ...loaded }

            // ダウンロードパスが存在しない場合はデフォルトに戻すか、再作成する
            // ここではチェックのみ
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
