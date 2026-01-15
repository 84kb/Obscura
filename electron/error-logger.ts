import path from 'path'
import { app } from 'electron'
const fs = require('fs-extra')

// エラーログのパス
const errorLogPath = path.join(app.getPath('userData'), 'error-log.json')

// エラーレベル
export type ErrorLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

// エラーログエントリ
export interface ErrorLogEntry {
    id: string
    level: ErrorLevel
    category: string // 'auth', 'server', 'database', 'api', 'crypto', etc.
    message: string
    stack?: string
    context?: any // 追加のコンテキスト情報
    timestamp: string
    resolved: boolean
    resolvedAt?: string
    resolvedBy?: string
    notes?: string
}

let errorLogs: ErrorLogEntry[] = []

// エラーログの読み込み
function loadErrorLogs() {
    try {
        if (fs.existsSync(errorLogPath)) {
            const data = fs.readFileSync(errorLogPath, 'utf-8')
            errorLogs = JSON.parse(data)

            // 古いログを削除（90日以上前）
            const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)
            errorLogs = errorLogs.filter(log => new Date(log.timestamp).getTime() > ninetyDaysAgo)
        }
    } catch (error) {
        console.error('Failed to load error logs:', error)
        errorLogs = []
    }
}

// エラーログの保存
function saveErrorLogs() {
    try {
        fs.writeFileSync(errorLogPath, JSON.stringify(errorLogs, null, 2), 'utf-8')
    } catch (error) {
        console.error('Failed to save error logs:', error)
    }
}

// 初期化
export function initErrorLogger() {
    loadErrorLogs()
    console.log('Error logger initialized')

    // 未処理のエラーをキャッチ
    process.on('uncaughtException', (error) => {
        logError('CRITICAL', 'system', 'Uncaught Exception', error)
    })

    process.on('unhandledRejection', (reason, _promise) => {
        logError('CRITICAL', 'system', 'Unhandled Promise Rejection', reason as Error)
    })
}

// エラーログ管理
export const errorLogger = {
    /**
     * エラーをログに記録
     */
    log(level: ErrorLevel, category: string, message: string, error?: Error | any, context?: any): string {
        const logEntry: ErrorLogEntry = {
            id: crypto.randomUUID(),
            level,
            category,
            message,
            stack: error?.stack || (error ? String(error) : undefined),
            context,
            timestamp: new Date().toISOString(),
            resolved: false,
        }

        errorLogs.push(logEntry)

        // ログが多すぎる場合は古いものを削除（最大5000件）
        if (errorLogs.length > 5000) {
            errorLogs = errorLogs.slice(-5000)
        }

        saveErrorLogs()

        // コンソールにも出力
        const consoleMethod = level === 'CRITICAL' || level === 'ERROR' ? console.error :
            level === 'WARNING' ? console.warn : console.log
        consoleMethod(`[${level}] [${category}] ${message}`, error || '')

        return logEntry.id
    },

    /**
     * 全てのログを取得
     */
    getLogs(limit: number = 100, level?: ErrorLevel, category?: string): ErrorLogEntry[] {
        let filtered = errorLogs

        if (level) {
            filtered = filtered.filter(log => log.level === level)
        }

        if (category) {
            filtered = filtered.filter(log => log.category === category)
        }

        return filtered.slice(-limit).reverse()
    },

    /**
     * 未解決のエラーを取得
     */
    getUnresolvedErrors(): ErrorLogEntry[] {
        return errorLogs.filter(log => !log.resolved && (log.level === 'ERROR' || log.level === 'CRITICAL'))
    },

    /**
     * エラーを解決済みとしてマーク
     */
    markResolved(logId: string, resolvedBy: string, notes?: string) {
        const log = errorLogs.find(l => l.id === logId)
        if (log) {
            log.resolved = true
            log.resolvedAt = new Date().toISOString()
            log.resolvedBy = resolvedBy
            if (notes) {
                log.notes = notes
            }
            saveErrorLogs()
        }
    },

    /**
     * ログをクリア
     */
    clearLogs() {
        errorLogs = []
        saveErrorLogs()
    },

    /**
     * カテゴリ別の統計を取得
     */
    getStatistics(): { [category: string]: { [level: string]: number } } {
        const stats: { [category: string]: { [level: string]: number } } = {}

        errorLogs.forEach(log => {
            if (!stats[log.category]) {
                stats[log.category] = { INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 }
            }
            stats[log.category][log.level]++
        })

        return stats
    },
}

// 便利な関数
export function logInfo(category: string, message: string, context?: any): string {
    return errorLogger.log('INFO', category, message, undefined, context)
}

export function logWarning(category: string, message: string, context?: any): string {
    return errorLogger.log('WARNING', category, message, undefined, context)
}

export function logError(category: string, message: string, error?: Error | any, context?: any): string {
    return errorLogger.log('ERROR', category, message, error, context)
}

export function logCritical(category: string, message: string, error?: Error | any, context?: any): string {
    return errorLogger.log('CRITICAL', category, message, error, context)
}
