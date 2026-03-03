import { useState, useEffect, useCallback, useContext, useRef } from 'react'
import { api } from '../api'
import { AppSettings, Library, ClientConfig, AutoImportPath, Theme, ThemeColors } from '@obscura/core'
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
        { id: 'extensions', label: '拡張機能', group: 'システム', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> },
        { id: 'developer', label: '開発者ツール', group: 'システム', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> },
    ]

    const handleToggle = (key: keyof AppSettings) => {
        onUpdateSettings({
            ...settings,
            [key]: !settings[key]
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
        if (activeCategory === 'import') {
            api.getLibraries()
                .then((libs: any[]) => setAvailableLibraries(libs))
                .catch((e: any) => console.error('Failed to get libraries:', e))
        }
    }, [activeCategory])

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
                    <div className="settings-header-actions" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                        <span className="settings-description" style={{ margin: 0 }}>
                            アプリの外観をカスタマイズできます。プリセットから選ぶか、独自のテーマを作成してください。
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary btn-sm" style={{ height: '32px', padding: '0 12px' }} onClick={() => {
                                setEditingColors(defaultDarkTheme.colors)
                                setIsCreatingTheme(true)
                            }}>
                                新規作成
                            </button>
                            <button className="btn btn-secondary btn-sm" style={{ height: '32px', padding: '0 12px' }} onClick={() => setShowTemplateModal(true)}>
                                テンプレート
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button className="btn btn-secondary btn-sm" style={{ height: '32px', padding: '0 12px' }} onClick={() => document.getElementById('theme-import-input')?.click()}>
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

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">ショートカット設定</h3>
                <div className="settings-padded-content" style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 0 }}>
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
            if (activeCategory === 'network' || activeCategory === 'developer') {
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
                    console.error('Failed to load settings data:', e)
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
                <div className="settings-card">
                    <div className="settings-row-vertical">
                        <span className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activeUsers.length > 0 ? '#10b981' : '#6b7280' }}></span>
                            現在の接続数: {activeUsers.length}
                        </span>
                        {activeUsers.length > 0 && (
                            <div className="active-users-list" style={{ marginLeft: '16px' }}>
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
                <div className="settings-card">
                    <div className="settings-row-vertical">
                        <span className="settings-label">新規ユーザー追加</span>
                        <p className="settings-description" style={{ margin: 0 }}>
                            ユーザーから受け取ったトークンを入力し、アクセストークンを発行してください。
                        </p>
                        <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center', marginTop: '4px' }}>
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
                            <div className="token-display" style={{ width: '100%' }}>
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
                    <div className="settings-padded-content">
                        <span className="settings-label">登録ユーザー一覧</span>
                        <div className="users-list">
                            {sharedUsers.map(u => (
                                <div key={u.id} className="user-card-item">
                                    <div className="user-card-header">
                                        <span className="user-card-name">{u.nickname || '未指定'}</span>
                                        <button
                                            onClick={() => handleDeleteUser(u.id)}
                                            className="icon-button delete"
                                            title="削除"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                    <div className="user-card-last-access">
                                        最終アクセス: {u.lastAccessAt ? new Date(u.lastAccessAt).toLocaleString() : '未アクセス'}
                                    </div>
                                    {/* トークン表示 (スポイラー形式) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div className="token-row">
                                            <div className="token-label-row">
                                                <span className="token-label">ユーザートークン</span>
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
                                                <span className="token-label">アクセストークン</span>
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
                                        <div className="field-hint" style={{ fontSize: '11px', marginTop: '0' }}>
                                            ※ 接続時は「ユーザートークン:アクセストークン」形式で入力
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
                                                        {PERMISSION_LABELS[p] || p}
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
                            <div className="settings-card" style={{ marginBottom: '16px' }}>
                                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                                    <div className="settings-info">
                                        <span className="settings-label">新しいリモートライブラリを追加</span>
                                        <span className="settings-description">
                                            ホストのURLとアクセストークンを入力してください。
                                        </span>
                                    </div>

                                    <div style={{ width: '100%' }}>
                                        <label className="settings-label" style={{ marginBottom: '8px', display: 'block' }}>ホストURL</label>
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
                                        <label className="settings-label" style={{ marginBottom: '8px', display: 'block' }}>アクセストークン</label>
                                        <input
                                            type="password"
                                            placeholder="公開設定で生成されたキー"
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
                                            {connectionStatus === 'testing' ? '接続確認中...' : '接続テスト'}
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
                                                        <span style={{ marginLeft: '8px', opacity: 0.8 }}>(ライブラリ: {remoteName})</span>
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
                                                        title="一括同期"
                                                        onClick={async () => {
                                                            try {
                                                                const btn = document.getElementById(`sync-btn-${lib.id}`) as HTMLButtonElement
                                                                if (btn) {
                                                                    btn.disabled = true
                                                                    btn.innerText = '同期中...'
                                                                }
                                                                const res = await api.syncRemoteLibrary(lib.url, lib.token, lib.id)
                                                                if (res.success) {
                                                                    alert('同期が完了しました。')
                                                                }
                                                            } catch (e: any) {
                                                                alert(`同期に失敗しました: ${e.message}`)
                                                            } finally {
                                                                const btn = document.getElementById(`sync-btn-${lib.id}`) as HTMLButtonElement
                                                                if (btn) {
                                                                    btn.disabled = false
                                                                    btn.innerText = '一括同期'
                                                                }
                                                            }
                                                        }}
                                                        id={`sync-btn-${lib.id}`}
                                                    >
                                                        一括同期
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
        const apiBaseUrl = serverConfig ? `http://${window.location.hostname}:${serverConfig.port}` : 'http://localhost:8765'
        const hostSecret = serverConfig?.hostSecret || ''

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">開発者ツール</h3>

                <section className="settings-section">
                    <h4 className="section-title">API 接続情報</h4>
                    <div className="settings-card">
                        <div className="settings-row-vertical">
                            <div className="settings-label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span className="settings-label">API Base URL</span>
                                <button className="btn btn-outline btn-small" onClick={() => {
                                    api.copyToClipboard(apiBaseUrl)
                                    alert('API Base URL をコピーしました')
                                }}>コピー</button>
                            </div>
                            <code className="code-block" style={{ margin: 0, width: '100%' }}>{apiBaseUrl}</code>
                        </div>

                        <div className="settings-row-vertical" style={{ marginTop: '16px' }}>
                            <div className="settings-label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span className="settings-label">Host Secret (認証用シークレット)</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn btn-outline btn-small"
                                        onClick={() => {
                                            if (hostSecret) {
                                                api.copyToClipboard(hostSecret)
                                                alert('Host Secret をコピーしました')
                                            }
                                        }}
                                    >
                                        コピー
                                    </button>
                                    <button
                                        className="btn btn-outline btn-small"
                                        onClick={async () => {
                                            if (confirm('Host Secret をリセットしてもよろしいですか？\n既存の拡張機能の認証が切れる可能性があります。')) {
                                                const newSecret = await api.resetHostSecret()
                                                setServerConfig({ ...serverConfig, hostSecret: newSecret })
                                            }
                                        }}
                                    >
                                        リセット
                                    </button>
                                </div>
                            </div>
                            <div
                                className="token-value-box revealed"
                                style={{ width: '100%', cursor: 'text', userSelect: 'all' }}
                            >
                                {hostSecret || '設定取得中...'}
                            </div>
                            <span className="settings-description" style={{ marginTop: '8px', display: 'block' }}>
                                APIリクエストの <code>Authorization</code> ヘッダーに <code>Bearer [Host Secret]</code> として使用してください。
                            </span>
                        </div>
                    </div>
                </section>

                <section className="settings-section" style={{ marginTop: '24px' }}>
                    <h4 className="section-title">拡張機能開発リソース</h4>

                    <div className="resource-list">
                        <a href="#" className="resource-item" onClick={(e) => {
                            e.preventDefault()
                            api.openExternal('https://github.com/84kb/Obscura/blob/main/plugins/niconico.js')
                        }}>
                            <div className="resource-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                            </div>
                            <div className="resource-info">
                                <span className="resource-title">Extension テンプレート (GitHub)</span>
                                <span className="resource-desc">TypeScript + Vite を使用した拡張機能のベースプロジェクトです。</span>
                            </div>
                        </a>

                        <div className="resource-item">
                            <div className="resource-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                            </div>
                            <div className="resource-info">
                                <span className="resource-title">@obscura/core 型定義の利用</span>
                                <span className="resource-desc">
                                    プロジェクト内で <code>npm install -D @obscura/core</code> を実行することで、APIの型補完を有効にできます。
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
                                <span className="resource-title">開発者向け公式ドキュメント</span>
                                <span className="resource-desc">APIの仕様や拡張機能のライフサイクルについての詳細な解説です。</span>
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
                <h4 className="section-title">アプリケーション更新</h4>
                <div className="settings-card">
                    <div className="settings-row-vertical">
                        <div className="settings-info" style={{ paddingRight: 0 }}>
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
                                <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                    <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
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

                            <div className="button-group" style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                {updateStatus === 'idle' && (
                                    <button className="btn btn-primary btn-sm" onClick={handleCheckForUpdates}>
                                        更新を確認
                                    </button>
                                )}

                                {updateStatus === 'available' && (
                                    <button className="btn btn-primary btn-sm" onClick={handleDownloadUpdate}>
                                        アップデートをダウンロード
                                    </button>
                                )}

                                {updateStatus === 'downloaded' && (
                                    <button className="btn btn-primary btn-sm" onClick={handleQuitAndInstall}>
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
        const path = await api.selectFolder()
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

    const renderImportSettings = () => {
        if (!clientConfig) return <div className="loading">読み込み中...</div>

        return (
            <div className="settings-page">
                <h3 className="settings-page-title">インポート・ダウンロード</h3>

                <section className="settings-section">
                    <h4 className="section-title">ダウンロード</h4>
                    <div className="settings-card">
                        <div className="settings-row-vertical">
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

                        <div className="settings-padded-content" style={{ paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="settings-label" style={{ fontSize: '13px', marginBottom: 0 }}>監視フォルダ設定</span>
                            <button className="btn btn-secondary btn-sm" onClick={handleAddWatchPath}>
                                + フォルダを追加
                            </button>
                        </div>

                        {(!clientConfig.autoImport.watchPaths || clientConfig.autoImport.watchPaths.length === 0) ? (
                            <div className="watcher-empty">
                                監視フォルダが設定されていません
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
                                                <span style={{ fontWeight: 'bold', minWidth: '70px' }}>インポート先:</span>
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
                                ※ インポート完了後、元のファイルは完全に削除されます。
                            </p>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <div className="settings-card">
                        <div className="settings-padded-content" style={{ paddingBottom: '8px' }}>
                            <div className="settings-info" style={{ paddingRight: 0 }}>
                                <span className="settings-label">他のライブラリへの追加設定</span>
                                <span className="settings-description">
                                    ファイルを他のライブラリに追加する際、引き継ぐ情報を選択します。
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
                                        updateClientConfig({ discordRichPresenceEnabled: e.target.checked })
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
                        <div className="settings-description-box">
                            <span className="settings-description">
                                ここで設定したニックネームとアイコンは、リモートライブラリへの接続時や、ホストとしてライブラリを公開する際に使用されます。
                            </span>
                        </div>

                        <div className="settings-row-vertical">
                            <label className="settings-label">ニックネーム</label>
                            <input
                                type="text"
                                className="settings-input"
                                placeholder="あなたの表示名"
                                value={nickname}
                                onChange={e => setNickname(e.target.value)}
                                maxLength={50}
                            />
                        </div>

                        <div className="settings-row-vertical">
                            <label className="settings-label">アイコン</label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ height: '40px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                    画像を選択...
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
                                        削除
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
                                    <span style={{ fontWeight: 'bold', fontSize: '18px', color: 'var(--text-main)' }}>{nickname || '（未設定）'}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>プレビュー</span>
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

    const renderExtensionsSettings = () => {
        return (
            <div className="settings-page">
                <h3 className="settings-page-title">拡張機能（プラグイン）設定</h3>
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
                                            alert(`以下のファイルは既に存在するためスキップされました:\n${(result.skipped ?? []).join('\n')}`)
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
                                ファイルからインストール...
                            </button>
                        </div>

                        {availablePlugins.length === 0 ? (
                            <div className="empty-state">
                                <p>利用可能なプラグインが見つかりません</p>
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
                                                        {meta.description || '説明がありません。'}
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
                                                                    alert(`削除に失敗しました: ${result.error}`)
                                                                }
                                                            } catch (e) {
                                                                console.error('[Settings] Plugin uninstall failed:', e)
                                                            }
                                                        }}
                                                        title="プラグインを削除"
                                                    >
                                                        削除
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
                                                            activeCategory === 'developer' ? renderDeveloperSettings() :
                                                                activeCategory === 'extensions' ? renderExtensionsSettings() : (
                                                                    <div className="empty-state">
                                                                        <p>このセクションの設定は準備中です。</p>
                                                                    </div>
                                                                )}
                    </div>

                    <footer className="settings-main-footer">
                        <button className="btn-save" onClick={onClose}>閉じる</button>
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
                            <div className="settings-controls">
                                <select
                                    className="settings-input"
                                    style={{ width: '220px' }}
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
                        </div>

                        <div className="settings-row-vertical">
                            <div className="settings-info" style={{ paddingRight: 0 }}>
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

                        <div className="settings-row-vertical">
                            <div className="settings-info" style={{ paddingRight: 0 }}>
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
