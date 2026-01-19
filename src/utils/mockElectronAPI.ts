/**
 * ブラウザ検証用モックElectron API
 * Electron環境外でUIを検証するためのモック実装
 */

import { MediaFile, Tag, TagFolder, Folder, Library, MediaComment, ClientConfig, ServerConfig, SharedUser } from '../types'

// localStorageのキー
const STORAGE_KEYS = {
    MEDIA_FILES: 'mock_media_files',
    TAGS: 'mock_tags',
    FOLDERS: 'mock_folders',
    LIBRARIES: 'mock_libraries',
    ACTIVE_LIBRARY: 'mock_active_library',
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
            folders: [],
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
            folders: [],
        },
    ]

    const sampleTags: Tag[] = [
        { id: 1, name: 'お気に入り' },
        { id: 2, name: '後で見る' },
    ]

    const sampleFolders: Folder[] = [
        { id: 1, name: '音楽', orderIndex: 0 },
        { id: 2, name: '映画', orderIndex: 1 },
    ]

    const sampleLibrary: Library = {
        name: 'モックライブラリ',
        path: '/mock/library',
        createdAt: new Date().toISOString(),
    }

    return { sampleMediaFiles, sampleTags, sampleFolders, sampleLibrary }
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

// モックAPI実装
export const mockElectronAPI = {
    // ファイル操作
    selectFile: async (_options?: any) => null,

    // ライブラリ管理
    createLibrary: async (name: string, parentPath: string): Promise<Library> => {
        const library: Library = {
            name,
            path: `${parentPath}/${name}.library`,
            createdAt: new Date().toISOString(),
        }
        return library
    },
    openLibrary: async (): Promise<Library | null> => createSampleData().sampleLibrary,
    getLibraries: async (): Promise<Library[]> => [createSampleData().sampleLibrary],
    setActiveLibrary: async (_libraryPath: string) => { },
    getActiveLibrary: async (): Promise<Library | null> => createSampleData().sampleLibrary,
    refreshLibrary: async () => true,
    onRefreshProgress: (_callback: (current: number, total: number) => void) => { },

    selectFolder: async () => null,
    scanFolder: async (_folderPath: string) => createSampleData().sampleMediaFiles,
    getMediaFiles: async (): Promise<MediaFile[]> => {
        const { sampleMediaFiles } = createSampleData()
        return storage.get(STORAGE_KEYS.MEDIA_FILES, sampleMediaFiles)
    },
    getMediaFile: async (id: number): Promise<MediaFile | null> => {
        const files = storage.get<MediaFile[]>(STORAGE_KEYS.MEDIA_FILES, createSampleData().sampleMediaFiles)
        return files.find(f => f.id === id) || null
    },

    // タグ
    getTags: async (): Promise<Tag[]> => storage.get(STORAGE_KEYS.TAGS, createSampleData().sampleTags),
    createTag: async (name: string): Promise<Tag> => {
        const tags = storage.get<Tag[]>(STORAGE_KEYS.TAGS, [])
        const newTag = { id: Date.now(), name }
        tags.push(newTag)
        storage.set(STORAGE_KEYS.TAGS, tags)
        return newTag
    },
    deleteTag: async (id: number) => {
        const tags = storage.get<Tag[]>(STORAGE_KEYS.TAGS, [])
        storage.set(STORAGE_KEYS.TAGS, tags.filter(t => t.id !== id))
    },
    addTagToMedia: async (_mediaId: number, _tagId: number) => { },
    addTagsToMedia: async (_mediaIds: number[], _tagIds: number[]) => { },
    removeTagFromMedia: async (_mediaId: number, _tagId: number) => { },

    // フォルダー
    getFolders: async (): Promise<Folder[]> => storage.get(STORAGE_KEYS.FOLDERS, createSampleData().sampleFolders),
    createFolder: async (name: string, parentId?: number | null): Promise<Folder> => {
        const folders = storage.get<Folder[]>(STORAGE_KEYS.FOLDERS, [])
        const newFolder = { id: Date.now(), name, parentId, orderIndex: folders.length }
        folders.push(newFolder)
        storage.set(STORAGE_KEYS.FOLDERS, folders)
        return newFolder
    },
    deleteFolder: async (id: number) => {
        const folders = storage.get<Folder[]>(STORAGE_KEYS.FOLDERS, [])
        storage.set(STORAGE_KEYS.FOLDERS, folders.filter(f => f.id !== id))
    },
    renameFolder: async (_id: number, _newName: string) => { },
    addFolderToMedia: async (_mediaId: number, _folderId: number) => { },
    removeFolderFromMedia: async (_mediaId: number, _folderId: number) => { },
    updateFolderStructure: async (_updates: { id: number; parentId: number | null; orderIndex: number }[]) => { },

    generateThumbnail: async (_mediaId: number, _filePath: string) => null,

    // Trash
    moveToTrash: async (_id: number) => { },
    moveFilesToTrash: async (_ids: number[]) => { },
    restoreFromTrash: async (_id: number) => { },
    restoreFilesFromTrash: async (_ids: number[]) => { },
    deletePermanently: async (_id: number) => { },
    deleteFilesPermanently: async (_ids: number[]) => { },

    updateLastPlayed: async (_id: number) => { },

    // Import
    importMedia: async (_filePaths: string[]) => [],
    checkImportDuplicates: async (_filePaths: string[]) => [],
    checkEntryDuplicates: async (_mediaId: number) => [],

    // Capture
    onTriggerFrameCapture: (_callback: (action: string) => void) => () => { },
    copyFrameToClipboard: async (_dataUrl: string) => true,
    saveCapturedFrame: async (_dataUrl: string) => true,
    setCapturedThumbnail: async (_mediaId: number, _dataUrl: string) => null,

    // Comment
    addComment: async (mediaId: number, text: string, time: number): Promise<MediaComment> => ({
        id: Date.now(), mediaId, text, time, createdAt: new Date().toISOString()
    }),
    getComments: async (_mediaId: number): Promise<MediaComment[]> => [],
    generatePreviews: async (_mediaId: number) => [],

    // File Ops
    openPath: async (_filePath: string) => { },
    openExternal: async (_url: string) => { },
    showItemInFolder: async (_filePath: string) => { },
    openWith: async (_filePath: string) => { },
    copyFile: async (_filePath: string) => { },
    copyToClipboard: async (_text: string) => { },
    renameMedia: async (_mediaId: number, _newName: string) => { },
    updateRating: async (_mediaId: number, _rating: number) => { },
    backfillMetadata: async () => 0,
    updateArtist: async (_mediaId: number, _artist: string | null) => { },
    updateDescription: async (_mediaId: number, _description: string | null) => { },
    updateUrl: async (_mediaId: number, _url: string | null) => { },
    exportMedia: async (_mediaId: number, _options?: { notificationId?: string }) => ({ success: true }),

    // Tag Folders
    getTagFolders: async (): Promise<TagFolder[]> => [],
    createTagFolder: async (_name: string): Promise<TagFolder> => ({ id: 0, name: '' }),
    deleteTagFolder: async (_id: number) => { },
    renameTagFolder: async (_id: number, _newName: string) => { },
    updateTagFolder: async (_tagId: number, _folderId: number | null) => { },

    startDrag: (_filePaths: string[]) => { },

    // Server
    getServerConfig: async (): Promise<ServerConfig> => ({
        isEnabled: false,
        port: 8765,
        hostSecret: 'mock',
        allowedIPs: [],
        maxConnections: 10,
        maxUploadSize: 100,
        maxUploadRate: 10,
        enableAuditLog: false,
        requireHttps: false
    }),
    updateServerConfig: async (_updates: Partial<ServerConfig>) => { },
    resetHostSecret: async () => 'mock',
    startServer: async () => ({ success: true }),
    stopServer: async () => ({ success: true }),
    getServerStatus: async () => false,

    // User Management
    getSharedUsers: async (): Promise<SharedUser[]> => [],
    addSharedUser: async (_user: Omit<SharedUser, 'id' | 'createdAt' | 'lastAccessAt'>): Promise<SharedUser> => ({
        id: 'mock', userToken: 'mock', accessToken: 'mock', nickname: 'Mock', hardwareId: 'mock',
        permissions: [], createdAt: '', lastAccessAt: '', isActive: true
    }),
    deleteSharedUser: async (_userId: string) => { },
    updateSharedUser: async (_userId: string, _updates: Partial<SharedUser>) => { },

    // Client
    getHardwareId: async () => 'mock-hw',
    generateUserToken: async () => 'mock-token',
    getClientConfig: async (): Promise<ClientConfig> => ({
        downloadPath: '',
        theme: 'dark' as const,
        language: 'ja' as const,
        remoteLibraries: [],
        myUserToken: undefined,
        autoImport: { enabled: false, watchPaths: [] },
        thumbnailMode: 'speed' as const,
        discordRichPresenceEnabled: false
    }),
    updateClientConfig: async (_updates: Partial<ClientConfig>): Promise<ClientConfig> => ({
        downloadPath: '',
        theme: 'dark' as const,
        language: 'ja' as const,
        remoteLibraries: [],
        myUserToken: undefined,
        autoImport: { enabled: false, watchPaths: [] },
        thumbnailMode: 'speed' as const,
        discordRichPresenceEnabled: false
    }),
    selectDownloadDirectory: async () => null,
    testConnection: async (_url: string, _token: string) => ({ success: true }),
    addRemoteLibrary: async (_name: string, _url: string, _token: string) => null,
    downloadRemoteMedia: async (_url: string, _filename: string, _options?: { notificationId?: string }) => ({ success: true }),
    uploadRemoteMedia: async (_url: string, _token: string, _filePaths: string[], _options?: { notificationId?: string }) => ({ success: true }),
    renameRemoteMedia: async (_url: string, _token: string, _id: number, _newName: string) => null,
    deleteRemoteMedia: async (_url: string, _token: string, _id: number, _options?: { permanent?: boolean }) => null,
    updateRemoteMedia: async (_url: string, _token: string, _id: number, _updates: any) => null,
    createRemoteTag: async (_url: string, _token: string, _name: string) => ({ id: 0, name: '' }),
    deleteRemoteTag: async (_url: string, _token: string, _id: number) => { },
    addRemoteTagToMedia: async (_url: string, _token: string, _mediaId: number, _tagId: number) => { },
    addRemoteTagsToMedia: async (_url: string, _token: string, _mediaIds: number[], _tagIds: number[]) => { },
    removeRemoteTagFromMedia: async (_url: string, _token: string, _mediaId: number, _tagId: number) => { },

    // Update
    checkForUpdates: async () => null,
    downloadUpdate: async () => null,
    quitAndInstall: async () => { },
    onUpdateStatus: (_callback: (data: { status: string; info?: any }) => void) => () => { },

    on: (_channel: string, _func: (...args: any[]) => void) => () => { },
    minimizeWindow: async () => { },
    maximizeWindow: async () => { },
    closeWindow: async () => { },
    getAppVersion: async () => '0.0.0-mock',

    // FFmpeg
    getFFmpegInfo: async () => ({ version: '0.0', path: '' }),
    checkFFmpegUpdate: async () => ({ available: false }),
    updateFFmpeg: async (_url: string) => true,
    onFFmpegUpdateProgress: (_callback: (progress: number) => void) => () => { },

    focusWindow: async () => { },

    // Discord
    updateDiscordActivity: async (_activity: any) => { },
    clearDiscordActivity: async () => { }
}



export function initMockElectronAPI(): void {
    const isElectron = navigator.userAgent.toLowerCase().includes('electron')
    if (isElectron) return
    if (typeof window !== 'undefined' && !window.electronAPI) {
        // @ts-ignore
        window.electronAPI = mockElectronAPI
    }
}
