/**
 * ブラウザ検証用モックElectron API
 * Electron環境外でUIを検証するためのモック実装
 */

import { MediaFile, Tag, TagFolder, Genre, Library, MediaComment } from '../types'

// localStorageのキー
const STORAGE_KEYS = {
    MEDIA_FILES: 'mock_media_files',
    TAGS: 'mock_tags',
    GENRES: 'mock_genres',
    LIBRARIES: 'mock_libraries',
    ACTIVE_LIBRARY: 'mock_active_library',
    MEDIA_TAGS: 'mock_media_tags',
    MEDIA_GENRES: 'mock_media_genres',
    TAG_FOLDERS: 'mock_tag_folders',
    COMMENTS: 'mock_comments',
}

// サンプルデータ
const createSampleData = () => {
    const sampleMediaFiles: MediaFile[] = [
        {
            id: 1,
            file_path: '/sample/video1.mp4',
            file_name: 'サンプル動画1.mp4',
            file_type: 'video',
            file_size: 1024 * 1024 * 150, // 150MB
            duration: 120,
            thumbnail_path: null,
            created_at: new Date().toISOString(),
            is_deleted: false,
            last_played_at: null,
            tags: [],
            genres: [],
        },
        {
            id: 2,
            file_path: '/sample/video2.mp4',
            file_name: 'サンプル動画2.mp4',
            file_type: 'video',
            file_size: 1024 * 1024 * 50, // 50MB
            duration: 90,
            thumbnail_path: null,
            created_at: new Date().toISOString(),
            is_deleted: false,
            last_played_at: null,
            tags: [],
            genres: [],
        },
        {
            id: 3,
            file_path: '/sample/audio1.mp3',
            file_name: 'サンプル音楽.mp3',
            file_type: 'audio',
            file_size: 1024 * 1024 * 5, // 5MB
            duration: 180,
            thumbnail_path: null,
            created_at: new Date().toISOString(),
            is_deleted: false,
            last_played_at: null,
            tags: [],
            genres: [],
        },
    ]

    const sampleTags: Tag[] = [
        { id: 1, name: 'お気に入り' },
        { id: 2, name: '後で見る' },
    ]

    const sampleGenres: Genre[] = [
        { id: 1, name: '音楽' },
        { id: 2, name: '映画' },
    ]

    const sampleLibrary: Library = {
        name: 'モックライブラリ',
        path: '/mock/library',
        createdAt: new Date().toISOString(),
    }

    return { sampleMediaFiles, sampleTags, sampleGenres, sampleLibrary }
}

// ストレージヘルパー
const storage = {
    get: <T>(key: string, defaultValue: T): T => {
        try {
            const item = localStorage.getItem(key)
            return item ? JSON.parse(item) : defaultValue
        } catch {
            return defaultValue
        }
    },
    set: <T>(key: string, value: T): void => {
        localStorage.setItem(key, JSON.stringify(value))
    },
}

// ID生成用カウンター取得
const getNextId = (items: { id: number }[]): number => {
    return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1
}

// モックAPI実装
export const mockElectronAPI = {
    // ライブラリ管理
    createLibrary: async (name: string, parentPath: string): Promise<Library> => {
        const library: Library = {
            name,
            path: `${parentPath}/${name}.library`,
            createdAt: new Date().toISOString(),
        }
        const libraries = storage.get<Library[]>(STORAGE_KEYS.LIBRARIES, [])
        libraries.push(library)
        storage.set(STORAGE_KEYS.LIBRARIES, libraries)
        storage.set(STORAGE_KEYS.ACTIVE_LIBRARY, library)
        return library
    },

    getLibraries: async (): Promise<Library[]> => {
        const { sampleLibrary } = createSampleData()
        const libraries = storage.get<Library[]>(STORAGE_KEYS.LIBRARIES, [sampleLibrary])
        if (libraries.length === 0) {
            libraries.push(sampleLibrary)
            storage.set(STORAGE_KEYS.LIBRARIES, libraries)
        }
        return libraries
    },

    setActiveLibrary: async (libraryPath: string): Promise<void> => {
        const libraries = storage.get<Library[]>(STORAGE_KEYS.LIBRARIES, [])
        const library = libraries.find(l => l.path === libraryPath)
        if (library) {
            storage.set(STORAGE_KEYS.ACTIVE_LIBRARY, library)
        }
    },

    getActiveLibrary: async (): Promise<Library | null> => {
        const { sampleLibrary } = createSampleData()
        return storage.get<Library | null>(STORAGE_KEYS.ACTIVE_LIBRARY, sampleLibrary)
    },

    // フォルダー選択（モック: 常にnull）
    selectFolder: async (): Promise<string | null> => {
        console.log('[Mock] selectFolder called - not available in browser')
        return null
    },

    // フォルダースキャン（モック: サンプルデータ返却）
    scanFolder: async (_folderPath: string): Promise<MediaFile[]> => {
        console.log('[Mock] scanFolder called - returning sample data')
        const { sampleMediaFiles } = createSampleData()
        storage.set(STORAGE_KEYS.MEDIA_FILES, sampleMediaFiles)
        return sampleMediaFiles
    },

    // メディアファイル取得
    getMediaFiles: async (): Promise<MediaFile[]> => {
        const { sampleMediaFiles } = createSampleData()
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, sampleMediaFiles)
        if (files.length === 0) {
            storage.set(STORAGE_KEYS.MEDIA_FILES, sampleMediaFiles)
            return sampleMediaFiles
        }
        return files
    },

    getMediaFile: async (id: number): Promise<MediaFile | null> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        return files.find(f => f.id === id) || null
    },

    // タグ操作
    getTags: async (): Promise<Tag[]> => {
        const { sampleTags } = createSampleData()
        return storage.get<Tag[]>(STORAGE_KEYS.TAGS, sampleTags)
    },

    createTag: async (name: string): Promise<Tag> => {
        const tags = storage.get<Tag[]>(STORAGE_KEYS.TAGS, [])
        const existing = tags.find(t => t.name === name)
        if (existing) return existing

        const newTag: Tag = { id: getNextId(tags), name }
        tags.push(newTag)
        storage.set(STORAGE_KEYS.TAGS, tags)
        return newTag
    },

    deleteTag: async (id: number): Promise<void> => {
        let tags = storage.get<Tag[]>(STORAGE_KEYS.TAGS, [])
        tags = tags.filter(t => t.id !== id)
        storage.set(STORAGE_KEYS.TAGS, tags)
    },

    addTagToMedia: async (mediaId: number, tagId: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const tags = storage.get<Tag[]>(STORAGE_KEYS.TAGS, [])
        const file = files.find(f => f.id === mediaId)
        const tag = tags.find(t => t.id === tagId)
        if (file && tag) {
            if (!file.tags) file.tags = []
            if (!file.tags.some(t => t.id === tagId)) {
                file.tags.push(tag)
                storage.set(STORAGE_KEYS.MEDIA_FILES, files)
            }
        }
    },

    removeTagFromMedia: async (mediaId: number, tagId: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === mediaId)
        if (file && file.tags) {
            file.tags = file.tags.filter(t => t.id !== tagId)
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    // ジャンル操作
    getGenres: async (): Promise<Genre[]> => {
        const { sampleGenres } = createSampleData()
        return storage.get<Genre[]>(STORAGE_KEYS.GENRES, sampleGenres)
    },

    createGenre: async (name: string, parentId?: number | null): Promise<Genre> => {
        const genres = storage.get<Genre[]>(STORAGE_KEYS.GENRES, [])
        const existing = genres.find(g => g.name === name)
        if (existing) return existing

        const newGenre: Genre = {
            id: getNextId(genres),
            name,
            parentId: parentId ?? null,
            orderIndex: genres.length
        }
        genres.push(newGenre)
        storage.set(STORAGE_KEYS.GENRES, genres)
        return newGenre
    },

    deleteGenre: async (id: number): Promise<void> => {
        let genres = storage.get<Genre[]>(STORAGE_KEYS.GENRES, [])
        genres = genres.filter(g => g.id !== id)
        storage.set(STORAGE_KEYS.GENRES, genres)
    },

    renameGenre: async (id: number, newName: string): Promise<void> => {
        const genres = storage.get<Genre[]>(STORAGE_KEYS.GENRES, [])
        const genre = genres.find(g => g.id === id)
        if (genre) {
            genre.name = newName
            storage.set(STORAGE_KEYS.GENRES, genres)
        }
    },

    addGenreToMedia: async (mediaId: number, genreId: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const genres = storage.get<Genre[]>(STORAGE_KEYS.GENRES, [])
        const file = files.find(f => f.id === mediaId)
        const genre = genres.find(g => g.id === genreId)
        if (file && genre) {
            if (!file.genres) file.genres = []
            if (!file.genres.some(g => g.id === genreId)) {
                file.genres.push(genre)
                storage.set(STORAGE_KEYS.MEDIA_FILES, files)
            }
        }
    },

    removeGenreFromMedia: async (mediaId: number, genreId: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === mediaId)
        if (file && file.genres) {
            file.genres = file.genres.filter(g => g.id !== genreId)
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    updateGenreStructure: async (_updates: { id: number; parentId: number | null; orderIndex: number }[]): Promise<void> => {
        console.log('[Mock] updateGenreStructure called')
    },

    // サムネイル生成
    generateThumbnail: async (_mediaId: number, _filePath: string): Promise<null> => {
        return null
    },

    // ゴミ箱操作
    moveToTrash: async (id: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === id)
        if (file) {
            file.is_deleted = true
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    restoreFromTrash: async (id: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === id)
        if (file) {
            file.is_deleted = false
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    deletePermanently: async (id: number): Promise<void> => {
        let files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        files = files.filter(f => f.id !== id)
        storage.set(STORAGE_KEYS.MEDIA_FILES, files)
    },

    updateLastPlayed: async (id: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === id)
        if (file) {
            file.last_played_at = new Date().toISOString()
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    // メディアインポート（モック: サンプル追加）
    importMedia: async (filePaths: string[]): Promise<MediaFile[]> => {
        console.log('[Mock] importMedia called with:', filePaths)
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const imported: MediaFile[] = []

        for (const path of filePaths) {
            const fileName = path.split('/').pop() || path.split('\\').pop() || 'unknown'
            const isAudio = ['.mp3', '.wav', '.flac', '.m4a', '.ogg'].some(ext => fileName.toLowerCase().endsWith(ext))

            const newFile: MediaFile = {
                id: getNextId(files),
                file_path: path,
                file_name: fileName,
                file_type: isAudio ? 'audio' : 'video',
                file_size: 0,
                duration: null,
                thumbnail_path: null,
                created_at: new Date().toISOString(),
                is_deleted: false,
                last_played_at: null,
                tags: [],
                genres: [],
            }
            files.push(newFile)
            imported.push(newFile)
        }

        storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        return imported
    },

    // キャプチャ
    onTriggerFrameCapture: (_callback: (action: string) => void) => () => { },
    copyFrameToClipboard: async (_dataUrl: string) => true,
    saveCapturedFrame: async (_dataUrl: string) => true,
    setCapturedThumbnail: async (_mediaId: number, _dataUrl: string) => null,

    // コメント
    addComment: async (mediaId: number, text: string, time: number): Promise<MediaComment> => {
        const comments = storage.get<MediaComment[]>(STORAGE_KEYS.COMMENTS, [])
        const newComment: MediaComment = {
            id: Date.now(),
            mediaId,
            text,
            time,
            createdAt: new Date().toISOString()
        }
        comments.push(newComment)
        storage.set(STORAGE_KEYS.COMMENTS, comments)
        return newComment
    },

    getComments: async (mediaId: number): Promise<MediaComment[]> => {
        const comments = storage.get<MediaComment[]>(STORAGE_KEYS.COMMENTS, [])
        return comments.filter((c: MediaComment) => c.mediaId === mediaId).sort((a: MediaComment, b: MediaComment) => a.time - b.time)
    },

    // プレビュー (Mock)
    generatePreviews: async (_mediaId: number): Promise<string[]> => {
        return []
    },

    // ファイル操作
    openPath: async (_filePath: string): Promise<void> => {
        console.log('[Mock] openPath called')
    },

    showItemInFolder: async (_filePath: string): Promise<void> => {
        console.log('[Mock] showItemInFolder called')
    },

    openWith: async (_filePath: string): Promise<void> => {
        console.log('[Mock] openWith called')
    },

    copyFile: async (_filePath: string): Promise<void> => {
        console.log('[Mock] copyFile called')
    },

    copyToClipboard: async (text: string): Promise<void> => {
        console.log('[Mock] copyToClipboard called:', text)
        await navigator.clipboard.writeText(text)
    },

    renameMedia: async (mediaId: number, newName: string): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === mediaId)
        if (file) {
            file.file_name = newName
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    updateRating: async (mediaId: number, rating: number): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === mediaId)
        if (file) {
            file.rating = rating
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    backfillMetadata: async (): Promise<number> => {
        console.log('[Mock] backfillMetadata called')
        return 0
    },

    updateArtist: async (mediaId: number, artist: string | null): Promise<void> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, [])
        const file = files.find(f => f.id === mediaId)
        if (file) {
            file.artist = artist
            storage.set(STORAGE_KEYS.MEDIA_FILES, files)
        }
    },

    // タグフォルダー操作
    getTagFolders: async (): Promise<TagFolder[]> => {
        return storage.get<TagFolder[]>(STORAGE_KEYS.TAG_FOLDERS, [])
    },

    createTagFolder: async (name: string): Promise<TagFolder> => {
        const folders = storage.get<TagFolder[]>(STORAGE_KEYS.TAG_FOLDERS, [])
        const newFolder = { id: Date.now(), name }
        folders.push(newFolder)
        storage.set(STORAGE_KEYS.TAG_FOLDERS, folders)
        return newFolder
    },

    deleteTagFolder: async (id: number): Promise<void> => {
        let folders = storage.get<TagFolder[]>(STORAGE_KEYS.TAG_FOLDERS, [])
        folders = folders.filter(f => f.id !== id)
        storage.set(STORAGE_KEYS.TAG_FOLDERS, folders)
    },

    renameTagFolder: async (id: number, newName: string): Promise<void> => {
        const folders = storage.get<TagFolder[]>(STORAGE_KEYS.TAG_FOLDERS, [])
        const folder = folders.find(f => f.id === id)
        if (folder) {
            folder.name = newName
            storage.set(STORAGE_KEYS.TAG_FOLDERS, folders)
        }
    },

    updateTagFolder: async (tagId: number, folderId: number | null): Promise<void> => {
        const tags = storage.get<Tag[]>(STORAGE_KEYS.TAGS, [])
        const tag = tags.find(t => t.id === tagId)
        if (tag) {
            tag.folderId = folderId ?? undefined
            storage.set(STORAGE_KEYS.TAGS, tags)
        }
    },

    on: (channel: string, _func: (...args: any[]) => void) => {
        console.log(`[Mock] on called for channel: ${channel}`)
    },

    // Missing methods
    startDrag: (_filePaths: string[]) => { },
    updateDescription: async (_mediaId: number, _description: string | null) => { },

    // === ネットワーク共有 (Mock) ===
    getServerConfig: async () => ({
        isEnabled: false,
        port: 8765,
        hostSecret: 'mock-secret',
        allowedIPs: [],
        maxConnections: 10,
        maxUploadSize: 5120,
        maxUploadRate: 10,
        enableAuditLog: true,
        requireHttps: false
    }),
    updateServerConfig: async (_updates: any) => { },
    resetHostSecret: async () => 'new-mock-secret',

    startServer: async () => ({ success: true }),
    stopServer: async () => ({ success: true }),
    getServerStatus: async () => false,

    getSharedUsers: async () => [],
    addSharedUser: async (_user: any) => ({
        id: 'mock-user-id',
        userToken: 'mock-token',
        accessToken: 'mock-access',
        nickname: 'Mock User',
        hardwareId: 'mock-hw-id',
        permissions: [],
        createdAt: new Date().toISOString(),
        lastAccessAt: new Date().toISOString(),
        isActive: true
    }),
    deleteSharedUser: async (_userId: string) => { },
    updateSharedUser: async (_userId: string, _updates: any) => { },

    getHardwareId: async () => 'mock-hardware-id',
    generateUserToken: async () => 'mock-user-token',
}

// グローバル型定義の拡張
declare global {
    interface Window {
        electronAPI: typeof mockElectronAPI
    }
}

/**
 * モックAPIを初期化・注入
 */
export function initMockElectronAPI(): void {
    // Electron環境では絶対にモックを注入しない
    const isElectron = navigator.userAgent.toLowerCase().includes('electron')
    if (isElectron) {
        return
    }

    // Electron環境外（ブラウザ）の場合のみモックを注入
    // 開発モードでのホットリロード対応のため、常に上書きする
    if (typeof window !== 'undefined' && !window.electronAPI?.addComment) {
        console.log('🔧 [Mock] Injecting mock Electron API for browser testing')
        try {
            window.electronAPI = mockElectronAPI
        } catch (e) {
            console.warn('Failed to inject mock API:', e)
        }
    }
}
