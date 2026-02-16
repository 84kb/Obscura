import { useState, useEffect, useCallback, useContext, useRef } from 'react'
import { api } from '../api'
import { AppSettings, Library, ClientConfig, AutoImportPath, Theme, ThemeColors } from '../types'
import { ShortcutContext, ShortcutAction } from '../contexts/ShortcutContext'
import { useTheme } from '../hooks/useTheme'
import { defaultDarkTheme, parseThemeCss, THEME_TEMPLATES } from '../utils/themeManager'
import './SettingsModal.css'

interface SettingsModalProps {
    settings: AppSettings
    onUpdateSettings: (settings: AppSettings) => void
    onClose: () => void
}

// 削除された定義
type Category = 'general' | 'sidebar' | 'controls' | 'viewer' | 'screenshot' | 'shortcuts' | 'notification' | 'password' | 'import' | 'network' | 'developer' | 'media-engine' | 'profile' | 'theme' | 'audio'

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
        path: '/api/health',
        label: 'ヘルスチェック',
        description: 'サーバーの稼働状況を確認します。認証不要です。',
        permission: 'none',
        params: []
    },
    {
        method: 'GET',
        path: '/api/media',
        label: 'メディア一覧',
        description: 'ライブラリ内のメディアアイテムを検索・取得します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'page', type: 'number', desc: 'ページ番号 (デフォルト: 1)', required: false },
            { name: 'limit', type: 'number', desc: '1ページあたりのアイテム数 (デフォルト: 50)', required: false },
            { name: 'search', type: 'string', desc: 'キーワード検索', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/media/:id',
        label: 'メディア詳細',
        description: '特定のメディアアイテムの詳細情報を取得します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
        ]
    },
    {
        method: 'GET',
        path: '/api/media/:id/duplicates',
        label: '重複検出',
        description: '指定したメディアの重複候補を取得します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true }
        ]
    },
    {
        method: 'POST',
        path: '/api/media/:id/comments',
        label: 'コメント追加',
        description: 'メディアにコメントを追加します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'text', type: 'string', desc: 'コメント本文', required: true },
            { name: 'time', type: 'number', desc: 'タイムスタンプ（動画の再生位置）', required: false },
        ]
    },
    {
        method: 'PUT',
        path: '/api/media/:id',
        label: 'メディア情報更新',
        description: 'メディアのメタデータ（評価、アーティスト、説明、ファイル名）を更新します。',
        permission: 'EDIT',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'rating', type: 'number', desc: '評価 (0-5)', required: false },
            { name: 'artist', type: 'string', desc: 'アーティスト名', required: false },
            { name: 'description', type: 'string', desc: '説明文', required: false },
            { name: 'fileName', type: 'string', desc: 'ファイル名', required: false },
        ]
    },
    {
        method: 'DELETE',
        path: '/api/media/:id',
        label: 'メディア削除',
        description: 'メディアをゴミ箱に移動します。permanent=trueで完全削除（FULL権限が必要）。',
        permission: 'EDIT',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'permanent', type: 'boolean', desc: '完全削除フラグ (FULL権限必要)', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/tags',
        label: 'タグ一覧',
        description: '登録されているすべてのタグのリストを取得します。',
        permission: 'READ_ONLY',
        params: []
    },
    {
        method: 'GET',
        path: '/api/tag-groups',
        label: 'タググループ一覧',
        description: '登録されているすべてのタググループのリストを取得します。',
        permission: 'READ_ONLY',
        params: []
    },
    {
        method: 'GET',
        path: '/api/folders',
        label: 'フォルダー一覧',
        description: '登録されているすべてのフォルダーのリストを取得します。',
        permission: 'READ_ONLY',
        params: []
    },
    {
        method: 'POST',
        path: '/api/tags',
        label: 'タグ作成',
        description: '新しいタグを作成します。',
        permission: 'EDIT',
        params: [
            { name: 'name', type: 'string', desc: 'タグ名', required: true }
        ]
    },
    {
        method: 'DELETE',
        path: '/api/tags/:id',
        label: 'タグ削除',
        description: 'タグを削除します。',
        permission: 'EDIT',
        params: [
            { name: 'id', type: 'number', desc: 'タグID', required: true }
        ]
    },
    {
        method: 'POST',
        path: '/api/tags/media',
        label: 'メディアにタグ追加',
        description: 'メディアにタグを追加します。単体または一括追加が可能です。',
        permission: 'EDIT',
        params: [
            { name: 'mediaId', type: 'number', desc: 'メディアID（単体）', required: false },
            { name: 'tagId', type: 'number', desc: 'タグID（単体）', required: false },
            { name: 'mediaIds', type: 'number[]', desc: 'メディアIDの配列（一括）', required: false },
            { name: 'tagIds', type: 'number[]', desc: 'タグIDの配列（一括）', required: false },
        ]
    },
    {
        method: 'DELETE',
        path: '/api/tags/media',
        label: 'メディアからタグ削除',
        description: 'メディアからタグを削除します。クエリパラメータまたはボディで指定可能です。',
        permission: 'EDIT',
        params: [
            { name: 'mediaId', type: 'number', desc: 'メディアID', required: true },
            { name: 'tagId', type: 'number', desc: 'タグID', required: true },
        ]
    },
    {
        method: 'GET',
        path: '/api/thumbnails/:id',
        label: 'サムネイル',
        description: '特定のメディアアイテムのサムネイル画像を取得します。',
        permission: 'any',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'width', type: 'number', desc: '幅（ピクセル）', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/stream/:id',
        label: 'ストリーミング',
        description: '特定のメディアアイテムをストリーミングします。Range requestsをサポートします。',
        permission: 'any',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'accessToken', type: 'string', desc: 'アクセストークン (クエリ認証)', required: false },
            { name: 'userToken', type: 'string', desc: 'ユーザートークン (クエリ認証)', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/download/:id',
        label: 'ダウンロード',
        description: 'メディアファイルをダウンロードします。',
        permission: 'DOWNLOAD',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
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
        method: 'GET',
        path: '/api/profile',
        label: 'プロフィール取得',
        description: '現在のユーザーのプロフィール情報を取得します。',
        permission: 'any',
        params: []
    },
    {
        method: 'PUT',
        path: '/api/profile',
        label: 'プロフィール更新',
        description: 'ユーザーのニックネームやアイコンを更新します。',
        permission: 'any',
        params: [
            { name: 'nickname', type: 'string', desc: 'ニックネーム', required: false },
            { name: 'iconUrl', type: 'string', desc: 'アイコンURL', required: false },
        ]
    },
]

const PERMISSION_LABELS: Record<string, string> = {
    'READ_ONLY': '閲覧',
    'DOWNLOAD': 'DL',
    'UPLOAD': 'UP',
    'EDIT': '編集',
    'FULL': 'フル'
}

const SHORTCUT_LABELS: Record<string, string> = {
    'PLAYER_TOGGLE_PLAY': '再生 / 一時停止',
    'PLAYER_FORWARD': '10秒進む',
    'PLAYER_REWIND': '10秒戻る',
    'PLAYER_STEP_FORWARD': '1フレーム進む (停止中のみ)',
    'PLAYER_STEP_BACKWARD': '1フレーム戻る (停止中のみ)',
    'PLAYER_VOLUME_UP': '音量を上げる',
    'PLAYER_VOLUME_DOWN': '音量を下げる',
    'PLAYER_TOGGLE_MUTE': 'ミュート切り替え',
    'PLAYER_TOGGLE_FULLSCREEN': 'フルスクリーン切り替え',

    'NAV_ENTER': 'アイテムを開く',
    'NAV_BACK': '戻る',
    'NAV_UP': '上へ移動',
    'NAV_DOWN': '下へ移動',
    'NAV_LEFT': '左へ移動',
    'NAV_RIGHT': '右へ移動'
}

type ShortcutCategory = 'Player' | 'Navigation'
const SHORTCUT_CATEGORIES: Record<ShortcutCategory, ShortcutAction[]> = {
    'Player': [
        'PLAYER_TOGGLE_PLAY', 'PLAYER_FORWARD', 'PLAYER_REWIND',
        'PLAYER_STEP_FORWARD', 'PLAYER_STEP_BACKWARD',
        'PLAYER_VOLUME_UP', 'PLAYER_VOLUME_DOWN',
        'PLAYER_TOGGLE_MUTE', 'PLAYER_TOGGLE_FULLSCREEN'
    ],
    'Navigation': [
        'NAV_UP', 'NAV_DOWN', 'NAV_LEFT', 'NAV_RIGHT',
        'NAV_ENTER', 'NAV_BACK'
    ]
}

export function SettingsModal({ settings, onUpdateSettings, onClose }: SettingsModalProps) {
    const [activeCategory, setActiveCategory] = useState<Category>('general')
    const [appVersion, setAppVersion] = useState<string>('Unknown')
    const [searchQuery, setSearchQuery] = useState('')

    // ショートカット関連
    const shortcutContext = useContext(ShortcutContext)
    const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null)

    // キー録音処理
    useEffect(() => {
        if (!recordingAction || !shortcutContext) return

        const handleRecordKeyDown = (e: KeyboardEvent) => {
            e.preventDefault()
            e.stopPropagation()

            // 修飾キーのみの場合は無視（組み合わせ用）
            // 今回はシンプルに単一キーまたは修飾キー+キーを文字列化
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

            const code = e.code
            // 保存
            shortcutContext.setKeyBinding(recordingAction, code)
            setRecordingAction(null)
        }

        // キャプチャフェーズでイベントを横取りする
        window.addEventListener('keydown', handleRecordKeyDown, { capture: true })
        return () => {
            window.removeEventListener('keydown', handleRecordKeyDown, { capture: true })
        }
    }, [recordingAction, shortcutContext])

    useEffect(() => {
        api.getAppVersion().then((v: string) => setAppVersion(v))
    }, [])

    const categories: { id: Category; label: string; icon: JSX.Element; group: string }[] = [
        // 基本
        { id: 'general', label: '基本設定', group: '基本', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> },
        { id: 'profile', label: 'プロフィール', group: '基本', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },

        // 表示・操作
        { id: 'theme', label: 'テーマ', group: '表示・操作', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg> },
        { id: 'viewer', label: 'ビューアー', group: '表示・操作', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> },
        { id: 'shortcuts', label: 'ショートカット', group: '表示・操作', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="6" y1="8" x2="6" y2="8"></line><line x1="10" y1="8" x2="10" y2="8"></line><line x1="14" y1="8" x2="14" y2="8"></line><line x1="18" y1="8" x2="18" y2="8"></line><line x1="6" y1="12" x2="6" y2="12"></line><line x1="10" y1="12" x2="10" y2="12"></line><line x1="14" y1="12" x2="14" y2="12"></line><line x1="18" y1="12" x2="18" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg> },

        // ライブラリ
        { id: 'import', label: 'インポート・ダウンロード', group: 'ライブラリ', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> },
        { id: 'audio', label: 'オーディオ', group: 'ライブラリ', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> },
        { id: 'media-engine', label: 'メディアエンジン', group: 'ライブラリ', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> },
        { id: 'network', label: 'ネットワーク同期', group: 'ライブラリ', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg> },

        // システム
        { id: 'developer', label: '開発者ツール', group: 'システム', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> },
    ]

    const handleToggle = (key: keyof AppSettings) => {
        onUpdateSettings({
            ...settings,
            [key]: !settings[key]
        })
    }

    // === APIメニュー開閉 State ===
    const [openApiIds, setOpenApiIds] = useState<string[]>([])
    const toggleApi = useCallback((id: string) => {
        setOpenApiIds((prev) =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        )
    }, [])

    // データ読み込み
    const [serverConfig, setServerConfig] = useState<any>(null)
    const [sharedUsers, setSharedUsers] = useState<any[]>([])
    const [myUserToken, setMyUserToken] = useState<string>('')
    const [isServerRunning, setIsServerRunning] = useState<boolean>(false)
    const [activeTab, setActiveTab] = useState<'host' | 'client'>('host')
    const [libraries, setLibraries] = useState<Library[]>([])

    // === クライアント設定 State ===
    const [clientConfig, setClientConfig] = useState<any>(null)

    // === テーマ設定 ===
    const updateClientConfig = useCallback(async (updates: Partial<ClientConfig>) => {
        try {
            const newConfig = await api.updateClientConfig(updates)
            setClientConfig(newConfig)
        } catch (error) {
            console.error('Failed to update client config:', error)
        }
    }, [])

    // テーマフックの初期化 (clientConfigがロードされるまで空オブジェクトで初期化)
    const themeHook = useTheme(clientConfig || {} as any, updateClientConfig, { applyOnMount: false })
    const { themes, activeThemeId, selectTheme, createTheme, updateTheme, deleteTheme } = themeHook

    // 新規テーマ作成用State
    const [isCreatingTheme, setIsCreatingTheme] = useState(false)
    const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
    const [newThemeName, setNewThemeName] = useState('')
    const [editingColors, setEditingColors] = useState<ThemeColors>(defaultDarkTheme.colors)

    const handleCreateTheme = () => {
        if (!newThemeName.trim()) return
        createTheme(newThemeName, editingColors)
        setIsCreatingTheme(false)
        setNewThemeName('')
        setEditingColors(defaultDarkTheme.colors) // Reset colors
    }

    const handleUpdateTheme = () => {
        if (!editingThemeId) return
        updateTheme(editingThemeId, editingColors)
        setEditingThemeId(null)
    }

    const handleDeleteTheme = (id: string) => {
        if (confirm('このテーマを削除してもよろしいですか？')) {
            deleteTheme(id)
        }
    }

    const startEditTheme = (theme: Theme) => {
        setEditingThemeId(theme.id)
        setEditingColors(theme.colors)
    }


    // === アップデート State ===
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded'>('idle')
    const [updateInfo, setUpdateInfo] = useState<any>(null)
    const [downloadProgress, setDownloadProgress] = useState<number>(0)

    // === Template Modal State ===
    const [showTemplateModal, setShowTemplateModal] = useState(false)

    const handleCopyTemplate = (css: string) => {
        api.copyToClipboard(css)
        alert('テンプレートをクリップボードにコピーしました')
    }

    useEffect(() => {
        // アップデートステータスのリスナー登録
        const unsubscribe = api.onUpdateStatus((data: { status: string; info?: any }) => {
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

    // === Import Settings State ===
    const [availableLibraries, setAvailableLibraries] = useState<{ name: string; path: string }[]>([])

    useEffect(() => {
        if (activeCategory === 'import' && window.electronAPI) {
            (window.electronAPI as any).getLibraries()
                .then((libs: any[]) => setAvailableLibraries(libs))
                .catch((e: any) => console.error('Failed to get libraries:', e))
        }
    }, [activeCategory])

    // === Profile Settings State ===
    const [nickname, setNickname] = useState('')
    const [selectedIcon, setSelectedIcon] = useState('👤')
    // デフォルトのアイコンオプション
    const DEFAULT_ICONS = [
        '👤', '😀', '😎', '🐱', '🐶', '🦊', '🐻', '🐼',
        '🐸', '🦁', '🐯', '🐨', '🐰', '🦄', '🐉', '🌟'
    ]

    useEffect(() => {
        if (activeCategory === 'profile' && clientConfig) {
            setNickname(clientConfig.nickname || '')
            setSelectedIcon(clientConfig.iconUrl || DEFAULT_ICONS[0])
        }
    }, [activeCategory, clientConfig])

    // === Media Engine Settings ===
    const [ffmpegInfo, setFfmpegInfo] = useState<{ version: string; path: string } | null>(null)
    const [ffmpegUpdateStatus, setFfmpegUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'updating' | 'error'>('idle')
    const [ffmpegUpdateProgress, setFfmpegUpdateProgress] = useState(0)

    useEffect(() => {
        if (activeCategory === 'media-engine') {
            api.getFFmpegInfo().then((info: any) => setFfmpegInfo(info))
        }
    }, [activeCategory])

    useEffect(() => {
        const removeListener = api.onFFmpegUpdateProgress((progress: number) => {
            setFfmpegUpdateProgress(progress)
        })
        return () => {
            if (removeListener) removeListener()
        }
    }, [])

    const handleCheckFFmpegUpdate = async () => {
        setFfmpegUpdateStatus('checking')
        try {
            const result = await api.checkFFmpegUpdate()
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
        setFfmpegUpdateStatus('updating')
        setFfmpegUpdateProgress(0)
        try {
            // Mock URL for now, or real one if implemented
            await api.updateFFmpeg('latest')
            setFfmpegUpdateStatus('idle')
            // Refresh info
            const info = await api.getFFmpegInfo()
            setFfmpegInfo(info)
            alert('FFmpeg update completed!')
        } catch (e: any) {
            console.error(e)
            setFfmpegUpdateStatus('error')
            alert('Update failed: ' + e.message)
        }
    }

    const renderThemeSettings = () => {
        // カラーラベル定義
        const colorLabels: Record<keyof ThemeColors, string> = {
            bgDark: '背景 (Dark)',
            bgCard: 'カード背景',
            bgSidebar: 'サイドバー背景',
            bgHover: 'ホバー背景',
            primary: 'メインカラー',
            primaryHover: 'メインカラー (Hover)',
            primaryLight: 'メインカラー (Light)',
            accent: 'アクセントカラー',
            textMain: 'テキスト (Main)',
            textMuted: 'テキスト (Muted)',
            border: 'ボーダー'
        }

        const renderColorPicker = (key: keyof ThemeColors, value: string, onChange: (val: string) => void) => (
            <div className="settings-row" key={key}>
                <div className="settings-info">
                    <span className="settings-label">{colorLabels[key]}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                        type="color"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        style={{ width: '40px', height: '30px', padding: 0, border: 'none', cursor: 'pointer' }}
                    />
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="form-control"
                        style={{ width: '100px' }}
                    />
                </div>
            </div>
        )

        if (isCreatingTheme || editingThemeId) {
            const isEdit = !!editingThemeId
            const handleSave = isEdit ? handleUpdateTheme : handleCreateTheme
            const handleCancel = () => {
                setIsCreatingTheme(false)
                setEditingThemeId(null)
            }

            return (
                <div className="settings-page">
                    <h3 className="settings-page-title">
                        {isEdit ? 'テーマを編集' : '新しいテーマを作成'}
                    </h3>
                    <div className="settings-section">
                        {!isEdit && (
                            <div className="settings-row">
                                <div className="settings-info">
                                    <span className="settings-label">テーマ名</span>
                                </div>
                                <input
                                    type="text"
                                    value={newThemeName}
                                    onChange={(e) => setNewThemeName(e.target.value)}
                                    className="form-control"
                                    placeholder="テーマ名を入力"
                                />
                            </div>
                        )}

                        <h4 className="section-title">カラー設定</h4>
                        {Object.keys(editingColors).map((key) =>
                            renderColorPicker(key as keyof ThemeColors, editingColors[key as keyof ThemeColors], (val) => {
                                setEditingColors(prev => ({ ...prev, [key]: val }))
                            })
                        )}

                        <div className="settings-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={handleCancel}>キャンセル</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={!isEdit && !newThemeName.trim()}>
                                {isEdit ? '更新' : '作成'}
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">テーマ設定</h3>
                <div className="settings-section">
                    <div className="settings-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <span className="settings-description">
                            アプリの外観をカスタマイズできます。プリセットから選ぶか、独自のテーマを作成してください。
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => {
                                setEditingColors(defaultDarkTheme.colors)
                                setIsCreatingTheme(true)
                            }}>
                                新規作成
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowTemplateModal(true)}>
                                テンプレート
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => document.getElementById('theme-import-input')?.click()}>
                                    CSSからインポート
                                </button>
                                <input
                                    id="theme-import-input"
                                    type="file"
                                    accept=".css"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                            const cssContent = event.target?.result as string;
                                            if (cssContent) {
                                                const parsedColors = parseThemeCss(cssContent);
                                                // 既存のデフォルト色にマージする形で初期化
                                                setEditingColors({ ...defaultDarkTheme.colors, ...parsedColors });
                                                // ファイル名をテーマ名の初期値にする（拡張子なし）
                                                const name = file.name.replace(/\.css$/i, '');
                                                setNewThemeName(name);
                                                setIsCreatingTheme(true);
                                            }
                                        };
                                        reader.readAsText(file);
                                        // Reset input value to allow selecting same file again
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {showTemplateModal && (
                        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowTemplateModal(false)}>
                            <div className="modal-content" style={{ width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>テーマテンプレート</h3>
                                    <button className="close-btn" onClick={() => setShowTemplateModal(false)}>×</button>
                                </div>
                                <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>
                                    <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
                                        これらのテンプレートをコピーして、新しいCSSファイルとして保存し、「CSSからインポート」機能で読み込むことができます。
                                    </p>
                                    {THEME_TEMPLATES.map((template, index) => (
                                        <div key={index} style={{ marginBottom: '24px', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', background: 'var(--bg-card)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: '16px' }}>{template.name}</h4>
                                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{template.description}</p>
                                                </div>
                                                <button className="btn btn-secondary btn-sm" onClick={() => handleCopyTemplate(template.css)}>
                                                    コピー
                                                </button>
                                            </div>
                                            <pre style={{
                                                background: 'var(--bg-dark)',
                                                padding: '12px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                overflowX: 'auto',
                                                color: 'var(--text-muted)',
                                                border: '1px solid var(--border)'
                                            }}>
                                                <code>{template.css}</code>
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                                <div className="modal-footer">
                                    <button className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>閉じる</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="theme-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                        {themes.map(theme => (
                            <div
                                key={theme.id}
                                className={`theme-card ${activeThemeId === theme.id ? 'active' : ''}`}
                                style={{
                                    border: `2px solid ${activeThemeId === theme.id ? 'var(--primary)' : 'var(--border)'}`,
                                    borderRadius: '8px',
                                    padding: '15px',
                                    cursor: 'pointer',
                                    background: 'var(--bg-card)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => selectTheme(theme.id)}
                            >
                                <div className="theme-preview" style={{
                                    height: '60px',
                                    background: theme.colors.bgDark,
                                    marginBottom: '10px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: `1px solid ${theme.colors.border}`
                                }}>
                                    <div style={{ width: '20px', height: '20px', background: theme.colors.primary, borderRadius: '50%' }}></div>
                                </div>
                                <div className="theme-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold' }}>{theme.name}</span>
                                    {theme.isSystem ? (
                                        <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-hover)', borderRadius: '4px' }}>System</span>
                                    ) : (
                                        <div className="theme-actions" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="btn-icon-sm"
                                                title="編集"
                                                onClick={() => startEditTheme(theme)}
                                                style={{ marginRight: '5px' }}
                                            >
                                                ✎
                                            </button>
                                            <button
                                                className="btn-icon-sm text-danger"
                                                title="削除"
                                                onClick={() => handleDeleteTheme(theme.id)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {activeThemeId === theme.id && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '5px',
                                        right: '5px',
                                        color: 'var(--primary)',
                                        background: 'var(--bg-dark)',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px'
                                    }}>
                                        ✓
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div >
        )
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
                                if (ffmpegInfo?.path) {
                                    api.copyToClipboard(ffmpegInfo.path)
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

    const renderShortcutsSettings = () => {
        if (!shortcutContext) return null
        const keyMap = shortcutContext.getKeyMap()

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">ショートカット設定</h3>
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                            if (confirm('すべてのショートカットを初期設定に戻しますか？')) {
                                shortcutContext.resetKeyMap()
                            }
                        }}
                    >
                        デフォルトに戻す
                    </button>
                </div>

                {Object.entries(SHORTCUT_CATEGORIES).map(([category, actions]) => {
                    // カテゴリごとの重複チェック
                    const categoryDuplicateKeys = new Set<string>()
                    const seenKeys = new Set<string>()

                    actions.forEach(act => {
                        const key = keyMap[act as ShortcutAction]
                        if (!key) return
                        if (seenKeys.has(key)) {
                            categoryDuplicateKeys.add(key)
                        } else {
                            seenKeys.add(key)
                        }
                    })

                    const isDuplicate = (action: ShortcutAction) => {
                        const key = keyMap[action]
                        return key && categoryDuplicateKeys.has(key)
                    }

                    return (
                        <section key={category} className="settings-section">
                            <h4 className="section-title">{category}</h4>
                            <div className="settings-card">
                                {actions.map(action => {
                                    const isDup = isDuplicate(action as ShortcutAction)
                                    return (
                                        <div key={action} className="settings-row">
                                            <div className="settings-info">
                                                <span className="settings-label">{SHORTCUT_LABELS[action] || action}</span>
                                                {isDup && <span style={{ color: 'var(--accent)', fontSize: '11px', marginLeft: '8px' }}>⚠ 重複</span>}
                                            </div>
                                            <button
                                                className={`btn ${recordingAction === action ? 'btn-danger' : 'btn-outline'} btn-sm`}
                                                style={{
                                                    minWidth: '100px',
                                                    fontFamily: 'monospace',
                                                    borderColor: isDup ? 'var(--accent)' : undefined,
                                                    color: isDup ? 'var(--accent)' : undefined,
                                                    backgroundColor: isDup ? 'color-mix(in srgb, var(--accent), transparent 90%)' : undefined
                                                }}
                                                onClick={() => setRecordingAction(action as ShortcutAction)}
                                            >
                                                {recordingAction === action ? 'キーを入力...' : (keyMap[action] || '未設定')}
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    )
                })}

                {/* マウスナビゲーション */}
                <section key="Mouse" className="settings-section">
                    <h4 className="section-title">Mouse Navigation</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">前の動画</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                Mouse Button 4 (戻る)
                            </div>
                        </div>
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">次の動画</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                Mouse Button 5 (進む)
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    const handleCheckForUpdates = async () => {
        setUpdateStatus('checking')
        try {
            // 15秒のタイムアウトを設定
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timed out')), 15000)
            )

            // アップデートチェック実行
            const resultPromise = api.checkForUpdates()

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
        setUpdateStatus('downloading')
        // download-update IPC does not exist in preload yet?
        // Wait, autoUpdater.downloadUpdate() is needed.
        // We need to add downloadUpdate to preload and updater.ts
        // For now, let's just use "checkForUpdates" triggering if autoDownload is true?
        // No, we set autoDownload=false. So we need an explicit download call.
        try {
            await api.downloadUpdate()
        } catch (e: any) {
            console.error('Download failed', e)
            setUpdateStatus('error')
            setUpdateInfo(e.message)
        }
    }

    const handleQuitAndInstall = async () => {
        await api.quitAndInstall()
    }

    // データ読み込み
    useEffect(() => {
        const loadData = async () => {
            if (activeCategory === 'network') {
                try {
                    const config = await api.getServerConfig()
                    setServerConfig(config)
                    const running = await api.getServerStatus()
                    setIsServerRunning(running)
                    const users = await api.getSharedUsers()
                    setSharedUsers(users)

                    // クライアント設定も読み込む（リモートライブラリ一覧用）
                    const cConfig = await api.getClientConfig()
                    setClientConfig(cConfig)

                    // クライアント用トークン (自分のマシン用)
                    const token = await api.generateUserToken()
                    setMyUserToken(token)
                    // ライブラリ一覧を取得
                    const libs = await api.getLibraries()
                    setLibraries(libs)
                } catch (e) {
                    console.error('Failed to load network settings:', e)
                }
            } else if (activeCategory === 'general' || activeCategory === 'import') {
                try {
                    const config = await api.getClientConfig()
                    setClientConfig(config)
                } catch (e) {
                    console.error('Failed to load client config:', e)
                }
            }
        }
        loadData()
    }, [activeCategory])

    const handleToggleServer = async () => {
        try {
            if (isServerRunning) {
                await api.stopServer()
                setIsServerRunning(false)
            } else {
                await api.startServer()
                setIsServerRunning(true)
            }
            // 設定更新
            const config = await api.getServerConfig()
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
        if (!newAllowedIP || !serverConfig) return
        const currentIPs = serverConfig.allowedIPs || []
        if (currentIPs.includes(newAllowedIP)) return

        const newIPs = [...currentIPs, newAllowedIP]
        setServerConfig({ ...serverConfig, allowedIPs: newIPs })
        api.updateServerConfig({ allowedIPs: newIPs })
        setNewAllowedIP('')
    }

    const handleDeleteIP = (ip: string) => {
        if (!serverConfig) return
        const newIPs = (serverConfig.allowedIPs || []).filter((i: string) => i !== ip)
        setServerConfig({ ...serverConfig, allowedIPs: newIPs })
        api.updateServerConfig({ allowedIPs: newIPs })
    }

    const handleSelectCert = async () => {
        const path = await api.selectFile({
            title: 'SSL証明書 (CRT/PEM) を選択',
            filters: [{ name: 'Certificate', extensions: ['crt', 'pem', 'cer'] }]
        })
        if (path) {
            setServerConfig({ ...serverConfig, sslCertPath: path })
            api.updateServerConfig({ sslCertPath: path })
        }
    }

    const handleSelectKey = async () => {
        const path = await api.selectFile({
            title: '秘密鍵 (KEY/PEM) を選択',
            filters: [{ name: 'Private Key', extensions: ['key', 'pem'] }]
        })
        if (path) {
            setServerConfig({ ...serverConfig, sslKeyPath: path })
            api.updateServerConfig({ sslKeyPath: path })
        }
    }

    const toggleTokenVisibility = (userId: string, type: 'user' | 'access') => {
        setVisibleTokens(prev => ({
            ...prev,
            [userId]: prev[userId] === type ? null : type
        }))
    }

    const handleAddUser = async () => {
        if (!inputUserToken.trim()) return
        try {
            const user = await api.addSharedUser({
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
        if (!confirm('このユーザーを削除しますか？')) return
        try {
            await api.deleteSharedUser(userId)
            setSharedUsers(sharedUsers.filter(u => u.id !== userId))
        } catch (e) {
            console.error('Failed to delete user:', e)
        }
    }

    const handleTogglePermission = async (userId: string, permission: any) => {
        const user = sharedUsers.find(u => u.id === userId)
        if (!user) return

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
            await api.updateSharedUser(userId, { permissions: newPermissions })
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
                            <div className="active-users-list">
                                {activeUsers.map(u => (
                                    <span key={u.id} className="active-user-badge">
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', marginRight: '6px' }}></div>
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
                            <div className="token-display">
                                <p>アクセストークンを共有してください（一度しか表示されません）:</p>
                                <code>{newAccessToken}</code>
                                <button
                                    onClick={() => {
                                        api.copyToClipboard(newAccessToken)
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
                    <div className="users-list">
                        {sharedUsers.map(u => (
                            <div key={u.id} className="user-card-item">
                                <div className="user-card-header">
                                    <span className="user-card-name">{u.nickname || '未指定'}</span>
                                    <button
                                        onClick={() => handleDeleteUser(u.id)}
                                        className="icon-button delete"
                                        title="削除"
                                        style={{ color: '#ef4444', flexShrink: 0 }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                                <div className="user-card-last-access">
                                    最終アクセス: {u.lastAccessAt ? new Date(u.lastAccessAt).toLocaleString() : '未アクセス'}
                                </div>
                                {/* トークン表示 (スポイラー形式) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div className="token-row">
                                        <div className="token-label-row">
                                            <span className="token-label">ユーザートークン:</span>
                                            {visibleTokens[u.id] === 'user' && (
                                                <button
                                                    onClick={() => api.copyToClipboard(u.userToken)}
                                                    className="btn btn-outline btn-small"
                                                >
                                                    コピー
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            onClick={() => toggleTokenVisibility(u.id, 'user')}
                                            className={`token-value-box ${visibleTokens[u.id] === 'user' ? 'revealed' : ''}`}
                                        >
                                            {visibleTokens[u.id] === 'user' ? u.userToken : 'クリックして表示'}
                                        </div>
                                    </div>
                                    <div className="token-row">
                                        <div className="token-label-row">
                                            <span className="token-label">アクセストークン:</span>
                                            {visibleTokens[u.id] === 'access' && (
                                                <button
                                                    onClick={() => api.copyToClipboard(u.accessToken)}
                                                    className="btn btn-outline btn-small"
                                                >
                                                    コピー
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            onClick={() => toggleTokenVisibility(u.id, 'access')}
                                            className={`token-value-box ${visibleTokens[u.id] === 'access' ? 'revealed' : ''}`}
                                        >
                                            {visibleTokens[u.id] === 'access' ? u.accessToken : 'クリックして表示'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        ※ 接続時は「ユーザートークン:アクセストークン」形式で入力
                                    </div>

                                    {/* 権限管理 */}
                                    <div className="permission-container">
                                        <span className="permission-title">権限設定:</span>
                                        <div className="permission-badges">
                                            {(['READ_ONLY', 'DOWNLOAD', 'UPLOAD', 'EDIT', 'FULL'] as any[]).map((p: any) => (
                                                <button
                                                    key={p}
                                                    onClick={() => handleTogglePermission(u.id, p)}
                                                    className={`permission-btn ${(u.permissions || []).includes(p) ? 'active' : ''}`}
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
                    </div>    {sharedUsers.length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            ユーザーがいません
                        </div>
                    )}
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

    // URLの正規化：プロトコルがない場合はhttp://を追加
    const normalizeRemoteUrl = (url: string): string => {
        const trimmed = url.trim()
        if (!trimmed) return ''
        // すでにプロトコルがある場合はそのまま
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return trimmed
        }
        // プロトコルがない場合はhttp://を追加
        return `http://${trimmed}`
    }

    const handleTestConnection = async () => {
        if (!remoteUrl || !remoteKey) return
        setConnectionStatus('testing')
        setConnectionMsg('接続確認中...')
        try {
            const normalizedUrl = normalizeRemoteUrl(remoteUrl)

            // まず指定されたプロトコル（またはデフォルトのhttp://）で試行
            let result = await api.testConnection(normalizedUrl, remoteKey)
            let finalUrl = normalizedUrl

            // HTTPで失敗し、かつURLがhttp://で始まる場合はhttps://で再試行
            if (!result.success && normalizedUrl.startsWith('http://')) {
                setConnectionMsg('HTTPS接続を試行中...')
                const httpsUrl = normalizedUrl.replace('http://', 'https://')
                const httpsResult = await api.testConnection(httpsUrl, remoteKey)

                if (httpsResult.success) {
                    result = httpsResult
                    finalUrl = httpsUrl
                }
            }
            // HTTPSで失敗し、かつURLがhttps://で始まる場合はhttp://で再試行
            else if (!result.success && normalizedUrl.startsWith('https://')) {
                setConnectionMsg('HTTP接続を試行中...')
                const httpUrl = normalizedUrl.replace('https://', 'http://')
                const httpResult = await api.testConnection(httpUrl, remoteKey)

                if (httpResult.success) {
                    result = httpResult
                    finalUrl = httpUrl
                }
            }

            if (result.success) {
                setConnectionStatus('success')
                const protocol = finalUrl.startsWith('https://') ? 'HTTPS' : 'HTTP'
                setConnectionMsg(`接続成功！ (${protocol})`)
                // URLを成功したプロトコルで更新
                setRemoteUrl(finalUrl)
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
        if (connectionStatus !== 'success') return
        try {
            const name = remoteName.trim() || 'Remote Library'
            const normalizedUrl = normalizeRemoteUrl(remoteUrl)
            await api.addRemoteLibrary(name, normalizedUrl, remoteKey)
            // 設定を再読み込み
            const cConfig = await api.getClientConfig()
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
        if (!confirm(`リモートライブラリ "${lib.name || lib.url}" を削除しますか？`)) return
        try {
            // updateClientConfig でリストから除外して保存
            const currentLibs = clientConfig?.remoteLibraries || []
            const newLibs = currentLibs.filter((l: any) => l.id !== lib.id)
            await api.updateClientConfig({ remoteLibraries: newLibs })
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
                                                api.updateServerConfig({ port: val })
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
                                                api.updateServerConfig(updates)
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

                        <section className="settings-section" style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
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
                                                <div key={ip} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-dark)', padding: '8px 12px', borderRadius: '4px' }}>
                                                    <span style={{ fontFamily: 'monospace' }}>{ip}</span>
                                                    <button
                                                        onClick={() => handleDeleteIP(ip)}
                                                        className="icon-button delete"
                                                        title="削除"
                                                        style={{ color: 'var(--accent)' }}
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
                                                api.updateServerConfig({ requireHttps: val })
                                            }}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                {serverConfig.requireHttps && (
                                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid var(--border)' }}>
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
                                        <p style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>
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
                                                if (myUserToken) {
                                                    api.copyToClipboard(myUserToken)
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
                                            <div key={lib.id} className="settings-row" style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{lib.name || 'Remote Library'}</span>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{lib.url}</span>
                                                    <span style={{ fontSize: '11px', color: 'color-mix(in srgb, var(--text-muted), transparent 40%)' }}>Last connected: {new Date(lib.lastConnectedAt).toLocaleString()}</span>
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
                            <span className="settings-label">拡大中の画像</span>
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
                            <span className="settings-label">PiP 操作モード</span>
                            <span className="settings-description">ピクチャーインピクチャー画面のボタン配置</span>
                        </div>
                        <div className="radio-group" style={{ display: 'flex', gap: '16px' }}>
                            <label className="radio-item">
                                <input
                                    type="radio"
                                    checked={settings.pipControlMode === 'navigation' || !settings.pipControlMode}
                                    onChange={() => onUpdateSettings({ ...settings, pipControlMode: 'navigation' })}
                                />
                                <span className="radio-dot"></span>
                                <span className="radio-label">前/次の動画</span>
                            </label>
                            <label className="radio-item">
                                <input
                                    type="radio"
                                    checked={settings.pipControlMode === 'skip'}
                                    onChange={() => onUpdateSettings({ ...settings, pipControlMode: 'skip' })}
                                />
                                <span className="radio-dot"></span>
                                <span className="radio-label">10秒スキップ</span>
                            </label>
                        </div>
                    </div>
                </div>
            </section>

            <section className="settings-section">
                <h4 className="section-title">外観・挙動</h4>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">サイドバーを自動的に隠す</span>
                            <span className="settings-description">
                                メディア閲覧中、マウスが離れてから一定時間後にサイドバーを非表示にします。
                            </span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={settings.autoHideSidebar}
                                onChange={() => handleToggle('autoHideSidebar')}
                            />
                            <span className="slider"></span>
                        </label>
                    </div>

                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">メディア情報を常に表示</span>
                            <span className="settings-description">
                                ビューアー下部にタイトルや評価などの情報を常に表示します。
                            </span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={settings.showInfoOverlay}
                                onChange={() => handleToggle('showInfoOverlay')}
                            />
                            <span className="slider"></span>
                        </label>
                    </div>

                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">GPUハードウェアアクセラレーション</span>
                            <span className="settings-description">
                                多くの環境でパフォーマンスが向上しますが、無効にすることで不具合が解消される場合があります。
                                <span className="settings-warning-text" style={{ color: 'var(--accent)', display: 'block', marginTop: '4px' }}>※変更を適用するには再起動が必要です。</span>
                            </span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={clientConfig?.enableGPUAcceleration ?? true}
                                onChange={(e) => updateClientConfig({ enableGPUAcceleration: e.target.checked })}
                            />
                            <span className="slider"></span>
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
                            <strong>認証:</strong> ヘッダー <code>Authorization: Bearer [YOUR_HOST_SECRET]</code> を使用してください。
                        </p>

                        <div className="api-list">
                            {API_ENDPOINTS.map(api => {
                                const apiId = `${api.method}-${api.path}`
                                return (
                                    <div key={apiId} className="api-item" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '12px' }}>
                                        <div
                                            className="api-header"
                                            onClick={() => toggleApi(apiId)}
                                        >
                                            <div className="api-method-path">
                                                <span className={`api-method ${api.method.toLowerCase()}`}>{api.method}</span>
                                                <span className="api-path">{api.path}</span>
                                            </div>
                                            <span className="api-label">{api.label}</span>
                                            <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                style={{ transition: 'transform 0.2s', transform: openApiIds.includes(apiId) ? 'rotate(180deg)' : 'rotate(0)' }}
                                            >
                                                <polyline points="6 9 12 15 18 9"></polyline>
                                            </svg>
                                        </div>

                                        {openApiIds.includes(apiId) && (
                                            <div className="api-details" style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-dark)', borderRadius: '4px' }}>
                                                {api.description && <p style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>{api.description}</p>}
                                                {api.permission && (
                                                    <div style={{ marginBottom: '8px' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>必要な権限: </span>
                                                        <code style={{ backgroundColor: 'var(--bg-hover)', padding: '2px 4px', borderRadius: '4px' }}>{api.permission}</code>
                                                    </div>
                                                )}
                                                {api.params && api.params.length > 0 && (
                                                    <div style={{ marginTop: '12px' }}>
                                                        <strong style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>Parameters:</strong>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                            <thead>
                                                                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                                                    <th style={{ padding: '4px' }}>Name</th>
                                                                    <th style={{ padding: '4px' }}>Type</th>
                                                                    <th style={{ padding: '4px' }}>Description</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {api.params.map(p => (
                                                                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                                                                        <td style={{ padding: '4px', color: 'var(--primary-light)' }}>
                                                                            {p.name}
                                                                            {p.required && <span style={{ color: 'var(--accent)', marginLeft: '2px' }}>*</span>}
                                                                        </td>
                                                                        <td style={{ padding: '4px', opacity: 0.7 }}>{p.type}</td>
                                                                        <td style={{ padding: '4px', opacity: 0.9 }}>{p.desc}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    const handleSelectDownloadPath = async () => {
        const path = await api.selectDownloadDirectory()
        if (path) {
            const newConfig = await api.updateClientConfig({ downloadPath: path })
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
                                    <span style={{ marginLeft: '10px', color: 'var(--primary-light)' }}>
                                        (最新: v{updateInfo.version})
                                    </span>
                                )}
                            </span>
                        </div>

                        <div style={{ width: '100%' }}>
                            {updateStatus === 'checking' && (
                                <div className="status-indicator">
                                    <div className="spinner"></div>
                                    <span>更新を確認中...</span>
                                </div>
                            )}

                            {updateStatus === 'downloading' && (
                                <div className="download-progress-container" style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                                        <span>ダウンロード中...</span>
                                        <span>{Math.round(downloadProgress)}%</span>
                                    </div>
                                    <div className="progress-bar-track" style={{ height: '6px', background: 'var(--bg-dark)', borderRadius: '3px' }}>
                                        <div
                                            className="progress-bar-fill"
                                            style={{
                                                width: `${downloadProgress}%`,
                                                height: '100%',
                                                background: 'var(--primary)',
                                                borderRadius: '3px',
                                                transition: 'width 0.3s'
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            )}

                            <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                {updateStatus === 'idle' && (
                                    <button className="btn-save" onClick={handleCheckForUpdates}>
                                        更新を確認
                                    </button>
                                )}

                                {updateStatus === 'available' && (
                                    <button className="btn-save" onClick={handleDownloadUpdate}>
                                        アップデートをダウンロード
                                    </button>
                                )}

                                {updateStatus === 'downloaded' && (
                                    <button className="btn-save" onClick={handleQuitAndInstall}>
                                        再起動してインストール
                                    </button>
                                )}

                                {updateStatus === 'not-available' && (
                                    <span className="settings-description" style={{ color: 'var(--primary-light)' }}>
                                        最新のバージョンを使用しています。
                                    </span>
                                )}

                                {updateStatus === 'error' && (
                                    <div style={{ color: 'var(--accent)', fontSize: '13px' }}>
                                        エラーが発生しました: {typeof updateInfo === 'string' ? updateInfo : '不明なエラー'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        )
    }

    const handleAddWatchPath = async () => {
        if (!window.electronAPI) return
        const path = await (window.electronAPI as any).selectFolder()
        if (path) {
            // Check dupes
            if (clientConfig?.autoImport.watchPaths.some((p: AutoImportPath) => p.path === path)) {
                alert('このフォルダは既に登録されています')
                return
            }

            // Default to first library if available
            const defaultLibId = availableLibraries.length > 0 ? availableLibraries[0].path : ''

            const newPath = {
                id: crypto.randomUUID(), // Or generate simple ID
                path,
                targetLibraryId: defaultLibId,
                enabled: true
            }

            const newConfig = {
                ...clientConfig!,
                autoImport: {
                    ...clientConfig!.autoImport,
                    watchPaths: [...(clientConfig!.autoImport.watchPaths || []), newPath]
                }
            }
            setClientConfig(newConfig);
            (window.electronAPI as any).updateClientConfig(newConfig)
        }
    }

    const handleRemoveWatchPath = (id: string) => {
        if (!clientConfig) return
        const newConfig: ClientConfig = {
            ...clientConfig,
            autoImport: {
                ...clientConfig.autoImport,
                watchPaths: clientConfig.autoImport.watchPaths.filter((p: AutoImportPath) => p.id !== id)
            }
        }
        setClientConfig(newConfig);
        (window.electronAPI as any).updateClientConfig(newConfig)
    }

    const handleUpdateWatchPath = (id: string, updates: Partial<AutoImportPath>) => {
        if (!clientConfig) return
        const newConfig: ClientConfig = {
            ...clientConfig,
            autoImport: {
                ...clientConfig.autoImport,
                watchPaths: clientConfig.autoImport.watchPaths.map((p: AutoImportPath) =>
                    p.id === id ? { ...p, ...updates } : p
                )
            }
        }
        setClientConfig(newConfig);
        (window.electronAPI as any).updateClientConfig(newConfig)
    }

    const renderImportSettings = () => {
        if (!clientConfig) return <div className="loading">読み込み中...</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">インポート・ダウンロード</h3>

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
                                    style={{ flex: 1, color: 'var(--text-muted)', cursor: 'not-allowed' }}
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

                <section className="settings-section">
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">自動インポートを有効にする</span>
                                <span className="settings-description">
                                    指定したフォルダを監視し、新しいファイルを自動的にインポートします。
                                </span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={clientConfig?.autoImport?.enabled || false}
                                    onChange={(e) => {
                                        const newConfig = {
                                            ...clientConfig,
                                            autoImport: {
                                                ...(clientConfig.autoImport || { watchPaths: [] }),
                                                enabled: e.target.checked
                                            }
                                        }
                                        setClientConfig(newConfig)
                                        if (window.electronAPI) (window.electronAPI as any).updateClientConfig(newConfig)
                                    }}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>

                        <div className="settings-divider" style={{ margin: '16px 0', borderBottom: '1px solid var(--border)' }}></div>

                        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="settings-label" style={{ fontSize: '13px' }}>監視フォルダ設定</span>
                            <button className="btn btn-secondary btn-sm" onClick={handleAddWatchPath}>
                                + フォルダを追加
                            </button>
                        </div>

                        {(!clientConfig.autoImport.watchPaths || clientConfig.autoImport.watchPaths.length === 0) ? (
                            <div className="watcher-empty">
                                監視フォルダが設定されていません
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {clientConfig.autoImport.watchPaths.map((p: AutoImportPath) => (
                                    <div key={p.id} className="watcher-item">
                                        <div style={{ width: '32px', display: 'flex', justifyContent: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={p.enabled}
                                                onChange={(e) => handleUpdateWatchPath(p.id, { enabled: e.target.checked })}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>インポート先: </span>
                                                <select
                                                    value={p.targetLibraryId}
                                                    onChange={(e) => handleUpdateWatchPath(p.id, { targetLibraryId: e.target.value })}
                                                    className="settings-input watcher-select"
                                                >
                                                    {availableLibraries.map(lib => (
                                                        <option key={lib.path} value={lib.path}>{lib.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.path}>
                                                {p.path}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleRemoveWatchPath(p.id)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--accent)',
                                                cursor: 'pointer',
                                                padding: '4px'
                                            }}
                                            title="削除"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="6"></line></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ marginTop: '16px', fontSize: '11px', color: '#eab308' }}>
                            ※ インポート完了後、元のファイルは完全に削除されます。
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <div className="settings-card">
                        <div className="settings-info" style={{ marginBottom: '16px' }}>
                            <span className="settings-label">他のライブラリへの追加設定</span>
                            <span className="settings-description">
                                ファイルを他のライブラリに追加する際、引き継ぐ情報を選択します。
                            </span>
                        </div>

                        {(() => {
                            const transferSettings = clientConfig?.libraryTransferSettings || {
                                keepTags: false,
                                keepArtists: false,
                                keepFolders: false,
                                keepRatings: false,
                                keepThumbnails: false,
                                keepUrl: false,
                                keepComments: false,
                                keepDescription: false
                            }

                            const updateTransferSettings = (key: keyof typeof transferSettings, value: boolean) => {
                                if (!clientConfig) return
                                const newConfig = {
                                    ...clientConfig,
                                    libraryTransferSettings: {
                                        ...transferSettings,
                                        [key]: value
                                    }
                                }
                                setClientConfig(newConfig)
                                if (window.electronAPI) (window.electronAPI as any).updateClientConfig(newConfig)
                            }

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[
                                        { key: 'keepTags', label: 'タグ情報を保持する' },
                                        { key: 'keepArtists', label: '投稿者情報を保持する' },
                                        { key: 'keepFolders', label: 'フォルダー構成を保持する' },
                                        { key: 'keepRatings', label: '評価を保持する' },
                                        { key: 'keepThumbnails', label: 'サムネイルを保持する' },
                                        { key: 'keepUrl', label: 'URLを保持する' },
                                        { key: 'keepComments', label: 'コメントを保持する' },
                                        { key: 'keepDescription', label: '説明欄を保持する' }
                                    ].map(item => (
                                        <div key={item.key} className="settings-row">
                                            <span className="settings-label" style={{ fontSize: '13px', fontWeight: 'normal' }}>{item.label}</span>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={(transferSettings as any)[item.key]}
                                                    onChange={(e) => updateTransferSettings(item.key as any, e.target.checked)}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            )
                        })()}
                    </div>
                </section>
            </div>
        )
    }

    const renderGeneralSettings = () => {
        if (!clientConfig) return <div className="loading">読み込み中...</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">一般設定</h3>

                {renderUpdateSection()}


                <section className="settings-section">
                    <h4 className="section-title">Discord リッチプレゼンス</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">Discord に再生状況を表示</span>
                                <span className="settings-description">
                                    再生中のメディア情報を Discord のステータスに表示します。
                                </span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={clientConfig.discordRichPresenceEnabled || false}
                                    onChange={(e) => {
                                        const newConfig = { ...clientConfig, discordRichPresenceEnabled: e.target.checked }
                                        setClientConfig(newConfig);
                                        (window.electronAPI as any).updateClientConfig({ discordRichPresenceEnabled: e.target.checked })
                                    }}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    // ... (renderNetworkSettingsなど)


    const handleSaveProfile = async () => {
        if (!window.electronAPI) return
        try {
            await window.electronAPI.updateClientConfig({
                nickname: nickname.trim(),
                iconUrl: selectedIcon
            })
            // 更新後のconfを再取得して反映
            const config = await window.electronAPI.getClientConfig()
            setClientConfig(config)

            // リモートライブラリへのプロファイル同期
            if (config.remoteLibraries && config.remoteLibraries.length > 0) {
                console.log('[Profile] Syncing profile to remote libraries...')
                Promise.all(config.remoteLibraries.map(lib =>
                    window.electronAPI.updateRemoteProfile(lib.url, lib.token, nickname.trim(), selectedIcon)
                        .then(res => {
                            if (!res.success) console.warn(`[Profile] Failed to sync to ${lib.name}:`, res.message)
                            else console.log(`[Profile] Synced to ${lib.name}`)
                        })
                        .catch(err => console.error(`[Profile] Error syncing to ${lib.name}:`, err))
                )).then(() => {
                    console.log('[Profile] Sync completed')
                })
            }

            alert('プロファイルを保存しました')
        } catch (e: any) {
            console.error('Failed to save profile:', e)
            alert('保存に失敗しました: ' + e.message)
        }
    }


    // renderAudioSettings removed from here

    const fileInputRef = useRef<HTMLInputElement>(null)

    const resizeImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
                const canvas = document.createElement('canvas')
                let width = img.width
                let height = img.height
                const maxSize = 1024

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width)
                        width = maxSize
                    } else {
                        width = Math.round((width * maxSize) / height)
                        height = maxSize
                    }
                }

                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                if (!ctx) return reject(new Error('Canvas context error'))

                ctx.drawImage(img, 0, 0, width, height)
                resolve(canvas.toDataURL('image/jpeg', 0.85))
            }
            img.onerror = reject
            img.src = URL.createObjectURL(file)
        })
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const resizedDataUrl = await resizeImage(file)
            setSelectedIcon(resizedDataUrl)
        } catch (err) {
            console.error('Failed to process image:', err)
            alert('画像の処理に失敗しました')
        }
    }



    const renderProfileSettings = () => {
        return (
            <div className="settings-page">
                <h3 className="settings-page-title">プロファイル設定</h3>
                <section className="settings-section">
                    <div className="settings-card">
                        <div className="settings-info" style={{ marginBottom: '16px' }}>
                            <span className="settings-description">
                                ここで設定したニックネームとアイコンは、リモートライブラリへの接続時や、ホストとしてライブラリを公開する際に使用されます。
                            </span>
                        </div>

                        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                            <label className="settings-label">ニックネーム</label>
                            <input
                                type="text"
                                className="settings-input"
                                placeholder="あなたの表示名"
                                value={nickname}
                                onChange={e => setNickname(e.target.value)}
                                maxLength={50}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px', marginTop: '16px' }}>
                            <label className="settings-label">アイコン</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {DEFAULT_ICONS.map(icon => (
                                    <button
                                        key={icon}
                                        type="button"
                                        style={{
                                            fontSize: '24px',
                                            width: '40px',
                                            height: '40px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: selectedIcon === icon ? 'var(--primary)' : 'var(--bg-dark)',
                                            border: selectedIcon === icon ? '1px solid var(--primary-light)' : '1px solid var(--border)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onClick={() => setSelectedIcon(icon)}
                                    >
                                        {icon}
                                    </button>
                                ))}
                                <div style={{ width: '1px', height: '32px', background: 'var(--border)', margin: '0 8px' }}></div>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ height: '40px', padding: '0 12px' }}
                                >
                                    画像を選択...
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    style={{ display: 'none' }}
                                    onChange={handleFileSelect}
                                />
                            </div>
                        </div>

                        <div className="settings-row" style={{ marginTop: '24px', justifyContent: 'flex-start', gap: '16px', borderTop: '1px solid #333', paddingTop: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '48px', height: '48px',
                                    background: 'var(--bg-dark)',
                                    borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '24px',
                                    border: '2px solid var(--border)',
                                    overflow: 'hidden'
                                }}>
                                    {selectedIcon && selectedIcon.startsWith('http') || selectedIcon.startsWith('data:') || selectedIcon.startsWith('/api') ? (
                                        <img src={selectedIcon} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        selectedIcon
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{nickname || '（未設定）'}</span>
                                    <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-dark)', borderRadius: '4px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>プレビュー</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ flex: 1 }}></div>
                            <button className="btn btn-primary" onClick={handleSaveProfile} disabled={!nickname.trim()}>
                                保存
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal-container" onClick={e => e.stopPropagation()}>
                <div className="settings-modal-sidebar">
                    <div className="settings-sidebar-header">
                        <h2>環境設定</h2>
                    </div>
                    <div className="settings-sidebar-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input
                            type="text"
                            placeholder="設定を検索..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <nav className="settings-sidebar-nav">
                        {categories.filter(c =>
                            c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            c.group.toLowerCase().includes(searchQuery.toLowerCase())
                        ).map((cat, index, filtered) => {
                            const showGroupAttr = index === 0 || filtered[index - 1].group !== cat.group
                            return (
                                <div key={cat.id} style={{ display: 'contents' }}>
                                    {showGroupAttr && (
                                        <div className="settings-nav-group-title">
                                            {cat.group}
                                        </div>
                                    )}
                                    <button
                                        className={`settings-nav-item ${activeCategory === cat.id ? 'active' : ''}`}
                                        onClick={() => setActiveCategory(cat.id)}
                                    >
                                        {cat.icon}
                                        <span>{cat.label}</span>
                                    </button>
                                </div>
                            )
                        })}
                    </nav>
                </div>

                <div className="settings-modal-main">
                    <header className="settings-header">
                        <span className="settings-category-title">{categories.find(c => c.id === activeCategory)?.label || ''}</span>
                        <button className="settings-close-btn" onClick={onClose}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg>
                        </button>
                    </header>

                    <div className="settings-main-content">
                        {activeCategory === 'general' ? renderGeneralSettings() :
                            activeCategory === 'profile' ? renderProfileSettings() :
                                activeCategory === 'theme' ? renderThemeSettings() :
                                    activeCategory === 'import' ? renderImportSettings() :
                                        activeCategory === 'viewer' ? renderViewerSettings() :
                                            activeCategory === 'network' ? renderNetworkSettings() :
                                                activeCategory === 'shortcuts' ? renderShortcutsSettings() :
                                                    activeCategory === 'media-engine' ? renderMediaEngineSettings() :
                                                        activeCategory === 'audio' ? <AudioSettings clientConfig={clientConfig} setClientConfig={setClientConfig} /> :
                                                            activeCategory === 'developer' ? renderDeveloperSettings() : (
                                                                <div className="empty-state">
                                                                    <p>このセクションの設定は準備中です。</p>
                                                                </div>
                                                            )}
                    </div>

                    <footer className="settings-main-footer">
                        <button className="btn-save" onClick={onClose}>閉じる</button>
                    </footer>
                </div>
            </div>
        </div>
    )
}

const AudioSettings = ({ clientConfig, setClientConfig }: { clientConfig: ClientConfig, setClientConfig: (config: ClientConfig) => void }) => {
    const [audioDevices, setAudioDevices] = useState<{ name: string, description: string }[]>([])

    useEffect(() => {
        api.getAudioDevices()
            .then(devices => setAudioDevices(devices))
            .catch(console.error)
    }, [])

    const useMpvAudio = clientConfig?.useMpvAudio || false
    const exclusiveMode = clientConfig?.exclusiveMode || false
    const enableMpvForVideo = clientConfig?.enableMpvForVideo || false
    const currentDevice = clientConfig?.audioDevice || 'auto'

    const updateConfig = async (update: Partial<ClientConfig>) => {
        try {
            await api.updateClientConfig(update)
            setClientConfig({ ...clientConfig, ...update })

            // Trigger backend updates if needed
            if (update.audioDevice) {
                await api.setAudioDevice(update.audioDevice)
            }
            if (update.exclusiveMode !== undefined) {
                await api.setExclusiveMode(update.exclusiveMode)
            }
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="settings-page">
            <h3 className="settings-page-title">オーディオ設定</h3>
            <section className="settings-section">
                <div className="settings-card">
                    {/* Master Switch: Enable WASAPI/MPV */}
                    <div className="settings-row">
                        <div className="settings-info">
                            <span className="settings-label">WASAPI (MPVバックエンド) を使用する</span>
                            <span className="settings-description">
                                高品質なオーディオ再生のためにMPVバックエンドを使用します。<br />
                                <span style={{ fontSize: '0.85em', opacity: 0.8 }}>無効の場合は標準のWeb Audio (Shared Mode) が使用されます。</span>
                            </span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={useMpvAudio}
                                onChange={(e) => updateConfig({ useMpvAudio: e.target.checked })}
                            />
                            <span className="slider"></span>
                        </label>
                    </div>

                    {/* Dependent Settings */}
                    <div style={{ opacity: useMpvAudio ? 1 : 0.5, pointerEvents: useMpvAudio ? 'auto' : 'none', transition: 'opacity 0.2s' }}>

                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">出力デバイス</span>
                                <span className="settings-description">
                                    再生に使用するオーディオデバイスを選択します。
                                </span>
                            </div>
                            <select
                                className="settings-input"
                                style={{ width: '250px' }}
                                value={currentDevice}
                                onChange={(e) => updateConfig({ audioDevice: e.target.value })}
                                disabled={!useMpvAudio}
                            >
                                <option value="auto">自動 (デフォルト)</option>
                                {audioDevices.map((dev, i) => (
                                    <option key={i} value={dev.name}>
                                        {dev.description}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">WASAPI 排他モード (Exclusive Mode)</span>
                                <span className="settings-description">
                                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>⚠ 実験的機能</span><br />
                                    システムミキサーをバイパスし、ビットパーフェクトな再生を行います。<br />
                                    有効にすると、他のアプリケーションの音声は再生されなくなります。
                                </span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={exclusiveMode}
                                    onChange={(e) => updateConfig({ exclusiveMode: e.target.checked })}
                                    disabled={!useMpvAudio}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>

                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">動画ファイルでも使用する (音声のみ)</span>
                                <span className="settings-description">
                                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>⚠ 画面は真っ暗になります</span><br />
                                    MP4などの動画ファイルでも高音質再生を行いますが、<br />映像は表示されません。
                                </span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={enableMpvForVideo}
                                    onChange={(e) => updateConfig({ enableMpvForVideo: e.target.checked })}
                                    disabled={!useMpvAudio}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>

                    </div>
                </div>
            </section>
        </div>
    )
}
