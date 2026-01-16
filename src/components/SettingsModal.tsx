import { useState, useEffect } from 'react'
import { AppSettings, Library } from '../types'
import './SettingsModal.css'

interface SettingsModalProps {
    settings: AppSettings
    onUpdateSettings: (settings: AppSettings) => void
    onClose: () => void
}

// 削除された定義
type Category = 'general' | 'sidebar' | 'controls' | 'viewer' | 'screenshot' | 'shortcuts' | 'notification' | 'password' | 'import' | 'network' | 'developer' | 'media-engine'

interface ApiEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    path: string
    label: string
    description?: string
    params?: { name: string; type: string; desc: string; required?: boolean }[]
    permission?: string
}

const API_ENDPOINTS: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/media',
        label: 'メディア一覧',
        description: 'ライブラリ内のメディアアイテムを検索・取得します。',
        permission: 'read:media',
        params: [
            { name: 'page', type: 'number', desc: 'ページ番号 (デフォルト: 1)', required: false },
            { name: 'limit', type: 'number', desc: '1ページあたりのアイテム数 (デフォルト: 50)', required: false },
            { name: 'search', type: 'string', desc: 'キーワード検索', required: false },
            { name: 'tags', type: 'string[]', desc: 'タグIDの配列 (例: tags=1,2,3)', required: false },
            { name: 'genres', type: 'string[]', desc: 'ジャンルIDの配列 (例: genres=a,b,c)', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/media/:id',
        label: 'メディア詳細',
        description: '特定のメディアアイテムの詳細情報を取得します。',
        permission: 'read:media',
        params: [
            { name: 'id', type: 'string', desc: 'メディアID', required: true },
        ]
    },
    {
        method: 'GET',
        path: '/api/stream/:id',
        label: 'ストリーミング',
        description: '特定のメディアアイテムをストリーミングします。URLクエリパラメータでのトークン指定も可能です。',
        permission: 'read:media',
        params: [
            { name: 'id', type: 'string', desc: 'メディアID', required: true },
            { name: 'accessToken', type: 'string', desc: 'アクセストークン (ヘッダー認証の代替)', required: false },
            { name: 'userToken', type: 'string', desc: 'ユーザートークン (ヘッダー認証の代替)', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/thumbnails/:id',
        label: 'サムネイル',
        description: '特定のメディアアイテムのサムネイル画像を取得します。',
        permission: 'read:media',
        params: [
            { name: 'id', type: 'string', desc: 'メディアID', required: true },
        ]
    },
    {
        method: 'GET',
        path: '/api/download/:id',
        label: 'ダウンロード',
        description: 'メディアファイルをダウンロードします。',
        permission: 'DOWNLOAD',
        params: [
            { name: 'id', type: 'string', desc: 'メディアID', required: true },
        ]
    },
    {
        method: 'POST',
        path: '/api/upload',
        label: 'アップロード',
        description: 'メディアファイルをアップロードします。Multi-part form dataを使用してください。',
        permission: 'UPLOAD',
        params: [
            { name: 'files', type: 'file[]', desc: 'アップロードするファイル（複数可）', required: true }
        ]
    },
    {
        method: 'PUT',
        path: '/api/media/:id',
        label: 'メディア情報更新',
        description: 'メディアのメタデータ（評価、アーティスト、説明など）を更新します。',
        permission: 'EDIT',
        params: [
            { name: 'rating', type: 'number', desc: '評価 (0-5)' },
            { name: 'artist', type: 'string', desc: 'アーティスト名' },
            { name: 'description', type: 'string', desc: '説明文' }
        ]
    },
    {
        method: 'DELETE',
        path: '/api/media/:id',
        label: 'メディア削除',
        description: 'メディアをゴミ箱に移動します。',
        permission: 'FULL',
        params: [
            { name: 'id', type: 'string', desc: 'メディアID', required: true },
        ]
    },
    {
        method: 'GET',
        path: '/api/tags',
        label: 'タグ一覧',
        description: '登録されているすべてのタグのリストを取得します。',
        permission: 'read:tags',
        params: []
    },
    {
        method: 'GET',
        path: '/api/genres',
        label: 'ジャンル一覧',
        description: '登録されているすべてのジャンルのリストを取得します。',
        permission: 'read:genres',
        params: []
    },
]

const PERMISSION_LABELS: Record<string, string> = {
    'READ_ONLY': '閲覧',
    'DOWNLOAD': 'DL',
    'UPLOAD': 'UP',
    'EDIT': '編集',
    'FULL': 'フル'
}

export function SettingsModal({ settings, onUpdateSettings, onClose }: SettingsModalProps) {
    const [activeCategory, setActiveCategory] = useState<Category | 'media-engine'>('viewer')
    const [appVersion, setAppVersion] = useState<string>('Unknown')

    useEffect(() => {
        if (window.electronAPI) {
            (window.electronAPI as any).getAppVersion().then((v: string) => setAppVersion(v))
        }
    }, [])

    const categories: { id: Category; label: string; icon: JSX.Element }[] = [
        { id: 'general', label: 'よく使う', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> },
        { id: 'network', label: 'ネットワーク', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg> },
        { id: 'sidebar', label: 'サイドバー', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg> },
        { id: 'controls', label: 'コントロール', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg> },
        { id: 'viewer', label: 'ビューアー', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> },
        { id: 'screenshot', label: 'スクリーンショット', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> },
        { id: 'shortcuts', label: 'ショートカット', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="6" y1="8" x2="6" y2="8"></line><line x1="10" y1="8" x2="10" y2="8"></line><line x1="14" y1="8" x2="14" y2="8"></line><line x1="18" y1="8" x2="18" y2="8"></line><line x1="6" y1="12" x2="6" y2="12"></line><line x1="10" y1="12" x2="10" y2="12"></line><line x1="14" y1="12" x2="14" y2="12"></line><line x1="18" y1="12" x2="18" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg> },
        { id: 'notification', label: '通知', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> },
        { id: 'password', label: 'パスワード', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> },
        { id: 'import', label: '自動インポート', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> },
        { id: 'media-engine', label: 'メディアエンジン', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> },
        { id: 'developer', label: '開発者', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> },
    ]

    const handleToggle = (key: keyof AppSettings) => {
        onUpdateSettings({
            ...settings,
            [key]: !settings[key]
        })
    }

    // === APIメニュー開閉 State ===
    const [openApiId, setOpenApiId] = useState<string | null>(null)
    const toggleApi = (path: string) => {
        setOpenApiId(openApiId === path ? null : path)
    }

    // データ読み込み
    const [serverConfig, setServerConfig] = useState<any>(null)
    const [sharedUsers, setSharedUsers] = useState<any[]>([])
    const [myUserToken, setMyUserToken] = useState<string>('')
    const [isServerRunning, setIsServerRunning] = useState<boolean>(false)
    const [activeTab, setActiveTab] = useState<'host' | 'client'>('host')
    const [libraries, setLibraries] = useState<Library[]>([])

    // === クライアント設定 State ===
    const [clientConfig, setClientConfig] = useState<any>(null)

    // === アップデート State ===
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded'>('idle')
    const [updateInfo, setUpdateInfo] = useState<any>(null)
    const [downloadProgress, setDownloadProgress] = useState<number>(0)

    useEffect(() => {
        if (!window.electronAPI) return

        // アップデートステータスのリスナー登録
        const unsubscribe = (window.electronAPI as any).onUpdateStatus((data: { status: string; info?: any }) => {
            console.log('Update Status:', data)
            switch (data.status) {
                case 'checking-for-update':
                    setUpdateStatus('checking')
                    break
                case 'update-available':
                    setUpdateStatus('available')
                    setUpdateInfo(data.info)
                    break
                case 'update-not-available':
                    setUpdateStatus('not-available')
                    setUpdateInfo(data.info)
                    break
                case 'error':
                    setUpdateStatus('error')
                    setUpdateInfo(data.info) // error message
                    break
                case 'download-progress':
                    setUpdateStatus('downloading')
                    setDownloadProgress(data.info.percent || 0)
                    break
                case 'update-downloaded':
                    setUpdateStatus('downloaded')
                    setUpdateInfo(data.info)
                    break
            }
        })

        return () => {
            unsubscribe()
        }
    }, [])

    // === Media Engine Settings ===
    const [ffmpegInfo, setFfmpegInfo] = useState<{ version: string; path: string } | null>(null)
    const [ffmpegUpdateStatus, setFfmpegUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'updating' | 'error'>('idle')
    const [ffmpegUpdateProgress, setFfmpegUpdateProgress] = useState(0)

    useEffect(() => {
        if (activeCategory === 'media-engine' && window.electronAPI && (window.electronAPI as any).getFFmpegInfo) {
            (window.electronAPI as any).getFFmpegInfo().then((info: any) => setFfmpegInfo(info))
        }
    }, [activeCategory])

    useEffect(() => {
        if (!window.electronAPI || !(window.electronAPI as any).onFFmpegUpdateProgress) return

        const removeListener = (window.electronAPI as any).onFFmpegUpdateProgress((progress: number) => {
            setFfmpegUpdateProgress(progress)
        })
        return () => {
            if (removeListener) removeListener()
        }
    }, [])

    const handleCheckFFmpegUpdate = async () => {
        if (!window.electronAPI || !(window.electronAPI as any).checkFFmpegUpdate) return
        setFfmpegUpdateStatus('checking')
        try {
            const result = await (window.electronAPI as any).checkFFmpegUpdate()
            if (result.available) {
                setFfmpegUpdateStatus('available')
            } else {
                setFfmpegUpdateStatus('up-to-date')
            }
        } catch (e) {
            console.error(e)
            setFfmpegUpdateStatus('error')
        }
    }

    const handleUpdateFFmpeg = async () => {
        if (!window.electronAPI || !(window.electronAPI as any).updateFFmpeg) return
        setFfmpegUpdateStatus('updating')
        setFfmpegUpdateProgress(0)
        try {
            // Mock URL for now, or real one if implemented
            await (window.electronAPI as any).updateFFmpeg('latest')
            setFfmpegUpdateStatus('idle')
            // Refresh info
            const info = await (window.electronAPI as any).getFFmpegInfo()
            setFfmpegInfo(info)
            alert('FFmpeg update completed!')
        } catch (e: any) {
            console.error(e)
            setFfmpegUpdateStatus('error')
            alert('Update failed: ' + e.message)
        }
    }

    const renderMediaEngineSettings = () => {
        return (
            <div className="settings-page">
                <h3 className="settings-page-title">メディアエンジン</h3>
                <section className="settings-section">
                    <h4 className="section-title">FFmpeg 設定</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">現在のバージョン</span>
                                <span className="settings-description">
                                    {ffmpegInfo?.version || '読み込み中...'}
                                </span>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => {
                                if (ffmpegInfo?.path && window.electronAPI) {
                                    window.electronAPI.copyToClipboard(ffmpegInfo.path)
                                    alert('パスをコピーしました')
                                }
                            }}>
                                パスをコピー
                            </button>
                        </div>
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">バイナリパス</span>
                                <span className="settings-description" style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                    {ffmpegInfo?.path || '...'}
                                </span>
                            </div>
                        </div>
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">アップデート</span>
                                <span className="settings-description">
                                    {ffmpegUpdateStatus === 'checking' && '更新を確認中...'}
                                    {ffmpegUpdateStatus === 'up-to-date' && '最新です'}
                                    {ffmpegUpdateStatus === 'available' && '新しいバージョンが利用可能です'}
                                    {ffmpegUpdateStatus === 'updating' && `更新中... ${ffmpegUpdateProgress}%`}
                                    {ffmpegUpdateStatus === 'error' && 'エラーが発生しました'}
                                    {ffmpegUpdateStatus === 'idle' && '手動で更新を確認できます'}
                                </span>
                            </div>
                            <div>
                                {ffmpegUpdateStatus === 'available' ? (
                                    <button className="btn btn-primary btn-sm" onClick={handleUpdateFFmpeg}>
                                        今すぐ更新
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={handleCheckFFmpegUpdate}
                                        disabled={ffmpegUpdateStatus === 'checking' || ffmpegUpdateStatus === 'updating'}
                                    >
                                        更新を確認
                                    </button>
                                )}
                            </div>
                        </div>
                        {ffmpegUpdateStatus === 'updating' && (
                            <div style={{ padding: '0 20px 20px' }}>
                                <div style={{ height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: '#0ea5e9', width: `${ffmpegUpdateProgress}%`, transition: 'width 0.2s' }}></div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        )
    }

    const handleCheckForUpdates = async () => {
        if (!window.electronAPI) return
        setUpdateStatus('checking')
        try {
            // 15秒のタイムアウトを設定
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timed out')), 15000)
            )

            // アップデートチェック実行
            const resultPromise = (window.electronAPI as any).checkForUpdates()

            // 競合
            const result: any = await Promise.race([resultPromise, timeoutPromise])

            console.log('Update Check Result:', result)

            // イベントが発火せず、結果だけで判断する場合のフォールバック
            // 通常はイベントで処理されるが、念のため
            if (result && result.updateInfo) {
                // バージョン比較などをここで行うのは複雑なので、
                // イベントが来ていない場合は available とみなすか判断が難しい
                // ただ、resultが返ってきた時点で checking のままなら何かおかしい
            }

        } catch (e: any) {
            console.error('Check update failed', e)
            setUpdateStatus('error')
            setUpdateInfo(e.message || 'Check failed')
        }
    }

    const handleDownloadUpdate = async () => {
        if (!window.electronAPI) return
        setUpdateStatus('downloading')
        // download-update IPC does not exist in preload yet?
        // Wait, autoUpdater.downloadUpdate() is needed.
        // We need to add downloadUpdate to preload and updater.ts
        // For now, let's just use "checkForUpdates" triggering if autoDownload is true?
        // No, we set autoDownload=false. So we need an explicit download call.
        try {
            await (window.electronAPI as any).downloadUpdate()
        } catch (e: any) {
            console.error('Download failed', e)
            setUpdateStatus('error')
            setUpdateInfo(e.message)
        }
    }

    const handleQuitAndInstall = async () => {
        if (!window.electronAPI) return
        await (window.electronAPI as any).quitAndInstall()
    }

    // データ読み込み
    useEffect(() => {
        const loadData = async () => {
            if (activeCategory === 'network' && window.electronAPI) {
                try {
                    const config = await window.electronAPI.getServerConfig()
                    setServerConfig(config)
                    const running = await window.electronAPI.getServerStatus()
                    setIsServerRunning(running)
                    const users = await window.electronAPI.getSharedUsers()
                    setSharedUsers(users)

                    // クライアント設定も読み込む（リモートライブラリ一覧用）
                    const cConfig = await (window.electronAPI as any).getClientConfig()
                    setClientConfig(cConfig)

                    // クライアント用トークン (自分のマシン用)
                    const token = await window.electronAPI.generateUserToken()
                    setMyUserToken(token)
                    // ライブラリ一覧を取得
                    const libs = await window.electronAPI.getLibraries()
                    setLibraries(libs)
                } catch (e) {
                    console.error('Failed to load network settings:', e)
                }
            } else if (activeCategory === 'general' && window.electronAPI) {
                try {
                    const config = await (window.electronAPI as any).getClientConfig()
                    setClientConfig(config)
                } catch (e) {
                    console.error('Failed to load client config:', e)
                }
            }
        }
        loadData()
    }, [activeCategory])

    const handleToggleServer = async () => {
        if (!window.electronAPI) return
        try {
            if (isServerRunning) {
                await window.electronAPI.stopServer()
                setIsServerRunning(false)
            } else {
                await window.electronAPI.startServer()
                setIsServerRunning(true)
            }
            // 設定更新
            const config = await window.electronAPI.getServerConfig()
            setServerConfig(config)
        } catch (e) {
            console.error('Failed to toggle server:', e)
        }
    }

    const [inputUserToken, setInputUserToken] = useState('')
    const [newAccessToken, setNewAccessToken] = useState<string | null>(null)
    const [visibleTokens, setVisibleTokens] = useState<Record<string, 'user' | 'access' | null>>({})
    const [newAllowedIP, setNewAllowedIP] = useState('')

    const handleAddIP = () => {
        if (!newAllowedIP || !serverConfig || !window.electronAPI) return
        const currentIPs = serverConfig.allowedIPs || []
        if (currentIPs.includes(newAllowedIP)) return

        const newIPs = [...currentIPs, newAllowedIP]
        setServerConfig({ ...serverConfig, allowedIPs: newIPs })
        window.electronAPI.updateServerConfig({ allowedIPs: newIPs })
        setNewAllowedIP('')
    }

    const handleDeleteIP = (ip: string) => {
        if (!serverConfig || !window.electronAPI) return
        const newIPs = (serverConfig.allowedIPs || []).filter((i: string) => i !== ip)
        setServerConfig({ ...serverConfig, allowedIPs: newIPs })
        window.electronAPI.updateServerConfig({ allowedIPs: newIPs })
    }

    const handleSelectCert = async () => {
        if (!window.electronAPI) return
        const path = await (window.electronAPI as any).selectFile({
            title: 'SSL証明書 (CRT/PEM) を選択',
            filters: [{ name: 'Certificate', extensions: ['crt', 'pem', 'cer'] }]
        })
        if (path) {
            setServerConfig({ ...serverConfig, sslCertPath: path })
            window.electronAPI.updateServerConfig({ sslCertPath: path })
        }
    }

    const handleSelectKey = async () => {
        if (!window.electronAPI) return
        const path = await (window.electronAPI as any).selectFile({
            title: '秘密鍵 (KEY/PEM) を選択',
            filters: [{ name: 'Private Key', extensions: ['key', 'pem'] }]
        })
        if (path) {
            setServerConfig({ ...serverConfig, sslKeyPath: path })
            window.electronAPI.updateServerConfig({ sslKeyPath: path })
        }
    }

    const toggleTokenVisibility = (userId: string, type: 'user' | 'access') => {
        setVisibleTokens(prev => ({
            ...prev,
            [userId]: prev[userId] === type ? null : type
        }))
    }

    const handleAddUser = async () => {
        if (!window.electronAPI || !inputUserToken.trim()) return
        try {
            const user = await window.electronAPI.addSharedUser({
                userToken: inputUserToken.trim(), // ユーザーが提供したトークン
                nickname: '', // ユーザー側で設定するため空
                permissions: ['READ_ONLY'], // デフォルト権限
            } as any)
            setSharedUsers([...sharedUsers, user])
            setInputUserToken('')

            // アクセストークンのみを表示
            setNewAccessToken(user.accessToken)
        } catch (e) {
            console.error('Failed to add user:', e)
        }
    }

    const handleDeleteUser = async (userId: string) => {
        if (!window.electronAPI || !confirm('このユーザーを削除しますか？')) return
        try {
            await window.electronAPI.deleteSharedUser(userId)
            setSharedUsers(sharedUsers.filter(u => u.id !== userId))
        } catch (e) {
            console.error('Failed to delete user:', e)
        }
    }

    const handleTogglePermission = async (userId: string, permission: any) => {
        const user = sharedUsers.find(u => u.id === userId)
        if (!user || !window.electronAPI) return

        let newPermissions: any[] = [...(user.permissions || [])]
        const allPermissions = ['READ_ONLY', 'DOWNLOAD', 'UPLOAD', 'EDIT', 'FULL']

        if (permission === 'FULL') {
            if (newPermissions.includes('FULL')) {
                // FULLをOFFにする -> FULLのみ外す (他は残す)
                newPermissions = newPermissions.filter(p => p !== 'FULL')
            } else {
                // FULLをONにする -> 全てON
                newPermissions = [...allPermissions]
            }
        } else {
            if (newPermissions.includes(permission)) {
                // 個別解除 -> その権限解除 & FULLも解除
                newPermissions = newPermissions.filter(p => p !== permission && p !== 'FULL')
            } else {
                // 個別追加
                newPermissions.push(permission)
            }
        }

        // ユニーク化
        newPermissions = Array.from(new Set(newPermissions))

        try {
            await (window.electronAPI as any).updateSharedUser(userId, { permissions: newPermissions })
            setSharedUsers(sharedUsers.map(u =>
                u.id === userId ? { ...u, permissions: newPermissions } : u
            ))
        } catch (e) {
            console.error('Failed to update permissions:', e)
        }
    }

    const renderUserManagement = () => {
        // アクティブユーザー判定 (5分以内)
        const activeUsers = sharedUsers.filter(u => {
            if (!u.lastAccessAt) return false
            const diff = Date.now() - new Date(u.lastAccessAt).getTime()
            return diff < 5 * 60 * 1000
        })

        return (
            <div className="settings-section" style={{ marginTop: '24px', borderTop: '1px solid #333', paddingTop: '16px' }}>
                <h4 className="section-title">ユーザー管理</h4>

                {/* 接続中ユーザー */}
                <div className="settings-card" style={{ marginBottom: '16px', border: '1px solid #2a2a2c' }}>
                    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                        <span className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activeUsers.length > 0 ? '#10b981' : '#6b7280' }}></span>
                            現在の接続数: {activeUsers.length}
                        </span>
                        {activeUsers.length > 0 && (
                            <div className="active-users-list" style={{ width: '100%', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {activeUsers.map(u => (
                                    <span key={u.id} className="user-badge active" style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {u.nickname || '未指定'}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 新規ユーザー追加 */}
                <div className="settings-card" style={{ marginBottom: '16px' }}>
                    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                        <span className="settings-label">新規ユーザー追加</span>
                        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
                            ユーザーから受け取ったトークンを入力し、アクセストークンを発行してください。
                        </p>
                        <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="ユーザートークンを入力"
                                value={inputUserToken}
                                onChange={e => setInputUserToken(e.target.value)}
                                className="settings-input"
                                style={{ flex: 1, minWidth: 0 }}
                            />
                            <button className="btn btn-primary btn-small" onClick={handleAddUser} disabled={!inputUserToken.trim()} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                                発行
                            </button>
                        </div>
                        {newAccessToken && (
                            <div className="token-display" style={{ width: '100%', backgroundColor: '#18181b', padding: '12px', borderRadius: '6px', border: '1px solid #0ea5e9', position: 'relative' }}>
                                <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>アクセストークンを共有してください（一度しか表示されません）:</p>
                                <code style={{ display: 'block', wordBreak: 'break-all', color: '#fff', fontSize: '14px', marginBottom: '8px' }}>{newAccessToken}</code>
                                <button
                                    onClick={() => {
                                        if (window.electronAPI) window.electronAPI.copyToClipboard(newAccessToken)
                                        setNewAccessToken(null)
                                    }}
                                    className="btn btn-outline btn-small"
                                    style={{ marginTop: '8px' }}
                                >
                                    コピーして閉じる
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 全ユーザーリスト */}
                <div className="settings-card">
                    <span className="settings-label" style={{ marginBottom: '12px', display: 'block' }}>登録ユーザー一覧</span>
                    <div className="users-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sharedUsers.map(u => (
                            <div key={u.id} className="user-card" style={{ backgroundColor: '#18181b', borderRadius: '8px', padding: '12px', border: '1px solid #2a2a2c', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                                    <span style={{ fontWeight: 'bold', color: '#fff', wordBreak: 'break-all', flex: 1, minWidth: 0 }}>{u.nickname || '未指定'}</span>
                                    <button
                                        onClick={() => handleDeleteUser(u.id)}
                                        className="icon-button delete"
                                        title="削除"
                                        style={{ color: '#ef4444', flexShrink: 0 }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                                <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                                    最終アクセス: {u.lastAccessAt ? new Date(u.lastAccessAt).toLocaleString() : '未アクセス'}
                                </div>
                                {/* トークン表示 (スポイラー形式) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '11px', color: '#666' }}>ユーザートークン:</span>
                                            {visibleTokens[u.id] === 'user' && (
                                                <button
                                                    onClick={() => window.electronAPI?.copyToClipboard(u.userToken)}
                                                    className="btn btn-outline btn-small"
                                                >
                                                    コピー
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            onClick={() => toggleTokenVisibility(u.id, 'user')}
                                            style={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '4px', padding: '8px', cursor: 'pointer', color: visibleTokens[u.id] === 'user' ? '#fff' : '#666', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: '1.4' }}
                                        >
                                            {visibleTokens[u.id] === 'user' ? u.userToken : 'クリックして表示'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '11px', color: '#666' }}>アクセストークン:</span>
                                            {visibleTokens[u.id] === 'access' && (
                                                <button
                                                    onClick={() => window.electronAPI?.copyToClipboard(u.accessToken)}
                                                    className="btn btn-outline btn-small"
                                                >
                                                    コピー
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            onClick={() => toggleTokenVisibility(u.id, 'access')}
                                            style={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '4px', padding: '8px', cursor: 'pointer', color: visibleTokens[u.id] === 'access' ? '#fff' : '#666', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: '1.4' }}
                                        >
                                            {visibleTokens[u.id] === 'access' ? u.accessToken : 'クリックして表示'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                                        ※ 接続時は「ユーザートークン:アクセストークン」形式で入力
                                    </div>

                                    {/* 権限管理 */}
                                    <div style={{ marginTop: '12px', borderTop: '1px solid #2a2a2c', paddingTop: '10px' }}>
                                        <span style={{ fontSize: '11px', color: '#666', marginBottom: '6px', display: 'block' }}>権限設定:</span>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {(['READ_ONLY', 'DOWNLOAD', 'UPLOAD', 'EDIT', 'FULL'] as any[]).map((p: any) => (
                                                <button
                                                    key={p}
                                                    onClick={() => handleTogglePermission(u.id, p)}
                                                    style={{
                                                        fontSize: '10px',
                                                        padding: '3px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #333',
                                                        backgroundColor: (u.permissions || []).includes(p) ? '#0ea5e9' : 'transparent',
                                                        color: (u.permissions || []).includes(p) ? '#fff' : '#888',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        fontWeight: (u.permissions || []).includes(p) ? 'bold' : 'normal'
                                                    }}
                                                    title={p}
                                                >
                                                    {PERMISSION_LABELS[p] || p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {sharedUsers.length === 0 && (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                                ユーザーがいません
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // === リモート接続 State ===
    const [remoteUrl, setRemoteUrl] = useState('')
    const [remoteKey, setRemoteKey] = useState('')
    const [remoteName, setRemoteName] = useState('')
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
    const [connectionMsg, setConnectionMsg] = useState('')

    const handleTestConnection = async () => {
        if (!remoteUrl || !remoteKey || !window.electronAPI) return
        setConnectionStatus('testing')
        setConnectionMsg('接続確認中...')
        try {
            const result = await (window.electronAPI as any).testConnection(remoteUrl, remoteKey)
            if (result.success) {
                setConnectionStatus('success')
                setConnectionMsg('接続成功！')
                // ホスト側のライブラリ名を自動反映
                if (result.libraryName && !remoteName) {
                    setRemoteName(result.libraryName)
                }
            } else {
                setConnectionStatus('error')
                setConnectionMsg(`接続失敗: ${result.message}`)
            }
        } catch (e: any) {
            setConnectionStatus('error')
            setConnectionMsg(`エラー: ${e.message}`)
        }
    }

    const handleAddRemoteLibrary = async () => {
        if (connectionStatus !== 'success' || !window.electronAPI) return
        try {
            const name = remoteName.trim() || 'Remote Library'
            await (window.electronAPI as any).addRemoteLibrary(name, remoteUrl, remoteKey)
            // 設定を再読み込み
            const cConfig = await (window.electronAPI as any).getClientConfig()
            setClientConfig(cConfig)
            // フォームリセット
            setRemoteUrl('')
            setRemoteKey('')
            setRemoteName('')
            setConnectionStatus('idle')
            setConnectionMsg('')
            alert('リモートライブラリを追加しました。')
        } catch (e: any) {
            alert(`追加に失敗しました: ${e.message}`)
        }
    }

    const handleDeleteRemoteLibrary = async (lib: any) => {
        if (!window.electronAPI || !confirm(`リモートライブラリ "${lib.name || lib.url}" を削除しますか？`)) return
        try {
            // updateClientConfig でリストから除外して保存
            const currentLibs = clientConfig?.remoteLibraries || []
            const newLibs = currentLibs.filter((l: any) => l.id !== lib.id)
            await (window.electronAPI as any).updateClientConfig({ remoteLibraries: newLibs })
            // local state update
            setClientConfig({ ...clientConfig, remoteLibraries: newLibs })
        } catch (e) {
            console.error('Failed to delete remote lib:', e)
        }
    }

    const renderNetworkSettings = () => {
        if (!serverConfig) return <div className="loading">読み込み中...</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">ネットワーク共有</h3>

                <div className="network-tabs">
                    <button
                        className={`network-tab ${activeTab === 'host' ? 'active' : ''}`}
                        onClick={() => setActiveTab('host')}
                    >
                        ホスト設定 (サーバー)
                    </button>
                    <button
                        className={`network-tab ${activeTab === 'client' ? 'active' : ''}`}
                        onClick={() => setActiveTab('client')}
                    >
                        クライアント設定 (接続)
                    </button>
                </div>

                {activeTab === 'host' ? (
                    <>
                        <section className="settings-section">
                            <h4 className="section-title">サーバー状態</h4>
                            <div className="settings-card">
                                <div className="settings-row">
                                    <div className="settings-info">
                                        <span className="settings-label">ネットワーク共有を有効にする</span>
                                        <span className="settings-description">
                                            {isServerRunning ? '起動中 - 外部からの接続を受け付けています' : '停止中 - 外部からの接続は拒否されます'}
                                        </span>
                                    </div>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={isServerRunning}
                                            onChange={handleToggleServer}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="settings-row">
                                    <div className="settings-info">
                                        <span className="settings-label">ポート番号</span>
                                    </div>
                                    <div className="input-with-button">
                                        <input
                                            type="number"
                                            value={serverConfig.port}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value)
                                                setServerConfig({ ...serverConfig, port: val })
                                                if (window.electronAPI) window.electronAPI.updateServerConfig({ port: val })
                                            }}
                                            disabled={isServerRunning}
                                            className="settings-input"
                                            style={{ width: '100px' }}
                                        />
                                    </div>
                                </div>

                                <div className="settings-row">
                                    <div className="settings-info">
                                        <span className="settings-label">公開するライブラリ</span>
                                        <span className="settings-description">
                                            外部に公開するライブラリを選択します。
                                        </span>
                                    </div>
                                    <div className="input-with-button">
                                        <select
                                            value={serverConfig.publishLibraryPath || ''}
                                            onChange={(e) => {
                                                const val = e.target.value || undefined
                                                const updates = { publishLibraryPath: val }
                                                setServerConfig({ ...serverConfig, ...updates })
                                                if (window.electronAPI) window.electronAPI.updateServerConfig(updates)
                                            }}
                                            className="settings-input"
                                            style={{ width: '200px', height: '32px' }}
                                            disabled={isServerRunning}
                                        >
                                            <option value="">(表示中のライブラリ)</option>
                                            {libraries.map(lib => (
                                                <option key={lib.path} value={lib.path}>
                                                    {lib.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {renderUserManagement()}

                        </section>

                        <section className="settings-section" style={{ marginTop: '24px', borderTop: '1px solid #333', paddingTop: '16px' }}>
                            <h4 className="section-title">セキュリティ設定</h4>


                            {/* IP制限 */}
                            <div className="settings-card" style={{ marginBottom: '16px' }}>
                                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>

                                    <div className="settings-info">
                                        <span className="settings-label">IPアドレス制限 (ホワイトリスト)</span>
                                        <span className="settings-description">
                                            指定したIPアドレスからのアクセスのみを許可します。リストが空の場合はすべてのIPからのアクセスを許可します。
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            placeholder="例: 192.168.1.50"
                                            value={newAllowedIP}
                                            onChange={e => setNewAllowedIP(e.target.value)}
                                            className="settings-input"
                                            style={{ flex: 1, minWidth: 0 }}
                                        />
                                        <button className="btn btn-primary btn-small" onClick={handleAddIP} disabled={!newAllowedIP} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                                            追加
                                        </button>
                                    </div>
                                    {serverConfig.allowedIPs && serverConfig.allowedIPs.length > 0 && (
                                        <div className="users-list" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {serverConfig.allowedIPs.map((ip: string) => (
                                                <div key={ip} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#27272a', padding: '8px 12px', borderRadius: '4px' }}>
                                                    <span style={{ fontFamily: 'monospace' }}>{ip}</span>
                                                    <button
                                                        onClick={() => handleDeleteIP(ip)}
                                                        className="icon-button delete"
                                                        title="削除"
                                                        style={{ color: '#ef4444' }}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 6 6 18"></polyline><polyline points="6 6 18 18"></polyline></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* HTTPS設定 */}
                            <div className="settings-card">
                                <div className="settings-row">
                                    <div className="settings-info">
                                        <span className="settings-label">HTTPS (SSL) 通信を強制</span>
                                        <span className="settings-description">
                                            通信を暗号化します。有効にするには証明書ファイルが必要です。
                                        </span>
                                    </div>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={serverConfig.requireHttps || false}
                                            onChange={(e) => {
                                                const val = e.target.checked
                                                setServerConfig({ ...serverConfig, requireHttps: val })
                                                window.electronAPI?.updateServerConfig({ requireHttps: val })
                                            }}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                {serverConfig.requireHttps && (
                                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid #333' }}>
                                        <div style={{ width: '100%' }}>
                                            <label className="settings-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>SSL証明書 (.crt / .pem)</label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    value={serverConfig.sslCertPath || ''}
                                                    readOnly
                                                    className="settings-input"
                                                    style={{ flex: 1, fontSize: '12px', color: '#aaa' }}
                                                    placeholder="ファイルを選択してください"
                                                />
                                                <button className="btn btn-outline btn-small" onClick={handleSelectCert}>選択</button>
                                            </div>
                                        </div>
                                        <div style={{ width: '100%' }}>
                                            <label className="settings-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>秘密鍵 (.key / .pem)</label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    value={serverConfig.sslKeyPath || ''}
                                                    readOnly
                                                    className="settings-input"
                                                    style={{ flex: 1, fontSize: '12px', color: '#aaa' }}
                                                    placeholder="ファイルを選択してください"
                                                />
                                                <button className="btn btn-outline btn-small" onClick={handleSelectKey}>選択</button>
                                            </div>
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#eab308', marginTop: '4px' }}>
                                            ※ 設定変更後はサーバーの再起動が必要です。
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="settings-section">
                            <h4 className="section-title">自分の接続情報</h4>
                            <div className="settings-card">
                                <p className="settings-description">
                                    このPCへの接続情報です。他のPCから接続する際に入力してください。
                                </p>
                                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                                    <span className="settings-label">ローカルIPアドレス</span>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {serverConfig.allowedIPs && serverConfig.allowedIPs.length > 0 ? (
                                            <code className="code-block" style={{ margin: 0 }}>IPアドレス設定を確認してください</code>
                                        ) : (
                                            <code className="code-block" style={{ margin: 0 }}>{window.location.hostname} (参考)</code>
                                        )}
                                    </div>
                                </div>
                                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', marginTop: '12px' }}>
                                    <span className="settings-label">あなたのユーザートークン</span>
                                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                        <code className="code-block" style={{ flex: 1, margin: 0, wordBreak: 'break-all' }}>
                                            {myUserToken || 'トークン生成中...'}
                                        </code>
                                        <button
                                            className="btn btn-outline btn-small"
                                            onClick={() => {
                                                if (window.electronAPI && myUserToken) {
                                                    window.electronAPI.copyToClipboard(myUserToken)
                                                    alert('コピーしました')
                                                }
                                            }}
                                        >
                                            コピー
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                ) : (
                    // Client Tab
                    <>
                        <section className="settings-section">
                            <h4 className="section-title">リモートライブラリへの接続</h4>
                            <div className="settings-card">
                                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ width: '100%' }}>
                                        <label className="settings-label" style={{ marginBottom: '8px', display: 'block' }}>ホスト URL</label>
                                        <input
                                            type="text"
                                            placeholder="http://192.168.1.10:8765"
                                            value={remoteUrl}
                                            onChange={e => setRemoteUrl(e.target.value)}
                                            className="settings-input"
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <div style={{ width: '100%' }}>
                                        <label className="settings-label" style={{ marginBottom: '8px', display: 'block' }}>アクセストークン (Access Token)</label>
                                        <input
                                            type="password"
                                            placeholder="Paste access token here"
                                            value={remoteKey}
                                            onChange={e => setRemoteKey(e.target.value)}
                                            className="settings-input"
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <div style={{ width: '100%' }}>
                                        <label className="settings-label" style={{ marginBottom: '8px', display: 'block' }}>ライブラリ名</label>
                                        <input
                                            type="text"
                                            placeholder="例: 私のライブラリ (接続成功時に自動入力されます)"
                                            value={remoteName}
                                            onChange={e => setRemoteName(e.target.value)}
                                            className="settings-input"
                                            style={{ width: '100%' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center' }}>
                                        <button
                                            className="btn btn-outline btn-small"
                                            onClick={handleTestConnection}
                                            disabled={!remoteUrl || !remoteKey || connectionStatus === 'testing'}
                                        >
                                            {connectionStatus === 'testing' ? '確認中...' : '接続テスト'}
                                        </button>

                                        {connectionStatus === 'success' && (
                                            <button
                                                className="settings-button primary"
                                                onClick={handleAddRemoteLibrary}
                                                style={{ backgroundColor: '#0ea5e9', border: 'none' }}
                                            >
                                                保存して追加
                                            </button>
                                        )}

                                        {connectionMsg && (
                                            <span style={{
                                                fontSize: '13px',
                                                color: connectionStatus === 'success' ? '#4ade80' : connectionStatus === 'error' ? '#ef4444' : '#aaa'
                                            }}>
                                                {connectionMsg}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="settings-section">
                            <h4 className="section-title">登録済みライブラリ</h4>
                            <div className="settings-card">
                                {clientConfig?.remoteLibraries && clientConfig.remoteLibraries.length > 0 ? (
                                    <div className="users-table" style={{ width: '100%' }}>
                                        {clientConfig.remoteLibraries.map((lib: any) => (
                                            <div key={lib.id} className="settings-row" style={{ borderBottom: '1px solid #333', padding: '12px 0' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{lib.name || 'Remote Library'}</span>
                                                    <span style={{ fontSize: '12px', color: '#888' }}>{lib.url}</span>
                                                    <span style={{ fontSize: '11px', color: '#555' }}>Last connected: {new Date(lib.lastConnectedAt).toLocaleString()}</span>
                                                </div>
                                                <button
                                                    className="icon-button delete"
                                                    onClick={() => handleDeleteRemoteLibrary(lib)}
                                                    title="削除"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="settings-description">登録されたリモートライブラリはありません。</p>
                                )}
                            </div>
                        </section>
                    </>
                )
                }
            </div >
        )
    }

    const renderViewerSettings = () => (
        <div className="settings-page">
            <h3 className="settings-page-title">ビューアー</h3>

            <section className="settings-section">
                <h4 className="section-title">画像</h4>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">拡大中の画像 <span className="help-icon">?</span></span>
                        </div>
                        <div className="radio-group">
                            <label className="radio-item">
                                <input type="radio" name="upscale" />
                                <span className="radio-dot"></span>
                                <span className="radio-label">画素化</span>
                            </label>
                            <label className="radio-item">
                                <input type="radio" name="upscale" defaultChecked />
                                <span className="radio-dot"></span>
                                <span className="radio-label">スムーズ</span>
                            </label>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">最後に閲覧した位置を記憶する</span>
                        </div>
                        <div className="radio-group">
                            <label className="radio-item">
                                <input type="radio" name="lastpos" />
                                <span className="radio-dot"></span>
                                <span className="radio-label">有効化</span>
                            </label>
                            <label className="radio-item">
                                <input type="radio" name="lastpos" defaultChecked />
                                <span className="radio-dot"></span>
                                <span className="radio-label">無効化</span>
                            </label>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">既定の画像サイズ</span>
                        </div>
                        <div className="radio-group">
                            <label className="radio-item">
                                <input type="radio" name="size" defaultChecked />
                                <span className="radio-dot"></span>
                                <span className="radio-label">自動</span>
                            </label>
                            <label className="radio-item">
                                <input type="radio" name="size" />
                                <span className="radio-dot"></span>
                                <span className="radio-label">オリジナル サイズ</span>
                            </label>
                        </div>
                    </div>
                </div>
            </section>

            <section className="settings-section">
                <h4 className="section-title">ビデオ</h4>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">垂直スクロール</span>
                        </div>
                        <div className="radio-group">
                            <label className="radio-item">
                                <input type="radio" name="vscroll" defaultChecked />
                                <span className="radio-dot"></span>
                                <span className="radio-label">プログレス コントロール</span>
                            </label>
                            <label className="radio-item">
                                <input type="radio" name="vscroll" />
                                <span className="radio-dot"></span>
                                <span className="radio-label">ボリューム コントロール</span>
                            </label>
                        </div>
                    </div>

                    <div className="settings-row-checkbox">
                        <label className="checkbox-item">
                            <input type="checkbox" defaultChecked />
                            <span className="checkbox-box"></span>
                            <span className="checkbox-label">ホバー時にプレビューする <span className="help-icon">?</span></span>
                        </label>
                        <label className="checkbox-item">
                            <input type="checkbox" checked={settings.allowUpscale} onChange={() => handleToggle('allowUpscale')} />
                            <span className="checkbox-box"></span>
                            <span className="checkbox-label">画面を拡大して表示する</span>
                        </label>
                        <label className="checkbox-item">
                            <input type="checkbox" checked={settings.autoPlay} onChange={() => handleToggle('autoPlay')} />
                            <span className="checkbox-box"></span>
                            <span className="checkbox-label">自動再生する</span>
                        </label>
                        <label className="checkbox-item">
                            <input type="checkbox" />
                            <span className="checkbox-box"></span>
                            <span className="checkbox-label">前回の再生位置を記憶する</span>
                        </label>
                    </div>
                </div>
            </section>
        </div>
    )

    const renderDeveloperSettings = () => {
        const apiBaseUrl = serverConfig ? `http://localhost:${serverConfig.port}` : 'http://localhost:8765'

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">開発者ツール</h3>
                <section className="settings-section">
                    <h4 className="section-title">API エンドポイント</h4>
                    <div className="settings-card">
                        <p className="settings-description" style={{ marginBottom: '16px' }}>
                            以下のエンドポイントを使用して、ライブラリのデータに外部からアクセスできます。<br />
                            <strong>Base URL:</strong> <code>{apiBaseUrl}</code><br />
                            アクセスには以下のヘッダーが必要です。<br />
                            <code>Authorization: Bearer [Access Token]</code><br />
                            <code>X-User-Token: [User Token]</code>
                        </p>

                        <div className="api-list">
                            {API_ENDPOINTS.map((api) => (
                                <div key={api.path + api.method} className={`api-item ${openApiId === api.path ? 'open' : ''}`} style={{ borderBottom: '1px solid #3a3a3c' }}>
                                    <div
                                        className="api-header"
                                        onClick={() => toggleApi(api.path)}
                                        style={{ display: 'flex', alignItems: 'center', padding: '12px 8px', cursor: 'pointer', gap: '10px' }}
                                    >
                                        <span className={`method-badge ${api.method.toLowerCase()}`} style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            backgroundColor: api.method === 'GET' ? '#0ea5e9' : api.method === 'POST' ? '#22c55e' : api.method === 'PUT' ? '#eab308' : '#ef4444',
                                            color: '#fff',
                                            minWidth: '50px',
                                            textAlign: 'center'
                                        }}>{api.method}</span>
                                        <span className="api-path" style={{ flex: 1, fontFamily: 'monospace', fontSize: '14px' }}>{api.path}</span>
                                        <span className="api-label" style={{ fontSize: '13px', color: '#aaa' }}>{api.label}</span>
                                        <svg
                                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                            style={{ transform: openApiId === api.path ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                        >
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>

                                    {openApiId === api.path && (
                                        <div className="api-details" style={{ padding: '0 16px 16px 16px', fontSize: '13px', color: '#ddd' }}>
                                            {api.description && <p style={{ marginBottom: '8px' }}>{api.description}</p>}
                                            {api.permission && <div style={{ marginBottom: '8px' }}>
                                                <span style={{ color: '#aaa' }}>必要な権限: </span>
                                                <code style={{ backgroundColor: '#333', padding: '2px 4px', borderRadius: '4px' }}>{api.permission}</code>
                                            </div>}
                                            {api.params && api.params.length > 0 && (
                                                <div style={{ marginTop: '8px' }}>
                                                    <strong style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Parameters:</strong>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                        <tbody>
                                                            {api.params.map(p => (
                                                                <tr key={p.name} style={{ borderBottom: '1px solid #333' }}>
                                                                    <td style={{ padding: '4px', fontFamily: 'monospace', color: '#88ccff' }}>
                                                                        {p.name}
                                                                        {p.required && <span style={{ color: '#ef4444' }}>*</span>}
                                                                    </td>
                                                                    <td style={{ padding: '4px', color: '#aaa' }}>{p.type}</td>
                                                                    <td style={{ padding: '4px' }}>{p.desc}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    const handleSelectDownloadPath = async () => {
        if (!window.electronAPI) return
        const path = await (window.electronAPI as any).selectDownloadDirectory()
        if (path) {
            const newConfig = await (window.electronAPI as any).updateClientConfig({ downloadPath: path })
            setClientConfig(newConfig)
        }
    }

    const renderUpdateSection = () => {
        return (
            <section className="settings-section">
                <h4 className="section-title">アプリケーション更新</h4>
                <div className="settings-card">
                    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                        <div className="settings-info">
                            <span className="settings-label">バージョン情報</span>
                            <span className="settings-description">
                                現在のバージョン: v{appVersion}
                                {updateInfo?.version && (
                                    <span style={{ marginLeft: '10px' }}>
                                        (最新: v{updateInfo.version})
                                    </span>
                                )}
                            </span>
                        </div>

                        <div style={{ width: '100%' }}>
                            {updateStatus === 'idle' && (
                                <button className="btn btn-outline btn-small" onClick={handleCheckForUpdates}>
                                    アップデートを確認
                                </button>
                            )}
                            {updateStatus === 'checking' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa' }}>
                                    <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid #aaa', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                    確認中...
                                </div>
                            )}
                            {updateStatus === 'available' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ color: '#4ade80' }}>
                                        新しいバージョンが利用可能です (v{updateInfo?.version})
                                    </div>
                                    <button className="btn btn-primary" onClick={handleDownloadUpdate}>
                                        ダウンロード開始
                                    </button>
                                </div>
                            )}
                            {updateStatus === 'not-available' && (
                                <div style={{ color: '#aaa' }}>
                                    最新バージョンを使用しています。
                                </div>
                            )}
                            {updateStatus === 'downloading' && (
                                <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                                        <span>ダウンロード中...</span>
                                        <span>{Math.round(downloadProgress)}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '4px', backgroundColor: '#333', borderRadius: '2px' }}>
                                        <div style={{ width: `${downloadProgress}%`, height: '100%', backgroundColor: '#0ea5e9', borderRadius: '2px', transition: 'width 0.2s' }}></div>
                                    </div>
                                </div>
                            )}
                            {updateStatus === 'downloaded' && (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ color: '#4ade80' }}>ダウンロード完了！</span>
                                    <button className="btn btn-primary" onClick={handleQuitAndInstall}>
                                        再起動してインストール
                                    </button>
                                </div>
                            )}
                            {updateStatus === 'error' && (
                                <div style={{ color: '#ef4444' }}>
                                    エラーが発生しました: {typeof updateInfo === 'string' ? updateInfo : '不明なエラー'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        )
    }

    const renderGeneralSettings = () => {
        if (!clientConfig) return <div className="loading">読み込み中...</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">一般設定</h3>

                {renderUpdateSection()}

                <section className="settings-section">
                    <h4 className="section-title">ダウンロード</h4>
                    <div className="settings-card">
                        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                            <span className="settings-label">保存先フォルダー</span>
                            <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={clientConfig.downloadPath || ''}
                                    readOnly
                                    className="settings-input"
                                    style={{ flex: 1, color: '#aaa', cursor: 'not-allowed' }}
                                />
                                <button className="btn btn-outline btn-small" onClick={handleSelectDownloadPath}>
                                    変更
                                </button>
                            </div>
                            <span className="settings-description">
                                サーバーからダウンロードするファイルのデフォルト保存先です。
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    // ... (renderNetworkSettingsなど)

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal-container" onClick={e => e.stopPropagation()}>
                <div className="settings-modal-sidebar">
                    <div className="sidebar-header">
                        <h2>環境設定</h2>
                        <div className="sidebar-search">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" placeholder="検索..." />
                        </div>
                    </div>
                    <nav className="sidebar-nav">
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                className={`nav-item ${activeCategory === cat.id ? 'active' : ''}`}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                {cat.icon}
                                <span>{cat.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="settings-modal-main">
                    <header className="settings-header">
                        <span className="category-title">{categories.find(c => c.id === activeCategory)?.label}</span>
                        <button className="close-btn" onClick={onClose}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="6"></line></svg>
                        </button>
                    </header>

                    <div className="main-content">
                        {activeCategory === 'general' ? renderGeneralSettings() :
                            activeCategory === 'viewer' ? renderViewerSettings() :
                                activeCategory === 'network' ? renderNetworkSettings() :
                                    activeCategory === 'media-engine' ? renderMediaEngineSettings() :
                                        activeCategory === 'developer' ? renderDeveloperSettings() : (
                                            <div className="empty-state">
                                                <p>このセクションの設定は準備中です。</p>
                                            </div>
                                        )}
                    </div>

                    <footer className="main-footer">
                        <button className="btn-save" onClick={onClose}>変更を保存</button>
                        <button className="btn-apply" onClick={onClose}>適用</button>
                    </footer>
                </div>
            </div>
        </div>
    )
}
