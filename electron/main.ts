import { app, BrowserWindow, dialog, ipcMain, protocol, shell, clipboard, Menu, MenuItem, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { initDatabase, mediaDB, tagDB, tagFolderDB, genreDB, libraryDB, commentDB } from './database'
import { generatePreviewImages, getVideoMetadata } from './ffmpeg'
import { initErrorLogger } from './error-logger'
import { initSharedLibrary, serverConfigDB, sharedUserDB, ServerConfig, SharedUser } from './shared-library'
import { startServer, stopServer, isServerRunning } from './server'
import { getHardwareId, generateUserToken } from './crypto-utils'
import { initClientSettings, getConfig as getClientConfig, updateConfig as updateClientConfig, ClientConfig, RemoteLibrary } from './settings'
import { downloadFile } from './downloader'
import { initUpdater } from './updater'


// 開発環境かどうか
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// クライアント設定初期化
initClientSettings()

// 特権スキームの登録 (app.readyの前に行う必要がある)
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'media',
        privileges: {
            secure: true,
            supportFetchAPI: true,
            bypassCSP: true,
            stream: true
        }
    }
])

let mainWindow: BrowserWindow | null = null

// サポートされるメディアフォーマット
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv']
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma']

// 日本語環境対応: キャッシュディレクトリを英語パスに設定
// 日本語環境対応: キャッシュディレクトリを英語パスに設定
app.setPath('userData', path.join(app.getPath('home'), '.obscura'))
app.setPath('cache', path.join(app.getPath('home'), '.obscura', 'cache'))

function createWindow() {
    // builtファイルからの相対パスで解決
    const preloadPath = path.join(__dirname, 'preload.cjs')

    console.log('--- Electron Window System Info ---')
    console.log('__dirname:', __dirname)
    console.log('Preload path:', preloadPath)
    console.log('Preload exists:', fs.existsSync(preloadPath))

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        title: 'Obscura',
        frame: false, // 枠を削除
        titleBarStyle: 'hidden', // タイトルバーを非表示
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false, // 開発環境でのpreload読み込みを安定させるため無効化
        },
        backgroundColor: '#1a1a1a',
        show: false,
    })

    // ウィンドウ準備完了後に表示
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
        if (mainWindow) {
            initUpdater(mainWindow)
        }
    })

    // 開発環境ではlocalhost、本番環境ではビルドされたファイルを読み込む
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173')
        mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })

    // 右クリックメニュー（コンテキストメニュー）
    mainWindow.webContents.on('context-menu', (_event, params) => {
        const menu = new Menu()

        // 動画上でのクリック時
        if (params.mediaType === 'video') {
            menu.append(new MenuItem({
                label: '現在のフレームをサムネイルに設定',
                click: () => mainWindow?.webContents.send('trigger-frame-capture', 'set-thumbnail')
            }))
            menu.append(new MenuItem({
                label: '現在のフレームをコピー',
                click: () => mainWindow?.webContents.send('trigger-frame-capture', 'copy-frame')
            }))
            menu.append(new MenuItem({
                label: '現在のフレームを保存',
                click: () => mainWindow?.webContents.send('trigger-frame-capture', 'save-frame')
            }))
            menu.append(new MenuItem({ type: 'separator' }))
        }

        // デフォルトのメニュー項目（開発者ツールなど）
        // 開発モードなら「検証」を表示
        if (isDev) {
            menu.append(new MenuItem({
                label: '検証 (Inspect Element)',
                click: () => {
                    mainWindow?.webContents.inspectElement(params.x, params.y)
                }
            }))
        }

        // メニュー項目がある場合のみ表示
        if (menu.items.length > 0) {
            menu.popup({ window: mainWindow || undefined })
        }
    })
}

// アプリ起動時
app.whenReady().then(() => {
    // カスタムプロトコル登録: media://
    protocol.handle('media', async (request) => {
        try {
            console.log(`[Media Protocol] Request URL: ${request.url}`)

            // URLオブジェクトを使用してパスを解析
            const url = new URL(request.url)

            let decodedPath: string
            if (url.hostname) {
                const driveLetter = url.hostname.toUpperCase()
                const pathPart = decodeURIComponent(url.pathname)
                decodedPath = `${driveLetter}:${pathPart}`
            } else {
                decodedPath = decodeURIComponent(url.pathname)
            }

            // Windowsパスの正規化
            const normalizedPath = decodedPath.replace(/\//g, '\\')

            // パス確定
            let finalPath = decodedPath
            if (!fs.existsSync(decodedPath)) {
                if (fs.existsSync(normalizedPath)) {
                    finalPath = normalizedPath
                } else {
                    console.error(`[Media Protocol] File not found: ${decodedPath}`)
                    return new Response('File not found', { status: 404 })
                }
            }

            // MIMEタイプ判定
            const ext = path.extname(finalPath).toLowerCase()
            let contentType = 'video/mp4' // デフォルト
            if (VIDEO_EXTENSIONS.includes(ext)) {
                if (ext === '.mkv') contentType = 'video/x-matroska'
                else if (ext === '.webm') contentType = 'video/webm'
                else if (ext === '.avi') contentType = 'video/x-msvideo'
                else if (ext === '.mov') contentType = 'video/quicktime'
            } else if (AUDIO_EXTENSIONS.includes(ext)) {
                if (ext === '.mp3') contentType = 'audio/mpeg'
                else if (ext === '.wav') contentType = 'audio/wav'
                else if (ext === '.flac') contentType = 'audio/flac'
                else if (ext === '.m4a') contentType = 'audio/mp4'
                else if (ext === '.ogg') contentType = 'audio/ogg'
            }

            // ファイル情報を取得
            const stat = fs.statSync(finalPath)
            const fileSize = stat.size

            // Rangeヘッダーの確認
            const rangeHeader = request.headers.get('range')

            // レスポンス用ストリームを作成するヘルパー関数
            const createResponseStream = (start?: number, end?: number) => {
                const nodeStream = fs.createReadStream(finalPath, { start, end })
                let isDestroyed = false

                return new ReadableStream({
                    start(controller) {
                        nodeStream.on('data', (chunk) => {
                            if (isDestroyed) return
                            try {
                                controller.enqueue(chunk)
                            } catch (e) {
                                // コントローラーが既に閉じられている場合など
                                nodeStream.destroy()
                                isDestroyed = true
                            }
                        })
                        nodeStream.on('end', () => {
                            if (isDestroyed) return
                            try {
                                controller.close()
                                isDestroyed = true
                            } catch (e) { /* ignore */ }
                        })
                        nodeStream.on('error', (err) => {
                            console.error(`[Media Protocol] Stream error for ${finalPath}:`, err)
                            if (isDestroyed) return
                            try {
                                controller.error(err)
                                isDestroyed = true
                            } catch (e) { /* ignore */ }
                        })
                    },
                    cancel() {
                        // ブラウザ側でリクエストが中止された場合
                        if (!isDestroyed) {
                            nodeStream.destroy()
                            isDestroyed = true
                        }
                    }
                })
            }

            if (rangeHeader) {
                const parts = rangeHeader.replace(/bytes=/, '').split('-')
                const start = parseInt(parts[0], 10)
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
                const chunksize = (end - start) + 1

                const webStream = createResponseStream(start, end)

                return new Response(webStream, {
                    status: 206,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize.toString(),
                        'Content-Type': contentType,
                        'Cache-Control': 'no-cache',
                    }
                })
            } else {
                const webStream = createResponseStream()

                return new Response(webStream, {
                    status: 200,
                    headers: {
                        'Accept-Ranges': 'bytes',
                        'Content-Length': fileSize.toString(),
                        'Content-Type': contentType,
                        'Cache-Control': 'no-cache',
                    }
                })
            }
        } catch (error) {
            console.error('[Media Protocol] Internal Error:', error)
            return new Response(`Error: ${error}`, { status: 500 })
        }
    })

    try {
        // 初期化（順序重要: エラーログ → 共有ライブラリ → データベース）
        initErrorLogger()
        initSharedLibrary()

        // サーバー自動起動
        const config = serverConfigDB.getConfig()
        console.log('Server Config Loaded:', JSON.stringify(config))
        if (config.isEnabled) {
            console.log('Auto-starting shared library server...')
            startServer(config.port).catch(err => console.error('Failed to auto-start server:', err))
        }

        initDatabase()
        createWindow()
    } catch (error) {
        console.error('Critical initialization error:', error)
        dialog.showErrorBox('Critical Error', `Failed to initialize application:\n${error}`)
        app.quit()
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

// 全ウィンドウが閉じられた時
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// IPC ハンドラー

// ライブラリ管理
ipcMain.handle('create-library', async (_, name: string, parentPath: string) => {
    return libraryDB.createLibrary(name, parentPath)
})

ipcMain.handle('open-library', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'ライブラリフォルダ (.library) を選択',
    })

    if (result.canceled || result.filePaths.length === 0) {
        return null
    }

    const libraryPath = result.filePaths[0]
    // .library フォルダであることを簡易チェック（必須ではないが親切）
    // if (!libraryPath.endsWith('.library')) ...

    try {
        return libraryDB.addLibraryPath(libraryPath)
    } catch (e) {
        console.error('Failed to open library:', e)
        throw e
    }
})

ipcMain.handle('get-libraries', async () => {
    return libraryDB.getLibraries()
})

ipcMain.handle('set-active-library', async (_, libraryPath: string) => {
    libraryDB.setActiveLibrary(libraryPath)
})

ipcMain.handle('get-active-library', async () => {
    return libraryDB.getActiveLibrary()
})

// フォルダ選択
ipcMain.handle('select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
    })

    if (result.canceled) {
        return null
    }

    return result.filePaths[0]
})

// フォルダスキャン
ipcMain.handle('scan-folder', async (_, folderPath: string) => {
    const mediaFiles: any[] = []

    async function scanDirectory(dirPath: string) {
        try {
            const files = fs.readdirSync(dirPath)

            for (const file of files) {
                const filePath = path.join(dirPath, file)
                const stat = fs.statSync(filePath)

                if (stat.isDirectory()) {
                    // 再帰的にサブディレクトリをスキャン
                    await scanDirectory(filePath)
                } else if (stat.isFile()) {
                    const ext = path.extname(file).toLowerCase()
                    const timestamp = new Date().toISOString()
                    let options: any = {}

                    // 動画ファイル
                    if (VIDEO_EXTENSIONS.includes(ext)) {
                        try {
                            const meta = await getVideoMetadata(filePath)
                            options = {
                                width: meta.width,
                                height: meta.height,
                                duration: meta.duration
                            }
                        } catch (e) {
                            console.error('Failed to get metadata:', e)
                        }

                        const id = mediaDB.addMediaFile(filePath, file, 'video', options)
                        mediaFiles.push({
                            id,
                            file_path: filePath,
                            file_name: file,
                            file_type: 'video',
                            duration: options.duration || null,
                            width: options.width,
                            height: options.height,
                            thumbnail_path: null,
                            created_at: timestamp,
                            file_size: stat.size,
                            rating: 0
                        })
                    }
                    // 音声ファイル
                    else if (AUDIO_EXTENSIONS.includes(ext)) {
                        const id = mediaDB.addMediaFile(filePath, file, 'audio')
                        mediaFiles.push({
                            id,
                            file_path: filePath,
                            file_name: file,
                            file_type: 'audio',
                            duration: null,
                            thumbnail_path: null,
                            created_at: timestamp,
                            file_size: stat.size,
                            rating: 0
                        })
                    }
                }
            }
        } catch (error) {
            console.error('Error scanning directory:', dirPath, error)
        }
    }

    await scanDirectory(folderPath)
    return mediaFiles
})

// メディアインポート
ipcMain.handle('import-media', async (_, filePaths: string[]) => {
    return await mediaDB.importMediaFiles(filePaths)
})

// 全メディアファイル取得
ipcMain.handle('get-media-files', async () => {
    return mediaDB.getAllMediaFiles()
})

ipcMain.handle('update-rating', async (_, mediaId: number, rating: number) => {
    mediaDB.updateRating(mediaId, rating)
})

ipcMain.handle('backfill-metadata', async () => {
    const targets = mediaDB.getVideosMissingMetadata()
    console.log(`[Backfill] Found ${targets.length} videos missing metadata`)

    let count = 0
    for (const media of targets) {
        try {
            const meta = await getVideoMetadata(media.file_path)
            mediaDB.updateVideoMetadata(media.id, meta.width || 0, meta.height || 0, meta.duration || 0)
            count++
        } catch (e) {
            console.error(`[Backfill] Failed to update metadata for ${media.file_name}:`, e)
        }
    }
    console.log(`[Backfill] Completed. Updated ${count} videos.`)
    return count
})

// メディアファイル取得(詳細付き)
ipcMain.handle('get-media-file', async (_, id: number) => {
    return mediaDB.getMediaFileWithDetails(id)
})

// タグ操作
ipcMain.handle('get-tags', async () => {
    return tagDB.getAllTags()
})

ipcMain.handle('create-tag', async (_, name: string) => {
    return tagDB.createTag(name)
})

ipcMain.handle('delete-tag', async (_, id: number) => {
    tagDB.deleteTag(id)
})

ipcMain.handle('add-tag-to-media', async (_, mediaId: number, tagId: number) => {
    tagDB.addTagToMedia(mediaId, tagId)
})

ipcMain.handle('remove-tag-from-media', async (_, mediaId: number, tagId: number) => {
    tagDB.removeTagFromMedia(mediaId, tagId)
})

ipcMain.handle('update-tag-folder', async (_, tagId: number, folderId: number | null) => {
    tagDB.updateTagFolder(tagId, folderId)
})

// タグフォルダ操作
ipcMain.handle('get-tag-folders', async () => {
    return tagFolderDB.getAllTagFolders()
})

ipcMain.handle('create-tag-folder', async (_, name: string) => {
    return tagFolderDB.createTagFolder(name)
})

ipcMain.handle('delete-tag-folder', async (_, id: number) => {
    tagFolderDB.deleteTagFolder(id)
})

ipcMain.handle('rename-tag-folder', async (_, id: number, newName: string) => {
    tagFolderDB.renameTagFolder(id, newName)
})

// ジャンル操作
ipcMain.handle('get-genres', async () => {
    return genreDB.getAllGenres()
})

ipcMain.handle('create-genre', async (_, name: string, parentId?: number | null) => {
    return genreDB.createGenre(name, parentId)
})

ipcMain.handle('delete-genre', (_event, id) => {
    genreDB.deleteGenre(id)
})

ipcMain.handle('rename-genre', (_event, id, newName) => {
    genreDB.renameGenre(id, newName)
})

ipcMain.handle('add-genre-to-media', async (_, mediaId: number, genreId: number) => {
    genreDB.addGenreToMedia(mediaId, genreId)
})

ipcMain.handle('remove-genre-from-media', (_event, mediaId: number, genreId: number) => {
    genreDB.removeGenreFromMedia(mediaId, genreId)
})

ipcMain.handle('update-genre-structure', (_event, updates: { id: number; parentId: number | null; orderIndex: number }[]) => {
    genreDB.updateGenreStructure(updates)
})

// サムネイル生成(ffmpegを使用)
ipcMain.handle('generate-thumbnail', async (_event, mediaId: number, filePath: string) => {
    const { spawn } = require('child_process')
    const fs = require('fs-extra')

    try {
        // サムネイル保存先
        const library = libraryDB.getActiveLibrary()
        if (!library) return null

        const thumbnailDir = path.join(library.path, 'thumbnails')
        if (!fs.existsSync(thumbnailDir)) {
            fs.mkdirSync(thumbnailDir, { recursive: true })
        }

        const thumbnailPath = path.join(thumbnailDir, `${mediaId}.jpg`)

        // 既に存在する場合はスキップ
        if (fs.existsSync(thumbnailPath)) {
            console.log(`[Thumbnail] Already exists: ${thumbnailPath}`)
            return thumbnailPath
        }

        console.log(`[Thumbnail] Generating for: ${filePath}`)

        // まず埋め込みサムネイル(カバーアート)の抽出を試みる
        const extractEmbedded = (): Promise<boolean> => {
            return new Promise((resolve) => {
                // ffmpegで埋め込みカバーアートを抽出
                // -map 0:v:1 は2番目のビデオストリーム(通常カバーアート)
                // または -an -vcodec copy でattached_picを抽出
                const args = [
                    '-i', filePath,
                    '-an',                    // 音声なし
                    '-vcodec', 'mjpeg',       // MJPEG形式で出力
                    '-map', '0:v',            // 全ビデオストリームから
                    '-map', '-0:V',           // メインビデオを除外（attached_picのみ）
                    '-vframes', '1',
                    '-y',
                    thumbnailPath
                ]

                const ffmpeg = spawn('ffmpeg', args)
                let stderr = ''

                ffmpeg.stderr.on('data', (data: Buffer) => {
                    stderr += data.toString()
                })

                ffmpeg.on('close', (code: number) => {
                    if (code === 0 && fs.existsSync(thumbnailPath)) {
                        const stats = fs.statSync(thumbnailPath)
                        if (stats.size > 1000) { // 最低1KB以上のファイルを有効とみなす
                            console.log(`[Thumbnail] Extracted embedded cover: ${thumbnailPath}`)
                            resolve(true)
                            return
                        }
                    }
                    // 失敗した場合はファイルを削除
                    if (fs.existsSync(thumbnailPath)) {
                        fs.unlinkSync(thumbnailPath)
                    }
                    resolve(false)
                })

                ffmpeg.on('error', () => {
                    resolve(false)
                })
            })
        }

        // フレームからサムネイルを生成
        const generateFromFrame = (): Promise<string | null> => {
            return new Promise((resolve) => {
                const args = [
                    '-ss', '3',           // 3秒目から
                    '-i', filePath,
                    '-vframes', '1',      // 1フレームのみ
                    '-q:v', '3',          // 品質（低いほど高品質）
                    '-vf', 'scale=320:-1', // 幅320px
                    '-y',                 // 上書き許可
                    thumbnailPath
                ]

                const ffmpeg = spawn('ffmpeg', args)

                ffmpeg.on('close', (code: number) => {
                    if (code === 0 && fs.existsSync(thumbnailPath)) {
                        console.log(`[Thumbnail] Generated from frame: ${thumbnailPath}`)
                        resolve(thumbnailPath)
                    } else {
                        console.error(`[Thumbnail] Frame capture failed with code ${code}`)
                        resolve(null)
                    }
                })

                ffmpeg.on('error', (err: Error) => {
                    console.error(`[Thumbnail] Error: ${err.message}`)
                    resolve(null)
                })
            })
        }

        // 埋め込みサムネイル抽出を試みる
        const embeddedSuccess = await extractEmbedded()

        // 埋め込みがなければフレームから生成
        if (!embeddedSuccess) {
            const result = await generateFromFrame()
            if (result) {
                mediaDB.updateThumbnail(mediaId, result)
                return result
            }
            return null
        }

        // 埋め込み成功
        mediaDB.updateThumbnail(mediaId, thumbnailPath)
        return thumbnailPath
    } catch (error) {
        console.error('[Thumbnail] Error:', error)
        return null
    }
})

// 新機能ハンドラー
ipcMain.handle('move-to-trash', async (_, id: number) => {
    mediaDB.moveToTrash(id)
})

ipcMain.handle('restore-from-trash', async (_, id: number) => {
    mediaDB.restoreFromTrash(id)
})

ipcMain.handle('delete-permanently', (_, id) => mediaDB.deletePermanently(id))
ipcMain.handle('update-last-played', (_, id) => mediaDB.updateLastPlayed(id))

// ウィンドウ操作
ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize()
})

ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize()
    } else {
        mainWindow?.maximize()
    }
})

ipcMain.handle('window-close', () => {
    mainWindow?.close()
})

// コメント
ipcMain.handle('add-comment', (_, mediaId, text, time) => commentDB.addComment(mediaId, text, time))
ipcMain.handle('get-comments', (_event, mediaId) => {
    return commentDB.getComments(mediaId)
})

// プレビュー生成
ipcMain.handle('generate-previews', async (_event, mediaId: number) => {
    try {
        const media = mediaDB.get(mediaId)
        if (!media) throw new Error('Media not found')

        const interval = 1 // Eagleスタイル: 1秒間隔
        const previewsDir = path.join(app.getPath('userData'), 'previews', `${mediaId}_${interval}s`)

        // 既に生成済みならファイルリストを返す
        if (fs.existsSync(previewsDir)) {
            const files = fs.readdirSync(previewsDir)
                .filter(f => f.startsWith('preview_') && f.endsWith('.jpg'))
                .sort()

            if (files.length > 0) {
                return files.map(f => path.join(previewsDir, f))
            }
        }

        // 生成実行
        const files = await generatePreviewImages(media.file_path, previewsDir, interval)
        return files.map(f => path.join(previewsDir, f))
    } catch (error: any) {
        console.error('Failed to generate previews:', error)
        return [] // 失敗時は空配列を返す（エラーで止まらないように）
    }
})

// ファイル操作

// 規定のアプリで開く
ipcMain.handle('open-path', async (_event, filePath: string) => {
    try {
        await shell.openPath(filePath)
    } catch (error) {
        console.error('Failed to open path:', error)
    }
})

// エクスプローラーで表示
ipcMain.handle('show-item-in-folder', async (_event, filePath: string) => {
    try {
        shell.showItemInFolder(filePath)
    } catch (error) {
        console.error('Failed to show in folder:', error)
    }
})

// 他のプログラムで開く（Windowsの「プログラムから開く」ダイアログ）
ipcMain.handle('open-with', async (_event, filePath: string) => {
    try {
        const { spawn } = require('child_process')
        // Windowsの「プログラムから開く」ダイアログを表示
        spawn('rundll32', ['shell32.dll,OpenAs_RunDLL', filePath], { detached: true })
    } catch (error) {
        console.error('Failed to open with:', error)
    }
})

// ファイルをコピー（クリップボードにファイルとしてコピー）
ipcMain.handle('copy-file', async (_event, filePath: string) => {
    try {
        // Windowsではクリップボードにファイルをコピーするのは複雑なので、
        // パスをコピーするだけにする（または実装に手間がかかる）
        clipboard.writeText(filePath)
        // 将来的にはnative-imageなどを使ってファイルをコピーできるようにする
    } catch (error) {
        console.error('Failed to copy file:', error)
    }
})

// テキストをクリップボードにコピー
ipcMain.handle('copy-to-clipboard', async (_event, text: string) => {
    try {
        clipboard.writeText(text)
    } catch (error) {
        console.error('Failed to copy to clipboard:', error)
    }
})

// メディア名変更
ipcMain.handle('rename-media', async (_event, mediaId: number, newName: string) => {
    try {
        mediaDB.updateFileName(mediaId, newName)
    } catch (error) {
        console.error('Failed to rename media:', error)
    }
})

// 投稿者更新
ipcMain.handle('update-artist', async (_event, mediaId: number, artist: string | null) => {
    try {
        mediaDB.updateArtist(mediaId, artist)
    } catch (error) {
        console.error('Failed to update artist:', error)
    }
})

// 説明更新
ipcMain.handle('update-description', async (_event, mediaId: number, description: string | null) => {
    try {
        mediaDB.updateDescription(mediaId, description)
    } catch (error) {
        console.error('Failed to update description:', error)
    }
})

// ネイティブファイルドラッグ（同期的にipcMain.onを使用）
ipcMain.on('start-drag', (event, filePaths: string[]) => {
    try {
        if (!filePaths || filePaths.length === 0) return

        console.log('[Drag] Starting native drag for:', filePaths)

        // 16x16の透明PNGをnativeImageとして作成
        const iconSize = 16
        const icon = nativeImage.createFromBuffer(
            Buffer.alloc(iconSize * iconSize * 4, 0), // 透明なRGBAバッファ
            { width: iconSize, height: iconSize }
        )

        // 単一ファイルの場合
        if (filePaths.length === 1) {
            console.log('[Drag] Single file drag:', filePaths[0])
            event.sender.startDrag({
                file: filePaths[0],
                icon: icon
            })
        } else {
            // 複数ファイルの場合
            console.log('[Drag] Multiple file drag:', filePaths.length, 'files')
            event.sender.startDrag({
                files: filePaths,
                icon: icon
            } as any)
        }
        console.log('[Drag] Native drag initiated successfully')
    } catch (error) {
        console.error('[Drag] Failed to start drag:', error)
    }
})

// === キャプチャ関連ハンドラー ===

// キャプチャしたフレームをクリップボードにコピー
ipcMain.handle('copy-frame-to-clipboard', async (_event, dataUrl: string) => {
    try {
        const { nativeImage } = require('electron')
        // DataURLからnativeImageを作成
        const image = nativeImage.createFromDataURL(dataUrl)
        clipboard.writeImage(image)
        console.log('[Clipboard] Frame copied successfully')
        return true
    } catch (error) {
        console.error('Failed to copy frame to clipboard:', error)
        return false
    }
})

// キャプチャしたフレームをサムネイルとして保存
ipcMain.handle('set-captured-thumbnail', async (_event, mediaId: number, dataUrl: string) => {
    try {
        const library = libraryDB.getActiveLibrary()
        if (!library) return false

        // DataURLからバッファを作成
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "")
        const buffer = Buffer.from(base64Data, 'base64')

        const thumbnailDir = path.join(library.path, 'thumbnails')
        if (!fs.existsSync(thumbnailDir)) {
            fs.mkdirSync(thumbnailDir, { recursive: true })
        }

        const thumbnailPath = path.join(thumbnailDir, `${mediaId}.jpg`)

        // ファイル書き込み
        fs.writeFileSync(thumbnailPath, buffer)
        console.log(`[Thumbnail] Updated from capture: ${thumbnailPath}`)

        // データベース更新
        mediaDB.updateThumbnail(mediaId, thumbnailPath)
        return thumbnailPath
    } catch (error) {
        console.error('Failed to set captured thumbnail:', error)
        return null
    }
})

// キャプチャしたフレームをファイルとして保存
ipcMain.handle('save-captured-frame', async (_event, dataUrl: string) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return false

    try {
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'フレームを保存',
            defaultPath: `capture_${Date.now()}.png`,
            filters: [
                { name: 'PNG Image', extensions: ['png'] },
                { name: 'JPEG Image', extensions: ['jpg'] }
            ]
        })

        if (filePath) {
            // DataURLからバッファを作成
            const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "")
            const buffer = Buffer.from(base64Data, 'base64')

            fs.writeFileSync(filePath, buffer)
            return true
        }
        return false
    } catch (error) {
        console.error('Failed to save captured frame:', error)
        return false
    }
})

// ファイル選択ダイアログ
ipcMain.handle('select-file', async (_event, options: any) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return null

    const dialogOptions: any = {
        title: options?.title || 'ファイルを選択',
        properties: ['openFile'],
        filters: options?.filters || []
    }

    if (options?.defaultPath) {
        dialogOptions.defaultPath = options.defaultPath
    }

    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, dialogOptions)
        if (canceled || filePaths.length === 0) {
            return null
        }
        return filePaths[0]
    } catch (e) {
        console.error('Failed to open file dialog:', e)
        return null
    }
})

// === ネットワーク共有関連ハンドラー ===

// サーバー設定
ipcMain.handle('get-server-config', async () => {
    return serverConfigDB.getConfig()
})

ipcMain.handle('update-server-config', async (_, updates: Partial<ServerConfig>) => {
    serverConfigDB.updateConfig(updates)
})

ipcMain.handle('reset-host-secret', async () => {
    return serverConfigDB.resetHostSecret()
})

// サーバー操作
ipcMain.handle('start-server', async () => {
    try {
        const config = serverConfigDB.getConfig()
        // 設定で無効になっていても、手動起動された場合は一時的に有効扱いにするか、
        // あるいは設定自体を更新するか。ここは設定を更新して起動するフローにする。
        if (!config.isEnabled) {
            serverConfigDB.updateConfig({ isEnabled: true })
        }
        await startServer(config.port)
        return { success: true }
    } catch (error: any) {
        console.error('Failed to start server:', error)
        return { success: false, error: error.message }
    }
})

ipcMain.handle('stop-server', async () => {
    try {
        await stopServer()
        serverConfigDB.updateConfig({ isEnabled: false })
        return { success: true }
    } catch (error: any) {
        console.error('Failed to stop server:', error)
        return { success: false, error: error.message }
    }
})

ipcMain.handle('get-server-status', async () => {
    return isServerRunning()
})

// ユーザー管理
ipcMain.handle('get-shared-users', async () => {
    return sharedUserDB.getAllUsers()
})

ipcMain.handle('add-shared-user', async (_, user: any) => {
    // ユーザートークンが提供された場合はそれを使用、なければ生成
    const userToken = user.userToken || crypto.randomBytes(16).toString('hex')
    // アクセストークンは常に新規生成
    const accessToken = crypto.randomBytes(32).toString('hex')

    // ユーザー情報にマージ
    const newUser = {
        ...user,
        userToken,
        accessToken,
        isActive: true,
        lastAccessAt: null
    }
    return sharedUserDB.addUser(newUser)
})

ipcMain.handle('delete-shared-user', async (_, userId: string) => {
    sharedUserDB.deleteUser(userId)
})

ipcMain.handle('update-shared-user', async (_, userId: string, updates: Partial<SharedUser>) => {
    sharedUserDB.updateUser(userId, updates)
})

// リモート接続
ipcMain.handle('test-connection', async (_, { url, token }: { url: string; token: string }) => {
    try {
        const baseUrl = url.replace(/\/$/, '')
        const apiUrl = `${baseUrl}/api/media?limit=1`

        // トークンの解析 (UserToken:AccessToken 形式をサポート)
        let userToken = token
        let accessToken = token

        if (token.includes(':')) {
            const parts = token.split(':')
            userToken = parts[0]
            accessToken = parts[1]
        }

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-User-Token': userToken
            }
        })

        if (response.ok) {
            return { success: true }
        } else {
            return { success: false, message: `Status: ${response.status} ${response.statusText}` }
        }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
})

ipcMain.handle('add-remote-library', async (_, { name, url, token }: { name: string; url: string; token: string }) => {
    try {
        const config = getClientConfig()
        const newLib: RemoteLibrary = {
            id: crypto.randomUUID(),
            name,
            url: url.replace(/\/$/, ''),
            token,
            lastConnectedAt: new Date().toISOString()
        }

        // 重複チェック (URL)
        const currentLibs = config.remoteLibraries || []
        if (currentLibs.some(l => l.url === newLib.url)) {
            throw new Error('This remote library is already registered.')
        }

        const updatedLibs = [...currentLibs, newLib]
        updateClientConfig({ remoteLibraries: updatedLibs })
        return newLib
    } catch (e: any) {
        console.error('Failed to add remote library:', e)
        throw e
    }
})

// クライアント機能
ipcMain.handle('get-hardware-id', async () => {
    return getHardwareId()
})

ipcMain.handle('generate-user-token', async () => {
    // 既存のトークンがあればそれを返す（不変性の保証）
    const config = getClientConfig()
    if (config.myUserToken) {
        return config.myUserToken
    }

    // 新規生成して保存
    const hardwareId = await getHardwareId()
    const token = generateUserToken(hardwareId)
    updateClientConfig({ myUserToken: token })
    return token
})

// クライアント設定
ipcMain.handle('get-client-config', async () => {
    return getClientConfig()
})

ipcMain.handle('update-client-config', async (_, updates: Partial<ClientConfig>) => {
    return updateClientConfig(updates)
})

ipcMain.handle('select-download-directory', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return null

    const { filePaths } = await dialog.showOpenDialog(win, {
        title: 'ダウンロード保存先を選択',
        properties: ['openDirectory', 'createDirectory']
    })

    if (filePaths && filePaths.length > 0) {
        return filePaths[0]
    }
    return null
})

ipcMain.handle('download-remote-media', async (_event, url: string, filename: string) => {
    try {
        const config = getClientConfig()
        const saveDir = config.downloadPath || app.getPath('downloads')
        const savedPath = await downloadFile(url, saveDir, filename)
        return { success: true, path: savedPath }
    } catch (error: any) {
        return { success: false, message: error.message }
    }
})
