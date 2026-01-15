import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'


let updateWin: BrowserWindow | null = null

export function initUpdater(win: BrowserWindow) {
    updateWin = win

    // ログ設定 (file log)
    const log = require('electron-log')
    log.transports.file.level = 'info'
    autoUpdater.logger = log

    // 開発環境でもアップデートチェックを許可する場合 (デバッグ用)
    // autoUpdater.forceDevUpdateConfig = true

    // 自動ダウンロードを有効にする (デフォルトはtrueだが明示的に)
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = true // Alpha版のためプレリリースを許可

    // === イベントハンドラ ===

    autoUpdater.on('checking-for-update', () => {
        sendStatusToWindow('checking-for-update')
    })

    autoUpdater.on('update-available', (info) => {
        sendStatusToWindow('update-available', info)
    })

    autoUpdater.on('update-not-available', (info) => {
        sendStatusToWindow('update-not-available', info)
    })

    autoUpdater.on('error', (err) => {
        sendStatusToWindow('error', err.toString())
        console.error('Updater Error:', err)
    })

    autoUpdater.on('download-progress', (progressObj) => {
        sendStatusToWindow('download-progress', progressObj)
    })

    autoUpdater.on('update-downloaded', (info) => {
        sendStatusToWindow('update-downloaded', info)
    })

    // === IPC ハンドラ ===

    ipcMain.handle('check-for-updates', async () => {
        if (!updateWin) return
        try {
            const result = await autoUpdater.checkForUpdates()
            return result
        } catch (error) {
            console.error('Failed to check for updates:', error)
            throw error;
        }
    })

    ipcMain.handle('quit-and-install', () => {
        autoUpdater.quitAndInstall()
    })

    // 起動時にアップデートを確認
    // 開発環境ではスキップ、または forceDevUpdateConfig が必要
    if (app.isPackaged) {
        setTimeout(() => {
            autoUpdater.checkForUpdatesAndNotify()
                .catch(err => console.error('Failed to check for updates:', err))
        }, 1500)
    }
}

export function checkForUpdates() {
    return autoUpdater.checkForUpdates()
}

export function quitAndInstall() {
    autoUpdater.quitAndInstall()
}

function sendStatusToWindow(text: string, info?: any) {
    if (updateWin) {
        updateWin.webContents.send('update-status', { status: text, info })
    }
}
