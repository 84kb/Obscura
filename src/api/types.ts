import { MediaFile, MediaComment, Tag, TagGroup, Folder, Library, ServerConfig, SharedUser, ClientConfig, AuditLogEntry, LibraryTransferSettings } from '../types';

export interface IMediaLibraryAPI {
    // ファイル操作汎用
    selectFile(options?: any): Promise<string | null>;

    // ライブラリ管理
    createLibrary(name: string, parentPath: string): Promise<Library>;
    openLibrary(): Promise<Library | null>;
    getLibraries(): Promise<Library[]>;
    setActiveLibrary(libraryPath: string): Promise<void>;
    getActiveLibrary(): Promise<Library | null>;

    selectFolder(): Promise<string | null>;
    scanFolder(folderPath: string): Promise<any[]>;
    getMediaFiles(page?: number, limit?: number, filters?: any): Promise<any>;
    getMediaFile(id: number): Promise<MediaFile | null>;

    getTags(): Promise<Tag[]>;
    createTag(name: string): Promise<Tag>;
    deleteTag(id: number): Promise<void>;
    addTagToMedia(mediaId: number, tagId: number): Promise<void>;
    addTagsToMedia(mediaIds: number[], tagIds: number[]): Promise<void>;
    removeTagFromMedia(mediaId: number, tagId: number): Promise<void>;

    getFolders(): Promise<Folder[]>;
    createFolder(name: string, parentId?: number | null): Promise<Folder>;
    deleteFolder(id: number): Promise<void>;
    renameFolder(id: number, newName: string): Promise<void>;
    addFolderToMedia(mediaId: number, folderId: number): Promise<void>;
    removeFolderFromMedia(mediaId: number, folderId: number): Promise<void>;
    updateFolderStructure(updates: { id: number; parentId: number | null; orderIndex: number }[]): Promise<void>;

    generateThumbnail(mediaId: number, filePath: string): Promise<string | null>;

    moveToTrash(id: number): Promise<void>;
    moveFilesToTrash(ids: number[]): Promise<void>;
    restoreFromTrash(id: number): Promise<void>;
    restoreFilesFromTrash(ids: number[]): Promise<void>;
    deletePermanently(id: number): Promise<void>;
    deleteFilesPermanently(ids: number[]): Promise<void>;
    updateLastPlayed(id: number): Promise<void>;

    importMedia(filePaths: string[]): Promise<MediaFile[]>;
    checkImportDuplicates(filePaths: string[]): Promise<{ newFile: any; existing: any }[]>;
    checkEntryDuplicates(mediaId: number): Promise<{ newMedia: MediaFile; existingMedia: MediaFile }[]>;
    findLibraryDuplicates(criteria?: { name: boolean; size: boolean; duration: boolean; modified: boolean }): Promise<{ [key: string]: MediaFile[] }[]>;
    refreshMetadata(ids: number[]): Promise<void>;
    scanFileSystemOrphans(): Promise<any[]>;
    deleteFileSystemFiles(paths: string[]): Promise<number>;

    // キャプチャ
    onTriggerFrameCapture(callback: (action: string) => void): () => void;
    copyFrameToClipboard(dataUrl: string): Promise<boolean>;
    saveCapturedFrame(dataUrl: string): Promise<boolean>;
    setCapturedThumbnail(mediaId: number, dataUrl: string): Promise<string | null>;

    // コメント
    addComment(mediaId: number, text: string, time: number): Promise<MediaComment>;
    getComments(mediaId: number): Promise<MediaComment[]>;
    generatePreviews(mediaId: number): Promise<string[]>;

    // ファイル操作
    openPath(filePath: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    showItemInFolder(filePath: string): Promise<void>;
    openWith(filePath: string): Promise<void>;
    copyFile(filePath: string): Promise<void>;
    copyToClipboard(text: string): Promise<void>;
    renameMedia(mediaId: number, newName: string): Promise<MediaFile | null>;
    updateRating(mediaId: number, rating: number): Promise<void>;
    backfillMetadata(): Promise<number>;
    updateArtist(mediaId: number, artist: string | null): Promise<void>;
    updateDescription(mediaId: number, description: string | null): Promise<void>;
    updateUrl(mediaId: number, url: string | null): Promise<void>;
    updateMediaRelation(childId: number, parentId: number | null): Promise<void>;
    searchMediaFiles(query: string): Promise<{ id: number; file_name: string; title?: string; thumbnail_path?: string | null }[]>;
    exportMedia(mediaId: number, options?: { notificationId?: string }): Promise<{ success: boolean; message?: string }>;
    copyMediaToLibrary(mediaIds: number[], libraryPath: string, settings: LibraryTransferSettings, options?: { notificationId?: string }): Promise<{ success: boolean; message?: string }>;

    // クリップボード
    copyFileToClipboard(filePath: string): Promise<boolean>;

    // タググループ操作
    getTagGroups(): Promise<TagGroup[]>;
    createTagGroup(name: string): Promise<TagGroup>;
    deleteTagGroup(id: number): Promise<void>;
    renameTagGroup(id: number, newName: string): Promise<void>;
    // ライブラリ管理
    refreshLibrary(): Promise<boolean>;
    onRefreshProgress(callback: (current: number, total: number) => void): void;
    updateTagGroup(tagId: number, groupId: number | null): Promise<void>;
    getAuditLogs(libraryPath?: string): Promise<AuditLogEntry[]>;

    // ネイティブファイルドラッグ（同期的）
    startDrag(filePaths: string[]): void;

    // === ネットワーク共有 ===
    // サーバー設定
    getServerConfig(): Promise<ServerConfig>;
    updateServerConfig(updates: Partial<ServerConfig>): Promise<void>;
    resetHostSecret(): Promise<string>;

    // サーバー操作
    startServer(): Promise<{ success: boolean; error?: string }>;
    stopServer(): Promise<{ success: boolean; error?: string }>;
    getServerStatus(): Promise<boolean>;

    // ユーザー管理
    getSharedUsers(): Promise<SharedUser[]>;
    getRemoteSharedUsers(params: { url: string; userToken: string; accessToken: string }): Promise<SharedUser[]>;
    addSharedUser(user: Omit<SharedUser, 'id' | 'createdAt' | 'lastAccessAt'>): Promise<SharedUser>;
    deleteSharedUser(userId: string): Promise<void>;
    updateSharedUser(userId: string, updates: Partial<SharedUser>): Promise<void>;

    // クライアント機能
    getHardwareId(): Promise<string>;
    generateUserToken(): Promise<string>;

    // クライアント設定
    getClientConfig(): Promise<ClientConfig>;
    updateClientConfig(updates: Partial<ClientConfig>): Promise<ClientConfig>;
    selectDownloadDirectory(): Promise<string | null>;
    testConnection(url: string, token: string): Promise<{ success: boolean; message?: string; libraryName?: string }>;
    addRemoteLibrary(name: string, url: string, token: string): Promise<any>;
    downloadRemoteMedia(url: string, filename: string, options?: { notificationId?: string }): Promise<{ success: boolean; path?: string; message?: string }>;
    uploadRemoteMedia(url: string, token: string, filePaths: string[], metadata?: any, options?: { notificationId?: string }): Promise<{ success: boolean; results?: any[]; message?: string }>;
    renameRemoteMedia(url: string, token: string, id: number, newName: string): Promise<any>;
    deleteRemoteMedia(url: string, token: string, id: number, options?: { permanent?: boolean }): Promise<any>;
    updateRemoteMedia(url: string, token: string, id: number, updates: any): Promise<any>;
    createRemoteTag(url: string, token: string, name: string): Promise<Tag>;
    deleteRemoteTag(url: string, token: string, id: number): Promise<void>;
    addRemoteTagToMedia(url: string, token: string, mediaId: number, tagId: number): Promise<void>;
    addRemoteTagsToMedia(url: string, token: string, mediaIds: number[], tagIds: number[]): Promise<void>;
    removeRemoteTagFromMedia(url: string, token: string, mediaId: number, tagId: number): Promise<void>;

    // === 自動アップデート ===
    checkForUpdates(): Promise<any>;
    downloadUpdate(): Promise<any>;
    quitAndInstall(): Promise<void>;
    onUpdateStatus(callback: (data: { status: string; info?: any }) => void): () => void;

    on(channel: string, func: (...args: any[]) => void): () => void;

    // ウィンドウ操作
    minimizeWindow(): Promise<void>;
    maximizeWindow(): Promise<void>;
    closeWindow(): Promise<void>;

    // アプリケーション情報
    getAppVersion(): Promise<string>;

    // FFmpeg
    getFFmpegInfo(): Promise<{ version: string; path: string }>;
    checkFFmpegUpdate(): Promise<{ available: boolean; version?: string; url?: string }>;
    updateFFmpeg(url: string): Promise<boolean>;
    onFFmpegUpdateProgress(callback: (progress: number) => void): () => void;

    // その他
    focusWindow(): Promise<void>;

    // Discord RPC
    updateDiscordActivity(activity: any): Promise<void>;
    clearDiscordActivity(): Promise<void>;

    getAuditLogs(libraryPath: string): Promise<any[]>;

    // Audio
    getAudioDevices(): Promise<{ name: string, description: string }[]>;
    setAudioDevice(deviceName: string): Promise<void>;
    setExclusiveMode(enabled: boolean): Promise<void>;
    playAudio(filePath?: string): Promise<void>;
    pauseAudio(): Promise<void>;
    resumeAudio(): Promise<void>;
    stopAudio(): Promise<void>;
    seekAudio(time: number): Promise<void>;
    setAudioVolume(volume: number): Promise<void>;
}
