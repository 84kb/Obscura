export interface MediaFile {
    id: number
    file_path: string
    file_name: string
    file_type: 'video' | 'audio'
    duration: number | null
    thumbnail_path: string | null
    created_at: string
    is_deleted: boolean
    last_played_at: string | null
    file_size: number
    rating?: number
    width?: number
    height?: number
    created_date?: string
    modified_date?: string
    tags?: Tag[]
    genres?: Genre[]
    comments?: MediaComment[]
    artist?: string | null
    description?: string | null
}

export interface MediaComment {
    id: number
    mediaId: number
    text: string
    time: number // 再生位置（秒）
    createdAt: string
}

export interface Tag {
    id: number
    name: string
    folderId?: number | null
}

export interface Genre {
    id: number
    name: string
    parentId?: number | null
    orderIndex?: number
}

export interface TagFolder {
    id: number
    name: string
}

export interface Library {
    name: string
    path: string
    createdAt: string
}

export interface FilterOptions {
    searchQuery: string
    selectedTags: number[]
    excludedTags: number[]
    selectedGenres: number[]
    tagFilterMode: 'and' | 'or'
    selectedFolders: string[]
    excludedFolders: string[]
    folderFilterMode: 'and' | 'or'
    filterType: 'all' | 'uncategorized' | 'untagged' | 'recent' | 'random' | 'trash' | 'tag_manager'
    fileType: 'all' | 'video' | 'audio' // 内部フィルタリング用として残す
    sortOrder: 'name' | 'date' | 'size' | 'duration' | 'last_played'
    sortDirection: 'asc' | 'desc'
    selectedRatings: number[] // 0-5, 0 は「評価なし」
    selectedExtensions: string[]
    excludedExtensions: string[]
    selectedArtists: string[]
    excludedArtists: string[]
    durationMin?: number | null // 秒
    durationMax?: number | null // 秒
    dateModifiedMin?: string | null // YYYY-MM-DD
    dateModifiedMax?: string | null // YYYY-MM-DD
}

export type Permission = 'READ_ONLY' | 'DOWNLOAD' | 'UPLOAD' | 'EDIT' | 'FULL'

export interface ServerConfig {
    isEnabled: boolean
    port: number
    hostSecret: string
    allowedIPs: string[]
    maxConnections: number
    maxUploadSize: number // MB
    maxUploadRate: number // MB/s
    enableAuditLog: boolean
    requireHttps: boolean
    sslCertPath?: string
    sslKeyPath?: string
}

export interface SharedUser {
    id: string
    userToken: string
    accessToken: string
    nickname: string
    hardwareId: string
    permissions: Permission[]
    createdAt: string
    lastAccessAt: string
    isActive: boolean
    ipAddress?: string
}

export interface ElectronAPI {
    // ファイル操作汎用
    selectFile: (options?: any) => Promise<string | null>

    // ライブラリ管理
    createLibrary: (name: string, parentPath: string) => Promise<Library>
    openLibrary: () => Promise<Library | null>
    getLibraries: () => Promise<Library[]>
    setActiveLibrary: (libraryPath: string) => Promise<void>
    getActiveLibrary: () => Promise<Library | null>

    selectFolder: () => Promise<string | null>
    scanFolder: (folderPath: string) => Promise<any[]>
    getMediaFiles: () => Promise<MediaFile[]>
    getMediaFile: (id: number) => Promise<MediaFile | null>

    getTags: () => Promise<Tag[]>
    createTag: (name: string) => Promise<Tag>
    deleteTag: (id: number) => Promise<void>
    addTagToMedia: (mediaId: number, tagId: number) => Promise<void>
    removeTagFromMedia: (mediaId: number, tagId: number) => Promise<void>

    getGenres: () => Promise<Genre[]>
    createGenre: (name: string, parentId?: number | null) => Promise<Genre>
    deleteGenre: (id: number) => Promise<void>
    renameGenre: (id: number, newName: string) => Promise<void>
    addGenreToMedia: (mediaId: number, genreId: number) => Promise<void>
    removeGenreFromMedia: (mediaId: number, genreId: number) => Promise<void>
    updateGenreStructure: (updates: { id: number; parentId: number | null; orderIndex: number }[]) => Promise<void>

    generateThumbnail: (mediaId: number, filePath: string) => Promise<string | null>

    moveToTrash: (id: number) => Promise<void>
    restoreFromTrash: (id: number) => Promise<void>
    deletePermanently: (id: number) => Promise<void>
    updateLastPlayed: (id: number) => Promise<void>

    importMedia: (filePaths: string[]) => Promise<MediaFile[]>

    // キャプチャ
    onTriggerFrameCapture: (callback: (action: string) => void) => () => void
    copyFrameToClipboard: (dataUrl: string) => Promise<boolean>
    saveCapturedFrame: (dataUrl: string) => Promise<boolean>
    setCapturedThumbnail: (mediaId: number, dataUrl: string) => Promise<string | null>

    // コメント
    addComment: (mediaId: number, text: string, time: number) => Promise<MediaComment>
    getComments: (mediaId: number) => Promise<MediaComment[]>
    generatePreviews: (mediaId: number) => Promise<string[]>

    // ファイル操作
    openPath: (filePath: string) => Promise<void>
    showItemInFolder: (filePath: string) => Promise<void>
    openWith: (filePath: string) => Promise<void>
    copyFile: (filePath: string) => Promise<void>
    copyToClipboard: (text: string) => Promise<void>
    renameMedia: (mediaId: number, newName: string) => Promise<void>
    updateRating: (mediaId: number, rating: number) => Promise<void>
    backfillMetadata: () => Promise<number>
    updateArtist: (mediaId: number, artist: string | null) => Promise<void>
    updateDescription: (mediaId: number, description: string | null) => Promise<void>

    // タグフォルダー操作
    getTagFolders: () => Promise<TagFolder[]>
    createTagFolder: (name: string) => Promise<TagFolder>
    deleteTagFolder: (id: number) => Promise<void>
    renameTagFolder: (id: number, newName: string) => Promise<void>
    updateTagFolder: (tagId: number, folderId: number | null) => Promise<void>

    // ネイティブファイルドラッグ（同期的）
    startDrag: (filePaths: string[]) => void

    // === ネットワーク共有 ===
    // サーバー設定
    getServerConfig: () => Promise<ServerConfig>
    updateServerConfig: (updates: Partial<ServerConfig>) => Promise<void>
    resetHostSecret: () => Promise<string>

    // サーバー操作
    startServer: () => Promise<{ success: boolean; error?: string }>
    stopServer: () => Promise<{ success: boolean; error?: string }>
    getServerStatus: () => Promise<boolean>

    // ユーザー管理
    getSharedUsers: () => Promise<SharedUser[]>
    addSharedUser: (user: Omit<SharedUser, 'id' | 'createdAt' | 'lastAccessAt'>) => Promise<SharedUser>
    deleteSharedUser: (userId: string) => Promise<void>
    updateSharedUser: (userId: string, updates: Partial<SharedUser>) => Promise<void>

    // クライアント機能
    getHardwareId: () => Promise<string>
    generateUserToken: () => Promise<string>

    // クライアント設定
    getClientConfig: () => Promise<ClientConfig>
    updateClientConfig: (updates: Partial<ClientConfig>) => Promise<ClientConfig>
    selectDownloadDirectory: () => Promise<string | null>
    testConnection: (url: string, token: string) => Promise<{ success: boolean; message?: string }>
    addRemoteLibrary: (name: string, url: string, token: string) => Promise<any>
    downloadRemoteMedia: (url: string, filename: string) => Promise<{ success: boolean; path?: string; message?: string }>

    // === 自動アップデート ===
    checkForUpdates: () => Promise<any>
    downloadUpdate: () => Promise<any>
    quitAndInstall: () => Promise<void>
    onUpdateStatus: (callback: (data: { status: string; info?: any }) => void) => () => void

    on: (channel: string, func: (...args: any[]) => void) => void

    // ウィンドウ操作
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
    closeWindow: () => Promise<void>
}

export interface RemoteLibrary {
    id: string
    name: string
    url: string
    token: string
    lastConnectedAt?: string
}

export interface ClientConfig {
    downloadPath: string
    theme: 'dark' | 'light' | 'system'
    language: 'ja' | 'en'
    remoteLibraries: RemoteLibrary[]
    myUserToken?: string
}

export interface AppSettings {
    autoPlay: boolean
    allowUpscale: boolean
    gridSize: number
    viewMode: 'grid' | 'list'
}

export type ItemInfoType = 'duration' | 'size' | 'tags' | 'rating' | 'modified' | 'created'

export interface ViewSettings {
    showName: boolean
    showItemInfo: boolean
    itemInfoType: ItemInfoType
    showExtension: boolean
    showExtensionLabel: boolean
    showSubfolderContent: boolean
    showSidebar: boolean
    showInspector: boolean
    thumbnailMode: 'speed' | 'quality'
}

export const defaultViewSettings: ViewSettings = {
    showName: true,
    showItemInfo: true,
    itemInfoType: 'duration',
    showExtension: true,
    showExtensionLabel: true,
    showSubfolderContent: false,
    showSidebar: true,
    showInspector: true,
    thumbnailMode: 'speed'
}
