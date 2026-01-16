import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import { generateHostSecret, encryptData, decryptData } from './crypto-utils'
import { logError } from './error-logger'
const fs = require('fs-extra')

// サーバー設定ファイルのパス
let serverConfigPath = ''
let sharedUsersPath = ''
let auditLogPath = ''

function updatePaths() {
    serverConfigPath = path.join(app.getPath('userData'), 'server-config.json')
    sharedUsersPath = path.join(app.getPath('userData'), 'shared-users.json')
    auditLogPath = path.join(app.getPath('userData'), 'audit-log.json')
}

// 権限レベル
export type Permission = 'READ_ONLY' | 'DOWNLOAD' | 'UPLOAD' | 'EDIT' | 'FULL'

// サーバー設定
export interface ServerConfig {
    isEnabled: boolean
    port: number
    hostSecret: string
    allowedIPs: string[]
    maxConnections: number
    maxUploadSize: number // MB
    maxUploadRate: number // MB/s (0 = 無制限)
    enableAuditLog: boolean
    requireHttps: boolean
    sslCertPath?: string
    sslKeyPath?: string
    publishLibraryPath?: string // 公開するライブラリのパス
}

// 共有ユーザー
export interface SharedUser {
    id: string
    userToken: string
    accessToken: string
    nickname: string
    iconUrl?: string
    hardwareId: string
    permissions: Permission[]
    createdAt: string
    lastAccessAt: string
    isActive: boolean
    ipAddress?: string
}

// 監査ログエントリ
export interface AuditLogEntry {
    id: string
    userId: string
    nickname: string
    action: string
    resourceType: string
    resourceId: number | null
    details: any
    ipAddress: string
    timestamp: string
    success: boolean
}

// デフォルトのサーバー設定
const defaultServerConfig: ServerConfig = {
    isEnabled: false,
    port: 8765,
    hostSecret: generateHostSecret(),
    allowedIPs: [],
    maxConnections: 10,
    maxUploadSize: 5120, // 5GB
    maxUploadRate: 10, // 10MB/s
    enableAuditLog: true,
    requireHttps: false, // 開発時はfalse、本番ではtrue推奨
}

let serverConfig: ServerConfig = { ...defaultServerConfig }
let sharedUsers: SharedUser[] = []
let auditLogs: AuditLogEntry[] = []

// サーバー設定の読み込み
function loadServerConfig() {
    try {
        if (fs.existsSync(serverConfigPath)) {
            const data = fs.readFileSync(serverConfigPath, 'utf-8')
            const loaded = JSON.parse(data)

            // hostSecretが存在しない、または長さが不足している場合は再生成
            // AES-256-GCMには64文字(=32バイト)以上の16進数文字列が必要
            if (!loaded.hostSecret || loaded.hostSecret.length < 64) {
                console.log('[Security] Regenerating hostSecret due to insufficient length')
                loaded.hostSecret = generateHostSecret()
            }

            serverConfig = { ...defaultServerConfig, ...loaded }

            // hostSecretが変更された場合は保存
            saveServerConfig()
        } else {
            // 初回起動時はデフォルト設定を保存
            saveServerConfig()
        }
    } catch (error) {
        logError('database', 'Failed to load server config', error)
        serverConfig = { ...defaultServerConfig }
    }
}

// サーバー設定の保存
function saveServerConfig() {
    try {
        fs.writeFileSync(serverConfigPath, JSON.stringify(serverConfig, null, 2), 'utf-8')
    } catch (error) {
        logError('database', 'Failed to save server config', error)
    }
}

function loadSharedUsers() {
    try {
        if (fs.existsSync(sharedUsersPath)) {
            const data = fs.readFileSync(sharedUsersPath, 'utf-8')
            const loadedUsers: any[] = JSON.parse(data)

            sharedUsers = loadedUsers.map(u => {
                // 暗号化されている場合は復号化を試みる
                // hostSecretが変更された場合や未暗号化データの場合は元の値を使用
                let userToken = u.userToken
                let accessToken = u.accessToken

                // 暗号化データの形式チェック: IV.AuthTag.EncryptedData (各パーツが16進数)
                const isEncryptedFormat = (str: string) => {
                    if (!str || typeof str !== 'string') return false
                    const parts = str.split('.')
                    return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p))
                }

                if (isEncryptedFormat(u.userToken)) {
                    const decrypted = decryptData(u.userToken, serverConfig.hostSecret)
                    if (decrypted) {
                        userToken = decrypted
                    }
                    // 復号化に失敗した場合は何もしない（元の値を使用）
                }

                if (isEncryptedFormat(u.accessToken)) {
                    const decrypted = decryptData(u.accessToken, serverConfig.hostSecret)
                    if (decrypted) {
                        accessToken = decrypted
                    }
                    // 復号化に失敗した場合は何もしない（元の値を使用）
                }

                return {
                    ...u,
                    userToken,
                    accessToken
                }
            })
        }
    } catch (error) {
        logError('database', 'Failed to load shared users', error)
        sharedUsers = []
    }
}

// 共有ユーザーの保存
function saveSharedUsers() {
    try {
        // hostSecretが64文字未満の場合は暗号化をスキップ（互換性のため）
        const canEncrypt = serverConfig.hostSecret && serverConfig.hostSecret.length >= 64

        // 保存用にデータをコピー
        const usersToSave = sharedUsers.map(u => {
            if (canEncrypt) {
                return {
                    ...u,
                    userToken: encryptData(u.userToken, serverConfig.hostSecret),
                    accessToken: encryptData(u.accessToken, serverConfig.hostSecret)
                }
            } else {
                // 暗号化できない場合はプレーンテキストで保存
                return { ...u }
            }
        })
        fs.writeFileSync(sharedUsersPath, JSON.stringify(usersToSave, null, 2), 'utf-8')
    } catch (error) {
        logError('database', 'Failed to save shared users', error)
    }
}

// 監査ログの読み込み
function loadAuditLogs() {
    try {
        if (fs.existsSync(auditLogPath)) {
            const data = fs.readFileSync(auditLogPath, 'utf-8')
            auditLogs = JSON.parse(data)

            // 古いログを削除（90日以上前）
            const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)
            auditLogs = auditLogs.filter(log => new Date(log.timestamp).getTime() > ninetyDaysAgo)
        }
    } catch (error) {
        logError('database', 'Failed to load audit logs', error)
        auditLogs = []
    }
}

// 監査ログの保存
function saveAuditLogs() {
    try {
        fs.writeFileSync(auditLogPath, JSON.stringify(auditLogs, null, 2), 'utf-8')
    } catch (error) {
        logError('database', 'Failed to save audit logs', error)
    }
}

// 初期化
export function initSharedLibrary() {
    updatePaths()
    loadServerConfig()
    loadSharedUsers()
    loadAuditLogs()
    console.log('Shared library system initialized')
}

// サーバー設定管理
export const serverConfigDB = {
    getConfig(): ServerConfig {
        return { ...serverConfig }
    },

    updateConfig(updates: Partial<ServerConfig>) {
        serverConfig = { ...serverConfig, ...updates }
        saveServerConfig()
    },

    resetHostSecret() {
        serverConfig.hostSecret = generateHostSecret()
        saveServerConfig()
        return serverConfig.hostSecret
    },
}

// 共有ユーザー管理
export const sharedUserDB = {
    getAllUsers(): SharedUser[] {
        return [...sharedUsers]
    },

    getUserByToken(userToken: string): SharedUser | null {
        return sharedUsers.find(u => u.userToken === userToken) || null
    },

    getUserById(userId: string): SharedUser | null {
        return sharedUsers.find(u => u.id === userId) || null
    },

    addUser(user: Omit<SharedUser, 'id' | 'createdAt' | 'lastAccessAt'>): SharedUser {
        const newUser: SharedUser = {
            ...user,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            lastAccessAt: new Date().toISOString(),
        }

        sharedUsers.push(newUser)
        saveSharedUsers()

        return newUser
    },

    updateUser(userId: string, updates: Partial<SharedUser>) {
        const index = sharedUsers.findIndex(u => u.id === userId)
        if (index !== -1) {
            sharedUsers[index] = { ...sharedUsers[index], ...updates }
            saveSharedUsers()
        }
    },

    updateLastAccess(userId: string, ipAddress: string) {
        const index = sharedUsers.findIndex(u => u.id === userId)
        if (index !== -1) {
            sharedUsers[index].lastAccessAt = new Date().toISOString()
            sharedUsers[index].ipAddress = ipAddress
            saveSharedUsers()
        }
    },

    deleteUser(userId: string) {
        sharedUsers = sharedUsers.filter(u => u.id !== userId)
        saveSharedUsers()
    },

    // トークンペアの検証
    verifyTokenPair(userToken: string, accessToken: string): SharedUser | null {
        const user = sharedUsers.find(u =>
            u.userToken === userToken &&
            u.accessToken === accessToken &&
            u.isActive
        )
        return user || null
    },
}

// 監査ログ管理
export const auditLogDB = {
    getLogs(limit: number = 100): AuditLogEntry[] {
        return auditLogs.slice(-limit).reverse()
    },

    getLogsByUser(userId: string, limit: number = 100): AuditLogEntry[] {
        return auditLogs
            .filter(log => log.userId === userId)
            .slice(-limit)
            .reverse()
    },

    addLog(log: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
        if (!serverConfig.enableAuditLog) {
            return
        }

        const newLog: AuditLogEntry = {
            ...log,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
        }

        auditLogs.push(newLog)

        // ログが多すぎる場合は古いものを削除（最大10000件）
        if (auditLogs.length > 10000) {
            auditLogs = auditLogs.slice(-10000)
        }

        saveAuditLogs()
    },

    clearLogs() {
        auditLogs = []
        saveAuditLogs()
    },
}
