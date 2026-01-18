import chokidar from 'chokidar'
import fs from 'fs-extra'
import { libraryRegistry } from './database'
import { ClientConfig } from './settings'

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
                ignored: /(^|[\/\\])\../,
                persistent: true,
                ignoreInitial: false,
                awaitWriteFinish: {
                    stabilityThreshold: 2000,
                    pollInterval: 100
                }
            })

            watcher.on('add', async (filePath: string) => {
                console.log(`[Watcher] File detected in ${cfg.path}: ${filePath}`)
                try {
                    // Get specific library instance (even if closed/background)
                    // targetLibraryId is treated as library PATH
                    const lib = libraryRegistry.getLibrary(cfg.targetLibraryId)

                    // Import
                    const imported = await lib.importMediaFiles([filePath])

                    if (imported && imported.length > 0) {
                        console.log(`[Watcher] Imported to ${lib.path}: ${filePath}`)

                        // Remove source file
                        await fs.remove(filePath)
                        console.log(`[Watcher] Source removed: ${filePath}`)

                        // Notification (Global)
                        if (onImport) {
                            onImport(imported.map(m => m.file_path))
                        }
                    } else {
                        console.warn(`[Watcher] Skipped/Failed import: ${filePath}`)
                    }
                } catch (error: any) {
                    console.error(`[Watcher] Error processing ${filePath}:`, error)
                }
            })

            watcher.on('error', (err) => console.error(`[Watcher] Error on ${cfg.path}:`, err))

            state.watchers.set(cfg.path, watcher)
        }
    })
}

