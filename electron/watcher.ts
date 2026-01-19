import chokidar from 'chokidar'
import fs from 'fs-extra'
import { libraryRegistry } from './database'
import { ClientConfig } from './settings'
import { mainWindow } from './main'

interface WatcherState {
    // Map<watchPath, WatcherInstance>
    watchers: Map<string, chokidar.FSWatcher>
}

const state: WatcherState = {
    watchers: new Map()
}

export function updateWatcher(config: ClientConfig, onImport?: (files: string[]) => void) {
    const { enabled, watchPaths } = config.autoImport

    // Master switch: if disabled, close all
    if (!enabled) {
        state.watchers.forEach(w => w.close())
        state.watchers.clear()
        console.log('[Watcher] Master switch disabled. All watchers closed.')
        return
    }

    // 1. Identify active configs
    const activeConfigs = (watchPaths || []).filter(p => p.enabled && p.path && p.targetLibraryId)
    const activePaths = new Set(activeConfigs.map(p => p.path))

    // 2. Remove watchers for paths that are no longer active
    for (const [path, watcher] of state.watchers.entries()) {
        if (!activePaths.has(path)) {
            watcher.close().catch(e => console.error(`Failed to close watcher for ${path}:`, e))
            state.watchers.delete(path)
            console.log(`[Watcher] Stopped watching: ${path}`)
        }
    }

    // 3. Add new watchers
    activeConfigs.forEach(cfg => {
        if (!state.watchers.has(cfg.path)) {
            if (!fs.existsSync(cfg.path)) {
                console.warn(`[Watcher] Path not found, skipping: ${cfg.path}`)
                return
            }

            console.log(`[Watcher] Starting watch on: ${cfg.path} -> Library: ${cfg.targetLibraryId}`)

            const watcher = chokidar.watch(cfg.path, {
                // Default ignores dotfiles, so we override it.
                // explicitly ignore .git and node_modules, but allow other dotfiles (e.g. .video.mp4)
                ignored: /(^|[\/\\])(\.git|node_modules)/,
                persistent: true,
                ignoreInitial: false,
                awaitWriteFinish: {
                    stabilityThreshold: 2000,
                    pollInterval: 100
                }
            })

            watcher.on('add', async (filePath: string) => {
                // mojibake 調査用の Hex Dump
                const hasNonAscii = /[^\x20-\x7E]/.test(filePath)
                if (hasNonAscii) {
                    const hex = Buffer.from(filePath, 'utf-8').toString('hex')
                    console.log(`[Watcher] File detected (Non-ASCII): ${filePath} [Hex: ${hex}]`)
                } else {
                    console.log(`[Watcher] File detected: ${filePath}`)
                }

                try {
                    const lib = libraryRegistry.getLibrary(cfg.targetLibraryId)
                    // Library handles sequential execution internally via importQueue
                    const imported = await lib.importMediaFiles([filePath], (data: any) => {
                        // main.ts で定義されている global mainWindow を使用
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('import-progress', { id: 'auto-import', ...data })
                        }
                    }, { checkDuplicates: true })

                    if (imported && imported.length > 0 && onImport) {
                        onImport(imported.map((m: any) => m.file_path))
                    }
                } catch (error: any) {
                    console.error(`[Watcher] Failed to trigger import: ${filePath}`, error)
                }
            })

            watcher.on('error', (err) => console.error(`[Watcher] Error on ${cfg.path}:`, err))

            state.watchers.set(cfg.path, watcher)
        }
    })
}

