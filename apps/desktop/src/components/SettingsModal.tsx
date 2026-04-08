import { useState, useEffect, useCallback, useContext, useRef } from 'react'
import { api } from '../api'
import { AppSettings, Library, ClientConfig, AutoImportPath, Theme, ThemeColors } from '@obscura/core'
import { ShortcutContext, ShortcutAction } from '../contexts/ShortcutContext'
import { useTheme } from '../hooks/useTheme'
import { defaultDarkTheme, parseThemeCss, THEME_TEMPLATES } from '../utils/themeManager'
import { ConfirmModal } from './ConfirmModal'
import { getBundledReleaseNotesHistory } from '../releaseNotes'
import './SettingsModal.css'

interface SettingsModalProps {
    settings: AppSettings
    onUpdateSettings: (settings: AppSettings) => void
    onClose: () => void
    onLibraryRestored?: () => void | Promise<void>
    language?: 'ja' | 'en'
    initialClientConfig?: ClientConfig | null
}

// 削除された定義
type Category = 'general' | 'sidebar' | 'controls' | 'viewer' | 'screenshot' | 'shortcuts' | 'notification' | 'password' | 'import' | 'network' | 'developer' | 'media-engine' | 'profile' | 'theme' | 'audio' | 'extensions'


// JS_API_REFERENCE and API_ENDPOINTS constants removed. Use external documentation.

// Documentation moved to api-data.js and external site.


const PERMISSION_LABELS: Record<string, string> = {
    'READ_ONLY': '閲覧',
    'DOWNLOAD': 'DL',
    'UPLOAD': 'UP',
    'EDIT': '編集',
    'FULL': 'フル'
}

const PERMISSION_LABELS_EN: Record<string, string> = {
    'READ_ONLY': 'Read',
    'DOWNLOAD': 'DL',
    'UPLOAD': 'UP',
    'EDIT': 'Edit',
    'FULL': 'Full'
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

const SHORTCUT_LABELS_EN: Record<string, string> = {
    'PLAYER_TOGGLE_PLAY': 'Play / Pause',
    'PLAYER_FORWARD': 'Forward 10s',
    'PLAYER_REWIND': 'Rewind 10s',
    'PLAYER_STEP_FORWARD': 'Step 1 frame (paused only)',
    'PLAYER_STEP_BACKWARD': 'Back 1 frame (paused only)',
    'PLAYER_VOLUME_UP': 'Volume up',
    'PLAYER_VOLUME_DOWN': 'Volume down',
    'PLAYER_TOGGLE_MUTE': 'Toggle mute',
    'PLAYER_TOGGLE_FULLSCREEN': 'Toggle fullscreen',
    'NAV_ENTER': 'Open item',
    'NAV_BACK': 'Back',
    'NAV_UP': 'Move up',
    'NAV_DOWN': 'Move down',
    'NAV_LEFT': 'Move left',
    'NAV_RIGHT': 'Move right'
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

const DEFAULT_INSPECTOR_SECTION_VISIBILITY = {
    artist: true,
    description: true,
    relations: true,
    url: true,
    tags: true,
    folders: true,
    info: true,
    comments: true,
    playlist: true
}

const DEFAULT_INSPECTOR_INFO_VISIBILITY = {
    rating: true,
    resolution: true,
    duration: true,
    fileSize: true,
    importedAt: true,
    createdAt: true,
    modifiedAt: true,
    audioBitrate: true,
    framerate: true,
    formatName: true,
    codecId: true
}

export function SettingsModal({ settings, onUpdateSettings, onClose, onLibraryRestored, language = 'ja', initialClientConfig = null }: SettingsModalProps) {
    const tr = (ja: string, en: string) => language === 'en' ? en : ja
    const [releaseNotesHistoryModal, setReleaseNotesHistoryModal] = useState<null | {
        title: string
        description: string
        releaseNotes: string
    }>(null)
    const [confirmState, setConfirmState] = useState<null | {
        title: string
        message: string
        confirmLabel?: string
        isDestructive?: boolean
        onConfirm: () => void | Promise<void>
    }>(null)
    const [activeCategory, setActiveCategory] = useState<Category>('general')
    const [appVersion, setAppVersion] = useState<string>('Unknown')
    const [searchQuery, setSearchQuery] = useState('')
    const inspectorSettings = {
        sectionVisibility: {
            ...DEFAULT_INSPECTOR_SECTION_VISIBILITY,
            ...(settings.inspector?.sectionVisibility || {})
        },
        infoVisibility: {
            ...DEFAULT_INSPECTOR_INFO_VISIBILITY,
            ...(settings.inspector?.infoVisibility || {})
        },
        playlistPrevVisibleCount: Number.isFinite(Number(settings.inspector?.playlistPrevVisibleCount))
            ? Math.max(0, Math.min(50, Number(settings.inspector?.playlistPrevVisibleCount)))
            : 1,
        playlistNextVisibleCount: Number.isFinite(Number(settings.inspector?.playlistNextVisibleCount))
            ? Math.max(0, Math.min(50, Number(settings.inspector?.playlistNextVisibleCount)))
            : (() => {
                const legacy = Number.isFinite(Number(settings.inspector?.playlistVisibleCount))
                    ? Math.max(3, Math.min(50, Number(settings.inspector?.playlistVisibleCount)))
                    : 12
                return Math.max(0, legacy - 2)
            })()
    }
    const [expandedInspectorOption, setExpandedInspectorOption] = useState<string | null>('section:artist')

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
        { id: 'general', label: tr('基本設定', 'General'), group: tr('基本', 'Core'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> },
        { id: 'profile', label: tr('プロフィール', 'Profile'), group: tr('基本', 'Core'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },

        // 表示・操作
        { id: 'theme', label: tr('テーマ', 'Theme'), group: tr('表示・操作', 'Display & Controls'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg> },
        { id: 'viewer', label: tr('ビューアー', 'Viewer'), group: tr('表示・操作', 'Display & Controls'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> },
        { id: 'shortcuts', label: tr('ショートカット', 'Shortcuts'), group: tr('表示・操作', 'Display & Controls'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="6" y1="8" x2="6" y2="8"></line><line x1="10" y1="8" x2="10" y2="8"></line><line x1="14" y1="8" x2="14" y2="8"></line><line x1="18" y1="8" x2="18" y2="8"></line><line x1="6" y1="12" x2="6" y2="12"></line><line x1="10" y1="12" x2="10" y2="12"></line><line x1="14" y1="12" x2="14" y2="12"></line><line x1="18" y1="12" x2="18" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg> },

        // ライブラリ
        { id: 'import', label: tr('インポート・ダウンロード', 'Import & Download'), group: tr('ライブラリ', 'Library'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> },
        { id: 'audio', label: tr('オーディオ', 'Audio'), group: tr('ライブラリ', 'Library'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> },
        { id: 'media-engine', label: tr('メディアエンジン', 'Media Engine'), group: tr('ライブラリ', 'Library'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> },
        { id: 'network', label: tr('ネットワーク同期', 'Network Sync'), group: tr('ライブラリ', 'Library'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg> },

        // システム
        { id: 'extensions', label: tr('拡張機能', 'Extensions'), group: tr('システム', 'System'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> },
        { id: 'developer', label: tr('開発者ツール', 'Developer Tools'), group: tr('システム', 'System'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> },
    ]

    const handleToggle = (key: keyof AppSettings) => {
        onUpdateSettings({
            ...settings,
            [key]: !settings[key]
        })
    }

    const updateInspectorSettings = (updates: Partial<AppSettings['inspector']>) => {
        onUpdateSettings({
            ...settings,
            inspector: {
                ...inspectorSettings,
                ...(updates || {}),
                sectionVisibility: {
                    ...inspectorSettings.sectionVisibility,
                    ...((updates as any)?.sectionVisibility || {})
                },
                infoVisibility: {
                    ...inspectorSettings.infoVisibility,
                    ...((updates as any)?.infoVisibility || {})
                }
            }
        })
    }

    // APIメニュー開閉 State removed

    const [availablePlugins, setAvailablePlugins] = useState<any[]>([])

    // 拡張機能一覧の取得
    useEffect(() => {
        if (activeCategory === 'extensions') {
            api.getPluginScripts().then(scripts => {
                setAvailablePlugins(scripts || [])
            }).catch(e => console.error('[Settings] Failed to load plugin scripts:', e))
        }
    }, [activeCategory])

    // データ読み込み
    const [serverConfig, setServerConfig] = useState<any>(null)
    const [sharedUsers, setSharedUsers] = useState<any[]>([])
    const [myUserToken, setMyUserToken] = useState<string>('')
    const [isServerRunning, setIsServerRunning] = useState<boolean>(false)
    const [serverToggleBusy, setServerToggleBusy] = useState(false)
    const [activeTab, setActiveTab] = useState<'host' | 'client'>('host')
    const [libraries, setLibraries] = useState<Library[]>([])

    // === クライアント設定 State ===
    const [clientConfig, setClientConfig] = useState<any>(initialClientConfig)
    const [activeLocalLibrary, setActiveLocalLibrary] = useState<Library | null>(null)
    const [libraryBackups, setLibraryBackups] = useState<{ id: string; createdAt: string; fileName: string; size: number }[]>([])
    const [backupBusy, setBackupBusy] = useState(false)
    const [networkDataLoaded, setNetworkDataLoaded] = useState(false)
    const [networkDataLoading, setNetworkDataLoading] = useState(false)

    useEffect(() => {
        if (initialClientConfig) {
            setClientConfig(initialClientConfig)
        }
    }, [initialClientConfig])

    const loadNetworkData = useCallback(async (force = false) => {
        if (networkDataLoading) return
        if (networkDataLoaded && !force) return

        setNetworkDataLoading(true)
        try {
            const clientConfigPromise = clientConfig
                ? Promise.resolve(clientConfig)
                : api.getClientConfig()

            const [config, running, users, cConfig, token, libs] = await Promise.all([
                api.getServerConfig(),
                api.getServerStatus(),
                api.getSharedUsers(),
                clientConfigPromise,
                api.generateUserToken(),
                api.getLibraries(),
            ])

            setServerConfig(config)
            setIsServerRunning(running)
            setSharedUsers(users)
            setClientConfig(cConfig)
            setMyUserToken(token)
            setLibraries(libs)
            setNetworkDataLoaded(true)
        } catch (e) {
            console.error('Failed to load network settings data:', e)
        } finally {
            setNetworkDataLoading(false)
        }
    }, [clientConfig, networkDataLoaded, networkDataLoading])

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
        setConfirmState({
            title: tr('テーマを削除', 'Delete theme'),
            message: tr('このテーマを削除してもよろしいですか？', 'Delete this theme?'),
            confirmLabel: tr('削除', 'Delete'),
            isDestructive: true,
            onConfirm: () => deleteTheme(id),
        })
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
        alert(tr('テンプレートをクリップボードにコピーしました', 'Template copied to clipboard'))
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

    const loadAvailableLibraries = useCallback(async () => {
        try {
            const libs = await api.getLibraries()
            setAvailableLibraries(Array.isArray(libs) ? libs : [])
        } catch (e: any) {
            console.error('Failed to get libraries:', e)
            setAvailableLibraries([])
        }
    }, [])

    useEffect(() => {
        void loadAvailableLibraries()
    }, [loadAvailableLibraries])

    // === Profile Settings State ===
    const [nickname, setNickname] = useState('')
    const [selectedIcon, setSelectedIcon] = useState('')

    useEffect(() => {
        if (activeCategory === 'profile' && clientConfig) {
            setNickname(clientConfig.nickname || '')
            const icon = clientConfig.iconUrl || ''
            // 絵文字なら空文字にする（撤廃）
            if (icon && !icon.startsWith('data:') && !icon.startsWith('http') && !icon.startsWith('/api')) {
                setSelectedIcon('')
            } else {
                setSelectedIcon(icon)
            }
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
                <div className="settings-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="color"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="color-input"
                        style={{ width: '32px', height: '32px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="settings-input"
                        style={{ width: '90px' }}
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
                        {isEdit ? tr('テーマを編集', 'Edit Theme') : tr('新しいテーマを作成', 'Create New Theme')}
                    </h3>
                    <div className="settings-section">
                        {!isEdit && (
                            <div className="settings-row">
                                <div className="settings-info">
                                    <span className="settings-label">{tr('テーマ名', 'Theme Name')}</span>
                                </div>
                                <input
                                    type="text"
                                    value={newThemeName}
                                    onChange={(e) => setNewThemeName(e.target.value)}
                                    className="form-control"
                                    placeholder={tr('テーマ名を入力', 'Enter theme name')}
                                />
                            </div>
                        )}

                        <h4 className="section-title">{tr('カラー設定', 'Color Settings')}</h4>
                        {Object.keys(editingColors).map((key) =>
                            renderColorPicker(key as keyof ThemeColors, editingColors[key as keyof ThemeColors], (val) => {
                                setEditingColors(prev => ({ ...prev, [key]: val }))
                            })
                        )}

                        <div className="settings-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={handleCancel}>{tr('キャンセル', 'Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={!isEdit && !newThemeName.trim()}>
                                {isEdit ? tr('更新', 'Update') : tr('作成', 'Create')}
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('テーマ設定', 'Theme Settings')}</h3>
                <div className="settings-section">
                    <div className="settings-header-actions" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                        <span className="settings-description" style={{ margin: 0 }}>
                            {tr('アプリの外観をカスタマイズできます。プリセットから選ぶか、独自のテーマを作成してください。', 'Customize the app appearance. Choose a preset or create your own theme.')}
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary btn-sm" style={{ height: '32px', padding: '0 12px' }} onClick={() => {
                                setEditingColors(defaultDarkTheme.colors)
                                setIsCreatingTheme(true)
                            }}>
                                {tr('新規作成', 'New')}
                            </button>
                            <button className="btn btn-secondary btn-sm" style={{ height: '32px', padding: '0 12px' }} onClick={() => setShowTemplateModal(true)}>
                                {tr('テンプレート', 'Templates')}
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button className="btn btn-secondary btn-sm" style={{ height: '32px', padding: '0 12px' }} onClick={() => document.getElementById('theme-import-input')?.click()}>
                                    {tr('CSSからインポート', 'Import from CSS')}
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



                    <div className="theme-grid">
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
                                <div className="theme-info">
                                    <span className="theme-card-name">{theme.name}</span>
                                    {theme.isSystem ? (
                                        <span className="badge system-badge">System</span>
                                    ) : (
                                        <div className="theme-actions" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="btn-icon-sm"
                                                title={tr('編集', 'Edit')}
                                                onClick={() => startEditTheme(theme)}
                                                style={{ marginRight: '5px' }}
                                            >
                                                ✎
                                            </button>
                                            <button
                                                className="btn-icon-sm text-danger"
                                                title={tr('削除', 'Delete')}
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
                <h3 className="settings-page-title">{tr('メディアエンジン', 'Media Engine')}</h3>
                <section className="settings-section">
                    <h4 className="section-title">{tr('FFmpeg 設定', 'FFmpeg Settings')}</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('現在のバージョン', 'Current version')}</span>
                                <span className="settings-description">
                                    {ffmpegInfo?.version || tr('読み込み中...', 'Loading...')}
                                </span>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => {
                                if (ffmpegInfo?.path) {
                                    api.copyToClipboard(ffmpegInfo.path)
                                    alert(tr('パスをコピーしました', 'Copied path'))
                                }
                            }}>
                                {tr('パスをコピー', 'Copy path')}
                            </button>
                        </div>
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('バイナリパス', 'Binary path')}</span>
                                <span className="settings-description" style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                    {ffmpegInfo?.path || '...'}
                                </span>
                            </div>
                        </div>
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('アップデート', 'Update')}</span>
                                <span className="settings-description">
                                    {ffmpegUpdateStatus === 'checking' && tr('更新を確認中...', 'Checking for updates...')}
                                    {ffmpegUpdateStatus === 'up-to-date' && tr('最新です', 'Up to date')}
                                    {ffmpegUpdateStatus === 'available' && tr('新しいバージョンが利用可能です', 'A new version is available')}
                                    {ffmpegUpdateStatus === 'updating' && `${tr('更新中...', 'Updating...')} ${ffmpegUpdateProgress}%`}
                                    {ffmpegUpdateStatus === 'error' && tr('エラーが発生しました', 'An error occurred')}
                                    {ffmpegUpdateStatus === 'idle' && tr('手動で更新を確認できます', 'You can check for updates manually')}
                                </span>
                            </div>
                            <div>
                                {ffmpegUpdateStatus === 'available' ? (
                                    <button className="btn btn-primary btn-sm" onClick={handleUpdateFFmpeg}>
                                        {tr('今すぐ更新', 'Update now')}
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={handleCheckFFmpegUpdate}
                                        disabled={ffmpegUpdateStatus === 'checking' || ffmpegUpdateStatus === 'updating'}
                                    >
                                        {tr('更新を確認', 'Check updates')}
                                    </button>
                                )}
                            </div>
                        </div>
                        {ffmpegUpdateStatus === 'updating' && (
                            <div className="settings-padded-content" style={{ paddingTop: 0 }}>
                                <div style={{ height: '4px', background: 'var(--bg-dark)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: 'var(--primary)', width: `${ffmpegUpdateProgress}%`, transition: 'width 0.2s' }}></div>
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
        const shortcutLabels = language === 'en' ? SHORTCUT_LABELS_EN : SHORTCUT_LABELS

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('ショートカット設定', 'Shortcut Settings')}</h3>
                <div className="settings-padded-content" style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 0 }}>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                            if (confirm(tr('すべてのショートカットを初期設定に戻しますか？', 'Reset all shortcuts to default?'))) {
                                shortcutContext.resetKeyMap()
                            }
                        }}
                    >
                        {tr('デフォルトに戻す', 'Reset to default')}
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
                                                <span className="settings-label">{shortcutLabels[action] || action}</span>
                                                {isDup && <span style={{ color: 'var(--accent)', fontSize: '11px', marginLeft: '8px' }}>{tr('⚠ 重複', '⚠ Duplicate')}</span>}
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
                                                {recordingAction === action ? tr('キーを入力...', 'Press key...') : (keyMap[action] || tr('未設定', 'Unassigned'))}
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
                                <span className="settings-label">{tr('前の動画', 'Previous media')}</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                Mouse Button 4 (戻る)
                            </div>
                        </div>
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('次の動画', 'Next media')}</span>
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

    const handleOpenReleaseNotesHistory = useCallback(() => {
        const history = getBundledReleaseNotesHistory(language)
        const formatted = history
            .map((entry) => `v${entry.version}\n${entry.releaseNotes}`)
            .join('\n\n')
            .trim()

        setReleaseNotesHistoryModal({
            title: tr('更新履歴', 'Release Notes'),
            description: tr('これまでの更新履歴を表示しています。', 'Showing bundled release notes history.'),
            releaseNotes: formatted || tr('変更履歴は取得できませんでした。', 'Release notes could not be loaded.'),
        })
    }, [language])

    useEffect(() => {
        void loadNetworkData()
    }, [loadNetworkData])

    // データ読み込み
    useEffect(() => {
        const loadData = async () => {
            if (activeCategory === 'network' || activeCategory === 'developer') {
                await loadNetworkData()
            } else if (activeCategory === 'general' || activeCategory === 'import' || activeCategory === 'profile' || activeCategory === 'audio') {
                try {
                    if (!clientConfig) {
                        const config = await api.getClientConfig()
                        setClientConfig(config)
                    }
                } catch (e) {
                    console.error('Failed to load client config:', e)
                }
            }
        }
        loadData()
    }, [activeCategory, clientConfig, loadNetworkData])

    const syncServerRuntimeState = useCallback(async (expected?: boolean) => {
        let running = false
        for (let i = 0; i < 5; i += 1) {
            running = await api.getServerStatus()
            if (expected === undefined || running === expected) break
            await new Promise((resolve) => setTimeout(resolve, 150))
        }
        setIsServerRunning(running)
        const config = await api.getServerConfig()
        setServerConfig(config)
        return running
    }, [])

    const handleToggleServer = useCallback(async () => {
        if (serverToggleBusy) return
        setServerToggleBusy(true)
        try {
            const nextRunning = !isServerRunning
            if (isServerRunning) {
                const result = await api.stopServer()
                if (!(result as any)?.success) {
                    throw new Error((result as any)?.error || tr('サーバー停止に失敗しました', 'Failed to stop server'))
                }
            } else {
                const result = await api.startServer()
                if (!(result as any)?.success) {
                    throw new Error((result as any)?.error || tr('サーバー起動に失敗しました', 'Failed to start server'))
                }
            }
            const actualRunning = await syncServerRuntimeState(nextRunning)
            if (actualRunning !== nextRunning) {
                const mismatchMessage = nextRunning
                    ? tr('サーバーは起動要求後も停止状態のままです', 'The server remained stopped after the start request')
                    : tr('サーバーは停止要求後も起動状態のままです', 'The server remained running after the stop request')
                throw new Error(mismatchMessage)
            }
        } catch (e) {
            console.error('Failed to toggle server:', e)
            alert(tr(`サーバー状態の切り替えに失敗しました: ${(e as any)?.message || e}`, `Failed to toggle server state: ${(e as any)?.message || e}`))
            await syncServerRuntimeState()
        } finally {
            setServerToggleBusy(false)
        }
    }, [isServerRunning, serverToggleBusy, syncServerRuntimeState, tr])

    const loadLibraryBackupState = useCallback(async () => {
        try {
            const library = await api.getActiveLibrary()
            setActiveLocalLibrary(library)
            if (!library) {
                setLibraryBackups([])
                return
            }
            const backups = await api.listLibraryBackups()
            setLibraryBackups(Array.isArray(backups) ? backups : [])
        } catch (error) {
            console.error('Failed to load library backups:', error)
            setActiveLocalLibrary(null)
            setLibraryBackups([])
        }
    }, [])

    const handleCreateLibraryBackup = useCallback(async () => {
        setBackupBusy(true)
        try {
            const result = await api.createLibraryBackup()
            if (!(result as any)?.success) {
                throw new Error(tr('バックアップの作成に失敗しました', 'Failed to create backup'))
            }
            await loadLibraryBackupState()
        } catch (error) {
            console.error('Failed to create library backup:', error)
            alert(tr('バックアップの作成に失敗しました', 'Failed to create backup'))
        } finally {
            setBackupBusy(false)
        }
    }, [loadLibraryBackupState])

    const handleRestoreLibraryBackup = useCallback((backupId: string) => {
        setConfirmState({
            title: tr('バックアップを復元', 'Restore backup'),
            message: tr('このバックアップを復元しますか？現在のメタデータは上書きされます。', 'Restore this backup? Current metadata will be overwritten.'),
            confirmLabel: tr('復元', 'Restore'),
            isDestructive: true,
            onConfirm: async () => {
                setBackupBusy(true)
                try {
                    const result = await api.restoreLibraryBackup(backupId)
                    if (!(result as any)?.success) {
                        throw new Error('restore failed')
                    }
                    await loadLibraryBackupState()
                    if (onLibraryRestored) {
                        await onLibraryRestored()
                    }
                    onClose()
                } catch (error) {
                    console.error('Failed to restore library backup:', error)
                    alert(tr('バックアップの復元に失敗しました', 'Failed to restore backup'))
                } finally {
                    setBackupBusy(false)
                }
            },
        })
    }, [loadLibraryBackupState, onClose, onLibraryRestored, tr])

    useEffect(() => {
        if (activeCategory === 'general') {
            void loadLibraryBackupState()
        }
    }, [activeCategory, loadLibraryBackupState])

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
        setConfirmState({
            title: tr('ユーザーを削除', 'Delete user'),
            message: tr('このユーザーを削除しますか？', 'Delete this user?'),
            confirmLabel: tr('削除', 'Delete'),
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await api.deleteSharedUser(userId)
                    setSharedUsers(sharedUsers.filter(u => u.id !== userId))
                } catch (e) {
                    console.error('Failed to delete user:', e)
                }
            },
        })
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
        const permissionLabels = language === 'en' ? PERMISSION_LABELS_EN : PERMISSION_LABELS
        // アクティブユーザー判定 (5分以内)
        const activeUsers = sharedUsers.filter(u => {
            if (!u.lastAccessAt) return false
            const diff = Date.now() - new Date(u.lastAccessAt).getTime()
            return diff < 5 * 60 * 1000
        })

        return (
            <div className="settings-section" style={{ marginTop: '24px', borderTop: '1px solid #333', paddingTop: '16px' }}>
                <h4 className="section-title">{tr('ユーザー管理', 'User Management')}</h4>

                {/* 接続中ユーザー */}
                <div className="settings-card">
                    <div className="settings-row-vertical">
                        <span className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activeUsers.length > 0 ? '#10b981' : '#6b7280' }}></span>
                            {tr('現在の接続数', 'Current connections')}: {activeUsers.length}
                        </span>
                        {activeUsers.length > 0 && (
                            <div className="active-users-list" style={{ marginLeft: '16px' }}>
                                {activeUsers.map(u => (
                                    <span key={u.id} className="active-user-badge">
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', marginRight: '6px' }}></div>
                                        {u.nickname || tr('未指定', 'Unspecified')}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 新規ユーザー追加 */}
                <div className="settings-card">
                    <div className="settings-row-vertical">
                        <span className="settings-label">{tr('新規ユーザー追加', 'Add User')}</span>
                        <p className="settings-description" style={{ margin: 0 }}>
                            {tr('ユーザーから受け取ったトークンを入力し、アクセストークンを発行してください。', 'Enter the token received from the user and issue an access token.')}
                        </p>
                        <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center', marginTop: '4px' }}>
                            <input
                                type="text"
                                placeholder={tr('ユーザートークンを入力', 'Enter user token')}
                                value={inputUserToken}
                                onChange={e => setInputUserToken(e.target.value)}
                                className="settings-input"
                                style={{ flex: 1, minWidth: 0 }}
                            />
                            <button className="btn btn-primary btn-small" onClick={handleAddUser} disabled={!inputUserToken.trim()} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {tr('発行', 'Issue')}
                            </button>
                        </div>
                        {newAccessToken && (
                            <div className="token-display" style={{ width: '100%' }}>
                                <p>{tr('アクセストークンを共有してください（一度しか表示されません）', 'Share this access token (shown only once)')}:</p>
                                <code>{newAccessToken}</code>
                                <button
                                    onClick={() => {
                                        api.copyToClipboard(newAccessToken)
                                        setNewAccessToken(null)
                                    }}
                                    className="btn btn-outline btn-small"
                                    style={{ marginTop: '8px' }}
                                >
                                    {tr('コピーして閉じる', 'Copy and close')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 全ユーザーリスト */}
                <div className="settings-card">
                    <div className="settings-padded-content">
                        <span className="settings-label">{tr('登録ユーザー一覧', 'Registered users')}</span>
                        <div className="users-list">
                            {sharedUsers.map(u => (
                                <div key={u.id} className="user-card-item">
                                    <div className="user-card-header">
                                        <span className="user-card-name">{u.nickname || tr('未指定', 'Unspecified')}</span>
                                        <button
                                            onClick={() => handleDeleteUser(u.id)}
                                            className="icon-button delete"
                                            title={tr('削除', 'Delete')}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                    <div className="user-card-last-access">
                                        {tr('最終アクセス', 'Last seen')}: {u.lastAccessAt ? new Date(u.lastAccessAt).toLocaleString() : tr('未アクセス', 'Never')}
                                    </div>
                                    {/* トークン表示 (スポイラー形式) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div className="token-row">
                                            <div className="token-label-row">
                                                <span className="token-label">{tr('ユーザートークン', 'User token')}</span>
                                                {visibleTokens[u.id] === 'user' && (
                                                    <button
                                                        onClick={() => api.copyToClipboard(u.userToken)}
                                                        className="btn btn-outline btn-small"
                                                    >
                                                        {tr('コピー', 'Copy')}
                                                    </button>
                                                )}
                                            </div>
                                            <div
                                                onClick={() => toggleTokenVisibility(u.id, 'user')}
                                                className={`token-value-box ${visibleTokens[u.id] === 'user' ? 'revealed' : ''}`}
                                            >
                                                {visibleTokens[u.id] === 'user' ? u.userToken : tr('クリックして表示', 'Click to reveal')}
                                            </div>
                                        </div>
                                        <div className="token-row">
                                            <div className="token-label-row">
                                                <span className="token-label">{tr('アクセストークン', 'Access token')}</span>
                                                {visibleTokens[u.id] === 'access' && (
                                                    <button
                                                        onClick={() => api.copyToClipboard(u.accessToken)}
                                                        className="btn btn-outline btn-small"
                                                    >
                                                        {tr('コピー', 'Copy')}
                                                    </button>
                                                )}
                                            </div>
                                            <div
                                                onClick={() => toggleTokenVisibility(u.id, 'access')}
                                                className={`token-value-box ${visibleTokens[u.id] === 'access' ? 'revealed' : ''}`}
                                            >
                                                {visibleTokens[u.id] === 'access' ? u.accessToken : tr('クリックして表示', 'Click to reveal')}
                                            </div>
                                        </div>
                                        <div className="field-hint" style={{ fontSize: '11px', marginTop: '0' }}>
                                            {tr('※ 接続時は「ユーザートークン:アクセストークン」形式で入力', 'Use format \"userToken:accessToken\" when connecting')}
                                        </div>

                                        {/* 権限管理 */}
                                        <div className="permission-container">
                                            <span className="permission-title">権限設定</span>
                                            <div className="permission-badges">
                                                {(['READ_ONLY', 'DOWNLOAD', 'UPLOAD', 'EDIT', 'FULL'] as any[]).map((p: any) => (
                                                    <button
                                                        key={p}
                                                        onClick={() => handleTogglePermission(u.id, p)}
                                                        className={`permission-btn ${(u.permissions || []).includes(p) ? 'active' : ''}`}
                                                        title={p}
                                                    >
                                                        {permissionLabels[p] || p}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {sharedUsers.length === 0 && (
                            <div className="empty-message">
                                登録されているユーザーはいません
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
            setConnectionMsg(tr('接続確認中...', 'Checking connection...'))
        try {
            const normalizedUrl = normalizeRemoteUrl(remoteUrl)

            // まず指定されたプロトコル（またはデフォルトのhttp://）で試行
            let result = await api.testConnection(normalizedUrl, remoteKey)
            let finalUrl = normalizedUrl

            // HTTPで失敗し、かつURLがhttp://で始まる場合はhttps://で再試行
            if (!result.success && normalizedUrl.startsWith('http://')) {
                    setConnectionMsg(tr('HTTPS接続を試行中...', 'Trying HTTPS connection...'))
                const httpsUrl = normalizedUrl.replace('http://', 'https://')
                const httpsResult = await api.testConnection(httpsUrl, remoteKey)

                if (httpsResult.success) {
                    result = httpsResult
                    finalUrl = httpsUrl
                }
            }
            // HTTPSで失敗し、かつURLがhttps://で始まる場合はhttp://で再試行
            else if (!result.success && normalizedUrl.startsWith('https://')) {
                    setConnectionMsg(tr('HTTP接続を試行中...', 'Trying HTTP connection...'))
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
                setConnectionMsg(tr(`接続成功！ (${protocol})`, `Connected (${protocol})`))
                // URLを成功したプロトコルで更新
                setRemoteUrl(finalUrl)
                // ホスト側のライブラリ名を自動反映
                if (result.libraryName && !remoteName) {
                    setRemoteName(result.libraryName)
                }
            } else {
                setConnectionStatus('error')
                setConnectionMsg(tr(`接続失敗: ${result.message}`, `Connection failed: ${result.message}`))
            }
        } catch (e: any) {
            setConnectionStatus('error')
            setConnectionMsg(tr(`エラー: ${e.message}`, `Error: ${e.message}`))
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
            alert(tr('リモートライブラリを追加しました。', 'Remote library added.'))
        } catch (e: any) {
            alert(tr(`追加に失敗しました: ${e.message}`, `Failed to add: ${e.message}`))
        }
    }

    const handleDeleteRemoteLibrary = async (lib: any) => {
        setConfirmState({
            title: tr('リモートライブラリを削除', 'Delete remote library'),
            message: tr(`リモートライブラリ "${lib.name || lib.url}" を削除しますか？`, `Delete remote library "${lib.name || lib.url}"?`),
            confirmLabel: tr('削除', 'Delete'),
            isDestructive: true,
            onConfirm: async () => {
                try {
                    const currentLibs = clientConfig?.remoteLibraries || []
                    const newLibs = currentLibs.filter((l: any) => l.id !== lib.id)
                    await api.updateClientConfig({ remoteLibraries: newLibs })
                    setClientConfig({ ...clientConfig, remoteLibraries: newLibs })
                } catch (e) {
                    console.error('Failed to delete remote lib:', e)
                }
            },
        })
    }

    const renderNetworkSettings = () => {
        if (!serverConfig || networkDataLoading) return <div className="loading">{tr('読み込み中...', 'Loading...')}</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('ネットワーク共有', 'Network Sharing')}</h3>

                <div className="network-tabs">
                    <button
                        className={`network-tab ${activeTab === 'host' ? 'active' : ''}`}
                        onClick={() => setActiveTab('host')}
                    >
                        {tr('ホスト設定 (サーバー)', 'Host Settings (Server)')}
                    </button>
                    <button
                        className={`network-tab ${activeTab === 'client' ? 'active' : ''}`}
                        onClick={() => setActiveTab('client')}
                    >
                        {tr('クライアント設定 (接続)', 'Client Settings (Connection)')}
                    </button>
                </div>

                {activeTab === 'host' ? (
                    <>
                        <section className="settings-section">
                            <h4 className="section-title">{tr('サーバー状態', 'Server Status')}</h4>
                            <div className="settings-card">
                                <div className="settings-row">
                                    <div className="settings-info">
                                        <span className="settings-label">{tr('ネットワーク共有を有効にする', 'Enable network sharing')}</span>
                                        <span className="settings-description">
                                            {isServerRunning
                                                ? tr('起動中 - 外部からの接続を受け付けています', 'Running - accepting external connections')
                                                : tr('停止中 - 外部からの接続は拒否されます', 'Stopped - external connections are rejected')}
                                        </span>
                                    </div>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={isServerRunning}
                                            onChange={handleToggleServer}
                                            disabled={serverToggleBusy}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="settings-row">
                                    <div className="settings-info">
                                        <span className="settings-label">{tr('ポート番号', 'Port')}</span>
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
                            <div className="settings-card">
                                <div className="settings-row-vertical">
                                    <div className="settings-info" style={{ paddingRight: 0 }}>
                                        <span className="settings-label">IPアドレス制限 (ホワイトリスト)</span>
                                        <span className="settings-description">
                                            指定したIPアドレスからのアクセスのみを許可します。リストが空の場合はすべてのIPからのアクセスを許可します。
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            placeholder={tr('例: 192.168.1.50', 'e.g. 192.168.1.50')}
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
                                        <div className="settings-padded-content" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 4px' }}>
                                            {serverConfig.allowedIPs.map((ip: string) => (
                                                <div key={ip} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-dark)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{ip}</span>
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
                                <div className="settings-description-box">
                                    <p className="settings-description">
                                        このPCへの接続情報です。他のPCから接続する際に入力してください。
                                    </p>
                                </div>
                                <div className="settings-row-vertical">
                                    <span className="settings-label">ローカルIPアドレス</span>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {serverConfig.allowedIPs && serverConfig.allowedIPs.length > 0 ? (
                                            <code className="code-block" style={{ margin: 0 }}>IPアドレス設定を確認してください</code>
                                        ) : (
                                            <code className="code-block" style={{ margin: 0 }}>{window.location.hostname} (参考)</code>
                                        )}
                                    </div>
                                </div>
                                <div className="settings-row-vertical">
                                    <span className="settings-label">あなたのユーザートークン</span>
                                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                        <code className="code-block" style={{ flex: 1, margin: 0, wordBreak: 'break-all' }}>
                                            {myUserToken || tr('トークン生成中...', 'Generating token...')}
                                        </code>
                                        <button
                                            className="btn btn-outline btn-small"
                                            onClick={() => {
                                                if (myUserToken) {
                                                    api.copyToClipboard(myUserToken)
                                                    alert(tr('コピーしました', 'Copied'))
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
                            <div className="settings-card" style={{ marginBottom: '16px' }}>
                                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                                    <div className="settings-info">
                                        <span className="settings-label">新しいリモートライブラリを追加</span>
                                        <span className="settings-description">
                                            ホストのURLとアクセストークンを入力してください。
                                        </span>
                                    </div>

                                    <div style={{ width: '100%' }}>
                                        <label className="settings-label" style={{ marginBottom: '8px', display: 'block' }}>{tr('ホストURL', 'Host URL')}</label>
                                        <input
                                            type="text"
                                            placeholder="例: http://192.168.1.10:3000"
                                            value={remoteUrl}
                                            onChange={e => setRemoteUrl(e.target.value)}
                                            className="settings-input"
                                            style={{ width: '100%' }}
                                        />
                                    </div>

                                    <div style={{ width: '100%' }}>
                                        <label className="settings-label" style={{ marginBottom: '8px', display: 'block' }}>{tr('アクセストークン', 'Access token')}</label>
                                        <input
                                            type="password"
                                            placeholder={tr('公開設定で生成されたキー', 'Key generated by host settings')}
                                            value={remoteKey}
                                            onChange={e => setRemoteKey(e.target.value)}
                                            className="settings-input"
                                            style={{ width: '100%' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px', alignItems: 'center' }}>
                                        <button
                                            className={`btn ${connectionStatus === 'testing' ? '' : 'btn-outline'}`}
                                            onClick={handleTestConnection}
                                            disabled={connectionStatus === 'testing' || !remoteUrl || !remoteKey}
                                        >
                                            {connectionStatus === 'testing' ? tr('接続確認中...', 'Testing connection...') : tr('接続テスト', 'Test connection')}
                                        </button>

                                        {connectionStatus !== 'idle' && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '8px', height: '8px', borderRadius: '50%',
                                                    backgroundColor:
                                                        connectionStatus === 'success' ? '#4caf50' :
                                                            connectionStatus === 'error' ? '#f44336' : '#999'
                                                }}></div>
                                                <span style={{ fontSize: '13px', color: connectionStatus === 'error' ? '#f44336' : 'var(--text-main)' }}>
                                                    {connectionMsg}
                                                    {connectionStatus === 'success' && remoteName && (
                                                        <span style={{ marginLeft: '8px', opacity: 0.8 }}>({tr('ライブラリ', 'Library')}: {remoteName})</span>
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {connectionStatus === 'success' && (
                                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button className="btn btn-primary" onClick={handleAddRemoteLibrary}>
                                            このライブラリを追加
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="settings-section">
                            <h4 className="section-title">登録済みライブラリ</h4>
                            <div className="settings-card">
                                {clientConfig?.remoteLibraries && clientConfig.remoteLibraries.length > 0 ? (
                                    <div className="users-table" style={{ width: '100%' }}>
                                        {clientConfig.remoteLibraries.map((lib: any) => (
                                            <div key={lib.id} className="settings-row" style={{ alignItems: 'center' }}>
                                                <div className="settings-info" style={{ flex: 1 }}>
                                                    <span className="settings-label">{lib.name || 'Remote Library'}</span>
                                                    <span className="settings-description" style={{ fontSize: '12px' }}>{lib.url}</span>
                                                    <span style={{ fontSize: '11px', color: 'color-mix(in srgb, var(--text-muted), transparent 40%)' }}>Last connected: {new Date(lib.lastConnectedAt).toLocaleString()}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <button
                                                        className="btn btn-outline btn-small"
                                                        title={tr('一括同期', 'Bulk sync')}
                                                        onClick={async () => {
                                                            try {
                                                                const btn = document.getElementById(`sync-btn-${lib.id}`) as HTMLButtonElement
                                                                if (btn) {
                                                                    btn.disabled = true
                                                                    btn.innerText = tr('同期中...', 'Syncing...')
                                                                }
                                                                const res = await api.syncRemoteLibrary(lib.url, lib.token, lib.id)
                                                                if (res.success) {
                                                                    alert(tr('同期が完了しました。', 'Sync completed.'))
                                                                }
                                                            } catch (e: any) {
                                                                alert(tr(`同期に失敗しました: ${e.message}`, `Sync failed: ${e.message}`))
                                                            } finally {
                                                                const btn = document.getElementById(`sync-btn-${lib.id}`) as HTMLButtonElement
                                                                if (btn) {
                                                                    btn.disabled = false
                                                                    btn.innerText = tr('一括同期', 'Bulk sync')
                                                                }
                                                            }
                                                        }}
                                                        id={`sync-btn-${lib.id}`}
                                                    >
                                                        {tr('一括同期', 'Bulk sync')}
                                                    </button>
                                                    <button
                                                        className="icon-button delete"
                                                        onClick={() => handleDeleteRemoteLibrary(lib)}
                                                        title="削除"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="settings-padded-content">
                                        <p className="settings-description" style={{ margin: 0 }}>登録されたリモートライブラリはありません。</p>
                                    </div>
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
                        <div className="radio-group" style={{ display: 'flex', gap: '12px' }}>
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
                            <span className="settings-label">説明欄のリッチテキストを有効化</span>
                            <span className="settings-description">
                                インスペクタの説明セクションをHTMLリッチテキストとして編集・表示します。
                            </span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={!!settings.enableRichText}
                                onChange={() => handleToggle('enableRichText')}
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

            <section className="settings-section">
                <h4 className="section-title">{tr('インスペクタ詳細', 'Inspector Details')}</h4>
                <div className="settings-card">
                    <div className="settings-row-vertical inspector-settings-group" style={{ gap: '12px' }}>
                        <span className="settings-label">{tr('表示するセクション', 'Visible Sections')}</span>
                        {[
                            { key: 'artist', label: tr('アーティスト', 'Artist'), desc: tr('作者・投稿者などの表示と編集', 'Show and edit creator/uploader') },
                            { key: 'description', label: tr('説明', 'Description'), desc: tr('説明文の表示と編集', 'Show and edit description') },
                            { key: 'relations', label: tr('親子関係', 'Relations'), desc: tr('関連メディアのリンク表示', 'Show links to related media') },
                            { key: 'url', label: 'URL', desc: '関連URLの表示と操作' },
                            { key: 'tags', label: tr('タグ', 'Tags'), desc: tr('タグの追加・削除', 'Add or remove tags') },
                            { key: 'folders', label: tr('フォルダー', 'Folders'), desc: tr('フォルダーの追加・削除', 'Add or remove folders') },
                            { key: 'info', label: tr('インフォメーション', 'Information'), desc: tr('メタデータ情報の一覧', 'Metadata information list') },
                            { key: 'comments', label: tr('コメント', 'Comments'), desc: tr('時刻コメントの表示', 'Show timeline comments') },
                            { key: 'playlist', label: tr('プレイリスト', 'Playlist'), desc: tr('関連リストの表示件数を制御', 'Control visible related items') }
                        ].map(item => {
                            const optionId = `section:${item.key}`
                            const isOpen = expandedInspectorOption === optionId
                            const isEnabled = !!inspectorSettings.sectionVisibility[item.key as keyof typeof inspectorSettings.sectionVisibility]
                            return (
                                <div key={item.key} className={`inspector-option-card ${isOpen ? 'open' : ''}`}>
                                    <button
                                        type="button"
                                        className="inspector-option-header"
                                        onClick={() => setExpandedInspectorOption(isOpen ? null : optionId)}
                                    >
                                        <span className="inspector-option-title">{item.label}</span>
                                        <span className="inspector-option-actions">
                                            <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => {
                                                        e.stopPropagation()
                                                        updateInspectorSettings({
                                                            sectionVisibility: {
                                                                [item.key]: !isEnabled
                                                            } as any
                                                        })
                                                    }}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                            <span className="inspector-option-chevron">{isOpen ? '▾' : '▸'}</span>
                                        </span>
                                    </button>
                                    <div className={`inspector-option-body-wrap ${isOpen ? 'open' : ''}`}>
                                        <div className="inspector-option-body">
                                            <span className="settings-description">{item.desc}</span>
                                            {item.key === 'playlist' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                                    <div className="settings-row" style={{ padding: '10px 12px' }}>
                                                        <div className="settings-info">
                                                            <span className="settings-label">{tr('前の動画の表示数', 'Previous items')}</span>
                                                            <span className="settings-description">{tr('0〜50件（標準: 1）', '0-50 (default: 1)')}</span>
                                                        </div>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={50}
                                                            value={inspectorSettings.playlistPrevVisibleCount}
                                                            onChange={(e) => {
                                                                const raw = Number(e.target.value)
                                                                const next = Number.isFinite(raw) ? Math.max(0, Math.min(50, raw)) : 1
                                                                updateInspectorSettings({ playlistPrevVisibleCount: next })
                                                            }}
                                                            className="settings-input"
                                                            style={{ width: '96px' }}
                                                        />
                                                    </div>
                                                    <div className="settings-row" style={{ padding: '10px 12px' }}>
                                                        <div className="settings-info">
                                                            <span className="settings-label">{tr('次の動画の表示数', 'Next items')}</span>
                                                            <span className="settings-description">{tr('0〜50件（標準: 10）', '0-50 (default: 10)')}</span>
                                                        </div>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={50}
                                                            value={inspectorSettings.playlistNextVisibleCount}
                                                            onChange={(e) => {
                                                                const raw = Number(e.target.value)
                                                                const next = Number.isFinite(raw) ? Math.max(0, Math.min(50, raw)) : 10
                                                                updateInspectorSettings({ playlistNextVisibleCount: next })
                                                            }}
                                                            className="settings-input"
                                                            style={{ width: '96px' }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {item.key === 'info' && (
                                                <div className="inspector-sub-options">
                                                    <span className="settings-label">{tr('インフォメーション項目', 'Information Fields')}</span>
                                                    {[
                                                        { key: 'rating', label: tr('評価', 'Rating'), desc: tr('評価値 (0〜5) を表示', 'Show rating (0-5)') },
                                                        { key: 'resolution', label: tr('解像度', 'Resolution'), desc: tr('幅×高さを表示', 'Show width x height') },
                                                        { key: 'duration', label: tr('再生時間', 'Duration'), desc: tr('長さを表示', 'Show duration') },
                                                        { key: 'fileSize', label: tr('ファイルサイズ', 'File size'), desc: tr('容量を表示', 'Show file size') },
                                                        { key: 'importedAt', label: tr('追加日', 'Imported'), desc: tr('ライブラリ追加日時を表示', 'Show import date/time') },
                                                        { key: 'createdAt', label: tr('作成日', 'Created'), desc: tr('ファイル作成日時を表示', 'Show file creation date/time') },
                                                        { key: 'modifiedAt', label: tr('更新日', 'Modified'), desc: tr('ファイル更新日時を表示', 'Show file modified date/time') },
                                                        { key: 'audioBitrate', label: tr('音声ビットレート', 'Audio bitrate'), desc: tr('音声のビットレートを表示', 'Show audio bitrate') },
                                                        { key: 'framerate', label: tr('フレームレート', 'Frame rate'), desc: tr('fpsを表示', 'Show fps') },
                                                        { key: 'formatName', label: tr('ファイル形式', 'File format'), desc: tr('コンテナ形式を表示', 'Show container format') },
                                                        { key: 'codecId', label: tr('コーデックID', 'Codec ID'), desc: tr('コーデック識別子を表示', 'Show codec identifier') }
                                                    ].map(infoItem => {
                                                        const infoEnabled = !!inspectorSettings.infoVisibility[infoItem.key as keyof typeof inspectorSettings.infoVisibility]
                                                        return (
                                                            <div key={infoItem.key} className="inspector-sub-option-row">
                                                                <div className="settings-info">
                                                                    <span className="settings-label">{infoItem.label}</span>
                                                                    <span className="settings-description">{infoItem.desc}</span>
                                                                </div>
                                                                <label className="toggle-switch">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={infoEnabled}
                                                                        onChange={() => updateInspectorSettings({
                                                                            infoVisibility: {
                                                                                [infoItem.key]: !infoEnabled
                                                                            } as any
                                                                        })}
                                                                    />
                                                                    <span className="slider"></span>
                                                                </label>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </section>
        </div>
    )

    const renderDeveloperSettings = () => {
        const apiBaseUrl = serverConfig ? `http://${window.location.hostname}:${serverConfig.port}` : 'http://localhost:8765'
        const hostSecret = serverConfig?.hostSecret || ''

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('開発者ツール', 'Developer Tools')}</h3>

                <section className="settings-section">
                    <h4 className="section-title">{tr('アプリ内開発支援', 'In-app Developer Support')}</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('F12でDeveloper Toolsを開く', 'Open Developer Tools with F12')}</span>
                                <span className="settings-description">
                                    {tr('有効時のみ、F12キーでWebViewのDeveloper Toolsを開閉します。', 'When enabled, press F12 to toggle WebView Developer Tools.')}
                                </span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={Boolean(clientConfig?.enableF12DeveloperTools)}
                                    onChange={(e) => updateClientConfig({ enableF12DeveloperTools: e.target.checked } as any)}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <h4 className="section-title">{tr('API 接続情報', 'API Connection')}</h4>
                    <div className="settings-card">
                        <div className="settings-row-vertical">
                            <div className="settings-label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span className="settings-label">API Base URL</span>
                                <button className="btn btn-outline btn-small" onClick={() => {
                                    api.copyToClipboard(apiBaseUrl)
                                    alert(tr('API Base URL をコピーしました', 'Copied API Base URL'))
                                }}>{tr('コピー', 'Copy')}</button>
                            </div>
                            <code className="code-block" style={{ margin: 0, width: '100%' }}>{apiBaseUrl}</code>
                        </div>

                        <div className="settings-row-vertical" style={{ marginTop: '16px' }}>
                            <div className="settings-label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span className="settings-label">{tr('Host Secret (認証用シークレット)', 'Host Secret (Auth Secret)')}</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn btn-outline btn-small"
                                        onClick={() => {
                                            if (hostSecret) {
                                                api.copyToClipboard(hostSecret)
                                                alert(tr('Host Secret をコピーしました', 'Copied Host Secret'))
                                            }
                                        }}
                                    >
                                        {tr('コピー', 'Copy')}
                                    </button>
                                    <button
                                        className="btn btn-outline btn-small"
                                        onClick={async () => {
                                            if (confirm(tr('Host Secret をリセットしてもよろしいですか？\n既存の拡張機能の認証が切れる可能性があります。', 'Reset Host Secret?\nExisting extension authentication may stop working.'))) {
                                                const newSecret = await api.resetHostSecret()
                                                setServerConfig({ ...serverConfig, hostSecret: newSecret })
                                            }
                                        }}
                                    >
                                        {tr('リセット', 'Reset')}
                                    </button>
                                </div>
                            </div>
                            <div
                                className="token-value-box revealed"
                                style={{ width: '100%', cursor: 'text', userSelect: 'all' }}
                            >
                                {hostSecret || tr('設定取得中...', 'Loading...')}
                            </div>
                            <span className="settings-description" style={{ marginTop: '8px', display: 'block' }}>
                                {tr('APIリクエストの ', 'Use in API request ') }<code>Authorization</code> {tr('ヘッダーに ', 'header as ')}<code>Bearer [Host Secret]</code>{tr(' として使用してください。', '.')}
                            </span>
                        </div>
                    </div>
                </section>

                <section className="settings-section" style={{ marginTop: '24px' }}>
                    <h4 className="section-title">{tr('拡張機能開発リソース', 'Extension Development Resources')}</h4>

                    <div className="resource-list">
                        <a href="#" className="resource-item" onClick={(e) => {
                            e.preventDefault()
                            api.openExternal('https://github.com/84kb/Obscura/blob/main/plugins/niconico.js')
                        }}>
                            <div className="resource-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                            </div>
                            <div className="resource-info">
                                <span className="resource-title">{tr('Extension テンプレート (GitHub)', 'Extension Template (GitHub)')}</span>
                                <span className="resource-desc">{tr('TypeScript + Vite を使用した拡張機能のベースプロジェクトです。', 'A base extension project built with TypeScript + Vite.')}</span>
                            </div>
                        </a>

                        <div className="resource-item">
                            <div className="resource-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                            </div>
                            <div className="resource-info">
                                <span className="resource-title">{tr('@obscura/core 型定義の利用', 'Use @obscura/core type definitions')}</span>
                                <span className="resource-desc">
                                    {tr('プロジェクト内で ', 'Run ')}<code>npm install -D @obscura/core</code>{tr(' を実行することで、APIの型補完を有効にできます。', ' in your project to enable API type completion.')}
                                </span>
                            </div>
                        </div>

                        <a href="#" className="resource-item" onClick={(e) => {
                            e.preventDefault()
                            api.openExternal('https://84kb.github.io/Obscura/')
                        }}>
                            <div className="resource-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            </div>
                            <div className="resource-info">
                                <span className="resource-title">{tr('開発者向け公式ドキュメント', 'Official Developer Documentation')}</span>
                                <span className="resource-desc">{tr('APIの仕様や拡張機能のライフサイクルについての詳細な解説です。', 'Detailed API specs and extension lifecycle documentation.')}</span>
                            </div>
                        </a>
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
                <h4 className="section-title">{tr('アプリケーション更新', 'Application Updates')}</h4>
                <div className="settings-card">
                    <div className="settings-row-vertical">
                        <div className="settings-info" style={{ paddingRight: 0 }}>
                            <span className="settings-label">{tr('バージョン情報', 'Version')}</span>
                            <span className="settings-description">
                                {tr('現在のバージョン', 'Current version')}: v{appVersion}
                                {updateInfo?.version && (
                                    <span style={{ marginLeft: '10px', color: 'var(--primary-light)' }}>
                                        ({tr('最新', 'Latest')}: v{updateInfo.version})
                                    </span>
                                )}
                            </span>
                        </div>

                        <div style={{ width: '100%' }}>
                            {updateStatus === 'checking' && (
                                <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                    <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                    <span>{tr('更新を確認中...', 'Checking for updates...')}</span>
                                </div>
                            )}

                            {updateStatus === 'downloading' && (
                                <div className="download-progress-container" style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                                        <span>{tr('ダウンロード中...', 'Downloading...')}</span>
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

                            <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                {updateStatus === 'idle' && (
                                    <>
                                        <button className="btn btn-primary btn-sm" onClick={handleCheckForUpdates}>
                                            {tr('更新を確認', 'Check for updates')}
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ opacity: 0.8 }}
                                            onClick={handleOpenReleaseNotesHistory}
                                        >
                                            {tr('更新履歴', 'Release notes')}
                                        </button>
                                    </>
                                )}

                                {updateStatus === 'available' && (
                                    <>
                                        <button className="btn btn-primary btn-sm" onClick={handleDownloadUpdate}>
                                            {tr('アップデートをダウンロード', 'Download update')}
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ opacity: 0.8 }}
                                            onClick={handleOpenReleaseNotesHistory}
                                        >
                                            {tr('更新履歴', 'Release notes')}
                                        </button>
                                    </>
                                )}

                                {updateStatus === 'downloaded' && (
                                    <>
                                        <button className="btn btn-primary btn-sm" onClick={handleQuitAndInstall}>
                                            {tr('再起動してインストール', 'Restart and install')}
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ opacity: 0.8 }}
                                            onClick={handleOpenReleaseNotesHistory}
                                        >
                                            {tr('更新履歴', 'Release notes')}
                                        </button>
                                    </>
                                )}

                                {updateStatus === 'not-available' && (
                                    <>
                                        <span className="settings-description" style={{ color: 'var(--primary-light)' }}>
                                            {tr('最新のバージョンを使用しています。', 'You are using the latest version.')}
                                        </span>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ opacity: 0.8 }}
                                            onClick={handleOpenReleaseNotesHistory}
                                        >
                                            {tr('更新履歴', 'Release notes')}
                                        </button>
                                    </>
                                )}

                                {updateStatus === 'error' && (
                                    <>
                                        <div style={{ color: 'var(--accent)', fontSize: '13px' }}>
                                            {tr('エラーが発生しました', 'An error occurred')}: {typeof updateInfo === 'string' ? updateInfo : tr('不明なエラー', 'Unknown error')}
                                        </div>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ opacity: 0.8 }}
                                            onClick={handleOpenReleaseNotesHistory}
                                        >
                                            {tr('更新履歴', 'Release notes')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        )
    }

    const handleAddWatchPath = async () => {
        const path = await api.selectFolder()
        if (path) {
            // Check dupes
            if (clientConfig?.autoImport.watchPaths.some((p: AutoImportPath) => p.path === path)) {
                alert(tr('このフォルダは既に登録されています', 'This folder is already registered'))
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
            updateClientConfig({ autoImport: newConfig.autoImport })
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
        updateClientConfig({ autoImport: newConfig.autoImport })
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
        updateClientConfig({ autoImport: newConfig.autoImport })
    }

    const getImportTargetOptions = useCallback((targetLibraryId: string) => {
        if (availableLibraries.some(lib => lib.path === targetLibraryId)) {
            return availableLibraries
        }
        if (!targetLibraryId) {
            return availableLibraries
        }
        return [
            ...availableLibraries,
            {
                name: tr('現在の設定先', 'Current target'),
                path: targetLibraryId
            }
        ]
    }, [availableLibraries, tr])

    const renderImportSettings = () => {
        if (!clientConfig) return <div className="loading">{tr('読み込み中...', 'Loading...')}</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('インポート・ダウンロード', 'Import & Download')}</h3>

                <section className="settings-section">
                    <h4 className="section-title">{tr('ダウンロード', 'Download')}</h4>
                    <div className="settings-card">
                        <div className="settings-row-vertical">
                            <span className="settings-label">{tr('保存先フォルダー', 'Download folder')}</span>
                            <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={clientConfig.downloadPath || ''}
                                    readOnly
                                    className="settings-input"
                                    style={{ flex: 1, color: 'var(--text-muted)', cursor: 'not-allowed' }}
                                />
                                <button className="btn btn-outline btn-small" onClick={handleSelectDownloadPath}>
                                    {tr('変更', 'Change')}
                                </button>
                            </div>
                            <span className="settings-description">
                                {tr('サーバーからダウンロードするファイルのデフォルト保存先です。', 'Default save location for downloaded files.')}
                            </span>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <h4 className="section-title">{tr('インポート', 'Import')}</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('D&D インポート後に元ファイルを移動する', 'Move source files after drag-and-drop import')}</span>
                                <span className="settings-description">
                                    {tr('オンの場合、ドラッグ&ドロップで取り込んだ後に元ファイルを削除し、コピーではなく移動として扱います。', 'When enabled, drag-and-drop imports remove the original file after import so the operation behaves like a move instead of a copy.')}
                                </span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={Boolean(clientConfig.dragDropImportMoveSource)}
                                    onChange={(e) => {
                                        const newConfig: ClientConfig = {
                                            ...clientConfig,
                                            dragDropImportMoveSource: e.target.checked
                                        }
                                        setClientConfig(newConfig)
                                        updateClientConfig({ dragDropImportMoveSource: e.target.checked })
                                    }}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <div className="settings-card">

                        <div className="settings-padded-content" style={{ paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="settings-label" style={{ fontSize: '13px', marginBottom: 0 }}>{tr('監視フォルダ設定', 'Watch folders')}</span>
                            <button className="btn btn-secondary btn-sm" onClick={handleAddWatchPath}>
                                + {tr('フォルダを追加', 'Add folder')}
                            </button>
                        </div>

                        {(!clientConfig.autoImport.watchPaths || clientConfig.autoImport.watchPaths.length === 0) ? (
                            <div className="watcher-empty">
                                {tr('監視フォルダが設定されていません', 'No watch folders configured')}
                            </div>
                        ) : (
                            <div className="settings-padded-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: 0 }}>
                                {clientConfig.autoImport.watchPaths.map((p: AutoImportPath) => (
                                    <div key={p.id} className="watcher-item">
                                        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                            <input
                                                type="checkbox"
                                                checked={p.enabled}
                                                onChange={(e) => handleUpdateWatchPath(p.id, { enabled: e.target.checked })}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '12px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 'bold', minWidth: '70px' }}>{tr('インポート先', 'Target')}: </span>
                                                <select
                                                    value={p.targetLibraryId}
                                                    onChange={(e) => handleUpdateWatchPath(p.id, { targetLibraryId: e.target.value })}
                                                    className="settings-input watcher-select"
                                                >
                                                    {(() => {
                                                        const libraryOptions = getImportTargetOptions(p.targetLibraryId)
                                                        return (
                                                            <>
                                                    {libraryOptions.length === 0 && (
                                                        <option value="">
                                                            {tr('ライブラリがありません', 'No libraries available')}
                                                        </option>
                                                    )}
                                                    {libraryOptions.map(lib => (
                                                        <option key={lib.path} value={lib.path}>{lib.name}</option>
                                                    ))}
                                                            </>
                                                        )
                                                    })()}
                                                </select>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.path}>
                                                {p.path}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleRemoveWatchPath(p.id)}
                                            className="icon-button delete"
                                            title="削除"
                                            style={{ color: 'var(--accent)', padding: '4px' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="6"></line></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="settings-description-box" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
                            <p className="settings-description" style={{ color: '#eab308' }}>
                                {tr('※ インポート完了後、元のファイルは完全に削除されます。', 'After import completes, source files will be permanently deleted.')}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <div className="settings-card">
                        <div className="settings-padded-content" style={{ paddingBottom: '8px' }}>
                            <div className="settings-info" style={{ paddingRight: 0 }}>
                                <span className="settings-label">{tr('他のライブラリへの追加設定', 'Add to other library settings')}</span>
                                <span className="settings-description">
                                    {tr('ファイルを他のライブラリに追加する際、引き継ぐ情報を選択します。', 'Choose which metadata to carry over when adding to another library.')}
                                </span>
                            </div>
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
                                updateClientConfig({ libraryTransferSettings: newConfig.libraryTransferSettings })
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
        if (!clientConfig) return <div className="loading">{tr('読み込み中...', 'Loading...')}</div>

        return (
            <>
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('一般設定', 'General')}</h3>

                {renderUpdateSection()}

                <section className="settings-section">
                    <h4 className="section-title">{tr('表示言語', 'Display language')}</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('ソフトウェアの言語', 'Software language')}</span>
                                <span className="settings-description">
                                    {tr('UI の表示言語を切り替えます。', 'Switch the UI display language.')}
                                </span>
                            </div>
                            <select
                                className="settings-input"
                                style={{ width: '180px', height: '32px' }}
                                value={clientConfig.language || 'ja'}
                                onChange={(e) => {
                                    const nextLanguage = (e.target.value === 'en' ? 'en' : 'ja') as 'ja' | 'en'
                                    const newConfig = { ...clientConfig, language: nextLanguage }
                                    setClientConfig(newConfig)
                                    updateClientConfig({ language: nextLanguage })
                                }}
                            >
                                <option value="ja">日本語</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                    </div>
                </section>


                <section className="settings-section">
                    <h4 className="section-title">{tr('Discord リッチプレゼンス', 'Discord Rich Presence')}</h4>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-info">
                                <span className="settings-label">{tr('Discord に再生状況を表示', 'Show playback status on Discord')}</span>
                                <span className="settings-description">
                                    {tr('再生中のメディア情報を Discord のステータスに表示します。', 'Display currently playing media in Discord status.')}
                                </span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={clientConfig.discordRichPresenceEnabled || false}
                                    onChange={(e) => {
                                        const newConfig = { ...clientConfig, discordRichPresenceEnabled: e.target.checked }
                                        setClientConfig(newConfig);
                                        updateClientConfig({ discordRichPresenceEnabled: e.target.checked })
                                    }}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <h4 className="section-title">{tr('ライブラリバックアップ', 'Library Backup')}</h4>
                    <div className="settings-card">
                        {!activeLocalLibrary ? (
                            <div className="settings-description-box">
                                <span className="settings-description">
                                    {tr('ローカルライブラリを開くとバックアップを利用できます。', 'Open a local library to use backups.')}
                                </span>
                            </div>
                        ) : (
                            <div className="settings-row-vertical">
                                <div className="settings-description-box">
                                    <span className="settings-description">
                                        {tr('バックアップは .library/backup に保存されます。10分以上経過した後の操作時に自動バックアップされます。', 'Backups are stored in .library/backup. An automatic backup is created when you perform an operation after 10 minutes have passed.')}
                                    </span>
                                    <span className="settings-description" style={{ marginTop: '6px', display: 'block' }}>
                                        {activeLocalLibrary.path}
                                    </span>
                                </div>
                                <div className="settings-row">
                                    <div className="settings-info">
                                        <span className="settings-label">{tr('保持するバックアップ数', 'Backup retention count')}</span>
                                        <span className="settings-description">
                                            {tr('古いバックアップはこの件数を超えると自動で削除されます。', 'Older backups are automatically deleted when this count is exceeded.')}
                                        </span>
                                    </div>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        className="settings-input"
                                        style={{ width: '100px' }}
                                        value={Number(clientConfig.libraryBackupRetention || 5)}
                                        onChange={(e) => {
                                            const nextValue = Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 5)))
                                            const nextConfig = { ...clientConfig, libraryBackupRetention: nextValue }
                                            setClientConfig(nextConfig)
                                            updateClientConfig({ libraryBackupRetention: nextValue })
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-secondary" onClick={handleCreateLibraryBackup} disabled={backupBusy}>
                                        {tr('今すぐバックアップ', 'Back up now')}
                                    </button>
                                </div>
                                <div className="users-list">
                                    {libraryBackups.length === 0 ? (
                                        <div className="empty-message">
                                            {tr('バックアップはまだありません', 'No backups yet')}
                                        </div>
                                    ) : (
                                        libraryBackups.map((backup) => (
                                            <div key={backup.id} className="user-card-item">
                                                <div className="user-card-header">
                                                    <span className="user-card-name">{backup.fileName}</span>
                                                    <button
                                                        onClick={() => handleRestoreLibraryBackup(backup.id)}
                                                        className="btn btn-outline btn-small"
                                                        disabled={backupBusy}
                                                    >
                                                        {tr('復元', 'Restore')}
                                                    </button>
                                                </div>
                                                <div className="user-card-last-access">
                                                    {tr('作成日時', 'Created')}: {backup.createdAt ? new Date(backup.createdAt).toLocaleString() : '-'}
                                                </div>
                                                <div className="user-card-last-access">
                                                    {tr('サイズ', 'Size')}: {(backup.size / 1024).toFixed(1)} KB
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </div>
            {releaseNotesHistoryModal && (
                <div className="app-modal-overlay inner-modal" onClick={() => setReleaseNotesHistoryModal(null)}>
                    <div className="app-modal release-notes-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="app-modal-header">
                            <h3>{releaseNotesHistoryModal.title}</h3>
                        </div>
                        <div className="app-modal-body">
                            <p>{releaseNotesHistoryModal.description}</p>
                            <div className="release-notes-content">
                                {releaseNotesHistoryModal.releaseNotes}
                            </div>
                        </div>
                        <div className="app-modal-footer">
                            <button className="btn btn-primary" onClick={() => setReleaseNotesHistoryModal(null)}>
                                {tr('閉じる', 'Close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </>
        )
    }

    // ... (renderNetworkSettingsなど)


    const handleSaveProfile = async () => {
        try {
            await api.updateClientConfig({
                nickname: nickname.trim(),
                iconUrl: selectedIcon
            })
            // 更新後のconfを再取得して反映
            const config = await api.getClientConfig()
            setClientConfig(config)

            // リモートライブラリへのプロファイル同期
            if (config.remoteLibraries && config.remoteLibraries.length > 0) {
                console.log('[Profile] Syncing profile to remote libraries...')
                Promise.all(config.remoteLibraries.map(lib =>
                    api.updateRemoteProfile(lib.url, lib.token, nickname.trim(), selectedIcon)
                        .then(res => {
                            if (!res.success) console.warn(`[Profile] Failed to sync to ${lib.name}:`, res.message)
                            else console.log(`[Profile] Synced to ${lib.name}`)
                        })
                        .catch(err => console.error(`[Profile] Error syncing to ${lib.name}:`, err))
                )).then(() => {
                    console.log('[Profile] Sync completed')
                })
            }

            alert(tr('プロファイルを保存しました', 'Profile saved'))
        } catch (e: any) {
            console.error('Failed to save profile:', e)
            alert(tr('保存に失敗しました: ' + e.message, 'Save failed: ' + e.message))
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
            alert(tr('画像の処理に失敗しました', 'Failed to process image'))
        }
    }



    const renderProfileSettings = () => {
        if (!clientConfig) return <div className="loading">{tr('読み込み中...', 'Loading...')}</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('プロファイル設定', 'Profile Settings')}</h3>
                <section className="settings-section">
                    <div className="settings-card">
                        <div className="settings-description-box">
                            <span className="settings-description">
                                ここで設定したニックネームとアイコンは、リモートライブラリへの接続時や、ホストとしてライブラリを公開する際に使用されます。
                            </span>
                        </div>

                        <div className="settings-row-vertical">
                            <label className="settings-label">{tr('ニックネーム', 'Nickname')}</label>
                            <input
                                type="text"
                                className="settings-input"
                                placeholder={tr('あなたの表示名', 'Your display name')}
                                value={nickname}
                                onChange={e => setNickname(e.target.value)}
                                maxLength={50}
                            />
                        </div>

                        <div className="settings-row-vertical">
                            <label className="settings-label">{tr('アイコン', 'Icon')}</label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ height: '40px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                    {tr('画像を選択...', 'Select image...')}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    style={{ display: 'none' }}
                                    onChange={handleFileSelect}
                                />
                                {selectedIcon && (selectedIcon.startsWith('data:') || selectedIcon.startsWith('/api') || selectedIcon.startsWith('http')) && (
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-small"
                                        onClick={() => setSelectedIcon('')}
                                        style={{ color: 'var(--accent)' }}
                                    >
                                        {tr('削除', 'Delete')}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="settings-row" style={{ marginTop: '24px', justifyContent: 'flex-start', gap: '16px', borderTop: '1px solid #333', paddingTop: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '64px', height: '64px',
                                    background: 'var(--bg-dark)',
                                    borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '24px',
                                    border: '2px solid var(--border)',
                                    overflow: 'hidden'
                                }}>
                                    {selectedIcon && (selectedIcon.startsWith('http') || selectedIcon.startsWith('data:') || selectedIcon.startsWith('/api')) ? (
                                        <img src={selectedIcon} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{
                                            width: '100%', height: '100%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: nickname ? (
                                                (() => {
                                                    const colors = ['#ff8c42', '#4cc9f0', '#4895ef', '#560bad', '#b5179e', '#7209b7', '#3f37c9', '#4361ee', '#4cc9f0', '#48bfe3'];
                                                    let hash = 0;
                                                    for (let i = 0; i < nickname.length; i++) hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
                                                    return colors[Math.abs(hash) % colors.length];
                                                })()
                                            ) : 'var(--bg-card)',
                                            color: '#fff',
                                            fontWeight: 'bold'
                                        }}>
                                            {nickname ? nickname.slice(0, 1).toUpperCase() : '?'}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '18px', color: 'var(--text-main)' }}>{nickname || tr('（未設定）', '(Not set)')}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tr('プレビュー', 'Preview')}</span>
                                </div>
                            </div>
                            <div style={{ flex: 1 }}></div>
                            <button className="btn btn-primary" onClick={handleSaveProfile} disabled={!nickname.trim()}>
                                {tr('保存', 'Save')}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    const renderExtensionsSettings = () => {
        return (
            <div className="settings-page">
                <h3 className="settings-page-title">{tr('拡張機能（プラグイン）設定', 'Extensions (Plugins)')}</h3>
                <section className="settings-section">
                    <div className="settings-card">
                        <div className="settings-description-box">
                            <span className="settings-description">
                                <code>plugins</code> フォルダに配置されたスクリプトを拡張機能として読み込みます。<br />
                                サードパーティ製スクリプトの実行はセキュリティリスクを伴うため、信頼できる提供元のプラグインのみを有効にしてください。
                            </span>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <button
                                className="btn btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                                onClick={async () => {
                                    try {
                                        const result = await api.installPlugin()
                                        if (result.error) {
                                            console.error('[Settings] Plugin install error:', result.error)
                                            return
                                        }
                                        // インストール成功時にリストを再取得
                                        if ((result.installed?.length ?? 0) > 0) {
                                            const scripts = await api.getPluginScripts()
                                            setAvailablePlugins(scripts || [])
                                        }
                                        if ((result.skipped?.length ?? 0) > 0) {
                                            alert(`${tr('以下のファイルは既に存在するためスキップされました', 'Skipped because these files already exist')}:\n${(result.skipped ?? []).join('\n')}`)
                                        }
                                    } catch (e) {
                                        console.error('[Settings] Plugin install failed:', e)
                                    }
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                {tr('ファイルからインストール...', 'Install from file...')}
                            </button>
                        </div>

                        {availablePlugins.length === 0 ? (
                            <div className="empty-state">
                                <p>{tr('利用可能なプラグインが見つかりません', 'No plugins available')}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {availablePlugins.map((plugin) => {
                                    const meta = plugin.metadata || {}
                                    const title = meta.name || plugin.name || plugin.id
                                    const version = meta.version ? `v${meta.version}` : ''
                                    const author = meta.author ? `by ${meta.author}` : ''

                                    const isEnabled = settings?.extensions?.[plugin.id]?.enabled ?? false

                                    return (
                                        <div key={plugin.id} className="settings-row-vertical">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                                                <div className="settings-info" style={{ gap: '4px', paddingRight: '0' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span className="settings-label" style={{ fontSize: '15px' }}>{title}</span>
                                                        {(version || author) && (
                                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                                {version} {author}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="settings-description" style={{ marginTop: '4px' }}>
                                                        {meta.description || tr('説明がありません。', 'No description.')}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '4px' }}>
                                                        ID: {plugin.id}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <label className="toggle-switch" style={{ marginTop: '0' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isEnabled}
                                                            onChange={(e) => {
                                                                const newExtensions = { ...(settings?.extensions || {}) }
                                                                newExtensions[plugin.id] = { enabled: e.target.checked }

                                                                const newConfig = {
                                                                    ...settings,
                                                                    extensions: newExtensions
                                                                }
                                                                onUpdateSettings(newConfig)
                                                                updateClientConfig({ extensions: newExtensions } as any)
                                                            }}
                                                        />
                                                        <span className="slider"></span>
                                                    </label>
                                                    <button
                                                        className="btn btn-outline btn-small"
                                                        style={{ marginLeft: '8px', color: 'var(--danger, #e74c3c)', borderColor: 'var(--danger, #e74c3c)', padding: '4px 10px', fontSize: '12px' }}
                                                        onClick={async () => {
                                                            if (!confirm(`「${title}」を削除しますか？\nこの操作は元に戻せません。`)) return
                                                            try {
                                                                const result = await api.uninstallPlugin(plugin.id)
                                                                if (result.success) {
                                                                    const scripts = await api.getPluginScripts()
                                                                    setAvailablePlugins(scripts || [])
                                                                } else {
                                                                    alert(tr(`削除に失敗しました: ${result.error}`, `Delete failed: ${result.error}`))
                                                                }
                                                            } catch (e) {
                                                                console.error('[Settings] Plugin uninstall failed:', e)
                                                            }
                                                        }}
                                                        title={tr('プラグインを削除', 'Remove plugin')}
                                                    >
                                                        {tr('削除', 'Delete')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
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
                        <h2>{tr('環境設定', 'Preferences')}</h2>
                    </div>
                    <div className="settings-sidebar-search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input
                            type="text"
                            placeholder={tr('設定を検索...', 'Search settings...')}
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
                                                        activeCategory === 'audio' ? <AudioSettings language={language} clientConfig={clientConfig} setClientConfig={setClientConfig} /> :
                                                            activeCategory === 'developer' ? renderDeveloperSettings() :
                                                                activeCategory === 'extensions' ? renderExtensionsSettings() : (
                                                                    <div className="empty-state">
                                                                        <p>{tr('このセクションの設定は準備中です。', 'Settings for this section are coming soon.')}</p>
                                                                    </div>
                                                                )}
                    </div>

                    <footer className="settings-main-footer">
                        <button className="btn-save" onClick={onClose}>{tr('閉じる', 'Close')}</button>
                    </footer>
                </div>

                {showTemplateModal && (
                    <div className="app-modal-overlay inner-modal" onClick={() => setShowTemplateModal(false)}>
                        <div className="app-modal custom-template-modal" onClick={e => e.stopPropagation()}>
                            <div className="app-modal-header">
                                <h3>テーマテンプレート</h3>
                                <button className="close-btn" onClick={() => setShowTemplateModal(false)}>×</button>
                            </div>
                            <div className="app-modal-body">
                                <p className="template-intro">
                                    これらのテンプレートをコピーして、新しいCSSファイルとして保存し、「CSSからインポート」機能で読み込むことができます。
                                </p>
                                <div className="template-list">
                                    {THEME_TEMPLATES.map((template, index) => (
                                        <div key={index} className="theme-template-item">
                                            <div className="template-header">
                                                <div className="template-info-group">
                                                    <h4 className="template-name">{template.name}</h4>
                                                    <p className="template-description">{template.description}</p>
                                                </div>
                                                <button className="btn btn-secondary btn-sm" onClick={() => handleCopyTemplate(template.css)}>
                                                    コピー
                                                </button>
                                            </div>
                                            <pre className="template-preview-code">
                                                <code>{template.css}</code>
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="app-modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>閉じる</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {confirmState && (
                <ConfirmModal
                    title={confirmState.title}
                    message={confirmState.message}
                    confirmLabel={confirmState.confirmLabel || tr('OK', 'OK')}
                    cancelLabel={tr('キャンセル', 'Cancel')}
                    isDestructive={Boolean(confirmState.isDestructive)}
                    onConfirm={async () => {
                        const action = confirmState.onConfirm
                        setConfirmState(null)
                        await action()
                    }}
                    onCancel={() => setConfirmState(null)}
                />
            )}
        </div>
    )
}

const AudioSettings = ({ language = 'ja', clientConfig, setClientConfig }: { language?: 'ja' | 'en', clientConfig: ClientConfig, setClientConfig: (config: ClientConfig) => void }) => {
    const tr = (ja: string, en: string) => language === 'en' ? en : ja
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
        const previousConfig = clientConfig
        const optimisticConfig = {
            ...(clientConfig || {}),
            ...update,
        }
        setClientConfig(optimisticConfig)
        try {
            const nextConfig = await api.updateClientConfig(update)
            setClientConfig(nextConfig)

            // Trigger backend updates if needed
            if (update.audioDevice !== undefined) {
                await api.setAudioDevice(update.audioDevice)
            }
            if (update.exclusiveMode !== undefined) {
                await api.setExclusiveMode(update.exclusiveMode)
            }
        } catch (e) {
            console.error(e)
            setClientConfig(previousConfig)
        }
    }

    return (
        <div className="settings-page">
            <h3 className="settings-page-title">{tr('オーディオ設定', 'Audio Settings')}</h3>
            <section className="settings-section">
                <div className="settings-card">
                    {/* Master Switch: Enable WASAPI/MPV */}
                    <div className="settings-row">
                        <div className="settings-info">
                                <span className="settings-label">{tr('WASAPI (MPVバックエンド) を使用する', 'Use WASAPI (MPV backend)')}</span>
                            <span className="settings-description">
                                {tr('高品質なオーディオ再生のためにMPVバックエンドを使用します。', 'Use MPV backend for high quality audio playback.')}<br />
                                <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{tr('無効の場合は標準のWeb Audio (Shared Mode) が使用されます。', 'When disabled, standard Web Audio (Shared Mode) is used.')}</span>
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
                                <span className="settings-label">{tr('出力デバイス', 'Output device')}</span>
                                <span className="settings-description">
                                    {tr('再生に使用するオーディオデバイスを選択します。', 'Select the audio device used for playback.')}
                                </span>
                            </div>
                            <div className="settings-controls">
                                <select
                                    className="settings-input"
                                    style={{ width: '220px' }}
                                    value={currentDevice}
                                    onChange={(e) => updateConfig({ audioDevice: e.target.value })}
                                    disabled={!useMpvAudio}
                                >
                                    <option value="auto">{tr('自動 (デフォルト)', 'Auto (Default)')}</option>
                                    {audioDevices.map((dev, i) => (
                                        <option key={i} value={dev.name}>
                                            {dev.description}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="settings-row-vertical">
                            <div className="settings-info" style={{ paddingRight: 0 }}>
                                <span className="settings-label">{tr('WASAPI 排他モード (Exclusive Mode)', 'WASAPI Exclusive Mode')}</span>
                                <span className="settings-description">
                                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{tr('⚠ 実験的機能', '⚠ Experimental')}</span><br />
                                    {tr('システムミキサーをバイパスし、ビットパーフェクトな再生を行います。', 'Bypasses the system mixer for bit-perfect playback.')}<br />
                                    {tr('有効にすると、他のアプリケーションの音声は再生されなくなります。', 'When enabled, audio from other applications may stop playing.')}
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

                        <div className="settings-row-vertical">
                            <div className="settings-info" style={{ paddingRight: 0 }}>
                                <span className="settings-label">{tr('動画ファイルでも使用する (音声のみ)', 'Use for video files too (audio only)')}</span>
                                <span className="settings-description">
                                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{tr('⚠ 画面は真っ暗になります', '⚠ Screen will be black')}</span><br />
                                    {tr('MP4などの動画ファイルでも高音質再生を行いますが、', 'Enables high quality audio for video files like MP4, but')}<br />{tr('映像は表示されません。', 'video will not be displayed.')}
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
