const { contextBridge, ipcRenderer } = require('electron');

/**
 * Obscura Preload Script (preload.cjs)
 * 
 * ⚠️ 重要: これがElectronで使用される唯一のpreloadファイルです。
 * main.tsでこのファイルが直接参照されています。
 * 
 * 新しいAPIを追加する場合:
 * 1. このファイル (preload.cjs) にメソッドを追加
 * 2. src/types/index.ts の ElectronAPI interface に型定義を追加
 * 3. electron/main.ts に ipcMain.handle または ipcMain.on ハンドラーを追加
 * 
 * 注意: TypeScriptファイル (preload.ts) は使用されていません。
 * このファイルを直接編集してください。
 */

console.log('🚀 [Preload] Initializing Electron API...');

try {
    contextBridge.exposeInMainWorld('electronAPI', {
        // ライブラリ管理
        createLibrary: (name, parentPath) => ipcRenderer.invoke('create-library', name, parentPath),
        openLibrary: () => ipcRenderer.invoke('open-library'),
        getLibraries: () => ipcRenderer.invoke('get-libraries'),
        setActiveLibrary: (libraryPath) => ipcRenderer.invoke('set-active-library', libraryPath),
        getActiveLibrary: () => ipcRenderer.invoke('get-active-library'),

        // フォルダ選択
        selectFolder: () => ipcRenderer.invoke('select-folder'),

        // メディアファイル操作
        scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
        getMediaFiles: () => ipcRenderer.invoke('get-media-files'),
        getMediaFile: (id) => ipcRenderer.invoke('get-media-file', id),

        // タグ操作
        getTags: () => ipcRenderer.invoke('get-tags'),
        createTag: (name) => ipcRenderer.invoke('create-tag', name),
        deleteTag: (id) => ipcRenderer.invoke('delete-tag', id),
        addTagToMedia: (mediaId, tagId) => ipcRenderer.invoke('add-tag-to-media', mediaId, tagId),
        removeTagFromMedia: (mediaId, tagId) => ipcRenderer.invoke('remove-tag-from-media', mediaId, tagId),
        updateTagFolder: (tagId, folderId) => ipcRenderer.invoke('update-tag-folder', tagId, folderId),

        // タグフォルダ操作
        getTagFolders: () => ipcRenderer.invoke('get-tag-folders'),
        createTagFolder: (name) => ipcRenderer.invoke('create-tag-folder', name),
        deleteTagFolder: (id) => ipcRenderer.invoke('delete-tag-folder', id),
        renameTagFolder: (id, newName) => ipcRenderer.invoke('rename-tag-folder', id, newName),

        // ジャンル操作
        getGenres: () => ipcRenderer.invoke('get-genres'),
        createGenre: (name, parentId) => ipcRenderer.invoke('create-genre', name, parentId),
        deleteGenre: (id) => ipcRenderer.invoke('delete-genre', id),
        renameGenre: (id, newName) => ipcRenderer.invoke('rename-genre', id, newName),
        addGenreToMedia: (mediaId, genreId) => ipcRenderer.invoke('add-genre-to-media', mediaId, genreId),
        removeGenreFromMedia: (mediaId, genreId) => ipcRenderer.invoke('remove-genre-from-media', mediaId, genreId),
        updateGenreStructure: (updates) => ipcRenderer.invoke('update-genre-structure', updates),

        // サムネイル生成
        generateThumbnail: (mediaId, filePath) => ipcRenderer.invoke('generate-thumbnail', mediaId, filePath),

        // アクション
        moveToTrash: (id) => ipcRenderer.invoke('move-to-trash', id),
        restoreFromTrash: (id) => ipcRenderer.invoke('restore-from-trash', id),
        deletePermanently: (id) => ipcRenderer.invoke('delete-permanently', id),
        updateLastPlayed: (id) => ipcRenderer.invoke('update-last-played', id),

        // インポート
        importMedia: (filePaths) => ipcRenderer.invoke('import-media', filePaths),

        // コメント
        addComment: (mediaId, text, time) => ipcRenderer.invoke('add-comment', mediaId, text, time),
        getComments: (mediaId) => ipcRenderer.invoke('get-comments', mediaId),

        // プレビュー
        generatePreviews: (mediaId) => ipcRenderer.invoke('generate-previews', mediaId),

        // ファイル操作
        openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
        showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
        openWith: (filePath) => ipcRenderer.invoke('open-with', filePath),
        copyFile: (filePath) => ipcRenderer.invoke('copy-file', filePath),
        copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
        renameMedia: (mediaId, newName) => ipcRenderer.invoke('rename-media', mediaId, newName),
        updateRating: (mediaId, rating) => ipcRenderer.invoke('update-rating', mediaId, rating),
        backfillMetadata: () => ipcRenderer.invoke('backfill-metadata'),
        updateArtist: (mediaId, artist) => ipcRenderer.invoke('update-artist', mediaId, artist),
        updateDescription: (mediaId, description) => ipcRenderer.invoke('update-description', mediaId, description),

        // キャプチャ
        onTriggerFrameCapture: (callback) => {
            const subscription = (_event, action) => callback(action);
            ipcRenderer.on('trigger-frame-capture', subscription);
            // クリーンアップ関数を返す
            return () => ipcRenderer.off('trigger-frame-capture', subscription);
        },
        copyFrameToClipboard: (dataUrl) => ipcRenderer.invoke('copy-frame-to-clipboard', dataUrl),
        saveCapturedFrame: (dataUrl) => ipcRenderer.invoke('save-captured-frame', dataUrl),
        setCapturedThumbnail: (mediaId, dataUrl) => ipcRenderer.invoke('set-captured-thumbnail', mediaId, dataUrl),

        // ネイティブファイルドラッグ（同期的にsendを使用）
        // ネイティブファイルドラッグ（同期的にsendを使用）
        startDrag: (filePaths) => ipcRenderer.send('start-drag', filePaths),

        // === ネットワーク共有 ===
        // サーバー設定
        getServerConfig: () => ipcRenderer.invoke('get-server-config'),
        updateServerConfig: (updates) => ipcRenderer.invoke('update-server-config', updates),
        resetHostSecret: () => ipcRenderer.invoke('reset-host-secret'),

        // サーバー操作
        startServer: () => ipcRenderer.invoke('start-server'),
        stopServer: () => ipcRenderer.invoke('stop-server'),
        getServerStatus: () => ipcRenderer.invoke('get-server-status'),

        // ユーザー管理
        getSharedUsers: () => ipcRenderer.invoke('get-shared-users'),
        addSharedUser: (user) => ipcRenderer.invoke('add-shared-user', user),
        deleteSharedUser: (userId) => ipcRenderer.invoke('delete-shared-user', userId),
        updateSharedUser: (userId, updates) => ipcRenderer.invoke('update-shared-user', userId, updates),

        // クライアント機能
        getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
        generateUserToken: () => ipcRenderer.invoke('generate-user-token'),

        // クライアント設定
        getClientConfig: () => ipcRenderer.invoke('get-client-config'),
        updateClientConfig: (updates) => ipcRenderer.invoke('update-client-config', updates),
        selectDownloadDirectory: () => ipcRenderer.invoke('select-download-directory'),
        testConnection: (url, token) => ipcRenderer.invoke('test-connection', { url, token }),
        addRemoteLibrary: (name, url, token) => ipcRenderer.invoke('add-remote-library', { name, url, token }),
        downloadRemoteMedia: (url, filename) => ipcRenderer.invoke('download-remote-media', url, filename),

        // === 自動アップデート ===
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
        quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
        onUpdateStatus: (callback) => {
            const subscription = (_event, data) => callback(data);
            ipcRenderer.on('update-status', subscription);
            ipcRenderer.on('update-status', subscription);
            return () => ipcRenderer.off('update-status', subscription);
        },

        // ウィンドウ操作
        minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
        maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
        closeWindow: () => ipcRenderer.invoke('window-close'),
    });

    console.log('✅ [Preload] Electron API successfully exposed to renderer.');
} catch (error) {
    console.error('❌ [Preload] Failed to expose Electron API:', error);
}
