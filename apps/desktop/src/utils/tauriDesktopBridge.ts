import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save, confirm, message } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification'
import { emit, listen, type Event as TauriEvent } from '@tauri-apps/api/event'
import { mockDesktopAPI } from './mockDesktopAPI'

const STORAGE_KEY = 'tauri_client_config'
const PLUGIN_DATA_PREFIX = 'tauri_plugin_data:'
const PLUGIN_ASSOC_PREFIX = 'tauri_plugin_assoc:'
let tauriAudio: HTMLAudioElement | null = null
let tauriAudioListenersBound = false
let selectedAudioDeviceId = 'default'
let pendingDownloadedUpdatePath: string | null = null
const pendingThumbnailRequests = new Map<string, Promise<string | null>>()
let nativeDropUnlisten: (() => void) | null = null
let autoImportPollTimer: ReturnType<typeof setInterval> | null = null
let autoImportPollRunning = false
const autoImportSeenByWatchId = new Map<string, Set<string>>()

const TAURI_EVENTS = {
    UPDATE_STATUS: 'update-status',
    REFRESH_PROGRESS: 'refresh-progress',
    TRIGGER_FRAME_CAPTURE: 'trigger-frame-capture',
    FFMPEG_UPDATE_PROGRESS: 'ffmpeg-update-progress',
} as const

function isTauriRuntime(): boolean {
    if (typeof window === 'undefined') return false
    const w = window as any
    return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__)
}

function getFallbackConfig() {
    return {
        downloadPath: '',
        theme: 'dark' as const,
        language: 'ja' as const,
        remoteLibraries: [],
        myUserToken: undefined,
        autoImport: { enabled: false, watchPaths: [] },
        thumbnailMode: 'speed' as const,
        discordRichPresenceEnabled: false,
        libraryViewSettings: {},
    }
}

function createLocalUserToken(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `tauri-${crypto.randomUUID()}`
    }

    const random = Math.random().toString(36).slice(2, 12)
    return `tauri-${Date.now().toString(36)}-${random}`
}

function normalizeConnectionMessage(message: unknown): string {
    const text = typeof message === 'string' ? message : ''
    if (!text) return 'Connection failed.'

    if (text.includes('ECONNREFUSED') || text.includes('fetch failed')) {
        return 'Cannot reach server. Check URL and server status.'
    }

    if (text.includes('certificate')) {
        return 'TLS certificate error. Check server certificate settings.'
    }

    if (text.includes('ETIMEDOUT') || text.includes('timeout')) {
        return 'Connection timed out.'
    }

    return text
}

function decodeMediaProtocolPath(inputPath: string): string {
    const raw = String(inputPath || '')
    if (!raw) return raw

    if (raw.startsWith('media://')) {
        const noScheme = raw.slice('media://'.length)
        const decoded = decodeURIComponent(noScheme)

        // Electron custom protocol path like: media://E/Library/file.mp4 -> E:/Library/file.mp4
        const match = decoded.match(/^([A-Za-z])\/(.*)$/)
        if (match) {
            return `${match[1]}:/${match[2]}`
        }
        return decoded
    }

    // Tauri asset protocol URL like:
    // http://asset.localhost/E%3A%5CLibrary%5Cfile.mp4 -> E:\Library\file.mp4
    try {
        const parsed = new URL(raw)
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname === 'asset.localhost') {
            let decoded = decodeURIComponent(parsed.pathname || '')
            decoded = decoded.replace(/^\/+/, '')
            return decoded
        }
    } catch {
        // Not a URL, return as-is.
    }

    return raw
}

function toPlayableSrc(inputPath: string): string {
    const normalized = decodeMediaProtocolPath(inputPath)
    if (!normalized) return normalized
    if (/^(https?:|data:|blob:)/i.test(normalized)) return normalized
    return convertFileSrc(normalized)
}

function normalizeMediaRecord(media: any): any {
    if (!media || typeof media !== 'object') return media

    const next: any = { ...media }
    if (typeof next.file_path === 'string' && next.file_path) {
        next.file_path = toPlayableSrc(next.file_path) as any
    }
    if (typeof next.thumbnail_path === 'string' && next.thumbnail_path) {
        next.thumbnail_path = toPlayableSrc(next.thumbnail_path) as any
    }
    return next
}

async function copyTextWithFallback(text: string): Promise<void> {
    try {
        await writeText(text)
        return
    } catch {
        // Fall through to browser APIs.
    }

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text)
            return
        } catch {
            // Fall through to legacy execCommand.
        }
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!ok) {
        throw new Error('Clipboard copy failed')
    }
}

async function emitBridgeEvent(eventName: string, payload: any): Promise<void> {
    try {
        await emit(eventName, payload)
    } catch {
        // Event emit failure should not break main flow.
    }
}

function subscribeBridgeEvent<T>(
    eventName: string,
    callback: (event: TauriEvent<T>) => void,
): () => void {
    let active = true
    const unlistenPromise = listen<T>(eventName, callback)
    return () => {
        if (!active) return
        active = false
        void unlistenPromise.then((unlisten) => unlisten()).catch(() => { })
    }
}

async function getStoredClientConfig() {
    try {
        const raw = await invoke<string>('read_client_config')
        const parsed = JSON.parse(raw || '{}')
        return { ...getFallbackConfig(), ...parsed }
    } catch {
        try {
            const localRaw = localStorage.getItem(STORAGE_KEY)
            return localRaw ? { ...getFallbackConfig(), ...JSON.parse(localRaw) } : getFallbackConfig()
        } catch {
            return getFallbackConfig()
        }
    }
}

function toLibraryEntry(libraryPath: string) {
    const normalized = String(libraryPath || '').trim()
    if (!normalized) return null
    const normalizedNoSlash = normalized.replace(/[\\\/]+$/, '')
    if (!normalizedNoSlash) return null

    const name = normalizedNoSlash.split(/[/\\]/).pop() || normalizedNoSlash
    return { name, path: normalizedNoSlash }
}

function mergeLocalLibraries(config: any) {
    const list = Array.isArray(config?.localLibraries) ? config.localLibraries : []
    const map = new Map<string, any>()
    for (const entry of list) {
        const lib = toLibraryEntry(entry?.path)
        if (lib) map.set(lib.path, lib)
    }
    const active = toLibraryEntry(config?.activeLibraryPath)
    if (active) map.set(active.path, active)
    return Array.from(map.values())
}

function getAudioElement(): HTMLAudioElement {
    if (!tauriAudio) {
        tauriAudio = new Audio()
        tauriAudio.preload = 'metadata'
    }
    return tauriAudio
}

function ensureAudioEventBridge(audio: HTMLAudioElement): void {
    if (tauriAudioListenersBound) return
    tauriAudioListenersBound = true

    audio.addEventListener('timeupdate', () => {
        void emitBridgeEvent('audio:time-update', audio.currentTime)
    })
    audio.addEventListener('durationchange', () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0
        void emitBridgeEvent('audio:duration-update', duration)
    })
    audio.addEventListener('pause', () => {
        void emitBridgeEvent('audio:pause-update', true)
    })
    audio.addEventListener('play', () => {
        void emitBridgeEvent('audio:pause-update', false)
    })
    audio.addEventListener('ended', () => {
        void emitBridgeEvent('audio:ended', true)
    })
}

function normalizeAudioDevices(raw: any[]): { name: string; description: string }[] {
    const normalizeLabel = (value: unknown, fallback: string) => {
        const text = String(value || '').trim()
        if (!text) return fallback
        // Strip common mojibake/replacement noise and collapse whitespace.
        const cleaned = text
            .replace(/\uFFFD/g, '')
            .replace(/[^\S\r\n]+/g, ' ')
            .trim()
        return cleaned || fallback
    }

    const dedupeKey = (value: string) =>
        value
            .toLowerCase()
            .replace(/[\s\-_()[\]{}]+/g, '')
            .trim()

    const seen = new Set<string>()
    const out: { name: string; description: string }[] = []
    for (let i = 0; i < (raw?.length || 0); i += 1) {
        const item = raw[i] || {}
        const name = normalizeLabel(item?.name, `device-${i}`)
        const description = normalizeLabel(item?.description, name)
        const key = dedupeKey(description)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ name, description })
    }
    return out
}

function normalizeFsPath(input: string): string {
    return String(input || '').replace(/\\/g, '/').toLowerCase().trim()
}

async function setupNativeDropBridge(): Promise<void> {
    if (nativeDropUnlisten) return
    try {
        const appWindow = getCurrentWindow()
        nativeDropUnlisten = await appWindow.onDragDropEvent((event: any) => {
            const payload = event?.payload
            const type = String(payload?.type || '')
            if (type === 'over') {
                void emitBridgeEvent('native-file-drag-over', true)
                return
            }
            if (type === 'cancel') {
                void emitBridgeEvent('native-file-drag-cancel', true)
                return
            }
            if (type !== 'drop') return
            void emitBridgeEvent('native-file-drag-drop', true)
            const paths = Array.isArray(payload.paths)
                ? payload.paths.filter((p: unknown) => typeof p === 'string' && String(p).trim().length > 0)
                : []
            if (paths.length === 0) return
            void emitBridgeEvent('trigger-import', paths)
        })
    } catch {
        // Keep app working even if drag-drop bridge is unavailable.
    }
}

async function pollAutoImport(): Promise<void> {
    if (autoImportPollRunning) return
    autoImportPollRunning = true
    try {
        const config = await getStoredClientConfig()
        const autoImport = config?.autoImport
        const watchPaths = Array.isArray(autoImport?.watchPaths) ? autoImport.watchPaths : []
        const activeWatchIds = new Set<string>()
        let importedPathSet: Set<string> | null = null

        const getImportedPathSet = async (): Promise<Set<string>> => {
            if (importedPathSet) return importedPathSet
            let mediaList: any[] = []
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_media_files',
                    params: {},
                })
                mediaList = Array.isArray(result) ? result : []
            } catch {
                mediaList = []
            }
            importedPathSet = new Set(
                mediaList
                    .map((m) => normalizeFsPath(String(m?.file_path || '')))
                    .filter((p) => p.length > 0),
            )
            return importedPathSet
        }

        for (const watch of watchPaths) {
            const watchId = String(watch?.id || '').trim()
            const watchPath = String(watch?.path || '').trim()
            const enabled = Boolean(watch?.enabled)
            if (!watchId || !watchPath || !enabled) continue

            activeWatchIds.add(watchId)

            let scanned: any[] = []
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'scan_folder',
                    params: { folderPath: watchPath },
                })
                scanned = Array.isArray(result) ? result : []
            } catch {
                continue
            }

            const currentSet = new Set<string>()
            for (const item of scanned) {
                const filePath = normalizeFsPath(String(item?.file_path || ''))
                if (filePath) currentSet.add(filePath)
            }

            const prevSet = autoImportSeenByWatchId.get(watchId)
            if (!prevSet) {
                autoImportSeenByWatchId.set(watchId, currentSet)
                const knownImported = await getImportedPathSet()
                const existingNotImported = scanned
                    .map((item) => String(item?.file_path || '').trim())
                    .filter((rawPath) => {
                        const key = normalizeFsPath(rawPath)
                        return key.length > 0 && !knownImported.has(key)
                    })
                if (existingNotImported.length > 0) {
                    void emitBridgeEvent('trigger-import', existingNotImported)
                }
                continue
            }

            const newPaths: string[] = []
            for (const item of scanned) {
                const rawPath = String(item?.file_path || '').trim()
                const key = normalizeFsPath(rawPath)
                if (!key) continue
                if (!prevSet.has(key)) newPaths.push(rawPath)
            }

            autoImportSeenByWatchId.set(watchId, currentSet)
            if (newPaths.length > 0) {
                void emitBridgeEvent('trigger-import', newPaths)
            }
        }

        for (const existingId of Array.from(autoImportSeenByWatchId.keys())) {
            if (!activeWatchIds.has(existingId)) {
                autoImportSeenByWatchId.delete(existingId)
            }
        }
    } finally {
        autoImportPollRunning = false
    }
}

function setupAutoImportPolling(): void {
    if (autoImportPollTimer) return
    autoImportPollTimer = setInterval(() => {
        void pollAutoImport()
    }, 8000)
    void pollAutoImport()
}
export function initTauriDesktopBridge(): void {
    if (!isTauriRuntime()) return
    if (typeof window === 'undefined') return
    if ((window as any).obscuraAPI) return

    void setupNativeDropBridge()
    setupAutoImportPolling()

    const tauriDesktopApi = {
        ...mockDesktopAPI,
        selectFile: async (options?: any) => {
            const selected = await open({
                multiple: false,
                directory: false,
                filters: options?.filters,
            })
            return typeof selected === 'string' ? selected : null
        },
        selectFolder: async () => {
            const selected = await open({
                multiple: false,
                directory: true,
            })
            return typeof selected === 'string' ? selected : null
        },
        scanFolder: async (folderPath: string) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'scan_folder',
                    params: { folderPath },
                })
                return Array.isArray(result) ? result.map((m) => normalizeMediaRecord(m)) : []
            } catch {
                return []
            }
        },
        getLibraries: async () => {
            const config = await getStoredClientConfig()
            return mergeLocalLibraries(config)
        },
        createLibrary: async (name: string, parentPath: string) => {
            const createdPath = await invoke<string>('sidecar_request', {
                method: 'create_library_dir',
                params: { name, parentPath },
            })
            const lib = toLibraryEntry(createdPath)
            if (!lib) throw new Error('Failed to create library')

            const config = await getStoredClientConfig()
            const merged = mergeLocalLibraries({
                ...config,
                activeLibraryPath: lib.path,
                localLibraries: [...(config?.localLibraries || []), lib],
            })

            await tauriDesktopApi.updateClientConfig({
                activeLibraryPath: lib.path,
                localLibraries: merged,
            })
            await tauriDesktopApi.setActiveLibrary(lib.path)
            return lib
        },
        openLibrary: async () => {
            const selected = await open({
                multiple: false,
                directory: true,
            })
            const selectedPath = typeof selected === 'string' ? selected : ''
            const lib = toLibraryEntry(selectedPath)
            if (!lib) return null

            const config = await getStoredClientConfig()
            const merged = mergeLocalLibraries({
                ...config,
                activeLibraryPath: lib.path,
                localLibraries: [...(config?.localLibraries || []), lib],
            })
            await tauriDesktopApi.updateClientConfig({
                activeLibraryPath: lib.path,
                localLibraries: merged,
            })
            await tauriDesktopApi.setActiveLibrary(lib.path)
            return lib
        },
        setActiveLibrary: async (libraryPath: string) => {
            const lib = toLibraryEntry(libraryPath)
            if (!lib) return
            await invoke('sidecar_request', {
                method: 'set_active_library',
                params: { libraryPath: lib.path },
            })
            const config = await getStoredClientConfig()
            const merged = mergeLocalLibraries({
                ...config,
                activeLibraryPath: lib.path,
                localLibraries: [...(config?.localLibraries || []), lib],
            })
            await tauriDesktopApi.updateClientConfig({
                activeLibraryPath: lib.path,
                localLibraries: merged,
            })
        },
        getActiveLibrary: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_active_library',
                    params: null,
                })
                if (result && typeof result === 'object' && result.path) return result
            } catch {
                // Fallback below.
            }

            const config = await getStoredClientConfig()
            const fallback = toLibraryEntry(config?.activeLibraryPath)
            if (!fallback) return null
            await invoke('sidecar_request', {
                method: 'set_active_library',
                params: { libraryPath: fallback.path },
            })
            return fallback
        },
        refreshLibrary: async () => {
            try {
                await emitBridgeEvent(TAURI_EVENTS.REFRESH_PROGRESS, { current: 0, total: 1 })
                await invoke('sidecar_request', {
                    method: 'refresh_library',
                    params: null,
                })
                await emitBridgeEvent(TAURI_EVENTS.REFRESH_PROGRESS, { current: 1, total: 1 })
                return true
            } catch {
                await emitBridgeEvent(TAURI_EVENTS.REFRESH_PROGRESS, { current: 1, total: 1 })
                return false
            }
        },
        getMediaFiles: async (page?: number, limit?: number, filters?: any) => {
            try {
                const targetPage = Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : 1
                const targetLimit = Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : 100
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_media_files',
                    params: {
                        page: targetPage,
                        limit: targetLimit,
                        filters: filters ?? null,
                    },
                })
                if (Array.isArray(result)) {
                    return result.map((m) => normalizeMediaRecord(m))
                }

                if (result && typeof result === 'object' && Array.isArray(result.media)) {
                    return {
                        ...result,
                        media: result.media.map((m: any) => normalizeMediaRecord(m)),
                    }
                }

                return []
            } catch {
                return []
            }
        },
        getMediaFile: async (id: number) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_media_file',
                    params: { id },
                })
                return result ? normalizeMediaRecord(result) : null
            } catch {
                return null
            }
        },
        renameMedia: async (mediaId: number, newName: string) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'rename_media',
                    params: { mediaId, newName },
                })
                return result ? normalizeMediaRecord(result) : null
            } catch {
                return null
            }
        },
        updateRating: async (mediaId: number, rating: number) => {
            await invoke('sidecar_request', {
                method: 'update_rating',
                params: { mediaId, rating },
            })
        },
        updateArtist: async (mediaId: number, artist: string | null) => {
            await invoke('sidecar_request', {
                method: 'update_artist',
                params: { mediaId, artist },
            })
        },
        updateDescription: async (mediaId: number, description: string | null) => {
            await invoke('sidecar_request', {
                method: 'update_description',
                params: { mediaId, description },
            })
        },
        updateUrl: async (mediaId: number, url: string | null) => {
            await invoke('sidecar_request', {
                method: 'update_url',
                params: { mediaId, url },
            })
        },
        backfillMetadata: async () => {
            const result = await invoke<number>('sidecar_request', {
                method: 'backfill_metadata',
                params: null,
            })
            return typeof result === 'number' ? result : 0
        },
        addMediaParent: async (childId: number, parentId: number) => {
            await invoke('sidecar_request', {
                method: 'add_media_parent',
                params: { childId, parentId },
            })
        },
        removeMediaParent: async (childId: number, parentId: number) => {
            await invoke('sidecar_request', {
                method: 'remove_media_parent',
                params: { childId, parentId },
            })
        },
        updateMedia: async (mediaId: number, updates: any) => {
            const payload = updates && typeof updates === 'object' ? updates : {}
            if (payload.rating !== undefined) {
                await tauriDesktopApi.updateRating(mediaId, Number(payload.rating))
            }
            if (payload.artist !== undefined) {
                await tauriDesktopApi.updateArtist(mediaId, payload.artist ?? null)
            }
            if (payload.description !== undefined) {
                await tauriDesktopApi.updateDescription(mediaId, payload.description ?? null)
            }
            if (payload.url !== undefined) {
                await tauriDesktopApi.updateUrl(mediaId, payload.url ?? null)
            }
            return await tauriDesktopApi.getMediaFile(mediaId)
        },
        updateLastPlayed: async (mediaId: number) => {
            await invoke('sidecar_request', {
                method: 'update_last_played',
                params: { mediaId },
            })
        },
        moveToTrash: async (mediaId: number) => {
            await invoke('sidecar_request', {
                method: 'move_to_trash',
                params: { mediaId },
            })
        },
        restoreFromTrash: async (mediaId: number) => {
            await invoke('sidecar_request', {
                method: 'restore_from_trash',
                params: { mediaId },
            })
        },
        deletePermanently: async (mediaId: number) => {
            await invoke('sidecar_request', {
                method: 'delete_permanently',
                params: { mediaId },
            })
        },
        moveFilesToTrash: async (ids: number[]) => {
            for (const mediaId of ids || []) {
                await invoke('sidecar_request', {
                    method: 'move_to_trash',
                    params: { mediaId },
                })
            }
        },
        restoreFilesFromTrash: async (ids: number[]) => {
            for (const mediaId of ids || []) {
                await invoke('sidecar_request', {
                    method: 'restore_from_trash',
                    params: { mediaId },
                })
            }
        },
        deleteFilesPermanently: async (ids: number[]) => {
            for (const mediaId of ids || []) {
                await invoke('sidecar_request', {
                    method: 'delete_permanently',
                    params: { mediaId },
                })
            }
        },
        getTags: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_tags',
                    params: null,
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        createTag: async (name: string) => {
            return await invoke<any>('sidecar_request', {
                method: 'create_tag',
                params: { name },
            })
        },
        deleteTag: async (id: number) => {
            await invoke('sidecar_request', {
                method: 'delete_tag',
                params: { id },
            })
        },
        addTagToMedia: async (mediaId: number, tagId: number) => {
            await invoke('sidecar_request', {
                method: 'add_tag_to_media',
                params: { mediaId, tagId },
            })
        },
        addTagsToMedia: async (mediaIds: number[], tagIds: number[]) => {
            await invoke('sidecar_request', {
                method: 'add_tags_to_media',
                params: { mediaIds, tagIds },
            })
        },
        removeTagFromMedia: async (mediaId: number, tagId: number) => {
            await invoke('sidecar_request', {
                method: 'remove_tag_from_media',
                params: { mediaId, tagId },
            })
        },
        getTagGroups: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_tag_groups',
                    params: null,
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        createTagGroup: async (name: string) => {
            return await invoke<any>('sidecar_request', {
                method: 'create_tag_group',
                params: { name },
            })
        },
        deleteTagGroup: async (id: number) => {
            await invoke('sidecar_request', {
                method: 'delete_tag_group',
                params: { id },
            })
        },
        renameTagGroup: async (id: number, newName: string) => {
            await invoke('sidecar_request', {
                method: 'rename_tag_group',
                params: { id, newName },
            })
        },
        updateTagGroup: async (tagId: number, groupId: number | null) => {
            await invoke('sidecar_request', {
                method: 'update_tag_group',
                params: { tagId, groupId },
            })
        },
        addComment: async (mediaId: number, text: string, time: number) => {
            return await invoke<any>('sidecar_request', {
                method: 'add_comment',
                params: { mediaId, text, time },
            })
        },
        getComments: async (mediaId: number) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_comments',
                    params: { mediaId },
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        generatePreviews: async (_mediaId: number) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'generate_previews',
                    params: { mediaId: _mediaId, interval: 1 },
                })
                return Array.isArray(result) ? result.map((p) => toPlayableSrc(String(p || ''))) : []
            } catch {
                return []
            }
        },
        getFolders: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_folders',
                    params: null,
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        createFolder: async (name: string, parentId?: number | null) => {
            return await invoke<any>('sidecar_request', {
                method: 'create_folder',
                params: { name, parentId: parentId ?? null },
            })
        },
        deleteFolder: async (id: number) => {
            await invoke('sidecar_request', {
                method: 'delete_folder',
                params: { id },
            })
        },
        renameFolder: async (id: number, newName: string) => {
            await invoke('sidecar_request', {
                method: 'rename_folder',
                params: { id, newName },
            })
        },
        addFolderToMedia: async (mediaId: number, folderId: number) => {
            await invoke('sidecar_request', {
                method: 'add_folder_to_media',
                params: { mediaId, folderId },
            })
        },
        removeFolderFromMedia: async (mediaId: number, folderId: number) => {
            await invoke('sidecar_request', {
                method: 'remove_folder_from_media',
                params: { mediaId, folderId },
            })
        },
        updateFolderStructure: async (updates: { id: number; parentId: number | null; orderIndex: number }[]) => {
            await invoke('sidecar_request', {
                method: 'update_folder_structure',
                params: { updates },
            })
        },
        importMedia: async (filePaths: string[]) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'import_media',
                    params: { filePaths: filePaths ?? [] },
                })
                return Array.isArray(result) ? result.map((m) => normalizeMediaRecord(m)) : []
            } catch {
                return []
            }
        },
        checkImportDuplicates: async (filePaths: string[]) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'check_import_duplicates',
                    params: { filePaths: filePaths ?? [] },
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        checkEntryDuplicates: async (mediaId: number) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'check_entry_duplicates',
                    params: { mediaId },
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        findLibraryDuplicates: async (criteria?: { name: boolean; size: boolean; duration: boolean; modified: boolean }) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'find_library_duplicates',
                    params: { criteria: criteria ?? null },
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        refreshMediaMetadata: async (ids: number[]) => {
            await invoke('sidecar_request', {
                method: 'refresh_media_metadata',
                params: { ids: ids ?? [] },
            })
        },
        scanFileSystemOrphans: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'scan_filesystem_orphans',
                    params: null,
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        deleteFileSystemFiles: async (paths: string[]) => {
            try {
                const result = await invoke<number>('sidecar_request', {
                    method: 'delete_filesystem_files',
                    params: { paths: paths ?? [] },
                })
                return typeof result === 'number' ? result : 0
            } catch {
                return 0
            }
        },
        searchMediaFiles: async (query: string, targets?: any) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'search_media_files',
                    params: { query, targets: targets ?? null },
                })
                return Array.isArray(result) ? result.map((m) => normalizeMediaRecord(m)) : []
            } catch {
                return []
            }
        },
        generateThumbnail: async (mediaId: number, _filePath: string) => {
            const key = `${Number(mediaId) || 0}:${String(_filePath || '')}`
            const pending = pendingThumbnailRequests.get(key)
            if (pending) {
                return pending
            }

            const request = (async () => {
                try {
                    const result = await invoke<string | null>('sidecar_request', {
                        method: 'generate_thumbnail',
                        params: { mediaId, filePath: _filePath },
                    })
                    return typeof result === 'string' && result ? toPlayableSrc(result) : null
                } catch {
                    return null
                } finally {
                    pendingThumbnailRequests.delete(key)
                }
            })()
            pendingThumbnailRequests.set(key, request)

            try {
                return await request
            } finally {
                // handled in request.finally
            }
        },
        copyFrameToClipboard: async (dataUrl: string) => {
            try {
                const canWriteImage =
                    typeof ClipboardItem !== 'undefined' &&
                    Boolean(navigator?.clipboard?.write) &&
                    typeof fetch === 'function'
                if (canWriteImage) {
                    const response = await fetch(dataUrl)
                    const blob = await response.blob()
                    const item = new ClipboardItem({ [blob.type || 'image/png']: blob })
                    await navigator.clipboard.write([item])
                    return true
                }
                await copyTextWithFallback(dataUrl)
                return true
            } catch {
                return false
            }
        },
        saveCapturedFrame: async (dataUrl: string) => {
            try {
                const outputPath = await save({
                    defaultPath: `obscura-capture-${Date.now()}.png`,
                    filters: [{ name: 'PNG Image', extensions: ['png'] }],
                })
                if (!outputPath) return false
                await invoke('sidecar_request', {
                    method: 'save_data_url_file',
                    params: { dataUrl, outputPath },
                })
                return true
            } catch {
                return false
            }
        },
        setCapturedThumbnail: async (mediaId: number, dataUrl: string) => {
            try {
                const result = await invoke<string | null>('sidecar_request', {
                    method: 'set_captured_thumbnail',
                    params: { mediaId, dataUrl },
                })
                return typeof result === 'string' && result ? result : null
            } catch {
                return null
            }
        },
        getSelectedMedia: async () => {
            const selected = (window as any)?.__obscura_selected_media
            if (!Array.isArray(selected)) return []
            return selected
                .filter((m: any) => m && typeof m === 'object')
                .map((m: any) => normalizeMediaRecord(m))
        },
        exportMedia: async (mediaId: number, options?: { notificationId?: string }) => {
            try {
                const notificationId = options?.notificationId
                if (notificationId) {
                    await emitBridgeEvent('export-progress', { id: notificationId, progress: 0 })
                }
                const media = await tauriDesktopApi.getMediaFile(mediaId)
                const defaultPath =
                    (media && typeof media.file_name === 'string' && media.file_name.trim()) ||
                    'exported-media'
                const selectedPath = await save({
                    defaultPath,
                    filters: [
                        { name: 'Video Files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi'] },
                        { name: 'All Files', extensions: ['*'] },
                    ],
                })
                if (!selectedPath) {
                    return { success: false, message: 'Cancelled' }
                }

                const result = await invoke<any>('sidecar_request', {
                    method: 'export_media',
                    params: {
                        mediaId,
                        outputPath: selectedPath,
                        options: options ?? null,
                    },
                })

                if (result && typeof result === 'object') {
                    if (!result.message && typeof result.error === 'string') {
                        return { ...result, message: result.error }
                    }
                    if (notificationId && result.success) {
                        await emitBridgeEvent('export-progress', { id: notificationId, progress: 100 })
                    }
                    return result
                }
                if (notificationId) {
                    await emitBridgeEvent('export-progress', { id: notificationId, progress: 100 })
                }
                return { success: true }
            } catch (error: any) {
                return { success: false, message: error?.message || 'export failed' }
            }
        },
        copyMediaToLibrary: async (
            mediaIds: number[],
            libraryPath: string,
            settings: any,
            options?: { notificationId?: string },
        ) => {
            try {
                const notificationId = options?.notificationId
                if (notificationId) {
                    await emitBridgeEvent('notification-progress', { id: notificationId, progress: 0 })
                }
                const result = await invoke<any>('sidecar_request', {
                    method: 'copy_media_to_library',
                    params: {
                        mediaIds: mediaIds ?? [],
                        libraryPath,
                        settings: settings ?? {},
                        options: options ?? null,
                    },
                })
                if (result && typeof result === 'object') {
                    if (!result.message && typeof result.error === 'string') {
                        return { ...result, message: result.error }
                    }
                    if (notificationId && result.success) {
                        await emitBridgeEvent('notification-progress', { id: notificationId, progress: 100 })
                    }
                    return result
                }
                if (notificationId) {
                    await emitBridgeEvent('notification-progress', { id: notificationId, progress: 100 })
                }
                return { success: true }
            } catch (error: any) {
                return { success: false, message: error?.message || 'copy failed' }
            }
        },
        openExternal: async (url: string) => {
            await openUrl(url)
        },
        openPath: async (filePath: string) => {
            await invoke('sidecar_request', {
                method: 'file_open_path',
                params: { filePath: decodeMediaProtocolPath(filePath) },
            })
        },
        showItemInFolder: async (filePath: string) => {
            await invoke('sidecar_request', {
                method: 'file_show_item_in_folder',
                params: { filePath: decodeMediaProtocolPath(filePath) },
            })
        },
        openWith: async (filePath: string) => {
            await invoke('sidecar_request', {
                method: 'file_open_with',
                params: { filePath: decodeMediaProtocolPath(filePath) },
            })
        },
        copyFile: async (filePath: string) => {
            await invoke('sidecar_request', {
                method: 'file_copy_to_clipboard',
                params: { filePath: decodeMediaProtocolPath(filePath) },
            })
        },
        copyToClipboard: async (text: string) => {
            await copyTextWithFallback(decodeMediaProtocolPath(text))
        },
        copyFileToClipboard: async (filePath: string) => {
            await invoke('sidecar_request', {
                method: 'file_copy_to_clipboard',
                params: { filePath: decodeMediaProtocolPath(filePath) },
            })
            return true
        },
        showNotification: async (options: { title: string; message: string }) => {
            let permissionGranted = await isPermissionGranted()
            if (!permissionGranted) {
                const permission = await requestPermission()
                permissionGranted = permission === 'granted'
            }
            if (permissionGranted) {
                sendNotification({ title: options.title, body: options.message })
            }
        },
        minimizeWindow: async () => {
            await invoke('window_minimize')
        },
        maximizeWindow: async () => {
            await invoke('window_toggle_maximize')
        },
        closeWindow: async () => {
            await invoke('window_close')
        },
        focusWindow: async () => {
            await invoke('window_focus')
        },
        updateDiscordActivity: async (activity: any) => {
            try {
                const config = await getStoredClientConfig()
                const enabled = Boolean(config?.discordRichPresenceEnabled)
                await invoke('sidecar_request', {
                    method: 'discord_update_activity',
                    params: { enabled, activity: activity ?? {} },
                })
            } catch {
                // Keep UI flow even when Discord RPC is unavailable.
            }
        },
        clearDiscordActivity: async () => {
            try {
                await invoke('sidecar_request', {
                    method: 'discord_clear_activity',
                    params: null,
                })
            } catch {
                // Ignore when Discord RPC is unavailable.
            }
        },
        checkForUpdates: async () => {
            try {
                await emitBridgeEvent(TAURI_EVENTS.UPDATE_STATUS, { status: 'checking-for-update' })
                const currentVersion = await getVersion().catch(() => '')
                const result = await invoke<any>('sidecar_request', {
                    method: 'check_for_updates',
                    params: { currentVersion },
                })
                const normalized = result && typeof result === 'object'
                    ? result
                    : { available: false, message: 'Invalid update response' }
                await emitBridgeEvent(TAURI_EVENTS.UPDATE_STATUS, {
                    status: normalized.available ? 'update-available' : 'update-not-available',
                    info: normalized,
                })
                return normalized
            } catch (error: any) {
                await emitBridgeEvent(TAURI_EVENTS.UPDATE_STATUS, {
                    status: 'error',
                    info: { message: error?.message || 'update check failed' },
                })
                return { available: false, message: error?.message || 'update check failed' }
            }
        },
        downloadUpdate: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'download_update',
                    params: null,
                })
                const normalized = result && typeof result === 'object'
                    ? result
                    : { success: false, message: 'Invalid download update response' }
                if (normalized.success) {
                    pendingDownloadedUpdatePath = typeof normalized.path === 'string' ? normalized.path : null
                    await emitBridgeEvent(TAURI_EVENTS.UPDATE_STATUS, { status: 'update-downloaded', info: normalized })
                } else {
                    await emitBridgeEvent(TAURI_EVENTS.UPDATE_STATUS, { status: 'error', info: normalized })
                }
                return normalized
            } catch (error: any) {
                await emitBridgeEvent(TAURI_EVENTS.UPDATE_STATUS, {
                    status: 'error',
                    info: { message: error?.message || 'download update failed' },
                })
                return { success: false, message: error?.message || 'download update failed' }
            }
        },
        quitAndInstall: async () => {
            await invoke('sidecar_request', {
                method: 'quit_and_install',
                params: { path: pendingDownloadedUpdatePath },
            })
        },
        onUpdateStatus: (callback: (data: { status: string; info?: any }) => void) =>
            subscribeBridgeEvent<any>(TAURI_EVENTS.UPDATE_STATUS, (event) => {
                callback((event?.payload && typeof event.payload === 'object')
                    ? event.payload
                    : { status: 'unknown', info: event?.payload })
            }),
        onRefreshProgress: (callback: (current: number, total: number) => void) =>
            subscribeBridgeEvent<any>(TAURI_EVENTS.REFRESH_PROGRESS, (event) => {
                const payload = event?.payload
                if (Array.isArray(payload)) {
                    callback(Number(payload[0] || 0), Number(payload[1] || 0))
                    return
                }
                if (payload && typeof payload === 'object') {
                    callback(Number(payload.current || 0), Number(payload.total || 0))
                    return
                }
                callback(0, 0)
            }),
        onTriggerFrameCapture: (callback: (action: string) => void) =>
            subscribeBridgeEvent<any>(TAURI_EVENTS.TRIGGER_FRAME_CAPTURE, (event) => {
                const payload = event?.payload
                if (typeof payload === 'string') {
                    callback(payload)
                    return
                }
                if (payload && typeof payload === 'object' && typeof payload.action === 'string') {
                    callback(payload.action)
                }
            }),
        onFFmpegUpdateProgress: (callback: (progress: number) => void) =>
            subscribeBridgeEvent<any>(TAURI_EVENTS.FFMPEG_UPDATE_PROGRESS, (event) => {
                const payload = event?.payload
                if (typeof payload === 'number') {
                    callback(payload)
                    return
                }
                if (payload && typeof payload === 'object' && Number.isFinite(Number(payload.progress))) {
                    callback(Number(payload.progress))
                }
            }),
        on: (channel: string, func: (...args: any[]) => void) =>
            subscribeBridgeEvent<any>(channel, (event) => {
                if (typeof func === 'function') {
                    func(event, event?.payload)
                }
            }),
        getFFmpegInfo: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'ffmpeg_info',
                    params: null,
                })
                if (result && typeof result === 'object') {
                    return {
                        version: String(result.version || ''),
                        path: String(result.path || ''),
                    }
                }
            } catch {
                // fallback below
            }
            return { version: '', path: '' }
        },
        checkFFmpegUpdate: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'ffmpeg_check_update',
                    params: null,
                })
                if (result && typeof result === 'object') {
                    return {
                        available: Boolean(result.available),
                        version: result.version ? String(result.version) : undefined,
                        url: result.url ? String(result.url) : undefined,
                    }
                }
            } catch {
                // fallback below
            }
            return { available: false }
        },
        updateFFmpeg: async (url: string) => {
            try {
                await emitBridgeEvent(TAURI_EVENTS.FFMPEG_UPDATE_PROGRESS, 0)
                const result = await invoke<any>('sidecar_request', {
                    method: 'ffmpeg_update',
                    params: { url: url === 'latest' ? '' : (url || '') },
                })
                const ok = Boolean(result)
                await emitBridgeEvent(TAURI_EVENTS.FFMPEG_UPDATE_PROGRESS, ok ? 100 : 0)
                return ok
            } catch {
                await emitBridgeEvent(TAURI_EVENTS.FFMPEG_UPDATE_PROGRESS, 0)
                return false
            }
        },
        getAudioDevices: async () => {
            const browserDevices = async () => {
                if (!navigator?.mediaDevices?.enumerateDevices) return []
                const devices = await navigator.mediaDevices.enumerateDevices()
                const outputs = devices.filter((d) => d.kind === 'audiooutput')
                return normalizeAudioDevices(outputs.map((d, index) => ({
                    name: d.deviceId || `device-${index}`,
                    description: d.label || `Audio Output ${index + 1}`,
                })))
            }

            try {
                const list = await browserDevices()
                if (list.length > 0) {
                    return list
                }
            } catch {
                // Fallback to sidecar below.
            }

            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'audio_get_devices',
                    params: null,
                })
                const list = normalizeAudioDevices(Array.isArray(result) ? result : [])
                if (list.length > 0) {
                    return list
                }
            } catch {
                // Fallback below.
            }
            return [{ name: 'default', description: 'Default audio output' }]
        },
        setAudioDevice: async (deviceName: string) => {
            selectedAudioDeviceId = deviceName || 'default'
            try {
                await invoke('sidecar_request', {
                    method: 'audio_set_device',
                    params: { deviceName: selectedAudioDeviceId },
                })
            } catch {
                // Continue with renderer-level best effort.
            }
            const audio = getAudioElement()
            const sinkSetter = (audio as any).setSinkId
            if (typeof sinkSetter === 'function') {
                await sinkSetter.call(audio, selectedAudioDeviceId)
            }
        },
        setExclusiveMode: async (enabled: boolean) => {
            try {
                await invoke('sidecar_request', {
                    method: 'audio_set_exclusive',
                    params: { enabled: Boolean(enabled) },
                })
            } catch {
                // Keep compatibility even if unsupported in current runtime.
            }
        },
        playAudio: async (filePath?: string) => {
            const audio = getAudioElement()
            ensureAudioEventBridge(audio)
            if (filePath) {
                audio.src = toPlayableSrc(filePath)
            }
            const sinkSetter = (audio as any).setSinkId
            if (selectedAudioDeviceId && typeof sinkSetter === 'function') {
                try {
                    await sinkSetter.call(audio, selectedAudioDeviceId)
                } catch {
                    // Ignore sink change failures on unsupported WebView builds.
                }
            }
            if (!audio.src) return
            await audio.play()
        },
        pauseAudio: async () => {
            getAudioElement().pause()
        },
        resumeAudio: async () => {
            const audio = getAudioElement()
            if (!audio.src) return
            await audio.play()
        },
        stopAudio: async () => {
            const audio = getAudioElement()
            audio.pause()
            audio.currentTime = 0
        },
        seekAudio: async (time: number) => {
            const audio = getAudioElement()
            audio.currentTime = Number.isFinite(time) ? Math.max(0, time) : 0
        },
        setAudioVolume: async (volume: number) => {
            const audio = getAudioElement()
            const normalized = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1
            audio.volume = normalized
        },
        getClientConfig: async () => {
            return await getStoredClientConfig()
        },
        updateClientConfig: async (updates: any) => {
            const current = await getStoredClientConfig()
            const nextConfig = { ...current, ...updates }
            const payload = JSON.stringify(nextConfig, null, 2)

            try {
                await invoke('write_client_config', { content: payload })
            } catch {
                localStorage.setItem(STORAGE_KEY, payload)
            }

            return nextConfig
        },
        getHardwareId: async () => {
            try {
                const hardwareId = await invoke<string>('sidecar_request', {
                    method: 'get_hardware_id',
                    params: null,
                })
                if (typeof hardwareId === 'string' && hardwareId.trim()) {
                    return hardwareId
                }
            } catch {
                // Fallback below.
            }
            return createLocalUserToken()
        },
        generateUserToken: async () => {
            const current = await getStoredClientConfig()
            if (typeof current?.myUserToken === 'string' && current.myUserToken.trim()) {
                return current.myUserToken
            }

            let token = ''
            try {
                const generated = await invoke<string>('sidecar_request', {
                    method: 'generate_user_token',
                    params: null,
                })
                if (typeof generated === 'string' && generated.trim()) {
                    token = generated
                }
            } catch {
                // Fallback below.
            }

            if (!token) {
                token = createLocalUserToken()
            }
            await tauriDesktopApi.updateClientConfig({ myUserToken: token })
            return token
        },
        testConnection: async (url: string, token: string) => {
            try {
                const config = await getStoredClientConfig()
                const result = await invoke<any>('sidecar_request', {
                    method: 'test_connection',
                    params: {
                        url,
                        token,
                        userToken: config?.myUserToken || '',
                    },
                })
                if (result && typeof result === 'object') {
                    const maybeMessage = (result as any).message
                    return {
                        ...result,
                        message: (result as any).success
                            ? maybeMessage
                            : normalizeConnectionMessage(maybeMessage),
                    }
                }
                return { success: false, message: 'Invalid sidecar response' }
            } catch (error: any) {
                return {
                    success: false,
                    message: normalizeConnectionMessage(error?.message || 'test connection failed'),
                }
            }
        },
        addRemoteLibrary: async (name: string, url: string, token: string) => {
            const config = await getStoredClientConfig()
            const normalizedUrl = String(url || '').trim().replace(/\/$/, '')
            if (!normalizedUrl) {
                throw new Error('Remote URL is required.')
            }

            const currentLibs = Array.isArray(config?.remoteLibraries) ? config.remoteLibraries : []
            if (currentLibs.some((lib: any) => lib?.url === normalizedUrl)) {
                throw new Error('This remote library is already registered.')
            }

            const newLib = {
                id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: String(name || '').trim() || 'Remote Library',
                url: normalizedUrl,
                token,
                lastConnectedAt: new Date().toISOString(),
            }

            await tauriDesktopApi.updateClientConfig({
                remoteLibraries: [...currentLibs, newLib],
            })

            return newLib
        },
        selectDownloadDirectory: async () => {
            const selected = await open({
                multiple: false,
                directory: true,
            })
            const selectedPath = typeof selected === 'string' ? selected : null
            if (!selectedPath) return null
            await tauriDesktopApi.updateClientConfig({ downloadPath: selectedPath })
            return selectedPath
        },
        showMessageBox: async (options: { type?: string; message: string; detail?: string; buttons?: string[] }) => {
            const text = [options?.message, options?.detail].filter(Boolean).join('\n\n')
            const buttons = Array.isArray(options?.buttons) ? options.buttons : []

            if (buttons.length >= 2) {
                const accepted = await confirm(text, {
                    title: 'Obscura',
                    kind: options?.type === 'error' ? 'error' : 'info',
                    okLabel: buttons[0],
                    cancelLabel: buttons[1],
                })
                return {
                    response: accepted ? 0 : 1,
                    checkboxChecked: false,
                }
            }

            await message(text, {
                title: 'Obscura',
                kind: options?.type === 'error' ? 'error' : 'info',
                okLabel: buttons[0] || 'OK',
            })
            return {
                response: 0,
                checkboxChecked: false,
            }
        },
        renameRemoteMedia: async (url: string, token: string, id: number, newName: string) => {
            const config = await getStoredClientConfig()
            return await invoke<any>('sidecar_request', {
                method: 'remote_rename_media',
                params: {
                    url,
                    token,
                    id,
                    newName,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        deleteRemoteMedia: async (url: string, token: string, id: number, options?: { permanent?: boolean }) => {
            const config = await getStoredClientConfig()
            return await invoke<any>('sidecar_request', {
                method: 'remote_delete_media',
                params: {
                    url,
                    token,
                    id,
                    options: options ?? null,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        updateRemoteMedia: async (url: string, token: string, id: number, updates: any) => {
            const config = await getStoredClientConfig()
            return await invoke<any>('sidecar_request', {
                method: 'remote_update_media',
                params: {
                    url,
                    token,
                    id,
                    updates: updates ?? {},
                    userToken: config?.myUserToken || '',
                },
            })
        },
        createRemoteTag: async (url: string, token: string, name: string) => {
            const config = await getStoredClientConfig()
            return await invoke<any>('sidecar_request', {
                method: 'remote_create_tag',
                params: {
                    url,
                    token,
                    name,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        deleteRemoteTag: async (url: string, token: string, id: number) => {
            const config = await getStoredClientConfig()
            await invoke('sidecar_request', {
                method: 'remote_delete_tag',
                params: {
                    url,
                    token,
                    id,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        addRemoteTagToMedia: async (url: string, token: string, mediaId: number, tagId: number) => {
            const config = await getStoredClientConfig()
            await invoke('sidecar_request', {
                method: 'remote_add_tag_to_media',
                params: {
                    url,
                    token,
                    mediaId,
                    tagId,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        addRemoteTagsToMedia: async (url: string, token: string, mediaIds: number[], tagIds: number[]) => {
            const config = await getStoredClientConfig()
            await invoke('sidecar_request', {
                method: 'remote_add_tag_to_media',
                params: {
                    url,
                    token,
                    mediaIds: mediaIds ?? [],
                    tagIds: tagIds ?? [],
                    userToken: config?.myUserToken || '',
                },
            })
        },
        removeRemoteTagFromMedia: async (url: string, token: string, mediaId: number, tagId: number) => {
            const config = await getStoredClientConfig()
            await invoke('sidecar_request', {
                method: 'remote_remove_tag_from_media',
                params: {
                    url,
                    token,
                    mediaId,
                    tagId,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        addRemoteMediaParent: async (url: string, token: string, childId: number, parentId: number) => {
            const config = await getStoredClientConfig()
            await invoke('sidecar_request', {
                method: 'remote_add_media_parent',
                params: {
                    url,
                    token,
                    childId,
                    parentId,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        removeRemoteMediaParent: async (url: string, token: string, childId: number, parentId: number) => {
            const config = await getStoredClientConfig()
            await invoke('sidecar_request', {
                method: 'remote_remove_media_parent',
                params: {
                    url,
                    token,
                    childId,
                    parentId,
                    userToken: config?.myUserToken || '',
                },
            })
        },
        updateRemoteProfile: async (url: string, token: string, nickname: string, iconUrl?: string) => {
            const config = await getStoredClientConfig()
            const result = await invoke<any>('sidecar_request', {
                method: 'remote_update_profile',
                params: {
                    url,
                    token,
                    nickname,
                    iconUrl,
                    userToken: config?.myUserToken || '',
                },
            })
            return result && typeof result === 'object'
                ? { success: true, ...result }
                : { success: true }
        },
        uploadRemoteMedia: async (
            url: string,
            token: string,
            filePaths: string[],
            metadata?: any,
            options?: { notificationId?: string },
        ) => {
            const config = await getStoredClientConfig()
            const notificationId = options?.notificationId
            if (notificationId) {
                await emitBridgeEvent('notification-progress', { id: notificationId, progress: 0 })
            }
            const result = await invoke<any>('sidecar_request', {
                method: 'remote_upload_media',
                params: {
                    url,
                    token,
                    filePaths: (filePaths ?? []).map((p) => decodeMediaProtocolPath(String(p || ''))),
                    metadata: metadata ?? {},
                    options: options ?? null,
                    userToken: config?.myUserToken || '',
                },
            })
            if (notificationId && result?.success) {
                await emitBridgeEvent('notification-progress', { id: notificationId, progress: 100 })
            }
            return result
        },
        downloadRemoteMedia: async (url: string, filename: string, options?: { notificationId?: string }) => {
            const config = await getStoredClientConfig()
            const downloadDir = config?.downloadPath || ''
            if (!downloadDir) {
                return { success: false, message: 'Download directory is not configured.' }
            }
            const notificationId = options?.notificationId
            if (notificationId) {
                await emitBridgeEvent('download-progress', { id: notificationId, progress: 0 })
            }
            const result = await invoke<any>('sidecar_request', {
                method: 'remote_download_media',
                params: {
                    url,
                    filename,
                    downloadDir,
                    options: options ?? null,
                },
            })
            if (notificationId && result?.success) {
                await emitBridgeEvent('download-progress', { id: notificationId, progress: 100 })
            }
            return result
        },
        getServerConfig: async () => {
            const fallbackConfig = {
                isEnabled: false,
                port: 53913,
                hostSecret: '',
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
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_server_config',
                    params: null,
                })
                return result && typeof result === 'object'
                    ? { ...fallbackConfig, ...result }
                    : fallbackConfig
            } catch {
                return fallbackConfig
            }
        },
        updateServerConfig: async (updates: any) => {
            await invoke('sidecar_request', {
                method: 'update_server_config',
                params: { updates: updates ?? {} },
            })
        },
        resetHostSecret: async () => {
            try {
                const result = await invoke<string>('sidecar_request', {
                    method: 'reset_host_secret',
                    params: null,
                })
                return typeof result === 'string' ? result : ''
            } catch {
                return ''
            }
        },
        startServer: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'start_server',
                    params: null,
                })
                return result && typeof result === 'object' ? result : { success: false, error: 'start failed' }
            } catch (error: any) {
                return { success: false, error: error?.message || 'start failed' }
            }
        },
        stopServer: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'stop_server',
                    params: null,
                })
                return result && typeof result === 'object' ? result : { success: false, error: 'stop failed' }
            } catch (error: any) {
                return { success: false, error: error?.message || 'stop failed' }
            }
        },
        getServerStatus: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_server_status',
                    params: null,
                })
                return Boolean(result)
            } catch {
                return false
            }
        },
        getSharedUsers: async () => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_shared_users',
                    params: null,
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        addSharedUser: async (user: any) => {
            return await invoke<any>('sidecar_request', {
                method: 'add_shared_user',
                params: { user: user ?? {} },
            })
        },
        deleteSharedUser: async (userId: string) => {
            await invoke('sidecar_request', {
                method: 'delete_shared_user',
                params: { userId },
            })
        },
        updateSharedUser: async (userId: string, updates: any) => {
            await invoke('sidecar_request', {
                method: 'update_shared_user',
                params: { userId, updates: updates ?? {} },
            })
        },
        getRemoteSharedUsers: async (params: { url: string; userToken: string; accessToken: string }) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'remote_get_shared_users',
                    params: {
                        url: params?.url,
                        userToken: params?.userToken || '',
                        accessToken: params?.accessToken || '',
                    },
                })
                return Array.isArray(result) ? result : []
            } catch (error: any) {
                console.error('[TauriBridge] getRemoteSharedUsers failed:', error)
                return []
            }
        },
        searchRemoteMediaFiles: async (url: string, token: string, query: string, targets?: any) => {
            const config = await getStoredClientConfig()
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'remote_search_media_files',
                    params: {
                        url,
                        token,
                        query,
                        targets: targets ?? null,
                        userToken: config?.myUserToken || '',
                    },
                })
                return Array.isArray(result) ? result : []
            } catch (error: any) {
                console.error('[TauriBridge] searchRemoteMediaFiles failed:', error)
                return []
            }
        },
        syncRemoteLibrary: async (url: string, token: string, remoteId: string) => {
            const config = await getStoredClientConfig()
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'remote_sync_library',
                    params: {
                        url,
                        token,
                        remoteId,
                        userToken: config?.myUserToken || '',
                    },
                })
                if (result && typeof result === 'object') {
                    return result
                }
                return { success: false, message: 'Invalid sync response' }
            } catch (error: any) {
                return {
                    success: false,
                    message: error?.message || 'sync failed',
                }
            }
        },
        getRemoteCachePath: async (remoteId: string) => {
            try {
                const result = await invoke<string>('sidecar_request', {
                    method: 'remote_get_cache_path',
                    params: { remoteId },
                })
                return typeof result === 'string' && result.trim() ? result : null
            } catch {
                return null
            }
        },
        getAuditLogs: async (_libraryPath?: string) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'get_audit_logs',
                    params: null,
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        getAppVersion: async () => {
            try {
                return await getVersion()
            } catch {
                return '0.0.0-tauri'
            }
        },
        getPluginScripts: async () => {
            try {
                const result = await invoke<any[]>('sidecar_request', {
                    method: 'get_plugin_scripts',
                    params: null,
                })
                return Array.isArray(result) ? result : []
            } catch {
                return []
            }
        },
        pluginFetch: async (url: string, options?: any) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'plugin_fetch',
                    params: { url, options: options || null },
                })
                if (result && typeof result === 'object') {
                    return result
                }
            } catch (error: any) {
                return {
                    ok: false,
                    status: 0,
                    statusText: error?.message || 'sidecar request failed',
                    details: {
                        message: error?.message || null,
                        cause: error?.cause?.message || String(error?.cause || ''),
                        raw: String(error),
                    },
                    error: true,
                }
            }
            return {
                ok: false,
                status: 0,
                statusText: 'sidecar returned invalid response',
                error: true,
            }
        },
        savePluginMediaData: async (mediaId: number, pluginId: string, data: any) => {
            try {
                const result = await invoke<boolean>('sidecar_request', {
                    method: 'save_plugin_media_data',
                    params: { mediaId, pluginId, data: data ?? null },
                })
                if (result === true) return true
            } catch {
                // Fallback below.
            }

            try {
                localStorage.setItem(
                    `${PLUGIN_DATA_PREFIX}${pluginId}:${mediaId}`,
                    JSON.stringify(data),
                )
                return true
            } catch {
                return false
            }
        },
        loadPluginMediaData: async (mediaId: number, pluginId: string) => {
            try {
                return await invoke<any>('sidecar_request', {
                    method: 'load_plugin_media_data',
                    params: { mediaId, pluginId },
                })
            } catch {
                // Fallback below.
            }

            try {
                const raw = localStorage.getItem(`${PLUGIN_DATA_PREFIX}${pluginId}:${mediaId}`)
                return raw ? JSON.parse(raw) : null
            } catch {
                return null
            }
        },
        saveAssociatedData: async (mediaFilePath: string, data: any) => {
            try {
                const result = await invoke<boolean>('sidecar_request', {
                    method: 'save_associated_data',
                    params: { mediaFilePath, data: data ?? null },
                })
                if (result === true) return true
            } catch {
                // Fallback below.
            }

            try {
                localStorage.setItem(
                    `${PLUGIN_ASSOC_PREFIX}${mediaFilePath}`,
                    JSON.stringify(data),
                )
                return true
            } catch {
                return false
            }
        },
        loadAssociatedData: async (mediaFilePath: string) => {
            try {
                return await invoke<any>('sidecar_request', {
                    method: 'load_associated_data',
                    params: { mediaFilePath },
                })
            } catch {
                // Fallback below.
            }

            try {
                const raw = localStorage.getItem(`${PLUGIN_ASSOC_PREFIX}${mediaFilePath}`)
                return raw ? JSON.parse(raw) : null
            } catch {
                return null
            }
        },
        installPlugin: async () => {
            const selected = await open({
                multiple: true,
                directory: false,
                filters: [{ name: 'JavaScript', extensions: ['js'] }],
            })

            const filePaths = Array.isArray(selected)
                ? selected.filter((v): v is string => typeof v === 'string')
                : typeof selected === 'string'
                    ? [selected]
                    : []

            if (filePaths.length === 0) {
                return { installed: [], skipped: [] }
            }

            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'install_plugins',
                    params: { filePaths },
                })
                return result && typeof result === 'object'
                    ? result
                    : { installed: [], skipped: [] }
            } catch {
                return { installed: [], skipped: [], error: 'install failed' }
            }
        },
        uninstallPlugin: async (pluginId: string) => {
            try {
                const result = await invoke<any>('sidecar_request', {
                    method: 'uninstall_plugin',
                    params: { pluginId },
                })
                if (result && typeof result === 'object') {
                    return result
                }
                return { success: false, error: 'Invalid uninstall response' }
            } catch {
                return { success: false, error: 'uninstall failed' }
            }
        },
    }

    ; (window as any).obscuraAPI = tauriDesktopApi

    // Dev helper: inspect sidecar lifecycle from browser devtools.
    ; (window as any).__obscuraTauriSidecar = {
        start: () => invoke('sidecar_start'),
        stop: () => invoke('sidecar_stop'),
        status: () => invoke('sidecar_status'),
        request: (method: string, params?: any) =>
            invoke('sidecar_request', { method, params: params ?? null }),
    }
}






