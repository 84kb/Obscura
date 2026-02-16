import express, { Request, Response, NextFunction } from 'express'
import { app } from 'electron'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { Server as SocketIOServer } from 'socket.io'
import { createServer } from 'http'
import { libraryRegistry, libraryDB } from './database.ts'
import { sharedUserDB, auditLogDB, Permission, serverConfigDB } from './shared-library.ts'
import { validateUserToken, validateAccessToken } from './crypto-utils'
import { logError, logWarning } from './error-logger'
import fs from 'fs'
import path from 'path'
import multer from 'multer'

import os from 'os'
import { MediaFile, Tag, Folder } from '../src/types'

// 拡張されたRequestインターフェース
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string
        nickname: string
        iconUrl?: string
        permissions: Permission[]
        ipAddress: string
    }
}

let httpServer: any = null
let io: SocketIOServer | null = null
let expressApp: express.Application | null = null

// アップロード設定
const upload = multer({
    dest: path.join(os.tmpdir(), 'obscura-uploads'),
    limits: {
        fileSize: 1024 * 1024 * 1024 * 5 // 5GB制限
    }
})

/**
 * 認証ミドルウェア
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization
        const userTokenHeader = req.headers['x-user-token'] as string

        let accessToken = ''
        let userToken = ''

        const config = serverConfigDB.getConfig()
        const clientIP = req.ip || (req.connection.remoteAddress as string) || ''
        const normalizedIP = clientIP.replace(/^::ffff:/, '')

        if (config.allowedIPs && config.allowedIPs.length > 0) {
            if (!config.allowedIPs.includes(normalizedIP)) {
                logWarning('auth', `[Security] Blocked connection from ${normalizedIP} (Not in allowed IPs)`)
                auditLogDB.addLog({
                    userId: 'unknown',
                    nickname: 'unknown',
                    action: 'auth_failed',
                    resourceType: 'auth',
                    resourceId: null,
                    details: { reason: 'ip_not_allowed', ip: normalizedIP },
                    ipAddress: normalizedIP,
                    success: false,
                })
                return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'このIPアドレスからのアクセスは許可されていません' } })
            }
        }

        if (authHeader && userTokenHeader) {
            accessToken = authHeader.replace(/^Bearer\s+/i, '')
            userToken = userTokenHeader
        } else if (req.query.accessToken && req.query.userToken) {
            accessToken = req.query.accessToken as string
            userToken = req.query.userToken as string
        } else {
            console.warn(`[Auth] Missing token. Headers: ${JSON.stringify(req.headers)}`)
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'トークンが不足しています' } })
        }

        // デバッグログ (一時的)
        console.log(`[AuthDebug] Headers:`, req.headers)
        console.log(`[AuthDebug] Extracted - UserToken: ${userToken.substring(0, 10)}..., AccessToken: ${accessToken.substring(0, 10)}...`)

        const userTokenValidation = validateUserToken(userToken)
        const accessTokenValidation = validateAccessToken(accessToken)

        if (!userTokenValidation.valid || !accessTokenValidation.valid) {
            console.warn(`[AuthDebug] Invalid format - UserToken: ${userTokenValidation.valid}, AccessToken: ${accessTokenValidation.valid}`)
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'トークン形式が無効です' } })
        }

        const user = sharedUserDB.getUserByToken(userToken)
        if (!user) {
            console.warn(`[AuthDebug] User not found for token: ${userToken.substring(0, 10)}...`)
            // DBの中身を少しダンプ (危険だがデバッグのため)
            // console.log('[AuthDebug] All users:', sharedUserDB.getAllUsers().map(u => ({ id: u.id, tokenStart: u.userToken.substring(0,5) })))
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: '認証に失敗しました (User not found)' } })
        }

        if (user.accessToken !== accessToken) {
            console.warn(`[AuthDebug] AccessToken mismatch for user ${user.nickname}. Expected: ${user.accessToken.substring(0, 10)}..., Got: ${accessToken.substring(0, 10)}...`)
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: '認証に失敗しました (Token mismatch)' } })
        }

        if (!user.isActive) {
            console.warn(`[AuthDebug] User ${user.nickname} is inactive`)
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'このユーザーは無効化されています' } })
        }

        sharedUserDB.updateLastAccess(user.id, req.ip || 'unknown')
        req.user = {
            id: user.id,
            nickname: user.nickname,
            iconUrl: user.iconUrl,
            permissions: user.permissions || [],
            ipAddress: normalizedIP,
        }

        next()
    } catch (error) {
        logError('auth', 'Auth middleware error', error)
        return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'サーバーエラー' } })
    }
}

/**
 * 権限チェックミドルウェア
 */
export function requirePermission(...requiredPermissions: Permission[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user) return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: '認証が必要です' } })
            if (req.user.permissions.includes('FULL')) return next()
            const hasPermission = requiredPermissions.some(perm => req.user!.permissions.includes(perm))
            if (!hasPermission) {
                logWarning('auth', `[Permission Denied] User: ${req.user!.nickname} (${req.user!.permissions.join(',')}), Required: ${requiredPermissions.join(',')}`)
                return res.status(403).json({ error: { code: 'INSUFFICIENT_PERMISSION', message: '権限が不足しています' } })
            }
            next()
        } catch (error) {
            logError('auth', 'Permission check error', error)
            return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'サーバーエラー' } })
        }
    }
}

/**
 * リクエストからIDパラメータを安全に取得するヘルパー
 */
function getSafeParams(req: Request) {
    const body = req.body || {}
    const query = req.query || {}
    const params = req.params || {}

    return {
        mediaId: body.mediaId ?? query.mediaId ?? (params.id ? parseInt(String(params.id)) : undefined),
        tagId: body.tagId ?? query.tagId ?? undefined,
        folderId: body.folderId ?? query.folderId ?? undefined,
        mediaIds: body.mediaIds ?? query.mediaIds ?? undefined,
        tagIds: body.tagIds ?? query.tagIds ?? undefined,
    }
}

/**
 * HTTPサーバーを起動
 */
export function startServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const config = serverConfigDB.getConfig()
            const publishPath = config.publishLibraryPath || libraryDB.getActiveLibrary()?.path
            if (!publishPath) {
                return reject(new Error('公開するライブラリが設定されていません'))
            }

            const library = libraryRegistry.getLibrary(publishPath)
            expressApp = express()

            expressApp.use(helmet({
                contentSecurityPolicy: false,
                crossOriginEmbedderPolicy: false,
                crossOriginResourcePolicy: { policy: 'cross-origin' },
            }))
            expressApp.use(cors({
                origin: true,
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Token', 'Range'],
            }))
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000,
                max: 1000,
                standardHeaders: true,
                legacyHeaders: false,
                message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'リクエスト回数が多すぎます。' } }
            })
            expressApp.use(limiter)
            // DataURIでの画像アップロードに対応するため制限緩和
            expressApp.use(express.json({ limit: '50mb' }))

            // アバター画像の静的配信
            const avatarDir = path.join(app.getPath('userData'), 'avatars')
            if (!fs.existsSync(avatarDir)) {
                fs.mkdirSync(avatarDir, { recursive: true })
            }
            expressApp.use('/api/avatars', express.static(avatarDir))

            expressApp.get('/api/health', (_req: Request, res: Response) => {
                res.json({
                    status: 'ok',
                    libraryName: path.basename(library.path).replace(/\.library$/i, ''),
                    version: app.getVersion(),
                    serverTime: new Date().toISOString()
                })
            })



            expressApp.get('/api/media', authMiddleware, requirePermission('READ_ONLY'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const page = parseInt(String(req.query.page || '1'))
                    const limit = parseInt(String(req.query.limit || '50'))
                    const search = req.query.search as string
                    let media = await library.getAllMediaFiles()
                    if (search) {
                        const lowerSearch = search.toLowerCase()
                        media = media.filter((m: MediaFile) => m.file_name.toLowerCase().includes(lowerSearch) || (m.description && m.description.toLowerCase().includes(lowerSearch)))
                    }
                    const startIndex = (page - 1) * limit
                    res.json({
                        media: media.slice(startIndex, startIndex + limit),
                        total: media.length,
                        page, limit,
                        totalPages: Math.ceil(media.length / limit)
                    })
                } catch (error) { res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'エラーが発生しました' } }) }
            })

            expressApp.get('/api/media/:id', authMiddleware, requirePermission('READ_ONLY'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { mediaId: id } = getSafeParams(req)
                    if (id === undefined || isNaN(Number(id))) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: '有効なIDが必要です' } })

                    const media = await library.getMediaFileWithDetails(Number(id))
                    if (!media) return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: '見つかりません' } })
                    res.json(media)
                } catch (e) {
                    logError('api', `GET /api/media/${req.params.id} error`, e)
                    res.status(500).json({ error: { code: 'SERVER_ERROR' } })
                }
            })

            expressApp.get('/api/media/:id/duplicates', authMiddleware, requirePermission('READ_ONLY'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { mediaId: id } = getSafeParams(req)
                    if (id === undefined || isNaN(Number(id))) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: '有効なIDが必要です' } })

                    const duplicates = await library.getDuplicatesForMedia(Number(id))
                    res.json(duplicates)
                } catch (e) {
                    logError('api', `GET /api/media/${req.params.id}/duplicates error`, e)
                    res.status(500).json({ error: { code: 'SERVER_ERROR' } })
                }
            })

            expressApp.post('/api/media/:id/comments', authMiddleware, requirePermission('READ_ONLY'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { mediaId: id } = getSafeParams(req)
                    const { text, time } = req.body || {}
                    if (id === undefined || isNaN(Number(id)) || !text) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'IDとテキストが必要です' } })

                    library.setCurrentOperator(req.user?.nickname || 'Remote User')
                    const comment = await library.addComment(Number(id), text, time, req.user?.nickname || 'Guest')
                    res.status(201).json(comment)
                    if (io) io.emit(`media:comment:${String(id)}`, comment)
                } catch (e) {
                    logError('api', `POST /api/media/${req.params.id}/comments error`, e)
                    res.status(500).json({ error: { code: 'SERVER_ERROR' } })
                }
            })

            expressApp.get('/api/tags', authMiddleware, requirePermission('READ_ONLY'), async (_req, res) => {
                res.json(await library.getAllTags())
            })

            expressApp.get('/api/tag-groups', authMiddleware, requirePermission('READ_ONLY'), async (_req, res) => {
                res.json(await library.getAllTagGroups())
            })

            expressApp.get('/api/folders', authMiddleware, requirePermission('READ_ONLY'), async (_req, res) => {
                res.json(await library.getAllFolders())
            })

            expressApp.get('/api/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
                res.json({ id: req.user?.id, nickname: req.user?.nickname, iconUrl: req.user?.iconUrl, permissions: req.user?.permissions })
            })

            expressApp.put('/api/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
                try {
                    const { nickname, iconUrl } = req.body
                    if (req.user) {
                        sharedUserDB.updateUser(req.user.id, { nickname, iconUrl })
                        res.json({ success: true })
                    }
                } catch (e) { res.status(500).send() }
            })

            expressApp.get('/api/thumbnails/:id', authMiddleware, async (req, res) => {
                const id = req.params.id ? parseInt(String(req.params.id)) : NaN
                if (isNaN(id)) return res.status(400).send()
                const media = await library.getMediaFileWithDetails(id)
                if (!media || !media.thumbnail_path || !fs.existsSync(media.thumbnail_path)) return res.status(404).send()
                res.sendFile(media.thumbnail_path)
            })

            expressApp.get('/api/stream/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
                try {
                    const id = req.params.id ? parseInt(String(req.params.id)) : NaN
                    if (isNaN(id)) return res.status(400).send()
                    const media = await library.getMediaFileWithDetails(id)
                    if (!media || !fs.existsSync(media.file_path)) return res.status(404).send()
                    const stat = fs.statSync(media.file_path); const fileSize = stat.size; const range = req.headers.range
                    const ext = path.extname(media.file_path).toLowerCase()
                    let contentType = 'video/mp4'
                    if (ext === '.mp3') contentType = 'audio/mpeg'

                    if (range) {
                        const parts = range.replace(/bytes=/, "").split("-")
                        const start = parseInt(parts[0], 10)
                        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
                        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': (end - start) + 1, 'Content-Type': contentType })
                        fs.createReadStream(media.file_path, { start, end }).pipe(res)
                    } else {
                        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': contentType })
                        fs.createReadStream(media.file_path).pipe(res)
                    }
                } catch (e) { if (!res.headersSent) res.status(500).send() }
            })

            expressApp.get('/api/download/:id', authMiddleware, requirePermission('DOWNLOAD'), async (req: AuthenticatedRequest, res) => {
                const id = req.params.id ? parseInt(String(req.params.id)) : NaN
                if (isNaN(id)) return res.status(400).send()
                const media = await library.getMediaFileWithDetails(id)
                if (!media || !fs.existsSync(media.file_path)) return res.status(404).send()
                res.download(media.file_path, media.file_name)
            })

            expressApp.post('/api/upload', authMiddleware, requirePermission('UPLOAD'), upload.array('files'), async (req: AuthenticatedRequest, res) => {
                const tempDirs: string[] = []
                try {
                    const files = req.files as Express.Multer.File[]
                    if (!files || files.length === 0) return res.status(400).send()

                    // メタデータのパース
                    let metadataMap: any = {}
                    try {
                        if (req.body.metadata) {
                            metadataMap = JSON.parse(req.body.metadata)
                        }
                    } catch (e) {
                        console.warn('Failed to parse upload metadata:', e)
                    }

                    const pathsToImport = files.map(f => {
                        // 文字化け対策: multerがファイル名を正しくデコードできていない場合の補正
                        // Latin1で解釈されてしまっているUTF-8バイト列を復元する
                        const originalName = Buffer.from(f.originalname, 'latin1').toString('utf8')

                        // ユニークな一時ディレクトリを作成して、そこに元のファイル名で移動する
                        // これにより、インポート時に正しいファイル名が使用され、metadata取得も安定する
                        const uniqueDir = path.join(path.dirname(f.path), `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`)
                        fs.mkdirSync(uniqueDir, { recursive: true })
                        tempDirs.push(uniqueDir)

                        const newPath = path.join(uniqueDir, originalName)
                        fs.renameSync(f.path, newPath)

                        // メタデータマップ用にオリジナル名を一時保存 (importMediaFilesの戻り値と照合するため)
                        // importMediaFilesはMediaFileオブジェクトを返すが、そのfile_nameはoriginalNameと同じはず
                        return newPath
                    })

                    library.setCurrentOperator(req.user?.nickname || 'Remote User')
                    const imported = await library.importMediaFiles(pathsToImport)

                    // メタデータの適用
                    if (imported.length > 0 && Object.keys(metadataMap).length > 0) {
                        console.log(`[Upload] Applying metadata for ${imported.length} files...`)
                        const allTags = await library.getAllTags()
                        const allFolders = await library.getAllFolders()

                        for (const media of imported) {
                            const meta = metadataMap[media.file_name]
                            if (meta) {
                                // Rating
                                if (typeof meta.rating === 'number') {
                                    await library.updateRating(media.id, meta.rating)
                                }
                                // Description
                                if (meta.description) {
                                    await library.updateDescription(media.id, meta.description)
                                }
                                // Tags
                                if (Array.isArray(meta.tags)) {
                                    const tagIds = []
                                    for (const tagName of meta.tags) {
                                        // 名前で検索、なければ作成
                                        let tag = allTags.find((t: Tag) => t.name === tagName)
                                        if (!tag) {
                                            tag = await library.createTag(tagName) // 同期的にタグ作成
                                            // キャッシュ更新（次のループ等のため）
                                            allTags.push(tag)
                                        }
                                        tagIds.push(tag.id)
                                    }
                                    if (tagIds.length > 0) {
                                        await library.addTagsToMedia([media.id], tagIds)
                                    }
                                }
                                // Folders
                                if (Array.isArray(meta.folders)) {
                                    for (const folderName of meta.folders) {
                                        // 名前で検索 (ルートフォルダのみ、または階層構造を表現するならパスで渡す必要があるが、
                                        // 現状の簡易実装ではフラットな名前マッチング、または既存フォルダへの割り当てを行う)
                                        // ここでは「同名のフォルダがあれば入れる、なければルートに作成して入れる」とする
                                        let folder = allFolders.find((f: Folder) => f.name === folderName)
                                        if (!folder) {
                                            folder = await library.createFolder(folderName, null)
                                            allFolders.push(folder)
                                        }
                                        if (folder) {
                                            await library.addFolderToMedia(media.id, folder.id)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    res.status(201).json(imported)
                    if (io) io.emit('library-updated')
                } catch (e) {
                    console.error('Upload error:', e)
                    res.status(500).send()
                } finally {
                    // クリーンアップ: 一時ディレクトリごと削除
                    tempDirs.forEach(d => {
                        try {
                            if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true })
                        } catch (e) {
                            console.error('Failed to cleanup temp dir:', d, e)
                        }
                    })
                }
            })

            expressApp.put('/api/media/:id', authMiddleware, requirePermission('EDIT'), async (req: AuthenticatedRequest, res) => {
                try {
                    const id = req.params.id ? parseInt(String(req.params.id)) : NaN
                    if (isNaN(id)) return res.status(400).send()
                    const { rating, artist, description, fileName } = req.body

                    library.setCurrentOperator(req.user?.nickname || 'Remote User')
                    if (rating !== undefined) await library.updateRating(id, rating)
                    if (artist !== undefined) await library.updateArtist(id, artist)
                    if (description !== undefined) await library.updateDescription(id, description)

                    if (fileName) {
                        // updateFileName 内で物理リネームとDB更新が行われる
                        await library.updateFileName(id, fileName)
                    }
                    res.json({ success: true })
                    if (io) io.emit('library-updated')
                } catch (e) { res.status(500).send() }
            })

            expressApp.delete('/api/media/:id', authMiddleware, requirePermission('EDIT'), async (req: AuthenticatedRequest, res) => {
                const id = req.params.id ? parseInt(String(req.params.id)) : NaN
                if (isNaN(id)) return res.status(400).send()

                const permanent = req.query.permanent === 'true'

                if (permanent) {
                    // 完全削除にはFULL権限が必要
                    if (!req.user || !req.user.permissions.includes('FULL')) {
                        return res.status(403).json({ error: { code: 'INSUFFICIENT_PERMISSION', message: '完全削除にはFULL権限が必要です' } })
                    }
                    await library.deleteMediaFilesPermanently([id])
                } else {
                    // ゴミ箱移動はEDIT権限でOK (requirePermissionでチェック済み)
                    await library.moveToTrash(id)
                }
                res.json({ success: true })
            })


            // --- タグ操作API (関係) ---
            // ※パラメータ衝突を防ぐため、具体的なパス (/api/tags/media) を変数パス (/api/tags/:id) より前に配置
            expressApp.post('/api/tags/media', authMiddleware, requirePermission('EDIT'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { mediaId, tagId, mediaIds, tagIds } = getSafeParams(req)

                    // 単体追加
                    if (mediaId !== undefined && tagId !== undefined) {
                        await library.addTagToMedia(Number(mediaId), Number(tagId))
                    }
                    // 一括追加
                    else if (mediaIds && tagIds && Array.isArray(mediaIds) && Array.isArray(tagIds)) {
                        await library.addTagsToMedia(mediaIds.map(Number), tagIds.map(Number))
                    }
                    else {
                        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'mediaId, tagId または mediaIds, tagIds が必要です' } })
                    }

                    library.setCurrentOperator(req.user?.nickname || 'Remote User')
                    res.json({ success: true })
                    if (io) io.emit('library-updated')
                } catch (e: any) {
                    logError('api', 'POST /api/tags/media error', e)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: e.message } })
                }
            })

            expressApp.delete('/api/tags/media', authMiddleware, requirePermission('EDIT'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { mediaId, tagId } = getSafeParams(req)
                    if (mediaId === undefined || tagId === undefined) {
                        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'mediaId と tagId が必要です' } })
                    }

                    library.setCurrentOperator(req.user?.nickname || 'Remote User')
                    await library.removeTagFromMedia(Number(mediaId), Number(tagId))
                    res.json({ success: true })
                    if (io) io.emit('library-updated')
                } catch (e: any) {
                    logError('api', 'DELETE /api/tags/media error', e)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: e.message } })
                }
            })

            // --- タグ基本API ---
            expressApp.post('/api/tags', authMiddleware, requirePermission('EDIT'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { name } = req.body || {}
                    if (!name) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: '名前が必要です' } })

                    library.setCurrentOperator(req.user?.nickname || 'Remote User')
                    const tag = await library.createTag(name)
                    res.status(201).json(tag)
                    if (io) io.emit('library-updated')
                } catch (e: any) {
                    logError('api', 'POST /api/tags error', e)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: e.message } })
                }
            })

            expressApp.delete('/api/tags/:id', authMiddleware, requirePermission('EDIT'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { mediaId: id } = getSafeParams(req)
                    if (id === undefined || isNaN(Number(id))) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: '有効なIDが必要です' } })

                    library.setCurrentOperator(req.user?.nickname || 'Remote User')
                    await library.deleteTag(Number(id))
                    res.json({ success: true })
                    if (io) io.emit('library-updated')
                } catch (e: any) {
                    logError('api', `DELETE /api/tags/${req.params.id} error`, e)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: e.message } })
                }
            })

            expressApp.put('/api/profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const { nickname, iconUrl } = req.body
                    if (!req.user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: '認証が必要です' } })

                    const updates: any = {}
                    if (nickname !== undefined) updates.nickname = nickname

                    if (iconUrl !== undefined) {
                        // DataURIの場合はファイルとして保存
                        if (iconUrl && iconUrl.startsWith('data:image')) {
                            try {
                                const matches = iconUrl.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/)
                                if (matches && matches.length === 3) {
                                    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
                                    const buffer = Buffer.from(matches[2], 'base64')
                                    const filename = `${req.user.id}_${Date.now()}.${ext}`
                                    const filePath = path.join(avatarDir, filename)

                                    fs.writeFileSync(filePath, buffer)
                                    updates.iconUrl = `/api/avatars/${filename}`

                                    // 古いアバターの削除（任意実装: 同じユーザーの古いファイルがあれば消すなど）
                                }
                            } catch (e) {
                                console.error('Failed to save avatar:', e)
                                // 失敗したら更新しない、またはエラーを返す？ここでは元の値を維持するかエラーにするか。
                                // クライアント側でエラーハンドリングできるようにエラーを返しても良いが、ここではログのみで続行
                            }
                        } else {
                            updates.iconUrl = iconUrl
                        }
                    }

                    if (Object.keys(updates).length > 0) {
                        sharedUserDB.updateUser(req.user.id, updates)

                        // 現在のリクエストコンテキストのユーザー情報も更新
                        if (updates.nickname !== undefined) req.user.nickname = updates.nickname
                        if (updates.iconUrl !== undefined) req.user.iconUrl = updates.iconUrl
                    }

                    res.json({ success: true, user: req.user })
                    // 自分自身を含む全員に配信（再接続時などに反映されるように）
                    if (io) io.emit('profile-updated', { userId: req.user.id, ...updates })
                } catch (error) {
                    logError('api', 'PUT /api/profile error', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'サーバーエラー' } })
                }
            })

            // グローバルエラーハンドラー (最後の砦)
            expressApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
                logError('server', `Unhandled error at ${req.method} ${req.url}`, err)
                if (res.headersSent) return next(err)
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '予期せぬエラーが発生しました' } })
            })

            if (config.requireHttps && config.sslCertPath && config.sslKeyPath) {
                try {
                    const credentials = { key: fs.readFileSync(config.sslKeyPath, 'utf8'), cert: fs.readFileSync(config.sslCertPath, 'utf8') }
                    httpServer = require('https').createServer(credentials, expressApp)
                } catch (e) {
                    console.warn('Failed to setup HTTPS, falling back to HTTP:', e)
                    httpServer = createServer(expressApp)
                }
            } else {
                httpServer = createServer(expressApp)
            }

            // Socket.io初期化（サーバー起動前に実行）
            io = new SocketIOServer(httpServer, { cors: { origin: true, credentials: true } })
            io.use((socket, next) => {
                const { token, userToken } = socket.handshake.auth
                if (!token || !userToken || !validateAccessToken(token).valid) return next(new Error('Auth error'))
                const user = sharedUserDB.verifyTokenPair(userToken, token)
                if (!user) return next(new Error('Invalid credentials'));
                (socket.request as any).user = user
                next()
            })

            // サーバー起動
            httpServer.listen(port, '0.0.0.0', () => {
                const protocol = config.requireHttps ? 'HTTPS' : 'HTTP'
                console.log(`${protocol} server started on port ${port} with library ${publishPath}`)
                resolve()
            })
        } catch (error) { reject(error) }
    })
}

export function stopServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!httpServer) return resolve()
        if (io) { io.close(); io = null }
        httpServer.close((error: any) => {
            if (error) reject(error)
            else { httpServer = null; expressApp = null; resolve() }
        })
    })
}

export function isServerRunning(): boolean {
    return httpServer !== null && httpServer.listening
}

export function getExpressApp(): express.Application | null {
    return expressApp
}
