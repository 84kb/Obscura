import chokidar from 'chokidar'
import fs from 'fs-extra'
// import path from 'path' 
import { mediaDB } from './database'
import { ClientConfig } from './settings'

interface WatcherState {
    watcher: chokidar.FSWatcher | null
    currentPath: string
}

const state: WatcherState = {
    watcher: null,
    currentPath: ''
}


export function updateWatcher(config: ClientConfig, onImport?: (files: string[]) => void) {
    const { enabled, watchPath } = config.autoImport

    // 無効化されているか、パスが変わった場合は既存の監視を停止
    if (!enabled || watchPath !== state.currentPath) {
        if (state.watcher) {
            state.watcher.close().then(() => console.log('Watcher closed'))
            state.watcher = null
            state.currentPath = ''
        }
    }

    // 有効かつパスが設定されていて、まだ監視していない場合に開始
    if (enabled && watchPath && !state.watcher) {
        if (!fs.existsSync(watchPath)) {
            console.warn(`Watch path does not exist: ${watchPath}`)
            return
        }

        console.log(`Starting watcher on: ${watchPath}`)
        state.currentPath = watchPath
        state.watcher = chokidar.watch(watchPath, {
            ignored: /(^|[\/\\])\../, // ドットファイルは無視
            persistent: true,
            ignoreInitial: false, // 起動時に既存ファイルもインポートする場合はfalse。今回は動作を見て決めるが、通常は既存も取り込むべき。
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        })

        state.watcher.on('add', async (filePath: string) => {
            console.log(`File detected: ${filePath}`)
            try {
                // インポート実行
                const imported = await mediaDB.importMediaFiles([filePath])

                if (imported && imported.length > 0) {
                    console.log(`Successfully imported: ${filePath}`)
                    // 元ファイルを削除
                    await fs.remove(filePath)
                    console.log(`Removed source file: ${filePath}`)

                    // コールバック呼び出し
                    if (onImport) {
                        onImport(imported.map(m => m.file_path))
                    }
                } else {
                    console.warn(`Skipped or failed import (no media imported): ${filePath}`)
                }
            } catch (error: any) {
                console.error(`Error processing file ${filePath}:`, error)
            }
        })

        state.watcher.on('error', (error: any) => console.error(`Watcher error: ${error}`))
    }
}

