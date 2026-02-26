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

        // ファイル選択
        selectFile: (options) => ipcRenderer.invoke('select-file', options),

        // メディアファイル操作
        scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
        getMediaFiles: () => ipcRenderer.invoke('get-media-files'),
        getMediaFile: (id) => ipcRenderer.invoke('get-media-file', id),

        // タグ操作
        getTags: () => ipcRenderer.invoke('get-tags'),
        createTag: (name) => ipcRenderer.invoke('create-tag', name),
        deleteTag: (id) => ipcRenderer.invoke('delete-tag', id),
        addTagToMedia: (mediaId, tagId) => ipcRenderer.invoke('add-tag-to-media', mediaId, tagId),
        addTagsToMedia: (mediaIds, tagIds) => ipcRenderer.invoke('add-tags-to-media', mediaIds, tagIds),
        removeTagFromMedia: (mediaId, tagId) => ipcRenderer.invoke('remove-tag-from-media', mediaId, tagId),
        updateTagGroup: (tagId, groupId) => ipcRenderer.invoke('update-tag-group', tagId, groupId),

        // タググループ操作
        getTagGroups: () => ipcRenderer.invoke('get-tag-groups'),
        createTagGroup: (name) => ipcRenderer.invoke('create-tag-group', name),
        deleteTagGroup: (id) => ipcRenderer.invoke('delete-tag-group', id),
        renameTagGroup: (id, name) => ipcRenderer.invoke('rename-tag-group', id, name),

        // ライブラリ管理
        refreshLibrary: () => ipcRenderer.invoke('refresh-library'),
        onRefreshProgress: (callback) => {
            const handler = (_event, current, total) => callback(current, total)
            ipcRenderer.on('refresh-progress', handler)
            return () => ipcRenderer.removeListener('refresh-progress', handler) // クリーンアップ関数を返す
        },
        getAuditLogs: (libraryPath) => ipcRenderer.invoke('get-audit-logs', libraryPath),

        // リモート接続
        // ジャンル操作
        getFolders: () => ipcRenderer.invoke('get-folders'),
        createFolder: (name, parentId) => ipcRenderer.invoke('create-folder', name, parentId),
        deleteFolder: (id) => ipcRenderer.invoke('delete-folder', id),
        renameFolder: (id, newName) => ipcRenderer.invoke('rename-folder', id, newName),
        addFolderToMedia: (mediaId, folderId) => ipcRenderer.invoke('add-folder-to-media', mediaId, folderId),
        removeFolderFromMedia: (mediaId, folderId) => ipcRenderer.invoke('remove-folder-from-media', mediaId, folderId),
        updateFolderStructure: (updates) => ipcRenderer.invoke('update-folder-structure', updates),

        // サムネイル生成
        generateThumbnail: (mediaId, filePath) => ipcRenderer.invoke('generate-thumbnail', mediaId, filePath),

        moveToTrash: (id) => ipcRenderer.invoke('move-to-trash', id),
        restoreFromTrash: (id) => ipcRenderer.invoke('restore-from-trash', id),
        deletePermanently: (id) => ipcRenderer.invoke('delete-permanently', id),
        updateLastPlayed: (id) => ipcRenderer.invoke('update-last-played', id),

        // インポート
        importMedia: (filePaths) => ipcRenderer.invoke('import-media', filePaths),
        checkImportDuplicates: (filePaths) => ipcRenderer.invoke('check-import-duplicates', filePaths),
        checkEntryDuplicates: (mediaId) => ipcRenderer.invoke('check-entry-duplicates', mediaId),
        checkEntryDuplicates: (mediaId) => ipcRenderer.invoke('check-entry-duplicates', mediaId),
        findLibraryDuplicates: (criteria) => ipcRenderer.invoke('find-library-duplicates', criteria),
        refreshMediaMetadata: (ids) => ipcRenderer.invoke('refresh-media-metadata', ids),
        scanFileSystemOrphans: () => ipcRenderer.invoke('scan-filesystem-orphans'),
        deleteFileSystemFiles: (paths) => ipcRenderer.invoke('delete-filesystem-files', paths),

        // コメント
        addComment: (mediaId, text, time) => ipcRenderer.invoke('add-comment', mediaId, text, time),
        getComments: (mediaId) => ipcRenderer.invoke('get-comments', mediaId),

        // プレビュー
        generatePreviews: (mediaId) => ipcRenderer.invoke('generate-previews', mediaId),
        extractSingleFrame: (filePath, timeSeconds, width) => ipcRenderer.invoke('extract-single-frame', filePath, timeSeconds, width),

        // ファイル操作
        openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
        openExternal: (url) => ipcRenderer.invoke('open-external', url),
        showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
        openWith: (filePath) => ipcRenderer.invoke('open-with', filePath),
        copyFile: (filePath) => ipcRenderer.invoke('copy-file', filePath),
        copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
        renameMedia: (mediaId, newName) => ipcRenderer.invoke('rename-media', mediaId, newName),
        updateRating: (mediaId, rating) => ipcRenderer.invoke('update-rating', mediaId, rating),
        backfillMetadata: () => ipcRenderer.invoke('backfill-metadata'),
        updateArtist: (mediaId, artist) => ipcRenderer.invoke('update-artist', mediaId, artist),
        updateDescription: (mediaId, description) => ipcRenderer.invoke('update-description', mediaId, description),
        updateUrl: (mediaId, url) => ipcRenderer.invoke('update-url', mediaId, url),
        exportMedia: (mediaId, options) => ipcRenderer.invoke('export-media', mediaId, options),
        updateMedia: (mediaId, updates) => ipcRenderer.invoke('update-media', mediaId, updates),
        getSelectedMedia: () => ipcRenderer.invoke('get-selected-media'),
        copyMediaToLibrary: (mediaIds, libraryPath, settings, options) => ipcRenderer.invoke('copy-media-to-library', mediaIds, libraryPath, settings, options),

        // キャプチャ
        onTriggerFrameCapture: (callback) => {
            const subscription = (_event, action) => callback(action);
            ipcRenderer.on('trigger-frame-capture', subscription);
            // クリーンアップ関数を返す
            return () => ipcRenderer.off('trigger-frame-capture', subscription);
        },
        copyFrameToClipboard: (dataUrl) => ipcRenderer.invoke('copy-frame-to-clipboard', dataUrl),
        copyFileToClipboard: (filePath) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
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

        // プラグイン・拡張機能操作
        pluginFetch: (url, options) => ipcRenderer.invoke('plugin:fetch', url, options),
        savePluginMediaData: (mediaId, pluginId, data) => ipcRenderer.invoke('plugin:saveMediaData', mediaId, pluginId, data),
        loadPluginMediaData: (mediaId, pluginId) => ipcRenderer.invoke('plugin:loadMediaData', mediaId, pluginId),
        getPluginScripts: () => ipcRenderer.invoke('plugin:getScripts'),
        installPlugin: () => ipcRenderer.invoke('plugin:install'),
        uninstallPlugin: (pluginId) => ipcRenderer.invoke('plugin:uninstall', pluginId),
        saveCommentFile: (filePath, data) => ipcRenderer.invoke('plugin:saveCommentFile', filePath, data),
        loadCommentFile: (filePath) => ipcRenderer.invoke('plugin:loadCommentFile', filePath),

        // ユーザー管理
        getSharedUsers: () => ipcRenderer.invoke('get-shared-users'),
        getRemoteSharedUsers: (params) => ipcRenderer.invoke('get-remote-shared-users', params),
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
        downloadRemoteMedia: (url, filename, options) => ipcRenderer.invoke('download-remote-media', url, filename, options),
        uploadRemoteMedia: (url, token, filePaths, options) => ipcRenderer.invoke('upload-remote-media', { url, token, filePaths, options }),
        renameRemoteMedia: (url, token, id, newName) => ipcRenderer.invoke('rename-remote-media', { url, token, id, newName }),
        deleteRemoteMedia: (url, token, id, options) => ipcRenderer.invoke('delete-remote-media', { url, token, id, options }),
        updateRemoteMedia: (url, token, id, updates) => ipcRenderer.invoke('update-remote-media', { url, token, id, updates }),
        createRemoteTag: (url, token, name) => ipcRenderer.invoke('create-remote-tag', { url, token, name }),
        deleteRemoteTag: (url, token, id) => ipcRenderer.invoke('delete-remote-tag', { url, token, id }),
        addRemoteTagToMedia: (url, token, mediaId, tagId) => ipcRenderer.invoke('add-remote-tag-to-media', { url, token, mediaId, tagId }),
        addRemoteTagsToMedia: (url, token, mediaIds, tagIds) => ipcRenderer.invoke('add-remote-tags-to-media', { url, token, mediaIds, tagIds }),
        removeRemoteTagFromMedia: (url, token, mediaId, tagId) => ipcRenderer.invoke('remove-remote-tag-from-media', { url, token, mediaId, tagId }),

        updateRemoteProfile: (url, token, nickname, iconUrl) => ipcRenderer.invoke('update-remote-profile', { url, token, nickname, iconUrl }),

        // === 自動アップデート ===
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

        // === 親子関係（複数親対応） ===
        addMediaParent: (childId, parentId) => ipcRenderer.invoke('add-media-parent', childId, parentId),
        removeMediaParent: (childId, parentId) => ipcRenderer.invoke('remove-media-parent', childId, parentId),
        searchMediaFiles: (query, targets) => ipcRenderer.invoke('search-media-files', query, targets),
        downloadUpdate: () => ipcRenderer.invoke('download-update'),
        quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
        onUpdateStatus: (callback) => {
            const subscription = (_event, data) => callback(data);
            ipcRenderer.on('update-status', subscription);
            return () => ipcRenderer.off('update-status', subscription);
        },
        getAppVersion: () => ipcRenderer.invoke('get-app-version'), // バージョン情報取得

        // === FFmpeg ===
        getFFmpegInfo: () => ipcRenderer.invoke('ffmpeg-get-info'),
        checkFFmpegUpdate: () => ipcRenderer.invoke('ffmpeg-check-update'),
        updateFFmpeg: (url) => ipcRenderer.invoke('ffmpeg-update', url),
        onFFmpegUpdateProgress: (callback) => {
            const subscription = (_event, progress) => callback(progress);
            ipcRenderer.on('ffmpeg-update-progress', subscription);
            return () => ipcRenderer.off('ffmpeg-update-progress', subscription);
        },


        // Discord RPC
        updateDiscordActivity: (activity) => ipcRenderer.invoke('discord-update-activity', activity),
        clearDiscordActivity: () => ipcRenderer.invoke('discord-clear-activity'),

        // Audio
        getAudioDevices: () => ipcRenderer.invoke('audio:get-devices'),
        setAudioDevice: (deviceName) => ipcRenderer.invoke('audio:set-device', deviceName),
        setExclusiveMode: (enabled) => ipcRenderer.invoke('audio:set-exclusive', enabled),
        playAudio: (filePath) => ipcRenderer.invoke('audio:play', filePath),
        pauseAudio: () => ipcRenderer.invoke('audio:pause'),
        resumeAudio: () => ipcRenderer.invoke('audio:resume'),
        stopAudio: () => ipcRenderer.invoke('audio:stop'),
        seekAudio: (time) => ipcRenderer.invoke('audio:seek', time),
        setAudioVolume: (volume) => ipcRenderer.invoke('audio:set-volume', volume),

        // ウィンドウ操作
        minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
        maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
        closeWindow: () => ipcRenderer.invoke('window-close'),
        focusWindow: () => ipcRenderer.invoke('focus-window'),

        // ダイアログ・通知
        showNotification: (options) => ipcRenderer.send('show-notification', options),
        showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),

        // 汎用イベントリスナー (ホワイトリスト形式)
        on: (channel, callback) => {
            const validChannels = ['trigger-import', 'auto-import-complete', 'auto-import-collision', 'export-progress', 'download-progress', 'notification-progress', 'audio:time-update', 'audio:duration-update', 'audio:pause-update', 'audio:ended'];
            if (validChannels.includes(channel)) {
                // 自動的に購読解除できるようにラッパーを返すか、あるいは単純にonするか
                // App.tsxの実装を見ると removeListener は使っていないようなので、
                // ここでは単純に callback を登録する。
                // ただし、useEffectのクリーンアップで解除できないとメモリリークの可能性がある。
                // App.tsx では window.electronAPI.on(...) としているだけで、返り値を見ていない。
                // preload側で subscription を管理するのは難しいので、
                // ここは単純に ipcRenderer.on する。
                // メモリリーク防止のためには本当は off も必要だが、
                // App.tsx は現状 removeListener していない（依存配列で再作成されるが...）
                // 確認すると App.tsx には removeListener のロジックがない。
                // 暫定対応として on を実装する。
                const subscription = (event, ...args) => {
                    if (typeof callback === 'function') {
                        try {
                            // Defensive check for args
                            const safeArgs = Array.isArray(args) ? args : [];
                            callback(event, ...safeArgs);
                        } catch (err) {
                            console.error('[Preload] Error in event handler:', err);
                        }
                    }
                };
                ipcRenderer.on(channel, subscription);

                // 解除用関数を返す（App.tsxが使えば使える）
                return () => ipcRenderer.removeListener(channel, subscription);
            }
        },
    });


    console.log('✅ [Preload] Electron API successfully exposed to renderer.');
} catch (error) {
    console.error('❌ [Preload] Failed to expose Electron API:', error);
}

// テーマ適用完了後にメインプロセスへ通知し、ウィンドウ表示を許可する
// DOMContentLoadedはindex.htmlの<head>内インラインスクリプト（テーマ適用）実行後に発火する
window.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.send('renderer-ready');
});
