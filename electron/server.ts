import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { Server as SocketIOServer } from 'socket.io'
import { createServer } from 'http'
import { mediaDB, tagDB, genreDB, libraryDB } from './database'
import { sharedUserDB, auditLogDB, Permission, serverConfigDB } from './shared-library'
import { validateUserToken, validateAccessToken } from './crypto-utils'
import { logError } from './error-logger'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import os from 'os'

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
 * セキュリティ: トークンペアを検証し、ユーザー情報をリクエストに追加
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        // ヘッダーからトークンを取得
        const authHeader = req.headers.authorization
        const userTokenHeader = req.headers['x-user-token'] as string

        // ストリーミングリクエストの場合、URLクエリパラメータからのトークンも許可する（videoタグ用）
        let accessToken = ''
        let userToken = ''

        // IP制限チェック
        const config = serverConfigDB.getConfig()
        const clientIP = req.ip || (req.connection.remoteAddress as string) || ''
        const normalizedIP = clientIP.replace(/^::ffff:/, '')

        if (config.allowedIPs && config.allowedIPs.length > 0) {
            if (!config.allowedIPs.includes(normalizedIP)) {
                console.warn(`[Security] Blocked connection from ${normalizedIP} (Not in allowed IPs)`)
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
            accessToken = authHeader.replace('Bearer ', '')
            userToken = userTokenHeader
        } else if (req.query.accessToken && req.query.userToken) {
            accessToken = req.query.accessToken as string
            userToken = req.query.userToken as string
        } else {
            auditLogDB.addLog({
                userId: 'unknown',
                nickname: 'unknown',
                action: 'auth_failed',
                resourceType: 'auth',
                resourceId: null,
                details: { reason: 'missing_tokens' },
                ipAddress: req.ip || 'unknown',
                success: false,
            })
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'トークンが提供されていません' } })
        }

        // トークンの形式を検証
        const userTokenValidation = validateUserToken(userToken)
        const accessTokenValidation = validateAccessToken(accessToken)

        if (!userTokenValidation.valid || !accessTokenValidation.valid) {
            auditLogDB.addLog({
                userId: 'unknown',
                nickname: 'unknown',
                action: 'auth_failed',
                resourceType: 'auth',
                resourceId: null,
                details: { reason: 'invalid_token_format' },
                ipAddress: req.ip || 'unknown',
                success: false,
            })
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'トークンが無効です' } })
        }

        // トークンペアを検証
        const user = sharedUserDB.verifyTokenPair(userToken, accessToken)

        if (!user) {
            auditLogDB.addLog({
                userId: 'unknown',
                nickname: 'unknown',
                action: 'auth_failed',
                resourceType: 'auth',
                resourceId: null,
                details: { reason: 'token_pair_mismatch' },
                ipAddress: req.ip || 'unknown',
                success: false,
            })
            return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'トークンペアが一致しません' } })
        }

        // 最終アクセス時刻を更新
        sharedUserDB.updateLastAccess(user.id, req.ip || 'unknown')

        // ユーザー情報をリクエストに追加
        req.user = {
            id: user.id,
            nickname: user.nickname,
            iconUrl: user.iconUrl,
            permissions: user.permissions,
            ipAddress: req.ip || 'unknown',
        }

        next()
    } catch (error) {
        logError('auth', 'Auth middleware error', error)
        return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'サーバーエラー' } })
    }
}

/**
 * 権限チェックミドルウェア
 * セキュリティ: 特定の権限を持つユーザーのみアクセスを許可
 */
export function requirePermission(...requiredPermissions: Permission[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: '認証が必要です' } })
            }

            // FULL権限は全てのアクセスを許可
            if (req.user.permissions.includes('FULL')) {
                return next()
            }

            // 必要な権限のいずれかを持っているかチェック
            const hasPermission = requiredPermissions.some(perm => req.user!.permissions.includes(perm))

            if (!hasPermission) {
                try {
                    auditLogDB.addLog({
                        userId: req.user.id,
                        nickname: req.user.nickname,
                        action: 'permission_denied',
                        resourceType: 'permission',
                        resourceId: null,
                        details: { required: requiredPermissions, has: req.user.permissions },
                        ipAddress: req.user.ipAddress,
                        success: false,
                    })
                } catch (e) {
                    // ログ書き込みエラーは無視して403を返す
                    console.error('Failed to write audit log:', e)
                }
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
 * HTTPサーバーを起動
 * セキュリティ: Helmet、CORS、レート制限を適用
 */
export function startServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            // 将来使用予定
            // const _config = serverConfigDB.getConfig()

            expressApp = express()

            // セキュリティヘッダー
            expressApp.use(helmet({
                contentSecurityPolicy: false, // 開発中は無効化するか、調整が必要
                crossOriginEmbedderPolicy: false,
            }))

            // CORS設定
            expressApp.use(cors({
                origin: true,
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Token', 'Range'],
            }))

            // レート制限（DDoS対策）
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000, // 15分
                max: 1000, // 15分間に1000リクエスト
                standardHeaders: true,
                legacyHeaders: false,
                message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'リクエスト回数が多すぎます。しばらく待ってから再試行してください。' } }
            })
            expressApp.use(limiter)

            // JSONパーサー
            expressApp.use(express.json())

            // 静的ファイル提供（サムネイル等）
            // 注意: 認証が必要なため、単なるstaticミドルウェアではなく、認証付きルートとして実装を推奨
            // expressApp.use('/static', express.static(path.join(libraryDB.getActiveLibrary()?.path || '', 'thumbnails')))

            // ヘルスチェック
            expressApp.get('/api/health', (_req, res) => {
                res.json({ status: 'ok', version: '1.0.0', serverTime: new Date().toISOString() })
            })

            // --- API Endpoints ---

            // メディア一覧取得
            expressApp.get('/api/media', authMiddleware, requirePermission('READ_ONLY'), (req: AuthenticatedRequest, res: Response) => {
                try {
                    const page = parseInt(String(req.query.page || '1'))
                    const limit = parseInt(String(req.query.limit || '50'))
                    const search = req.query.search as string

                    let media = mediaDB.getAllMediaFiles()

                    // 検索フィルタ
                    if (search) {
                        const lowerSearch = search.toLowerCase()
                        media = media.filter(m =>
                            m.file_name.toLowerCase().includes(lowerSearch) ||
                            (m.description && m.description.toLowerCase().includes(lowerSearch))
                        )
                    }

                    // ページネーション
                    const startIndex = (page - 1) * limit
                    const endIndex = page * limit
                    const paginatedMedia = media.slice(startIndex, endIndex)

                    res.json({
                        media: paginatedMedia,
                        total: media.length,
                        page,
                        limit,
                        totalPages: Math.ceil(media.length / limit)
                    })
                } catch (error) {
                    logError('api', 'Failed to get media list', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'メディア一覧の取得に失敗しました' } })
                }
            })

            // メディア詳細取得
            expressApp.get('/api/media/:id', authMiddleware, requirePermission('READ_ONLY'), (req: AuthenticatedRequest, res: Response) => {
                try {
                    const id = parseInt(String(req.params.id))
                    const media = mediaDB.getMediaFileWithDetails(id)

                    if (!media) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'メディアが見つかりません' } })
                    }

                    res.json(media)
                } catch (error) {
                    logError('api', 'Failed to get media details', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'メディア詳細の取得に失敗しました' } })
                }
            })

            // タグ一覧取得
            expressApp.get('/api/tags', authMiddleware, requirePermission('READ_ONLY'), (_req: AuthenticatedRequest, res: Response) => {
                try {
                    const tags = tagDB.getAllTags()
                    res.json(tags)
                } catch (error) {
                    logError('api', 'Failed to get tags', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'タグ一覧の取得に失敗しました' } })
                }
            })

            // ユーザープロファイル取得
            expressApp.get('/api/profile', authMiddleware, requirePermission('READ_ONLY'), (req: AuthenticatedRequest, res: Response) => {
                try {
                    if (!req.user) {
                        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '認証が必要です' } })
                    }
                    res.json({
                        id: req.user.id,
                        nickname: req.user.nickname || null,
                        iconUrl: req.user.iconUrl || null,
                        permissions: req.user.permissions
                    })
                } catch (error) {
                    logError('api', 'Failed to get profile', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'プロファイルの取得に失敗しました' } })
                }
            })

            // ユーザープロファイル更新（自分のニックネーム・アイコンを設定）
            expressApp.put('/api/profile', authMiddleware, requirePermission('READ_ONLY'), (req: AuthenticatedRequest, res: Response) => {
                try {
                    if (!req.user) {
                        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '認証が必要です' } })
                    }

                    const { nickname, iconUrl } = req.body

                    // バリデーション
                    if (nickname !== undefined && (typeof nickname !== 'string' || nickname.length > 50)) {
                        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'ニックネームは50文字以内で入力してください' } })
                    }

                    // ユーザー情報を更新
                    const updates: any = {}
                    if (nickname !== undefined) updates.nickname = nickname
                    if (iconUrl !== undefined) updates.iconUrl = iconUrl

                    sharedUserDB.updateUser(req.user.id, updates)

                    auditLogDB.addLog({
                        userId: req.user.id,
                        nickname: nickname || req.user.nickname,
                        action: 'profile_update',
                        resourceType: 'user',
                        resourceId: null,
                        details: { nickname, iconUrl, userId: req.user.id },
                        ipAddress: req.user.ipAddress,
                        success: true,
                    })

                    res.json({ success: true, message: 'プロファイルを更新しました' })
                } catch (error) {
                    logError('api', 'Failed to update profile', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'プロファイルの更新に失敗しました' } })
                }
            })

            // ジャンル一覧取得
            expressApp.get('/api/genres', authMiddleware, requirePermission('READ_ONLY'), (_req: AuthenticatedRequest, res: Response) => {
                try {
                    const genres = genreDB.getAllGenres()
                    res.json(genres)
                } catch (error) {
                    logError('api', 'Failed to get genres', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'ジャンル一覧の取得に失敗しました' } })
                }
            })

            // サムネイル取得
            expressApp.get('/api/thumbnails/:id', authMiddleware, requirePermission('READ_ONLY'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const id = parseInt(String(req.params.id))
                    const media = mediaDB.get(id)

                    if (!media || !media.thumbnail_path) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'サムネイルが見つかりません' } })
                    }

                    if (!fs.existsSync(media.thumbnail_path)) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'サムネイルファイルが見つかりません' } })
                    }

                    res.sendFile(media.thumbnail_path)
                } catch (error) {
                    logError('api', 'Failed to get thumbnail', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'サムネイルの取得に失敗しました' } })
                }
            })

            // メディアストリーミング
            expressApp.get('/api/stream/:id', authMiddleware, requirePermission('READ_ONLY'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const id = parseInt(String(req.params.id))
                    const media = mediaDB.get(id)

                    if (!media) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'メディアが見つかりません' } })
                    }

                    const filePath = media.file_path
                    if (!fs.existsSync(filePath)) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'ファイルが見つかりません' } })
                    }

                    const stat = fs.statSync(filePath)
                    const fileSize = stat.size
                    const range = req.headers.range

                    // MIMEタイプ判定
                    const ext = path.extname(filePath).toLowerCase()
                    let contentType = 'application/octet-stream' // デフォルト
                    if (ext === '.mp4') contentType = 'video/mp4'
                    else if (ext === '.webm') contentType = 'video/webm'
                    else if (ext === '.ogg') contentType = 'video/ogg'
                    else if (ext === '.mp3') contentType = 'audio/mpeg'
                    else if (ext === '.wav') contentType = 'audio/wav'

                    if (range) {
                        const parts = range.replace(/bytes=/, "").split("-")
                        const start = parseInt(parts[0], 10)
                        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
                        const chunksize = (end - start) + 1

                        // 監査ログ（再生開始 - 先頭からのリクエストのみ）
                        if (start === 0 && req.user) {
                            auditLogDB.addLog({
                                userId: req.user.id,
                                nickname: req.user.nickname,
                                action: 'play',
                                resourceType: 'media',
                                resourceId: id,
                                details: { fileName: media.file_name, range },
                                ipAddress: req.user.ipAddress,
                                success: true,
                            })
                        }

                        const file = fs.createReadStream(filePath, { start, end })

                        const head = {
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunksize,
                            'Content-Type': contentType,
                        }

                        res.writeHead(206, head)
                        file.pipe(res)
                    } else {
                        const head = {
                            'Content-Length': fileSize,
                            'Content-Type': contentType,
                        }

                        res.writeHead(200, head)
                        fs.createReadStream(filePath).pipe(res)
                    }
                } catch (error) {
                    logError('api', 'Failed to stream media', error)
                    // ストリーミング開始後はヘッダーを送れない場合があるため、コンソールエラーのみの場合も
                    if (!res.headersSent) {
                        res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'ストリーミングエラー' } })
                    }
                }
            })

            // ダウンロードAPI
            expressApp.get('/api/download/:id', authMiddleware, requirePermission('DOWNLOAD'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const id = parseInt(String(req.params.id))
                    const media = mediaDB.get(id)

                    if (!media) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'メディアが見つかりません' } })
                    }

                    const filePath = media.file_path
                    if (!fs.existsSync(filePath)) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'ファイルが見つかりません' } })
                    }

                    // const fileName = encodeURIComponent(media.file_name) // 日本語ファイル名対応

                    if (req.user) {
                        auditLogDB.addLog({
                            userId: req.user.id,
                            nickname: req.user.nickname,
                            action: 'download',
                            resourceType: 'media',
                            resourceId: id,
                            details: { fileName: media.file_name },
                            ipAddress: req.user.ipAddress,
                            success: true,
                        })
                    }

                    res.download(filePath, media.file_name, (err) => {
                        if (err) {
                            logError('api', 'Download failed', err)
                            if (!res.headersSent) {
                                res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'ダウンロードに失敗しました' } })
                            }
                        }
                    })
                } catch (error) {
                    logError('api', 'Failed to download media', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'サーバーエラー' } })
                }
            })

            // メディアアップロードAPI
            expressApp.post('/api/upload', authMiddleware, requirePermission('UPLOAD'), upload.array('files'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const files = req.files as Express.Multer.File[]
                    if (!files || files.length === 0) {
                        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'ファイルがアップロードされていません' } })
                    }

                    const activeLibrary = libraryDB.getActiveLibrary()
                    if (!activeLibrary) {
                        return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'アクティブなライブラリがありません' } })
                    }

                    const filePaths = files.map(f => f.path)
                    const importedFiles = await mediaDB.importMediaFiles(filePaths)

                    // 一時ファイルの削除
                    filePaths.forEach(p => {
                        if (fs.existsSync(p)) fs.unlinkSync(p)
                    })

                    if (req.user) {
                        auditLogDB.addLog({
                            userId: req.user.id,
                            nickname: req.user.nickname,
                            action: 'upload',
                            resourceType: 'media',
                            resourceId: null,
                            details: { count: importedFiles.length, files: importedFiles.map(f => f.file_name) },
                            ipAddress: req.user.ipAddress,
                            success: true,
                        })
                    }

                    res.status(201).json({
                        message: 'アップロード完了',
                        importedCount: importedFiles.length,
                        files: importedFiles
                    })

                    // イベント通知
                    broadcastMediaUpdate('created', { count: importedFiles.length })
                } catch (error) {
                    logError('api', 'Failed to upload media', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'アップロードに失敗しました' } })
                }
            })

            // メディア情報更新API
            expressApp.put('/api/media/:id', authMiddleware, requirePermission('EDIT'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const id = parseInt(String(req.params.id))
                    const updates = req.body

                    const media = mediaDB.get(id)
                    if (!media) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'メディアが見つかりません' } })
                    }

                    // 更新処理
                    if (updates.rating !== undefined) mediaDB.updateRating(id, updates.rating)
                    if (updates.artist !== undefined) mediaDB.updateArtist(id, updates.artist)
                    if (updates.description !== undefined) mediaDB.updateDescription(id, updates.description)
                    // タイトル変更はファイル名変更を伴うため慎重に
                    // if (updates.file_name) mediaDB.updateFileName(id, updates.file_name)

                    // タグ・ジャンルの更新もここでサポート可能だが、複雑になるため別エンドポイントか、ロジックを分離すべき
                    // 一旦基本的なメタデータのみ

                    if (req.user) {
                        auditLogDB.addLog({
                            userId: req.user.id,
                            nickname: req.user.nickname,
                            action: 'update',
                            resourceType: 'media',
                            resourceId: id,
                            details: { updates },
                            ipAddress: req.user.ipAddress,
                            success: true,
                        })
                    }

                    res.json({ message: '更新しました', media: mediaDB.getMediaFileWithDetails(id) })
                    broadcastMediaUpdate('updated', { id, updates })
                } catch (error) {
                    logError('api', 'Failed to update media', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'メディア情報の更新に失敗しました' } })
                }
            })

            // メディア削除API
            expressApp.delete('/api/media/:id', authMiddleware, requirePermission('FULL'), async (req: AuthenticatedRequest, res: Response) => {
                try {
                    const id = parseInt(String(req.params.id))
                    const media = mediaDB.get(id)
                    if (!media) {
                        return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'メディアが見つかりません' } })
                    }

                    mediaDB.moveToTrash(id)

                    if (req.user) {
                        auditLogDB.addLog({
                            userId: req.user.id,
                            nickname: req.user.nickname,
                            action: 'delete',
                            resourceType: 'media',
                            resourceId: id,
                            details: { permanent: false },
                            ipAddress: req.user.ipAddress,
                            success: true,
                        })
                    }

                    broadcastMediaUpdate('deleted', { id })
                    res.json({ message: 'メディアをゴミ箱に移動しました' })
                } catch (error) {
                    logError('api', 'Failed to delete media', error)
                    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'メディアの削除に失敗しました' } })
                }
            })

            // サーバー設定を確認
            const config = serverConfigDB.getConfig()

            // HTTP/HTTPSサーバーを作成
            if (config.requireHttps && config.sslCertPath && config.sslKeyPath) {
                try {
                    const privateKey = fs.readFileSync(config.sslKeyPath, 'utf8')
                    const certificate = fs.readFileSync(config.sslCertPath, 'utf8')
                    const credentials = { key: privateKey, cert: certificate }

                    // Dynamic import for https to avoid top-level dependency if not used
                    const https = require('https')
                    httpServer = https.createServer(credentials, expressApp)
                    console.log('Shared library server initialized in HTTPS mode')
                } catch (error) {
                    console.error('Failed to load SSL certificates, falling back to HTTP:', error)
                    httpServer = createServer(expressApp)
                }
            } else {
                httpServer = createServer(expressApp)
            }

            // Socket.IOサーバーを作成
            io = new SocketIOServer(httpServer, {
                cors: {
                    origin: true,
                    credentials: true,
                },
            })

            // Socket.IO接続ハンドラー
            io.on('connection', (socket) => {
                const user = (socket.request as any).user
                console.log('Client connected:', socket.id, user ? `(${user.nickname})` : '')
                if (user) {
                    socket.join(`user:${user.id}`)
                    // 権限に応じたルームに参加させることも可能
                }

                socket.on('disconnect', () => {
                    console.log('Client disconnected:', socket.id)
                })
            })

            // Socket.IO認証ミドルウェア
            io.use((socket, next) => {
                const token = socket.handshake.auth.token
                const userToken = socket.handshake.auth.userToken

                if (!token || !userToken) {
                    return next(new Error('Authentication error'))
                }

                const validation = validateAccessToken(token)
                if (!validation.valid) {
                    return next(new Error('Invalid token'))
                }

                const user = sharedUserDB.verifyTokenPair(userToken, token)
                if (!user) {
                    return next(new Error('Invalid credentials'))
                }

                // ソケットオブジェクトにユーザー情報を添付
                (socket.request as any).user = user
                next()
            })

            // サーバーを起動（0.0.0.0で全インターフェースにバインド）
            httpServer.listen(port, '0.0.0.0', () => {
                console.log(`Shared library server started on 0.0.0.0:${port}`)
                resolve()
            })

            httpServer.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    reject(new Error(`ポート ${port} は既に使用されています`))
                } else {
                    reject(error)
                }
            })
        } catch (error) {
            reject(error)
        }
    })
}

/**
 * HTTPサーバーを停止
 */
export function stopServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!httpServer) {
            return resolve()
        }

        // Socket.IOを閉じる
        if (io) {
            io.close()
            io = null
        }

        // HTTPサーバーを閉じる
        httpServer.close((error: any) => {
            if (error) {
                reject(error)
            } else {
                httpServer = null
                expressApp = null
                console.log('Shared library server stopped')
                resolve()
            }
        })
    })
}

/**
 * Expressアプリケーションを取得
 */
export function getExpressApp(): express.Application | null {
    return expressApp
}

/**
 * Socket.IOサーバーを取得
 */
export function getSocketIO(): SocketIOServer | null {
    return io
}

/**
 * 変更を全クライアントに通知する
 */
export function broadcastMediaUpdate(action: 'created' | 'updated' | 'deleted', data: any) {
    if (!io) return

    // 自分自身には送らない等の制御が必要な場合は引数を追加する
    // 現状は全員に送る

    const eventName = `media:${action}`
    io.emit(eventName, data)
    console.log(`Broadcasted ${eventName}`, data.id ? `id=${data.id}` : '')
}

/**
 * サーバーが起動しているかチェック
 */
export function isServerRunning(): boolean {
    return httpServer !== null
}
