import { useState, useEffect, useRef, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { useNotification } from './contexts/NotificationContext'
import { LibraryGrid } from './components/LibraryGrid'
import { ListView } from './components/ListView'
import { Player } from './components/Player'
import { Inspector } from './components/Inspector'
import { TagManager } from './components/TagManager'
import { LibraryModal } from './components/LibraryModal'
import { SettingsModal } from './components/SettingsModal'
import { ContextMenu } from './components/ContextMenu'
import { ConfirmModal } from './components/ConfirmModal'
import { SubfolderGrid } from './components/SubfolderGrid'
import { ProfileSetupModal } from './components/ProfileSetupModal'
import { useLibrary } from './hooks/useLibrary'
import { MediaFile, AppSettings, RemoteLibrary, ViewSettings, defaultViewSettings, ElectronAPI } from './types'
import { MainHeader } from './components/MainHeader'
import { useSocket } from './hooks/useSocket'
import { DuplicateModal } from './components/DuplicateModal'
import './styles/index.css'
import './styles/drag-overlay.css'

const DEFAULT_SETTINGS: AppSettings = {
    autoPlay: true,
    allowUpscale: false,
    gridSize: 4,
    viewMode: 'grid',
    enableRichText: false,
    pipControlMode: 'navigation'
}


export default function App() {
    const {
        mediaFiles,
        allMediaFiles,
        filterOptions,
        setFilterOptions,
        tags,
        tagGroups,
        folders,
        libraries,
        activeLibrary,
        createTag,
        deleteTag,
        createFolder,
        addTagToMedia,
        removeTagFromMedia,
        addFolderToMedia,
        removeFolderFromMedia,
        moveToTrash,
        moveFilesToTrash,
        restoreFromTrash,
        restoreFilesFromTrash,
        deletePermanently,
        deleteFilesPermanently,
        updateLastPlayed,
        createLibrary,
        hasActiveLibrary,
        importMedia,
        libraryStats,
        updateRating,
        renameMedia,
        updateArtist,
        refreshLibrary,
        loadFolders,
        renameFolder,
        deleteFolder,
        activeRemoteLibrary,
        switchToRemoteLibrary,
        switchToLocalLibrary,
        openLibrary,
        myUserToken,
        addTagsToMedia,
        setMediaFiles,
        reloadLibrary,
        checkEntryDuplicates
    } = useLibrary()

    const { addNotification, removeNotification, updateProgress } = useNotification()


    // Socket.io 接続 (リモートライブラリ選択時のみ)
    const { isConnected: isSocketConnected, subscribe } = useSocket({
        enabled: !!activeRemoteLibrary,
        url: activeRemoteLibrary?.url,
        userToken: myUserToken,
        accessToken: activeRemoteLibrary?.token
    })

    // データ読み込み (ライブラリ切り替え時などに再実行)
    useEffect(() => {
        const loadAll = async () => {
            try {
                await refreshLibrary()
                await loadFolders()
                // 他のデータも必要に応じて
            } catch (e: any) {
                if (activeRemoteLibrary) {
                    alert(`リモートライブラリ "${activeRemoteLibrary.name}" への接続に失敗しました。\nサーバーが起動していないか、ネットワークに問題があります。`)
                    // 失敗した場合はローカルに戻すなどの処理も検討可能だが、一旦警告のみ
                }
            }
        }
        loadAll()
    }, [refreshLibrary, loadFolders, activeRemoteLibrary])

    // Socketイベントハンドリング
    useEffect(() => {
        if (!isSocketConnected) return

        const handleUpdate = (data: any) => {
            console.log('[Socket] Received update:', data)
            refreshLibrary()
        }

        const unsubDetails = [
            subscribe('media:created', handleUpdate),
            subscribe('media:updated', handleUpdate),
            subscribe('media:deleted', handleUpdate)
        ]

        return () => {
            unsubDetails.forEach(unsub => unsub())
        }
    }, [isSocketConnected, subscribe, refreshLibrary])

    // アップデート通知
    useEffect(() => {
        if (!window.electronAPI) return
        const removeListener = window.electronAPI.onUpdateStatus((data) => {
            if (data.status === 'update-downloaded') {
                addNotification({
                    type: 'success',
                    title: 'アップデート完了',
                    message: '新しいバージョンをインストールする準備ができました。設定画面から再起動してください。',
                    duration: 0
                })
            }
            if (data.status === 'update-available') {
                addNotification({
                    type: 'info',
                    title: 'アップデートがあります',
                    message: `新しいバージョン v${data.info?.version} が利用可能です。設定画面からダウンロードできます。`,
                    duration: 10000
                })
            }
        })
        return () => {
            if (removeListener && typeof removeListener === 'function') removeListener()
        }
    }, [addNotification])



    // 選択されたメディアのIDリスト
    const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([])
    // 最後に選択されたメディアID (Shift選択用)
    const [lastSelectedId, setLastSelectedId] = useState<number | null>(null)
    const [renamingMediaId, setRenamingMediaId] = useState<number | null>(null)

    // 再生中のメディア(プレイヤー用)
    const [playingMedia, setPlayingMedia] = useState<MediaFile | null>(null)

    // Discord RPC: Idle State Handling
    useEffect(() => {
        if (!window.electronAPI) return

        if (!playingMedia) {
            const libName = activeRemoteLibrary
                ? activeRemoteLibrary.name
                : (activeLibrary ? activeLibrary.name : 'No Library')

            // ライブラリが開かれていない場合はクリア、開かれていればライブラリ名を表示
            if (!activeLibrary && !activeRemoteLibrary) {
                window.electronAPI.clearDiscordActivity()
            } else {
                window.electronAPI.updateDiscordActivity({
                    details: 'Browsing Library',
                    state: libName,
                    largeImageKey: 'app_icon',
                    largeImageText: 'Obscura'
                }).catch(err => console.error('Failed to update idle activity:', err))
            }
        }
    }, [playingMedia, activeLibrary, activeRemoteLibrary])

    // 設定
    const [settings, setSettings] = useState<AppSettings>(() => {
        const saved = localStorage.getItem('app_settings')
        if (saved) {
            const parsed = JSON.parse(saved)
            return { ...DEFAULT_SETTINGS, ...parsed }
        }
        return DEFAULT_SETTINGS
    })

    // ライブラリ更新状態
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 })

    useEffect(() => {
        const api = window.electronAPI as unknown as ElectronAPI
        if (!api?.onRefreshProgress) return
        return api.onRefreshProgress((current: number, total: number) => {
            setRefreshProgress({ current, total })
        })
    }, [])

    const handleRefreshLibrary = async () => {
        setIsRefreshing(true)
        setRefreshProgress({ current: 0, total: 0 })
        try {
            await (window.electronAPI as unknown as ElectronAPI).refreshLibrary()
        } catch (error) {
            console.error('Refresh failed:', error)
            alert('ライブラリの更新に失敗しました')
        } finally {
            setIsRefreshing(false)
        }
    }
    const [showSettingsModal, setShowSettingsModal] = useState(false)
    const [showLibraryModal, setShowLibraryModal] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const isInternalDrag = useRef(false)
    const dragCounter = useRef(0)
    const [gridSize, setGridSize] = useState<number>(settings.gridSize)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(settings.viewMode)

    // イベントリスナー内で最新の状態を参照するための Ref
    const isDraggingRef = useRef(isDragging)
    const hasActiveLibraryRef = useRef(hasActiveLibrary)
    const activeRemoteLibraryRef = useRef(activeRemoteLibrary)

    // StateとRefの同期
    useEffect(() => {
        isDraggingRef.current = isDragging
    }, [isDragging])

    useEffect(() => {
        hasActiveLibraryRef.current = hasActiveLibrary
    }, [hasActiveLibrary])

    useEffect(() => {
        activeRemoteLibraryRef.current = activeRemoteLibrary
    }, [activeRemoteLibrary])

    // ドラッグ＆ドロップ状態のグローバル管理
    useEffect(() => {
        const handleGlobalDragEnter = (e: DragEvent) => {
            e.preventDefault()
            dragCounter.current++
            console.log('[Global D&D] DragEnter:', dragCounter.current, 'isInternal:', isInternalDrag.current)

            if (dragCounter.current === 1) {
                // 内部ドラッグ中はオーバーレイを表示しない
                if (isInternalDrag.current) {
                    console.log('[Global D&D] Internal drag detected, suppressing overlay')
                    return
                }

                const hasFiles = Array.from(e.dataTransfer?.types || []).some(t => t.toLowerCase() === 'files')
                if ((hasActiveLibraryRef.current || activeRemoteLibraryRef.current) && hasFiles) {
                    console.log('[Global D&D] Showing overlay')
                    setIsDragging(true)
                    document.body.classList.add('dragging-file')
                }
            }
        }

        const handleGlobalDragOver = (e: DragEvent) => {
            e.preventDefault()
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy'
            }

            // 内部ドラッグ中なら何もしない
            if (isInternalDrag.current) return

            if (!isDraggingRef.current) {
                const hasFiles = Array.from(e.dataTransfer?.types || []).some(t => t.toLowerCase() === 'files')
                if ((hasActiveLibraryRef.current || activeRemoteLibraryRef.current) && hasFiles) {
                    console.log('[Global D&D] Delayed overlay trigger')
                    setIsDragging(true)
                    document.body.classList.add('dragging-file')
                }
            }
        }

        const handleGlobalDragLeave = (e: DragEvent) => {
            e.preventDefault()
            dragCounter.current--
            console.log('[Global D&D] DragLeave:', dragCounter.current)

            if (dragCounter.current <= 0) {
                dragCounter.current = 0
                if (isDraggingRef.current) {
                    console.log('[Global D&D] Hiding overlay')
                    setIsDragging(false)
                    document.body.classList.remove('dragging-file')
                }
            }
        }

        const handleGlobalDrop = async (e: DragEvent) => {
            // dropイベントはバブリングで受ける (Sidebar等のstopPropagationを優先)
            console.log('[Global D&D] Global Drop detected, isInternal:', isInternalDrag.current)

            const wasInternal = isInternalDrag.current

            // 状態リセット
            dragCounter.current = 0
            setIsDragging(false)
            document.body.classList.remove('dragging-file')
            // Drop後に確実にリセット
            isInternalDrag.current = false

            if (wasInternal) {
                console.log('[Global D&D] Internal drop caught at global level, ignore file import')
                return
            }

            e.preventDefault()

            if (!hasActiveLibraryRef.current && !activeRemoteLibraryRef.current) {
                return
            }

            const files = Array.from(e.dataTransfer?.files || [])
            const filePaths = files.map(file => (file as any).path)
            console.log('[Global D&D] Global Dropped paths:', filePaths)

            if (filePaths.length > 0) {
                await handleSmartImport(filePaths)
            }
        }


        const handleGlobalDragEnd = () => {
            console.log('[Global D&D] Global DragEnd')
            dragCounter.current = 0
            setIsDragging(false)
            isInternalDrag.current = false
            document.body.classList.remove('dragging-file')
        }

        const handleMouseDown = () => {
            if (dragCounter.current !== 0 || isDraggingRef.current) {
                console.log('[Global D&D] Manual reset via mousedown')
                dragCounter.current = 0
                setIsDragging(false)
                isInternalDrag.current = false
                document.body.classList.remove('dragging-file')
            }
        }

        const handleFocusReset = () => {
            if (dragCounter.current !== 0 || isDraggingRef.current) {
                console.log('[Global] Focus recovered, resetting states')
                dragCounter.current = 0
                setIsDragging(false)
                isInternalDrag.current = false
                document.body.classList.remove('dragging-file')
            }
        }

        // 基本的に capture: true で preventDefault を確実に行う
        // ただし内部要素が handleDrop で stopPropagation() した場合にグローバル側で走らないよう、
        // drop だけは bubbling (capture: false) で登録する
        // バブリングフェーズで登録し、個別のコンポーネントでの stopPropagation を優先させる
        window.addEventListener('dragenter', handleGlobalDragEnter, { capture: false })
        window.addEventListener('dragover', handleGlobalDragOver, { capture: false })
        window.addEventListener('dragleave', handleGlobalDragLeave, { capture: false })
        window.addEventListener('drop', handleGlobalDrop, { capture: false })
        window.addEventListener('dragend', handleGlobalDragEnd, { capture: false })
        window.addEventListener('mousedown', handleMouseDown, { capture: false })
        window.addEventListener('focus', handleFocusReset)

        return () => {
            window.removeEventListener('dragenter', handleGlobalDragEnter, { capture: false })
            window.removeEventListener('dragover', handleGlobalDragOver, { capture: false })
            window.removeEventListener('dragleave', handleGlobalDragLeave, { capture: false })
            window.removeEventListener('drop', handleGlobalDrop, { capture: false })
            window.removeEventListener('dragend', handleGlobalDragEnd, { capture: false })
            window.removeEventListener('mousedown', handleMouseDown, { capture: false })
            window.removeEventListener('focus', handleFocusReset)
        }
    }, [importMedia])

    useEffect(() => {
        const handleTriggerImport = (_: any, filePaths: string[]) => {
            console.log('[App] Received trigger-import:', filePaths)
            // Refを使用して最新の状態を確認
            if ((hasActiveLibraryRef.current || activeRemoteLibraryRef.current) && filePaths.length > 0) {
                handleSmartImport(filePaths).catch(e => console.error('Import failed via trigger:', e))
            }
        }

        const handleAutoImportComplete = (_: any, files: string[]) => {
            console.log('[App] Auto-import completed:', files.length)
            refreshLibrary()
            addNotification({
                type: 'success',
                title: '自動インポート完了',
                message: `${files.length} 件のファイルをインポートしました`,
                duration: 5000
            })
        }

        // イベントリスナー登録
        let unsubscribeTrigger: (() => void) | undefined
        let unsubscribeAutoImport: (() => void) | undefined
        let unsubscribeExportProgress: (() => void) | undefined

        if (window.electronAPI && window.electronAPI.on) {
            unsubscribeTrigger = window.electronAPI.on('trigger-import', handleTriggerImport) as any
            unsubscribeAutoImport = window.electronAPI.on('auto-import-complete', handleAutoImportComplete) as any
            unsubscribeExportProgress = window.electronAPI.on('export-progress', (_e: any, data: { id: string, progress: number }) => {
                // eはeventオブジェクトだが、preloadでどうラップしたかによる
                // preloadの実装: callback(_event, ...args)
                // dataは第一引数（event除く）

                // preloadの実装を確認すると:
                // callback(_event, ...args)
                // App側の受け取り: (e, data) => ...
                // もし data が直接来るなら (data) => ...

                // preload:
                // const subscription = (_event, ...args) => callback(_event, ...args);

                // なので、第一引数は event object.
                // data comes as second argument.
                if (data && data.id) {
                    updateProgress(data.id, data.progress)
                }
            }) as any
        }

        // クリーンアップ
        return () => {
            if (unsubscribeTrigger) unsubscribeTrigger()
            if (unsubscribeAutoImport) unsubscribeAutoImport()
            if (unsubscribeExportProgress) unsubscribeExportProgress()
        }
    }, [importMedia, refreshLibrary, addNotification])

    // 表示設定
    const [viewSettings, setViewSettings] = useState<ViewSettings>(() => {
        const saved = localStorage.getItem('view_settings')
        if (saved) {
            return { ...defaultViewSettings, ...JSON.parse(saved) }
        }
        return defaultViewSettings
    })

    // viewSettings保存
    useEffect(() => {
        localStorage.setItem('view_settings', JSON.stringify(viewSettings))
    }, [viewSettings])

    const handleUpdateViewSettings = useCallback((updates: Partial<ViewSettings>) => {
        setViewSettings(prev => ({ ...prev, ...updates }))
    }, [])

    useEffect(() => {
        setSettings(prev => ({ ...prev, gridSize, viewMode }))
    }, [gridSize, viewMode])

    // 設定保存
    useEffect(() => {
        localStorage.setItem('app_settings', JSON.stringify(settings))
    }, [settings])

    // リモートライブラリ管理
    const [remoteLibraries, setRemoteLibraries] = useState<RemoteLibrary[]>([])

    // 重複検知・解決用ステート
    const [duplicateQueue, setDuplicateQueue] = useState<{ newMedia: MediaFile; existingMedia: MediaFile; onResolve?: (media: MediaFile) => void }[]>([])

    // 最初の重複アイテムに対する処理
    const handleResolveDuplicate = async (action: 'skip' | 'replace' | 'both') => {
        const current = duplicateQueue[0]
        if (!current) return

        try {
            if (action === 'replace') {
                // 元ファイルをゴミ箱へ -> 新しく入れた方は維持
                await moveToTrash(current.existingMedia.id)
                // コールバック実行 (新しく入れた方を有効なファイルとして渡す)
                if (current.onResolve) await current.onResolve(current.newMedia)
            } else if (action === 'both') {
                // 両方そのまま (すでにインポート済み)
                if (current.onResolve) await current.onResolve(current.newMedia)
            } else if (action === 'skip') {
                // 新しく入れた方を「完全に削除」(重複なので) -> 元ファイルを維持
                await deletePermanently(current.newMedia.id)
                // コールバック実行 (既存の方を有効なファイルとして渡す)
                if (current.onResolve) await current.onResolve(current.existingMedia)
            }
        } catch (e) {
            console.error('Failed to resolve duplicate:', e)
        }

        // 次のキューへ
        setDuplicateQueue(prev => prev.slice(1))
    }

    const handleSmartImport = async (filePaths: string[], onImported?: (media: MediaFile) => void) => {
        // 先にインポート実行
        const imported = await importMedia(filePaths)
        if (!imported) return

        for (const media of imported) {
            // インポート済みのメディアに対して重複チェック
            const duplicates = await checkEntryDuplicates(media.id)

            if (duplicates.length > 0) {
                // 重複あり -> キューに追加 (onResolveとしてonImportedを渡す)
                // 複数の既存重複がある場合も考慮
                const queueItems = duplicates.map((d: any) => ({ ...d, onResolve: onImported }))
                setDuplicateQueue(prev => [...prev, ...queueItems])
            } else {
                // 重複なし -> 通常通りコールバック実行
                if (onImported) await onImported(media)
            }
        }
    }

    // プロファイル設定モーダル
    const [showProfileSetup, setShowProfileSetup] = useState(false)
    const [profileSetupLibrary, setProfileSetupLibrary] = useState<string>('')

    useEffect(() => {
        const loadRemoteLibraries = async () => {
            try {
                const config = await (window.electronAPI as any).getClientConfig()
                if (config && config.remoteLibraries) {
                    setRemoteLibraries(config.remoteLibraries)
                }
            } catch (error) {
                console.error("Failed to load remote libraries:", error)
            }
        }
        loadRemoteLibraries()
    }, [showSettingsModal]) // 設定モーダルが閉じたときに更新

    // リモートライブラリ接続時にプロファイルをチェック
    useEffect(() => {
        if (!activeRemoteLibrary) return

        const checkProfile = async () => {
            try {
                const response = await fetch(`${activeRemoteLibrary.url}/api/profile`, {
                    headers: {
                        'Authorization': `Bearer ${activeRemoteLibrary.token}`,
                        'X-User-Token': myUserToken
                    }
                })

                if (response.ok) {
                    const profile = await response.json()
                    // ニックネームが未設定の場合、設定モーダルを表示
                    if (!profile.nickname) {
                        setProfileSetupLibrary(activeRemoteLibrary.name || 'リモートライブラリ')
                        setShowProfileSetup(true)
                    }
                }
            } catch (error) {
                console.error('Failed to check profile:', error)
            }
        }

        checkProfile()
    }, [activeRemoteLibrary, myUserToken])

    // プロファイル保存ハンドラー
    const handleSaveProfile = async (profile: { nickname: string; iconUrl?: string }) => {
        if (!activeRemoteLibrary) return

        const response = await fetch(`${activeRemoteLibrary.url}/api/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${activeRemoteLibrary.token}`,
                'X-User-Token': myUserToken
            },
            body: JSON.stringify(profile)
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error?.message || 'プロファイルの保存に失敗しました')
        }

        setShowProfileSetup(false)
    }


    // コンテキストメニュー
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; media: MediaFile } | null>(null)

    // mediaFilesが更新されたら選択中メディアと再生中メディアを最新のデータで更新
    useEffect(() => {
        if (selectedMediaIds.length > 0) {
            // 現在の表示対象ファイルの中にまだ存在するかチェック
            const validIds = selectedMediaIds.filter(id => mediaFiles.some(m => m.id === id))
            if (validIds.length !== selectedMediaIds.length) {
                setSelectedMediaIds(validIds)
            }
        }
        if (playingMedia) {
            const updated = mediaFiles.find(m => m.id === playingMedia.id)
            if (updated) {
                setPlayingMedia(updated)
            }
        }
    }, [mediaFiles])

    // DELETEキーでゴミ箱へ移動（ゴミ箱表示時は完全削除）
    const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[]>([])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 入力フィールドにフォーカスがある場合は無視
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return
            }

            if (e.key === 'Delete' && selectedMediaIds.length > 0) {
                e.preventDefault()

                if (filterOptions.filterType === 'trash') {
                    // ゴミ箱表示時: 完全削除（確認モーダル表示）
                    setDeleteConfirmIds([...selectedMediaIds])
                } else {
                    // 通常表示時: ゴミ箱へ移動
                    selectedMediaIds.forEach(id => moveToTrash(id))
                    setSelectedMediaIds([])
                    setLastSelectedId(null)
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [selectedMediaIds, moveToTrash, filterOptions.filterType])

    const handleMediaClick = useCallback((media: MediaFile, e: React.MouseEvent) => {
        const isCtrl = e.ctrlKey || e.metaKey
        const isShift = e.shiftKey

        if (isShift && lastSelectedId !== null) {
            // Shift選択: 前回の選択から今回の選択までの範囲を選択
            const currentIndex = mediaFiles.findIndex(m => m.id === media.id)
            const lastIndex = mediaFiles.findIndex(m => m.id === lastSelectedId)

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex)
                const end = Math.max(currentIndex, lastIndex)
                const rangeIds = mediaFiles.slice(start, end + 1).map(m => m.id)

                // 既存の選択に追加（重複排除）
                setSelectedMediaIds(prev => Array.from(new Set([...prev, ...rangeIds])))
            }
        } else if (isCtrl) {
            // Ctrl選択: 個別にトグル
            setSelectedMediaIds(prev => {
                if (prev.includes(media.id)) {
                    return prev.filter(id => id !== media.id)
                } else {
                    return [...prev, media.id]
                }
            })
        } else {
            // 通常選択: 単一選択
            setSelectedMediaIds([media.id])
        }

        setLastSelectedId(media.id)
    }, [mediaFiles, lastSelectedId])

    const handleMediaDoubleClick = useCallback((media: MediaFile) => {
        setPlayingMedia(media)
        setSelectedMediaIds([media.id]) // 再生時も単一選択に
        setLastSelectedId(media.id)
        updateLastPlayed(media.id)
    }, [updateLastPlayed])

    const handleClosePlayer = () => {
        setPlayingMedia(null)
    }

    const handleCloseInspector = () => {
        setSelectedMediaIds([])
        setLastSelectedId(null)
    }

    // コンテキストメニューハンドラー
    const handleContextMenu = useCallback((media: MediaFile, e: React.MouseEvent) => {
        setContextMenu({ x: e.clientX, y: e.clientY, media })
        // 右クリック時には、そのアイテムが選択されていなければそれのみを選択
        setSelectedMediaIds(prev => {
            if (!prev.includes(media.id)) {
                return [media.id]
            }
            return prev
        })
        setLastSelectedId(media.id)
    }, [])

    const closeContextMenu = () => {
        setContextMenu(null)
    }

    const handleOpenDefault = async () => {
        if (contextMenu?.media) {
            await window.electronAPI.openPath(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleOpenWith = async () => {
        if (contextMenu?.media) {
            await window.electronAPI.openWith(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleShowInExplorer = async () => {
        if (contextMenu?.media) {
            await window.electronAPI.showItemInFolder(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleExport = async (media: MediaFile) => {
        closeContextMenu()

        // 通知IDを生成してプログレス通知を表示（Progress=0）
        const notificationId = addNotification({
            type: 'progress',
            title: 'エクスポート中',
            message: `${media.file_name} のメタデータを埋め込み中...`,
            progress: 0,
            duration: 0
        })

        try {
            const result = await window.electronAPI.exportMedia(media.id, { notificationId })

            // 完了したら通知を削除
            removeNotification(notificationId)

            if (result.success) {
                addNotification({
                    type: 'success',
                    title: 'エクスポート完了',
                    message: `${media.file_name} を保存しました`,
                    duration: 5000
                })
            } else if (result.message === 'Cancelled') {
                // キャンセルされた場合は何もしない（通知は削除済み）
            } else {
                addNotification({
                    type: 'error',
                    title: 'エクスポート失敗',
                    message: result.message || '不明なエラーが発生しました',
                    duration: 5000
                })
            }
        } catch (e: any) {
            removeNotification(notificationId)
            addNotification({
                type: 'error',
                title: 'エクスポート失敗',
                message: e.message,
                duration: 5000
            })
        }
    }

    const handleAddToFolder = async (folderId: number) => {
        if (contextMenu?.media) {
            await addFolderToMedia(contextMenu.media.id, folderId)
        }
        closeContextMenu()
    }

    const handleDropOnFolder = async (folderId: number, files: FileList) => {
        if (!files || files.length === 0) return

        const filePaths = Array.from(files).map(f => (f as any).path)

        if (isInternalDrag.current) {
            // 内部ドラッグ：既存のメディアファイルを特定して追加
            // パスから一致するメディアを探す
            const targetIds: number[] = []
            filePaths.forEach(path => {
                const media = mediaFiles.find(m => m.file_path === path)
                if (media) {
                    targetIds.push(media.id)
                }
            })

            // 選択中のファイルも考慮（ドラッグ中のファイルが含まれていない場合の保険、基本はパスで一致するはず）
            if (targetIds.length === 0 && selectedMediaIds.length > 0) {
                selectedMediaIds.forEach(id => targetIds.push(id))
            }

            // 重複排除
            const uniqueIds = Array.from(new Set(targetIds))

            for (const mediaId of uniqueIds) {
                await addFolderToMedia(mediaId, folderId)
            }
        } else {
            // 外部ドラッグ：Smartインポートを使用して解決
            await handleSmartImport(filePaths, async (media) => {
                await addFolderToMedia(media.id, folderId)
            })
            // ライブラリをリフレッシュ (addFolderToMedia内でloadMediaFilesしていれば不要だが念のため)
            await refreshLibrary()
        }
    }



    const handleCopy = async () => {
        if (contextMenu?.media) {
            await window.electronAPI.copyFile(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleCopyPath = async () => {
        if (contextMenu?.media) {
            await window.electronAPI.copyToClipboard(contextMenu.media.file_path)
        }
        closeContextMenu()
    }

    const handleMoveToTrash = async () => {
        if (contextMenu?.media) {
            await moveToTrash(contextMenu.media.id)
        }
        closeContextMenu()
    }



    const updateDescription = async (id: number, description: string | null) => {
        await window.electronAPI.updateDescription(id, description)
        refreshLibrary()
    }

    // ヘッダータイトルの取得
    const getHeaderTitle = () => {
        if (activeRemoteLibrary) return activeRemoteLibrary.name || 'リモートライブラリ'

        if (filterOptions.filterType === 'tag_manager') return 'タグ管理'
        if (filterOptions.filterType === 'trash') return 'ゴミ箱'
        if (filterOptions.filterType === 'uncategorized') return '未分類'
        if (filterOptions.filterType === 'untagged') return 'タグなし'
        if (filterOptions.filterType === 'recent') return '最近使用'
        if (filterOptions.filterType === 'random') return 'ランダム'

        if (filterOptions.selectedFolders.length > 0) {
            const folder = folders.find(f => filterOptions.selectedFolders.includes(f.id))
            return folder ? folder.name : 'すべて'
        }

        return activeLibrary ? activeLibrary.name : 'すべて'
    }

    const renderMainContent = () => {
        // プレイヤー再生中: オーバーレイとして表示
        const playerOverlay = playingMedia ? (
            <div className="player-overlay-container">
                <Player
                    media={playingMedia}
                    onBack={handleClosePlayer}
                    onNext={() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        const hasNext = currentIndex !== -1 && currentIndex < mediaFiles.length - 1
                        if (hasNext) {
                            const nextMedia = mediaFiles[currentIndex + 1]
                            setPlayingMedia(nextMedia)
                            setSelectedMediaIds([nextMedia.id])
                            setLastSelectedId(nextMedia.id)
                            updateLastPlayed(nextMedia.id)
                        }
                    }}
                    onPrev={() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        const hasPrev = currentIndex !== -1 && currentIndex > 0
                        if (hasPrev) {
                            const prevMedia = mediaFiles[currentIndex - 1]
                            setPlayingMedia(prevMedia)
                            setSelectedMediaIds([prevMedia.id])
                            setLastSelectedId(prevMedia.id)
                            updateLastPlayed(prevMedia.id)
                        }
                    }}
                    hasNext={(() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        return currentIndex !== -1 && currentIndex < mediaFiles.length - 1
                    })()}
                    hasPrev={(() => {
                        const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
                        return currentIndex !== -1 && currentIndex > 0
                    })()}
                    autoPlayEnabled={settings.autoPlay}
                    onToggleAutoPlay={() => {
                        setSettings(prev => ({ ...prev, autoPlay: !prev.autoPlay }))
                    }}
                    onPlayFirst={() => {
                        if (mediaFiles.length > 0) {
                            const firstMedia = mediaFiles[0]
                            setPlayingMedia(firstMedia)
                            setSelectedMediaIds([firstMedia.id])
                            setLastSelectedId(firstMedia.id)
                            updateLastPlayed(firstMedia.id)
                        }
                    }}
                    activeRemoteLibrary={activeRemoteLibrary}
                    myUserToken={myUserToken}
                    onCommentAdded={() => {
                        // コメント追加後、メディアデータを再取得してInspectorを更新
                        reloadLibrary()
                    }}
                />
            </div>
        ) : null

        let mainContent = null
        if (filterOptions.filterType === 'tag_manager') {
            mainContent = (
                <TagManager
                    tags={tags}
                    onCreateTag={createTag}
                    onDeleteTag={deleteTag}
                    disabled={!hasActiveLibrary && !activeRemoteLibrary}
                    onRefresh={refreshLibrary}
                    onInternalDragStart={() => {
                        isInternalDrag.current = true
                    }}
                    onInternalDragEnd={() => {
                        isInternalDrag.current = false
                    }}
                    allMediaFiles={allMediaFiles}
                />
            )
        } else {
            mainContent = (
                <div
                    className={`content-container ${isDragging ? 'dragging' : ''}`}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setSelectedMediaIds([])
                            setLastSelectedId(null)
                        }
                    }}
                >
                    <MainHeader
                        title={getHeaderTitle()}
                        filterOptions={filterOptions}
                        onFilterChange={setFilterOptions}
                        gridSize={gridSize}
                        onGridSizeChange={setGridSize}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        tags={tags}
                        tagGroups={tagGroups}
                        allMediaFiles={allMediaFiles}
                        viewSettings={viewSettings}
                        onViewSettingsChange={setViewSettings}
                        folders={folders}
                        onRefreshLibrary={handleRefreshLibrary}
                        onReload={reloadLibrary}
                    />
                    {/* サブフォルダー表示 */}
                    {filterOptions.selectedFolders.length > 0 && (
                        <SubfolderGrid
                            subfolders={folders.filter(f => f.parentId === filterOptions.selectedFolders[0])}
                            onSelectFolder={(folderId) => {
                                setFilterOptions(prev => ({ ...prev, selectedFolders: [folderId] }))
                            }}
                            getMediaCount={(folderId) => {
                                // TODO: 実際のメディアカウントを計算
                                return mediaFiles.filter(m => m.folders?.some(f => f.id === folderId)).length
                            }}
                        />
                    )}

                    {/* 内容ヘッダー */}
                    {filterOptions.selectedFolders.length > 0 && folders.filter(f => f.parentId === filterOptions.selectedFolders[0]).length > 0 && (
                        <div className="content-section-header">
                            <span>内容 ({mediaFiles.length})</span>
                        </div>
                    )}

                    {viewMode === 'grid' ? (
                        <LibraryGrid
                            mediaFiles={mediaFiles}
                            onMediaClick={handleMediaClick}
                            onMediaDoubleClick={handleMediaDoubleClick}
                            onMediaContextMenu={handleContextMenu}
                            gridSize={gridSize}
                            viewMode={viewMode}
                            selectedMediaIds={selectedMediaIds}
                            viewSettings={viewSettings}
                            onClearSelection={() => {
                                setSelectedMediaIds([])
                                setLastSelectedId(null)
                            }}
                            onSelectionChange={(ids) => {
                                setSelectedMediaIds(ids)
                                if (ids.length > 0) setLastSelectedId(ids[ids.length - 1])
                            }}
                            onInternalDragStart={() => {
                                isInternalDrag.current = true
                            }}
                            onInternalDragEnd={() => {
                                // Global dragend でケアするため、ここでは何もしないか、
                                // 脱落防止に短いタイマーを置く程度にする
                            }}
                            renamingMediaId={renamingMediaId}
                            onRenameSubmit={async (id, newName) => {
                                // DB更新
                                await window.electronAPI.renameMedia(id, newName)
                                setRenamingMediaId(null)
                                refreshLibrary()
                            }}
                            onRenameCancel={() => setRenamingMediaId(null)}
                        />
                    ) : (
                        <ListView
                            mediaFiles={mediaFiles}
                            selectedIds={selectedMediaIds}
                            onSelect={handleMediaClick}
                            onDoubleClick={handleMediaDoubleClick}
                            onContextMenu={handleContextMenu}
                            viewSettings={viewSettings}
                            updateViewSettings={handleUpdateViewSettings}
                            filterOptions={filterOptions}
                            onFilterChange={setFilterOptions}
                        />
                    )}
                </div>
            )
        }

        return (
            <>
                {mainContent}
                {playerOverlay}
            </>
        )
    }


    // メタデータバックフィル
    useEffect(() => {
        if (activeLibrary) {
            window.electronAPI.backfillMetadata()
                .then(count => {
                    if (count > 0) {
                        console.log(`[App] Backfilled metadata for ${count} videos.`)
                        refreshLibrary()
                    }
                })
                .catch(err => console.error('[App] Failed to backfill metadata:', err))
        }
    }, [activeLibrary, refreshLibrary])

    return (
        <div className="app">

            <Sidebar
                filterOptions={filterOptions}
                onFilterChange={(options) => {
                    setPlayingMedia(null)
                    setFilterOptions(options)
                }}
                folders={folders}
                libraries={libraries}
                remoteLibraries={remoteLibraries}
                activeLibrary={activeLibrary}
                activeRemoteLibrary={activeRemoteLibrary}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={deleteFolder}
                onOpenLibraryModal={() => setShowLibraryModal(true)}
                onOpenLibrary={openLibrary}
                onSwitchLibrary={(path) => {
                    setPlayingMedia(null)
                    switchToLocalLibrary(path)
                }}
                onSwitchRemoteLibrary={(lib) => {
                    setPlayingMedia(null)
                    switchToRemoteLibrary(lib)
                }}
                onOpenSettings={() => setShowSettingsModal(true)}
                hasActiveLibrary={hasActiveLibrary}
                onRefreshFolders={loadFolders}
                onDropFileOnFolder={handleDropOnFolder}
                // 内部ドラッグの通知を追加
                onInternalDragStart={() => {
                    isInternalDrag.current = true
                }}
                onInternalDragEnd={() => {
                    isInternalDrag.current = false
                }}
            />

            <main className={`main-content ${playingMedia ? 'is-playing' : ''}`} onClick={(e) => {
                // グリッドの空きスペースをクリックしたら選択解除
                if (e.target === e.currentTarget) {
                    setSelectedMediaIds([])
                    setLastSelectedId(null)
                }
            }}>
                {renderMainContent()}

                {/* ライブラリ更新プログレスバー (メインコンテンツ下部固定) */}
                {isRefreshing && (
                    <div className="bottom-progress-bar-container">
                        <div className="bottom-progress-info">
                            <span className="scanning-text">ライブラリを更新中...</span>
                            <span className="progress-count">{refreshProgress.current} / {refreshProgress.total}</span>
                        </div>
                        <div className="bottom-progress-track">
                            <div
                                className="bottom-progress-fill"
                                style={{ width: `${(refreshProgress.current / Math.max(refreshProgress.total, 1)) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                )}
            </main>

            {viewSettings.showInspector && (
                <Inspector
                    media={selectedMediaIds.map(id => mediaFiles.find(m => m.id === id)).filter(Boolean) as MediaFile[]}
                    playingMedia={playingMedia}
                    allTags={tags}
                    allFolders={folders}
                    onAddTag={addTagToMedia}
                    onAddTags={addTagsToMedia}
                    onRemoveTag={removeTagFromMedia}
                    onCreateTag={createTag}
                    onAddFolder={addFolderToMedia}
                    onRemoveFolder={removeFolderFromMedia}
                    onCreateFolder={createFolder}
                    enableRichText={settings.enableRichText}
                    onPlay={(media) => {
                        setPlayingMedia(media)
                        setSelectedMediaIds([media.id])
                        setLastSelectedId(media.id)
                        updateLastPlayed(media.id)
                    }}
                    onMoveToTrash={moveToTrash}
                    onMoveFilesToTrash={moveFilesToTrash}
                    onRestore={restoreFromTrash}
                    onRestoreFiles={restoreFilesFromTrash}
                    onDeletePermanently={deletePermanently}
                    onDeleteFilesPermanently={deleteFilesPermanently}
                    onClose={handleCloseInspector}
                    onRenameMedia={renameMedia}
                    onUpdateRating={updateRating}
                    onUpdateArtist={updateArtist}
                    onUpdateDescription={updateDescription}
                    onUpdateUrl={(id, url) => window.electronAPI.updateUrl(id, url).then(() => {
                        setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, url } : m))
                    })}
                    totalStats={libraryStats}
                    currentContextMedia={mediaFiles}
                />
            )}

            {showLibraryModal && (
                <LibraryModal
                    onClose={() => setShowLibraryModal(false)}
                    onCreateLibrary={createLibrary}
                    onOpenLibrary={openLibrary}
                />
            )}

            {showSettingsModal && (
                <SettingsModal
                    settings={settings}
                    onUpdateSettings={(newSettings) => {
                        setSettings(newSettings)
                        localStorage.setItem('app_settings', JSON.stringify(newSettings))
                    }}
                    onClose={() => setShowSettingsModal(false)}
                />
            )}

            {/* コンテキストメニュー */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    media={contextMenu.media}
                    folders={folders}
                    onClose={closeContextMenu}
                    onOpenDefault={handleOpenDefault}
                    onOpenWith={handleOpenWith}
                    onShowInExplorer={handleShowInExplorer}
                    onAddToFolder={handleAddToFolder}
                    onRename={() => {
                        setRenamingMediaId(contextMenu.media.id)
                        closeContextMenu()
                    }}
                    onCopy={handleCopy}
                    onCopyPath={handleCopyPath}
                    onMoveToTrash={handleMoveToTrash}
                    onExport={!activeRemoteLibrary ? handleExport : undefined}
                    onDownload={activeRemoteLibrary ? async () => {
                        if (!contextMenu?.media || !window.electronAPI) return
                        const media = contextMenu.media
                        const downloadUrl = media.file_path
                        const filename = media.file_name || 'download.mp4'

                        // 通知ID生成 (addNotificationの戻り値を使用)
                        const notificationId = addNotification({
                            title: 'ダウンロード中...',
                            message: filename,
                            type: 'progress',
                            progress: 0
                        })

                        closeContextMenu()

                        try {
                            const result = await (window.electronAPI as any).downloadRemoteMedia(downloadUrl, filename, { notificationId })

                            // 完了後、プログレス通知を消して結果通知を表示
                            removeNotification(notificationId)

                            if (result.success) {
                                addNotification({
                                    title: 'ダウンロード完了',
                                    message: filename,
                                    type: 'success',
                                    duration: 3000
                                })
                            } else {
                                addNotification({
                                    title: 'ダウンロード失敗',
                                    message: result.message || '不明なエラー',
                                    type: 'error',
                                    duration: 5000
                                })
                            }
                        } catch (e: any) {
                            removeNotification(notificationId)
                            addNotification({
                                title: 'エラー',
                                message: e.message,
                                type: 'error',
                                duration: 5000
                            })
                        }
                    } : undefined}
                />
            )}

            {/* 完全削除確認モーダル */}
            {deleteConfirmIds.length > 0 && (
                <ConfirmModal
                    title="完全に削除"
                    message={deleteConfirmIds.length === 1
                        ? 'ファイルをデバイスから完全に削除しますか？\nこの操作は取り消せません。'
                        : `${deleteConfirmIds.length}個のファイルをデバイスから完全に削除しますか？\nこの操作は取り消せません。`
                    }
                    confirmLabel="削除"
                    cancelLabel="キャンセル"
                    isDestructive={true}
                    onConfirm={async () => {
                        if (filterOptions.filterType === 'trash') {
                            if (confirm(`${deleteConfirmIds.length}個のファイルをデバイスから完全に削除しますか？\nこの操作は取り消せません。`)) {
                                await deleteFilesPermanently(deleteConfirmIds)
                            }
                        } else {
                            await moveFilesToTrash(deleteConfirmIds)
                        }
                        setSelectedMediaIds([])
                        setLastSelectedId(null)
                        setDeleteConfirmIds([])
                    }}
                    onCancel={() => setDeleteConfirmIds([])}
                />
            )}

            {/* プロファイル設定モーダル */}
            <ProfileSetupModal
                isOpen={showProfileSetup}
                libraryName={profileSetupLibrary}
                onSave={handleSaveProfile}
                onClose={() => setShowProfileSetup(false)}
            />

            {isDragging && (
                <div className="app-drag-overlay">
                    <div className="drag-content">
                        <div className="drag-icon">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                        </div>
                        <h2>ファイルをドロップして追加</h2>
                        <p>ライブラリにインポートされます</p>
                    </div>
                </div>
            )}

            {/* 重複チェックモーダル */}
            {duplicateQueue.length > 0 && (
                <DuplicateModal
                    duplicate={duplicateQueue[0]}
                    onResolve={handleResolveDuplicate}
                />
            )}
        </div>
    )
}


