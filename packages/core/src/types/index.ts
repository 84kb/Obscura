export interface MediaFile {
    uniqueId?: string
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
    folders?: Folder[] // Renamed from genres
    comments?: MediaComment[]
    artist?: string | null
    artists?: string[]
    description?: string | null
    url?: string | null
    dominant_color?: string | null
    title?: string | null
    framerate?: number
    parentIds?: number[]
    parents?: MediaFile[]
    children?: MediaFile[]
}

export interface MediaComment {
    id: number
    mediaId: number
    text: string
    time: number // 再生位置（秒）
    nickname?: string
    createdAt: string
}

export interface Tag {
    id: number
    name: string
    groupId?: number | null
}

export interface Folder { // Renamed from Genre
    id: number
    name: string
    parentId?: number | null
    orderIndex?: number
}

export interface TagGroup {
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
    searchTargets?: { // Optional for backward compatibility init
        name: boolean
        folder: boolean
        description: boolean
        extension: boolean
        tags: boolean
        url: boolean
        comments: boolean
        memo: boolean
        artist: boolean
    }
    selectedTags: number[]
    excludedTags: number[]
    selectedFolders: number[] // Renamed from selectedGenres (for Virtual Folders)
    excludedFolders: number[] // Exclude specific folders
    tagFilterMode: 'and' | 'or'
    selectedSysDirs: string[] // Renamed from selectedFolders (for File System Dirs)
    excludedSysDirs: string[] // Renamed from excludedFolders
    folderFilterMode: 'and' | 'or'
    filterType: 'all' | 'uncategorized' | 'untagged' | 'recent' | 'random' | 'trash' | 'tag_manager'
    fileType: 'all' | 'video' | 'audio' // 内部フィルタリング用として残す
    sortOrder: 'name' | 'date' | 'size' | 'duration' | 'last_played' | 'rating' | 'modified' | 'artist' | 'tags' | 'random'
    sortDirection: 'asc' | 'desc'
    selectedRatings: number[] // 0-5, 0 は「評価なし」
    excludedRatings: number[]
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

export interface EqualizerBand {
    frequency: number
    gain: number
}

export interface AudioEngineSettings {
    enabled: boolean
    masterGain: number // 0 to 200 (100 is unity)

    // Playback Gain Control
    playbackGainEnabled: boolean
    playbackGainRatio: number // 0 to 100
    playbackMaxGain: number // 0 to 100

    // FIREqualizer
    eqEnabled: boolean
    eqBands: EqualizerBand[]

    // Convolver / Kernel
    convolverEnabled: boolean
    convolverIR: string | null // Path to IR file (.irs / .wav)
    convolverCrossfeed: number // 0 to 100 (VHS+ like)

    // DDC (Viper Digital Headphone Correction)
    ddcEnabled: boolean
    ddcFile: string | null // Path to .vdc file

    // Reverberation (Algorithmic)
    reverbEnabled: boolean
    reverbSize: number // 0 to 100
    reverbWet: number // 0 to 100
    reverbDry: number // 0 to 100
    reverbDamping: number // 0 to 100
    reverbWidth: number // 0 to 100 (Sound Field)

    // Tube Simulator (6N1J)
    tubeEnabled: boolean
    tubeOrder: number // Distortion order/amount (2 or 4 typical even harmonics)

    // Auditory System Protection
    auditoryProtectionEnabled: boolean
    protectionThreshold: number // dB (e.g. -3dB)

    // Surround
    surroundEnabled: boolean
    surroundMode: 'Field' | 'Differential' | 'Haas'
    surroundStrength: number // 0 to 100
    surroundDelay: number // 0 to 500 (ms)

    // Master Limiter
    masterLimiterEnabled: boolean
    masterLimiterThreshold: number // 0 to -10

    // ViPER Bass
    bassEnabled: boolean
    bassMode: 'Natural' | 'Pure' | 'Subwoofer'
    bassFrequency: number // 40 to 100Hz
    bassGain: number // 0 to 100

    // ViPER Clarity
    clarityEnabled: boolean
    clarityMode: 'Natural' | 'Ozone' | 'XHiFi'
    clarityGain: number // 0 to 100

    // Dynamic System (Real implementation)
    dynamicEnabled: boolean
    dynamicSideGain: number // 0 to 100
    dynamicBassThreshold: number // -60 to 0

    // Spectrum Extension
    spectrumEnabled: boolean
    spectrumGain: number // 0 to 100

    // AnalogX
    analogXEnabled: boolean
    analogXMode: 'Class A' | 'Class AB' | 'Class B'
    analogXDrive: number // 0 to 100

    // FET Compressor
    compressorEnabled: boolean
    compressorThreshold: number // -60 to 0
    compressorRatio: number // 1 to 20
    compressorKnee: number // 0 to 40
    compressorAttack: number // 0.001 to 1.0
    compressorRelease: number // 0.01 to 3.0
}

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
    publishLibraryPath?: string
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
    iconUrl?: string
    isOnline?: boolean
    isHost?: boolean
}

export interface AuditLogEntry {
    id: string
    userId?: string
    userNickname: string
    action: string
    targetId?: number | string
    targetName: string
    description: string
    details?: any
    timestamp: string
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
    getMediaFiles: (page?: number, limit?: number, filters?: any) => Promise<any> // TODO: Proper return type with pagination metadata
    getMediaFile: (id: number) => Promise<MediaFile | null>

    getTags: () => Promise<Tag[]>
    createTag: (name: string) => Promise<Tag>
    deleteTag: (id: number) => Promise<void>
    addTagToMedia: (mediaId: number, tagId: number) => Promise<void>
    addTagsToMedia: (mediaIds: number[], tagIds: number[]) => Promise<void>
    removeTagFromMedia: (mediaId: number, tagId: number) => Promise<void>

    getFolders: () => Promise<Folder[]> // Renamed from getGenres
    createFolder: (name: string, parentId?: number | null) => Promise<Folder>
    deleteFolder: (id: number) => Promise<void>
    renameFolder: (id: number, newName: string) => Promise<void>
    addFolderToMedia: (mediaId: number, folderId: number) => Promise<void>
    removeFolderFromMedia: (mediaId: number, folderId: number) => Promise<void>
    updateFolderStructure: (updates: { id: number; parentId: number | null; orderIndex: number }[]) => Promise<void>

    generateThumbnail: (mediaId: number, filePath: string) => Promise<string | null>

    moveToTrash: (id: number) => Promise<void>
    moveFilesToTrash: (ids: number[]) => Promise<void>
    restoreFromTrash: (id: number) => Promise<void>
    restoreFilesFromTrash: (ids: number[]) => Promise<void>
    deletePermanently: (id: number) => Promise<void>
    deleteFilesPermanently: (ids: number[]) => Promise<void>
    updateLastPlayed: (id: number) => Promise<void>

    importMedia: (filePaths: string[]) => Promise<MediaFile[]>
    checkImportDuplicates: (filePaths: string[]) => Promise<{ newFile: any; existing: any }[]>
    checkEntryDuplicates: (mediaId: number) => Promise<{ newMedia: MediaFile; existingMedia: MediaFile }[]>
    findLibraryDuplicates: (criteria?: { name: boolean; size: boolean; duration: boolean; modified: boolean }) => Promise<{ [key: string]: MediaFile[] }[]>
    scanFileSystemOrphans: () => Promise<any[]>
    refreshMediaMetadata: (ids: number[]) => Promise<void>
    deleteFileSystemFiles: (paths: string[]) => Promise<number>

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
    openExternal: (url: string) => Promise<void>
    showItemInFolder: (filePath: string) => Promise<void>
    openWith: (filePath: string) => Promise<void>
    copyFile: (filePath: string) => Promise<void>
    copyToClipboard: (text: string) => Promise<void>
    renameMedia: (mediaId: number, newName: string) => Promise<MediaFile | null>
    updateRating: (mediaId: number, rating: number) => Promise<void>
    backfillMetadata: () => Promise<number>
    updateArtist: (mediaId: number, artist: string | null) => Promise<void>
    updateDescription: (mediaId: number, description: string | null) => Promise<void>
    updateUrl: (mediaId: number, url: string | null) => Promise<void>
    addMediaParent: (childId: number, parentId: number) => Promise<void>
    removeMediaParent: (childId: number, parentId: number) => Promise<void>
    searchMediaFiles: (query: string) => Promise<{ id: number; file_name: string; title?: string; thumbnail_path?: string | null }[]>
    exportMedia: (mediaId: number, options?: { notificationId?: string }) => Promise<{ success: boolean; message?: string }>
    copyMediaToLibrary: (mediaIds: number[], libraryPath: string, settings: LibraryTransferSettings, options?: { notificationId?: string }) => Promise<{ success: boolean; message?: string }>
    updateRemoteProfile: (url: string, token: string, nickname: string, iconUrl?: string) => Promise<{ success: boolean; message?: string }>;

    // クリップボード
    copyFileToClipboard: (filePath: string) => Promise<boolean>

    // タググループ操作
    getTagGroups: () => Promise<TagGroup[]>
    createTagGroup: (name: string) => Promise<TagGroup>
    deleteTagGroup: (id: number) => Promise<void>
    renameTagGroup: (id: number, newName: string) => Promise<void>
    // ライブラリ管理
    refreshLibrary: () => Promise<boolean>
    onRefreshProgress: (callback: (current: number, total: number) => void) => void
    updateTagGroup: (tagId: number, groupId: number | null) => Promise<void>
    getAuditLogs: (libraryPath?: string) => Promise<AuditLogEntry[]>

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
    getRemoteSharedUsers: (params: { url: string; userToken: string; accessToken: string }) => Promise<SharedUser[]>
    addSharedUser: (user: Omit<SharedUser, 'id' | 'createdAt' | 'lastAccessAt'>) => Promise<SharedUser>
    deleteSharedUser: (userId: string) => Promise<void>
    updateSharedUser: (userId: string, updates: Partial<SharedUser>) => Promise<void>

    // プラグイン API
    showNotification: (options: { title: string; message: string }) => void
    showMessageBox: (options: ExtensionMessageBoxOptions) => Promise<{ response: number }>
    updateMedia: (mediaId: number, updates: any) => Promise<MediaFile | null>
    getSelectedMedia: () => Promise<MediaFile[]>

    // クライアント機能
    getHardwareId: () => Promise<string>
    generateUserToken: () => Promise<string>

    // クライアント設定
    getClientConfig: () => Promise<ClientConfig>
    updateClientConfig: (updates: Partial<ClientConfig>) => Promise<ClientConfig>
    selectDownloadDirectory: () => Promise<string | null>
    testConnection: (url: string, token: string) => Promise<{ success: boolean; message?: string }>
    addRemoteLibrary: (name: string, url: string, token: string) => Promise<any>
    downloadRemoteMedia: (url: string, filename: string, options?: { notificationId?: string }) => Promise<{ success: boolean; path?: string; message?: string }>
    uploadRemoteMedia: (url: string, token: string, filePaths: string[], metadata?: any, options?: { notificationId?: string }) => Promise<{ success: boolean; results?: any[]; message?: string }>
    renameRemoteMedia: (url: string, token: string, id: number, newName: string) => Promise<any>
    deleteRemoteMedia: (url: string, token: string, id: number, options?: { permanent?: boolean }) => Promise<any>
    updateRemoteMedia: (url: string, token: string, id: number, updates: any) => Promise<any>
    createRemoteTag: (url: string, token: string, name: string) => Promise<Tag>
    deleteRemoteTag: (url: string, token: string, id: number) => Promise<void>
    addRemoteTagToMedia: (url: string, token: string, mediaId: number, tagId: number) => Promise<void>
    addRemoteTagsToMedia: (url: string, token: string, mediaIds: number[], tagIds: number[]) => Promise<void>
    removeRemoteTagFromMedia: (url: string, token: string, mediaId: number, tagId: number) => Promise<void>

    // === 自動アップデート ===
    checkForUpdates: () => Promise<any>
    downloadUpdate: () => Promise<any>
    quitAndInstall: () => Promise<void>
    onUpdateStatus: (callback: (data: { status: string; info?: any }) => void) => () => void

    on: (channel: string, func: (...args: any[]) => void) => () => void

    // ウィンドウ操作
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
    closeWindow: () => Promise<void>

    // アプリケーション情報
    getAppVersion: () => Promise<string>

    // FFmpeg
    getFFmpegInfo: () => Promise<{ version: string; path: string }>
    checkFFmpegUpdate: () => Promise<{ available: boolean; version?: string; url?: string }>
    updateFFmpeg: (url: string) => Promise<boolean>
    onFFmpegUpdateProgress: (callback: (progress: number) => void) => () => void

    // その他
    focusWindow: () => Promise<void>

    // Discord RPC
    updateDiscordActivity: (activity: any) => Promise<void>
    clearDiscordActivity: () => Promise<void>


    // Audio
    getAudioDevices: () => Promise<{ name: string, description: string }[]>
    setAudioDevice: (deviceName: string) => Promise<void>
    setExclusiveMode: (enabled: boolean) => Promise<void>
    playAudio: (filePath?: string) => Promise<void>
    pauseAudio: () => Promise<void>
    resumeAudio: () => Promise<void>
    stopAudio: () => Promise<void>
    seekAudio: (time: number) => Promise<void>
    setAudioVolume: (volume: number) => Promise<void>

    // ニコニココメント（廃止・プラグイン化）
    // fetchNicoComments, getNicoComments was removed

    // プラグイン・拡張機能操作
    pluginFetch: (url: string, options?: any) => Promise<{ ok: boolean; status: number; statusText: string; data?: any; error?: boolean }>;
    savePluginMediaData: (mediaId: number, pluginId: string, data: any) => Promise<boolean>;
    loadPluginMediaData: (mediaId: number, pluginId: string) => Promise<any>;
    getPluginScripts: () => Promise<PluginInfo[]>;

    // コメントファイルI/O（動画横保存）
    saveAssociatedData: (mediaFilePath: string, data: any) => Promise<boolean>;
    loadAssociatedData: (mediaFilePath: string) => Promise<any>;
}

export interface RemoteLibrary {
    id: string
    name: string
    url: string
    token: string
    userToken?: string
    accessToken?: string
    lastConnectedAt?: string
}


export interface AutoImportPath {
    id: string
    path: string
    targetLibraryId: string
    enabled: boolean
}

export interface AutoImportConfig {
    enabled: boolean
    watchPaths: AutoImportPath[]
    // Deprecated legacy fields (optional for migration)
    watchPath?: string
    targetLibraryId?: string
}

export interface LibraryViewSettings {
    sortOrder: string
    sortDirection: 'asc' | 'desc'
}

export interface LibraryTransferSettings {
    keepTags: boolean
    keepArtists: boolean
    keepFolders: boolean
    keepRatings: boolean
    keepThumbnails: boolean
    keepUrl: boolean
    keepComments: boolean
    keepDescription: boolean
}

// ---------------------------------------------------------------------------
// 拡張機能・プラグインAPI用 型定義
// ---------------------------------------------------------------------------

// プラグインから取得される汎用データのインターフェース
export interface ExtensionResource {
    id: string | number;
    time?: number;     // タイムライン上の位置（秒）
    type?: string;     // データ種別 (comment, chapter, etc.)
    content: string;   // コンテンツ本文
    [key: string]: any; // その他のプラグイン固有データ
}

export interface ExtensionButton {
    id: string;
    label: string;
    icon?: string;
    disabled?: boolean;
    isActive?: boolean;
    onClick: (context: { media: MediaFile, updateMedia?: (media: MediaFile) => void }) => void;
}

export interface PlayerOverlayContext {
    currentTime: number;
    isPlaying: boolean;
    enabled: boolean;
}

export interface ExtensionNotificationOptions {
    title: string;
    description?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
}

export interface ExtensionMessageBoxOptions {
    title: string;
    message: string;
    type?: 'info' | 'error' | 'warning' | 'question';
    buttons?: string[];
    defaultId?: number;
    cancelId?: number;
}

export interface ExtensionUIHooks {
    inspectorActions?: (media: MediaFile) => ExtensionButton[];
    playerTopBar?: (media: MediaFile) => ExtensionButton[];
    playerOverlay?: (canvas: HTMLCanvasElement, media: MediaFile, context: PlayerOverlayContext) => void;
}

export interface ObscuraPlugin {
    id: string;        // 例: 'niconico'
    name: string;      // 例: '拡張機能'
    canHandle: (url: string) => boolean; // このURLを処理可能か判定
    fetchData: (mediaId: number, url: string) => Promise<ExtensionResource[]>; // データ取得処理
    uiHooks?: ExtensionUIHooks;
}

export interface ObscuraAPI {
    registerPlugin: (plugin: ObscuraPlugin) => void;
    unregisterPlugin?: (pluginId: string) => void;
    getPlugins: () => ObscuraPlugin[];


    // プレイヤーオーバーレイAPI
    registerPlayerOverlay: (id: string, callback: (canvas: HTMLCanvasElement, media: MediaFile, context: PlayerOverlayContext) => void) => void;
    unregisterPlayerOverlay: (id: string) => void;

    // メディア操作 (Eagle 互換)
    media: {
        get: (id: number) => Promise<MediaFile | null>;
        getSelected: () => Promise<MediaFile | null>;
        getSelection: () => Promise<MediaFile[]>;
        update: (id: number, updates: Partial<MediaFile>) => Promise<MediaFile | null>;
        addTag: (mediaId: number, tagId: number) => Promise<void>;
        removeTag: (mediaId: number, tagId: number) => Promise<void>;
        import: (filePaths: string[]) => Promise<MediaFile[]>;
    };

    // UI 操作
    ui: {
        showNotification: (options: ExtensionNotificationOptions) => void;
        showMessageBox: (options: ExtensionMessageBoxOptions) => Promise<{ response: number }>;
        copyToClipboard: (text: string) => void;
    };

    system: {
        fetch: (url: string, options?: any) => Promise<any>;
        saveMediaData: (mediaId: number, pluginId: string, data: any) => Promise<boolean>;
        loadMediaData: (mediaId: number, pluginId: string) => Promise<any>;
        // 各種データ保存用 (旧 saveCommentFile)
        saveAssociatedData: (mediaFilePath: string, data: any) => Promise<boolean>;
        loadAssociatedData: (mediaFilePath: string) => Promise<any>;
        openPath: (path: string) => Promise<void>;
        openExternal: (url: string) => Promise<void>;

        // プラグイン用永続ストレージ
        storage: {
            get: (key: string) => Promise<any>;
            set: (key: string, value: any) => Promise<void>;
        };
    };

    // イベント
    on: (event: 'selection-changed' | 'item-info-updated' | 'theme-changed', callback: (...args: any[]) => void) => () => void;
}

// グローバルオブジェクトの型拡張
declare global {
    interface Window {
        ObscuraAPI: ObscuraAPI;
        electronAPI: ElectronAPI; // 既存の定義
    }
}

export interface ThemeColors {
    bgDark: string
    bgCard: string
    bgSidebar: string
    bgHover: string
    primary: string
    primaryHover: string
    primaryLight: string
    accent: string
    textMain: string
    textMuted: string
    border: string
}

export interface Theme {
    id: string
    name: string
    colors: ThemeColors
    isSystem?: boolean // for default themes
}

export interface DuplicateCriteria {
    name: boolean
    size: boolean
    duration: boolean
    modified: boolean
}

export interface ClientConfig {
    downloadPath: string
    theme: 'dark' | 'light' | 'system'
    customThemes?: Theme[]
    activeThemeId?: string // 適用中のカスタムテーマID (themeが'custom'の場合などに使用)
    language: 'ja' | 'en'
    remoteLibraries: RemoteLibrary[]
    myUserToken?: string
    autoImport: AutoImportConfig
    libraryViewSettings: { [libraryId: string]: LibraryViewSettings }
    thumbnailMode: 'speed' | 'quality'
    discordRichPresenceEnabled: boolean
    nickname?: string
    iconUrl?: string
    libraryTransferSettings?: LibraryTransferSettings
    enableGPUAcceleration?: boolean
    audioDevice?: string
    exclusiveMode?: boolean
    useMpvAudio?: boolean
    enableMpvForVideo?: boolean
}

export interface AppSettings {
    autoPlay: boolean
    allowUpscale: boolean
    gridSize: number
    viewMode: 'grid' | 'list'
    enableRichText: boolean
    pipControlMode: 'navigation' | 'skip'
    autoHideSidebar: boolean
    showInfoOverlay: boolean
    showTitleOnHover: boolean
    videoScaling: 'smooth' | 'pixelated'
    imageScaling: 'smooth' | 'pixelated'
    extensions: ExtensionsSettings
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
    listColumns?: {
        tags: boolean
        resolution: boolean
        rating: boolean
        extension: boolean
        size: boolean
        modified: boolean
        created: boolean
        artist: boolean
    }
    showComments?: boolean
}

export interface NicoComment {
    vpos: number // ms
    content: string
    mail: string // color, position, size (e.g., "shita red big")
    userId: string
}

export interface ExtensionSettings {
    enabled: boolean
}

export interface ExtensionsSettings {
    [pluginId: string]: ExtensionSettings
}

export interface PluginMetadata {
    name: string
    description: string
    version: string
    author: string
}

export interface PluginInfo {
    id: string
    fileName: string
    name: string
    code: string
    metadata: PluginMetadata
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
    thumbnailMode: 'speed',
    listColumns: {
        tags: true,
        resolution: true,
        rating: true,
        extension: true,
        size: true,
        modified: true,
        created: true,
        artist: true
    }
}

declare global {
    interface Window {
        electronAPI: ElectronAPI
    }
}
