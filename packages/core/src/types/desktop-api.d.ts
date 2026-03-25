import { MediaFile, Tag, Folder, TagGroup, Library, MediaComment, ServerConfig, SharedUser, ClientConfig, LibraryTransferSettings } from './index'

declare global {
    interface Window {
        obscuraAPI?: DesktopAPI
    }
}

export interface DesktopAPI {
    // 繝輔ぃ繧､繝ｫ謫堺ｽ懈ｱ守畑
    selectFile: (options?: any) => Promise<string | null>

    // 繝ｩ繧､繝悶Λ繝ｪ邂｡逅・
    createLibrary: (name: string, parentPath: string) => Promise<Library>
    openLibrary: () => Promise<Library | null>
    getLibraries: () => Promise<Library[]>
    setActiveLibrary: (libraryPath: string) => Promise<void>
    getActiveLibrary: () => Promise<Library | null>

    selectFolder: () => Promise<string | null>
    scanFolder: (folderPath: string) => Promise<any[]>
    getMediaFiles: (page?: number, limit?: number, filterOptions?: any) => Promise<{ media: MediaFile[]; total: number }>
    getMediaFile: (id: number) => Promise<MediaFile | null>

    getTags: () => Promise<Tag[]>
    createTag: (name: string) => Promise<Tag>
    deleteTag: (id: number) => Promise<void>
    addTagToMedia: (mediaId: number, tagId: number) => Promise<void>
    addTagsToMedia: (mediaIds: number[], tagIds: number[]) => Promise<void>
    removeTagFromMedia: (mediaId: number, tagId: number) => Promise<void>

    getFolders: () => Promise<Folder[]>
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

    // 繧ｭ繝｣繝励メ繝｣
    onTriggerFrameCapture: (callback: (action: string) => void) => () => void
    copyFrameToClipboard: (dataUrl: string) => Promise<boolean>
    saveCapturedFrame: (dataUrl: string) => Promise<boolean>
    setCapturedThumbnail: (mediaId: number, dataUrl: string) => Promise<string | null>
    captureFrameDataUrl: (filePath: string, timeSeconds: number) => Promise<string | null>

    // 繧ｳ繝｡繝ｳ繝・
    addComment: (mediaId: number, text: string, time: number) => Promise<MediaComment>
    getComments: (mediaId: number) => Promise<MediaComment[]>
    generatePreviews: (mediaId: number) => Promise<string[]>

    // 繝輔ぃ繧､繝ｫ謫堺ｽ・
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
    exportMedia: (mediaId: number, options?: { notificationId?: string }) => Promise<{ success: boolean; message?: string }>
    copyMediaToLibrary: (mediaIds: number[], libraryPath: string, settings: LibraryTransferSettings, options?: { notificationId?: string }) => Promise<{ success: boolean; message?: string }>

    // 繧ｯ繝ｪ繝・・繝懊・繝・
    copyFileToClipboard: (filePath: string) => Promise<boolean>

    // 繧ｿ繧ｰ繧ｰ繝ｫ繝ｼ繝玲桃菴・
    getTagGroups: () => Promise<TagGroup[]>
    createTagGroup: (name: string) => Promise<TagGroup>
    deleteTagGroup: (id: number) => Promise<void>
    renameTagGroup: (id: number, newName: string) => Promise<void>
    // 繝ｩ繧､繝悶Λ繝ｪ邂｡逅・
    refreshLibrary: () => Promise<boolean>
    onRefreshProgress: (callback: (current: number, total: number) => void) => () => void
    updateTagGroup: (tagId: number, groupId: number | null) => Promise<void>

    // 繝阪う繝・ぅ繝悶ヵ繧｡繧､繝ｫ繝峨Λ繝・げ・亥酔譛溽噪・・
    startDrag: (filePaths: string[]) => void

    // === 繝阪ャ繝医Ρ繝ｼ繧ｯ蜈ｱ譛・===
    // 繧ｵ繝ｼ繝舌・險ｭ螳・
    getServerConfig: () => Promise<ServerConfig>
    updateServerConfig: (updates: Partial<ServerConfig>) => Promise<void>
    resetHostSecret: () => Promise<string>

    // 繧ｵ繝ｼ繝舌・謫堺ｽ・
    startServer: () => Promise<{ success: boolean; error?: string }>
    stopServer: () => Promise<{ success: boolean; error?: string }>
    getServerStatus: () => Promise<boolean>

    // 繝ｦ繝ｼ繧ｶ繝ｼ邂｡逅・
    getSharedUsers: () => Promise<SharedUser[]>
    addSharedUser: (user: Omit<SharedUser, 'id' | 'createdAt' | 'lastAccessAt'>) => Promise<SharedUser>
    deleteSharedUser: (userId: string) => Promise<void>
    updateSharedUser: (userId: string, updates: Partial<SharedUser>) => Promise<void>

    // 繧ｯ繝ｩ繧､繧｢繝ｳ繝域ｩ溯・
    getHardwareId: () => Promise<string>
    generateUserToken: () => Promise<string>

    // 繧ｯ繝ｩ繧､繧｢繝ｳ繝郁ｨｭ螳・
    getClientConfig: () => Promise<ClientConfig>
    updateClientConfig: (updates: Partial<ClientConfig>) => Promise<ClientConfig>
    installPlugin: () => Promise<{ installed?: string[]; skipped?: string[]; error?: string }>
    uninstallPlugin: (pluginId: string) => Promise<{ success: boolean; error?: string }>
    selectDownloadDirectory: () => Promise<string | null>
    testConnection: (url: string, token: string) => Promise<{ success: boolean; message?: string; libraryName?: string }>
    addRemoteLibrary: (name: string, url: string, token: string) => Promise<any>
    downloadRemoteMedia: (url: string, filename: string, options?: { notificationId?: string }) => Promise<{ success: boolean; path?: string; message?: string }>
    uploadRemoteMedia: (url: string, token: string, filePaths: string[], options?: { notificationId?: string }) => Promise<{ success: boolean; results?: any[]; message?: string }>
    renameRemoteMedia: (url: string, token: string, id: number, newName: string) => Promise<any>
    deleteRemoteMedia: (url: string, token: string, id: number, options?: { permanent?: boolean }) => Promise<any>
    updateRemoteMedia: (url: string, token: string, id: number, updates: any) => Promise<any>
    createRemoteTag: (url: string, token: string, name: string) => Promise<Tag>
    deleteRemoteTag: (url: string, token: string, id: number) => Promise<void>
    addRemoteTagToMedia: (url: string, token: string, mediaId: number, tagId: number) => Promise<void>
    addRemoteTagsToMedia: (url: string, token: string, mediaIds: number[], tagIds: number[]) => Promise<void>
    removeRemoteTagFromMedia: (url: string, token: string, mediaId: number, tagId: number) => Promise<void>

    addRemoteMediaParent: (url: string, token: string, childId: number, parentId: number) => Promise<void>
    removeRemoteMediaParent: (url: string, token: string, childId: number, parentId: number) => Promise<void>
    searchRemoteMediaFiles: (url: string, token: string, query: string, targets?: any) => Promise<{ id: number; file_name: string; title?: string; thumbnail_path?: string | null }[]>

    syncRemoteLibrary: (url: string, token: string, remoteId: string) => Promise<{ success: boolean; message?: string }>
    getRemoteCachePath: (remoteId: string) => Promise<string | null>

    updateRemoteProfile: (url: string, token: string, nickname: string, iconUrl?: string) => Promise<{ success: boolean; message?: string }>

    // === 閾ｪ蜍輔い繝・・繝・・繝・===
    checkForUpdates: () => Promise<any>
    downloadUpdate: () => Promise<any>
    quitAndInstall: () => Promise<void>
    onUpdateStatus: (callback: (data: { status: string; info?: any }) => void) => () => void

    on: (channel: string, func: (...args: any[]) => void) => () => void

    // 繧ｦ繧｣繝ｳ繝峨え謫堺ｽ・
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
    closeWindow: () => Promise<void>

    // 繧｢繝励Μ繧ｱ繝ｼ繧ｷ繝ｧ繝ｳ諠・ｱ
    getAppVersion: () => Promise<string>

    // FFmpeg
    getFFmpegInfo: () => Promise<{ version: string; path: string }>
    checkFFmpegUpdate: () => Promise<{ available: boolean; version?: string; url?: string }>
    updateFFmpeg: (url: string) => Promise<boolean>
    onFFmpegUpdateProgress: (callback: (progress: number) => void) => () => void

    // 縺昴・莉・
    focusWindow: () => Promise<void>

    // Discord RPC
    updateDiscordActivity: (activity: any) => Promise<void>
    clearDiscordActivity: () => Promise<void>

    // 繝繧､繧｢繝ｭ繧ｰ繝ｻ騾夂衍
    showNotification: (options: { title: string; description?: string; type?: string }) => void
    showMessageBox: (options: { title: string; message: string; type?: string; buttons?: string[]; defaultId?: number; cancelId?: number }) => Promise<{ response: number }>
}

