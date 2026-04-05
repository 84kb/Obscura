import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { MediaFile, Tag, TagGroup, Folder, FilterOptions, Library, RemoteLibrary } from '@obscura/core'
import { useNotification } from '../contexts/NotificationContext'
import { api } from '../api'
import { getAuthQuery } from '../utils/auth'

export function useLibrary(options?: { showSubfolderContent?: boolean }) {
    const MEDIA_LOAD_TIMEOUT_MS = 60000
    const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
    const [tags, setTags] = useState<Tag[]>([])
    const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
    const [folders, setFolders] = useState<Folder[]>([]) // Renamed from genres
    const [libraries, setLibraries] = useState<Library[]>([])
    const [loading, setLoading] = useState(false)
    const [loadingProgress, setLoadingProgress] = useState(0)
    const isInitialLoadDone = useRef(false)
    const previousLibraryLoadKey = useRef<string | null>(null)
    const startupRefreshAttemptedKey = useRef<string | null>(null)
    const startupLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [startupLoading, setStartupLoading] = useState(true)
    const [initialLibraryResolved, setInitialLibraryResolved] = useState(false)
    const [activeLibrary, setActiveLibrary] = useState<Library | null>(null)
    const [activeRemoteLibrary, setActiveRemoteLibrary] = useState<RemoteLibrary | null>(null)
    const [myUserToken, setMyUserToken] = useState<string>('')
    const [isUserTokenLoaded, setIsUserTokenLoaded] = useState(false)
    const [randomSeed, setRandomSeed] = useState<number>(Date.now())
    // Pagination & Performance
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [loadingTime, setLoadingTime] = useState<number | null>(null)
    // Compatibility mode: many features assume a full in-memory dataset.
    // Keep full fetch until list/filter/folder features are fully server-paginated.
    const FULL_FETCH_LIMIT = 100000
    const loadingRef = useRef(false) // Prevent concurrent loads
    const loadRequestSeq = useRef(0)
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        searchQuery: '',
        searchTargets: {
            name: true,
            folder: true,
            description: true,
            extension: true,
            tags: true,
            url: true,
            comments: true,
            memo: true,
            artist: true
        },
        selectedTags: [],
        excludedTags: [],
        selectedFolders: [], // Renamed from selectedGenres
        excludedFolders: [],
        tagFilterMode: 'or',
        selectedSysDirs: [], // Renamed from selectedFolders
        excludedSysDirs: [], // Renamed from excludedFolders
        folderFilterMode: 'or',
        filterType: 'all',
        fileType: 'all',
        sortOrder: 'name',
        sortDirection: 'desc',
        selectedRatings: [],
        excludedRatings: [],
        selectedExtensions: [],
        excludedExtensions: [],
        selectedArtists: [],
        excludedArtists: []
    })
    const foldersRef = useRef<Folder[]>([])

    useEffect(() => {
        foldersRef.current = folders
    }, [folders])

    // ソート設定読み込み・保存のヘルパー
    const getLibraryIdForConfig = useCallback(() => {
        if (activeRemoteLibrary) {
            return `remote_${activeRemoteLibrary.id}`
        }
        if (activeLibrary) {
            return `local_${activeLibrary.path}`
        }
        return null
    }, [activeLibrary, activeRemoteLibrary])

    // 簡易的な実装として、ロード完了を待つ (useRefで管理)
    const isViewSettingsLoaded = useRef<string | null>(null)

    // ロードエフェクト
    useEffect(() => {
        const load = async () => {
            const libId = getLibraryIdForConfig()
            if (!libId) {
                isViewSettingsLoaded.current = null
                return
            }
            // 既にロード済みならスキップ…はできない（ライブラリ切り替え時）

            try {
                const config = await api.getClientConfig()
                if (config && config.libraryViewSettings && config.libraryViewSettings[libId]) {
                    const saved = config.libraryViewSettings[libId]
                    setFilterOptions(prev => ({
                        ...prev,
                        sortOrder: saved.sortOrder as any,
                        sortDirection: saved.sortDirection
                    }))
                } else {
                    setFilterOptions(prev => ({
                        ...prev,
                        sortOrder: 'name',
                        sortDirection: 'desc'
                    }))
                }
                isViewSettingsLoaded.current = libId
            } catch (e) {
                console.error('Failed to load view settings', e)
            }
        }
        load()
    }, [getLibraryIdForConfig])

    // 保存エフェクト
    useEffect(() => {
        const save = async () => {
            const libId = getLibraryIdForConfig()
            if (!libId) return
            // まだロードが完了していない（あるいはロードしたIDと違う）なら保存しない
            if (isViewSettingsLoaded.current !== libId) return

            try {
                const currentConfig = await api.getClientConfig()
                const newSettings = {
                    ...currentConfig.libraryViewSettings,
                    [libId]: {
                        sortOrder: filterOptions.sortOrder,
                        sortDirection: filterOptions.sortDirection
                    }
                }
                await api.updateClientConfig({ libraryViewSettings: newSettings })
            } catch (e) {
                console.error('Failed to save view settings', e)
            }
        }

        // デバウンス的に少し待ってもいいが、頻繁に変えるものでもないので直実行
        // ただしロード直後の発火を防ぐため、依存配列等注意
        save()
    }, [filterOptions.sortOrder, filterOptions.sortDirection, getLibraryIdForConfig])

    // ... 

    // フォルダー (ex-Genre) 読み込み
    const loadFolders = useCallback(async () => {
        try {
            const loadedFolders = await api.getFolders()
            setFolders(Array.isArray(loadedFolders) ? loadedFolders : [])
        } catch (error) {
            console.error('Failed to load folders:', error)
            setFolders([])
        }
    }, [])


    // フォルダー (ex-Genre) 作成
    const createFolder = useCallback(async (name: string, parentId?: number | null) => {
        if (!activeLibrary && !activeRemoteLibrary) return null
        try {
            const newFolder = await api.createFolder(name, parentId)
            await loadFolders()
            return newFolder
        } catch (error) {
            console.error('Failed to create folder:', error)
            return null
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])

    // フォルダー削除
    const deleteFolder = useCallback(async (id: number) => {
        try {
            await api.deleteFolder(id)
            await loadFolders()
        } catch (error) {
            console.error('Failed to delete folder:', error)
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])

    // フォルダー名変更
    const renameFolder = useCallback(async (id: number, newName: string) => {
        try {
            await api.renameFolder(id, newName)
            await loadFolders()
        } catch (error) {
            console.error('Failed to rename folder:', error)
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])



    const { addNotification, removeNotification, updateProgress } = useNotification()

    // インポート進捗リスナー
    useEffect(() => {
        // if (!window.electronAPI || !window.electronAPI.on) return // Adapter pattern usually ensures api exists but let's check basic validity if needed
        // Assuming api.on is available via adapter

        const activeNotifications = new Map<string, string>() // sessionId -> notificationId

        const handleProgress = (_: any, data: { id: string, current: number, total: number, fileName: string, step: string, percentage: number }) => {
            let notificationId = activeNotifications.get(data.id)

            const message = data.total > 1
                ? `[${data.current}/${data.total}] ${data.fileName}\n${data.step}`
                : `${data.fileName}\n${data.step}`

            if (!notificationId) {
                const title = data.id === 'auto-import' ? '自動インポート' : 'インポート中'
                notificationId = addNotification({
                    type: 'progress',
                    title,
                    message,
                    progress: data.percentage,
                    duration: 0
                })
                activeNotifications.set(data.id, notificationId)
            } else {
                updateProgress(notificationId, data.percentage)
                // メッセージも更新したいが NotificationContext が現在メッセージ更新をサポートしていない場合は
                // コンテキストを拡張するか、一旦プログレスのみとする。
                // 現状の updateProgress は progress のみ。
            }

            if (data.percentage >= 100 && data.current === data.total) {
                setTimeout(() => {
                    if (notificationId) removeNotification(notificationId)
                    activeNotifications.delete(data.id)
                }, 1000)
            }
        }

        const handleUploadProgress = (_: any, data: { id: string, progress: number }) => {
            updateProgress(data.id, data.progress)
        }

        const removeImportListener = api.on('import-progress', handleProgress)
        const removeUploadListener = api.on('upload-progress', handleUploadProgress)
        const removeDownloadListener = api.on('download-progress', handleUploadProgress)

        return () => {
            // @ts-ignore
            if (removeImportListener) (removeImportListener as any)()
            // @ts-ignore
            if (removeUploadListener) (removeUploadListener as any)()
            // @ts-ignore
            if (removeDownloadListener) (removeDownloadListener as any)()
        }
    }, [addNotification, updateProgress, removeNotification])

    // クライアント設定（UserToken）読み込み
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const config = await api.getClientConfig()
                const savedToken = String(config?.myUserToken || '').trim()
                const token = /^[a-f0-9]{64}$/i.test(savedToken)
                    ? savedToken
                    : await api.generateUserToken().catch(() => savedToken)
                console.log('[useLibrary] Loaded user token:', token ? '***' : '(empty)')
                setMyUserToken(token)
            } catch (e) {
                console.error('Failed to load client config in useLibrary', e)
            } finally {
                setIsUserTokenLoaded(true)
                console.log('[useLibrary] Token load userTokenLoaded = true')
            }
        }
        loadConfig()
    }, [])

    // メディアファイルのパスをリモート用に変換するヘルパー
    const transformRemoteMedia = useCallback((mediaList: MediaFile[], remoteLib: RemoteLibrary): MediaFile[] => {
        const { userToken, accessToken } = getAuthQuery(remoteLib.token, myUserToken)

        const baseUrl = remoteLib.url.replace(/\/$/, '')

        return mediaList.map(m => ({
            ...m,
            // サムネイルとファイルパスをリモートURLに置換
            // クエリパラメータでトークンを渡す (imgタグなどで読み込むため)
            // 呼び出し側で ?width=... 等を追加する場合があるため、& で接続できるようにクエリ文字列を構築
            thumbnail_path: m.thumbnail_path ? `${baseUrl}/api/thumbnails/${m.id}?userToken=${userToken}&accessToken=${accessToken}` : '',
            file_path: `${baseUrl}/api/stream/${m.id}?userToken=${userToken}&accessToken=${accessToken}`,
            // webViewLinkなどがもしあればそれも変換検討だが、現在は file_path が重要
        }))
    }, [myUserToken])

    // Media file loading
    const loadMediaFiles = useCallback(async (
        reset = true,
        silent = false,
        requestFilters: Record<string, any> | null = null,
    ) => {
        if (loadingRef.current) return 0

        // In full-fetch compatibility mode, incremental paging is disabled.
        if (!reset) return 0

        loadingRef.current = true
        const requestSeq = ++loadRequestSeq.current
        const startTime = performance.now()
        if (!silent) {
            setLoading(true)
            setLoadingProgress(5)
        }

        try {
            // Wait for user token if accessing a remote library
            if (activeRemoteLibrary) {
                if (!isUserTokenLoaded) {
                    loadingRef.current = false
                    if (!silent) {
                        setLoading(false)
                        setLoadingProgress(0)
                    }
                    return 0
                }
                if (!myUserToken) {
                    console.warn('[loadMediaFiles] User token is empty. Skipping request.')
                    loadingRef.current = false
                    if (!silent) {
                        setLoading(false)
                        setLoadingProgress(0)
                    }
                    return 0
                }
            }

            const targetPage = 1
            const mergedFilters = requestFilters && typeof requestFilters === 'object'
                ? { ...requestFilters }
                : null
            const result = activeRemoteLibrary
                ? await Promise.race([
                    api.getMediaFiles(targetPage, FULL_FETCH_LIMIT, mergedFilters),
                    new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(`getMediaFiles timed out after ${MEDIA_LOAD_TIMEOUT_MS}ms`))
                        }, MEDIA_LOAD_TIMEOUT_MS)
                    }),
                ])
                : await api.getMediaFiles(targetPage, FULL_FETCH_LIMIT, mergedFilters)
            if (requestSeq !== loadRequestSeq.current) return

            let newFiles = Array.isArray(result) ? result : (result.media || [])

            // リモートライブラリの場合は、画像パス等をリモートURLへ置換
            if (activeRemoteLibrary) {
                newFiles = transformRemoteMedia(newFiles, activeRemoteLibrary)
            }

            setMediaFiles(newFiles)

            setPage(1)
            setHasMore(false)
            if (!silent) {
                setLoadingProgress(95)
            }

            // Measure time
            const endTime = performance.now()
            const duration = (endTime - startTime) / 1000
            setLoadingTime(duration)
            return newFiles.length
        } catch (error: any) {
            console.error('Failed to load media files:', error)
            // Do not re-throw if it's just a background fetch failing, but maybe notify...
            return 0
        } finally {
            if (requestSeq === loadRequestSeq.current) {
                loadingRef.current = false
                if (!silent) {
                    setLoading(false)
                    setLoadingProgress(0)
                }
            }
        }
    }, [activeRemoteLibrary, activeLibrary, transformRemoteMedia, myUserToken, isUserTokenLoaded, addNotification])

    const loadMore = useCallback(() => {
        // no-op in full-fetch compatibility mode
    }, [])

    const finalizeStartupLoading = useCallback(() => {
        if (startupLoadingTimerRef.current) {
            clearTimeout(startupLoadingTimerRef.current)
        }
        startupLoadingTimerRef.current = setTimeout(() => {
            setLoading(false)
            setLoadingProgress(0)
            setStartupLoading(false)
            startupLoadingTimerRef.current = null
        }, 120)
    }, [])

    useEffect(() => {
        if (!startupLoading || loading) return

        const fallbackTimer = setTimeout(() => {
            if (!loadingRef.current) {
                setLoading(false)
                setLoadingProgress(0)
                setStartupLoading(false)
            }
        }, 500)

        return () => clearTimeout(fallbackTimer)
    }, [startupLoading, loading])

    useEffect(() => {
        const apiWithEvents = api as any
        if (!apiWithEvents?.on) return

        const unsubscribe = apiWithEvents.on('library-load-progress', (_event: any, payload: any) => {
            const percentage = Number(payload?.percentage)
            if (!Number.isFinite(percentage)) return
            setLoading(true)
            setLoadingProgress((prev) => {
                const next = Math.max(0, Math.min(100, Math.round(percentage)))
                return next >= prev ? next : prev
            })
        })

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe()
            }
        }
    }, [])

    useEffect(() => {
        if (!startupLoading) return
        if (loadingProgress < 100) return

        const timer = setTimeout(() => {
            if (!loadingRef.current) {
                finalizeStartupLoading()
            }
        }, 150)

        return () => clearTimeout(timer)
    }, [startupLoading, loadingProgress, finalizeStartupLoading])

    useEffect(() => {
        if (!startupLoading) return
        if (loadingProgress < 100) return

        const hardStopTimer = setTimeout(() => {
            setLoading(false)
            setLoadingProgress(0)
            setStartupLoading(false)
            loadingRef.current = false
            if (startupLoadingTimerRef.current) {
                clearTimeout(startupLoadingTimerRef.current)
                startupLoadingTimerRef.current = null
            }
        }, 1200)

        return () => clearTimeout(hardStopTimer)
    }, [startupLoading, loadingProgress])

    useEffect(() => {
        if (!startupLoading) return
        if (loading || loadingRef.current) return
        if (!isInitialLoadDone.current) return

        const timer = setTimeout(() => {
            if (!loadingRef.current) {
                finalizeStartupLoading()
            }
        }, 150)

        return () => clearTimeout(timer)
    }, [startupLoading, loading, mediaFiles, activeLibrary, activeRemoteLibrary, finalizeStartupLoading])

    // タグ読み込み
    const loadTags = useCallback(async () => {
        try {
            const loadedTags = await api.getTags()
            setTags(Array.isArray(loadedTags) ? loadedTags : [])
        } catch (error) {
            console.error('Failed to load tags:', error)
        }
    }, [])

    // タググループ（親タグカテゴリ等）読み込み
    const loadTagGroups = useCallback(async () => {
        try {
            const loadedGroups = await api.getTagGroups()
            setTagGroups(Array.isArray(loadedGroups) ? loadedGroups : [])
        } catch (error) {
            console.error('Failed to load tag groups:', error)
        }
    }, [])


    // フォルダー選択とスキャン
    const selectAndScanFolder = useCallback(async () => {
        try {
            const folderPath = await api.selectFolder()
            if (folderPath) {
                await api.scanFolder(folderPath)
                await loadMediaFiles()
            }
        } catch (error) {
            console.error('Failed to scan folder:', error)
        }
    }, [loadMediaFiles])

    // タグ作成
    const createTag = useCallback(async (name: string): Promise<Tag | null> => {
        if (!activeLibrary && !activeRemoteLibrary) return null
        try {
            if (activeRemoteLibrary) {
                try {
                    const newTag = await api.createRemoteTag(activeRemoteLibrary.url, activeRemoteLibrary.token, name)
                    await loadTags()
                    return newTag
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'タグ作成の権限がありません。' })
                    }
                    throw e
                }
            }
            const newTag = await api.createTag(name)
            await loadTags()
            return newTag
        } catch (error) {
            console.error('Failed to create tag:', error)
            return null
        }
    }, [loadTags, activeLibrary, activeRemoteLibrary, addNotification])

    // タグ削除
    const deleteTag = useCallback(async (id: number) => {
        try {
            if (activeRemoteLibrary) {
                try {
                    await api.deleteRemoteTag(activeRemoteLibrary.url, activeRemoteLibrary.token, id)
                    await loadTags()
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'タグ削除の権限がありません。' })
                    }
                    throw e
                }
            }
            await api.deleteTag(id)
            await loadTags()
        } catch (error) {
            console.error('Failed to delete tag:', error)
        }
    }, [loadTags, activeLibrary, activeRemoteLibrary, addNotification])



    // メディアにタグ追加
    const addTagToMedia = useCallback(async (mediaId: number, tagId: number) => {
        // Optimistic Update
        const targetTag = tags.find(t => t.id === tagId)
        if (!targetTag) return

        setMediaFiles(prev => prev.map(m => {
            if (m.id === mediaId) {
                // 既に持っている場合はスキップ
                if (m.tags?.some(t => t.id === tagId)) return m
                return { ...m, tags: [...(m.tags || []), targetTag] }
            }
            return m
        }))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.addRemoteTagToMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, mediaId, tagId)
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'タグ追加の権限がありません。' })
                    }
                    // Revert or reload on error
                    await loadMediaFiles()
                    throw e
                }
            }
            await api.addTagToMedia(mediaId, tagId)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to add tag to media:', error)
            // Error recovery
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification, tags])

    // メディアからタグ削除
    const removeTagFromMedia = useCallback(async (mediaId: number, tagId: number) => {
        // Optimistic Update
        setMediaFiles(prev => prev.map(m => {
            if (m.id === mediaId) {
                return { ...m, tags: (m.tags || []).filter(t => t.id !== tagId) }
            }
            return m
        }))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.removeRemoteTagFromMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, mediaId, tagId)
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'タグ削除の権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
            }
            await api.removeTagFromMedia(mediaId, tagId)
        } catch (error) {
            console.error('Failed to remove tag from media:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification])

    // メディアにタグ一括追加
    const addTagsToMedia = useCallback(async (mediaIds: number[], tagIds: number[]) => {
        // Optimistic Update
        const targetTags = tags.filter(t => tagIds.includes(t.id))

        setMediaFiles(prev => prev.map(m => {
            if (mediaIds.includes(m.id)) {
                // 重複排除して追加
                const existingIds = new Set(m.tags?.map(t => t.id) || [])
                const newTags = targetTags.filter(t => !existingIds.has(t.id))
                if (newTags.length === 0) return m
                return { ...m, tags: [...(m.tags || []), ...newTags] }
            }
            return m
        }))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.addRemoteTagsToMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, mediaIds, tagIds)
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'タグ一括追加の権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
                return
            }
            await api.addTagsToMedia(mediaIds, tagIds)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to add tags to media:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification, tags])

    // メディアにフォルダー追加
    const addFolderToMedia = useCallback(async (mediaId: number, folderId: number, folderOverride?: Folder | null) => {
        // Optimistic Update
        const normalizedFolderId = Number(folderId)
        const targetFolder =
            folderOverride ||
            foldersRef.current.find(f => Number(f.id) === normalizedFolderId) ||
            folders.find(f => Number(f.id) === normalizedFolderId)

        setMediaFiles(prev => prev.map(m => {
            if (m.id === mediaId) {
                // 既に持っている場合はスキップ
                if (m.folders?.some(f => Number(f.id) === normalizedFolderId)) return m
                if (!targetFolder) return m
                return { ...m, folders: [...(m.folders || []), targetFolder] }
            }
            return m
        }))

        try {
            await api.addFolderToMedia(mediaId, normalizedFolderId)
        } catch (error) {
            console.error('Failed to add folder to media:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, folders])

    // メディアからフォルダー削除
    const removeFolderFromMedia = useCallback(async (mediaId: number, folderId: number) => {
        // Optimistic Update
        setMediaFiles(prev => prev.map(m => {
            if (m.id === mediaId) {
                return { ...m, folders: (m.folders || []).filter(f => f.id !== folderId) }
            }
            return m
        }))

        try {
            await api.removeFolderFromMedia(mediaId, folderId)
        } catch (error) {
            console.error('Failed to remove folder from media:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles])

    // ゴミ箱操作
    const moveToTrash = useCallback(async (id: number) => {
        // Optimistic Update: is_deletedフラグを更新
        setMediaFiles(prev => prev.map(m => {
            if (m.id === id) {
                return { ...m, is_deleted: true }
            }
            return m
        }))

        try {
            await api.moveToTrash(id)
        } catch (error) {
            console.error('Failed to move to trash:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles])

    // ソート設定保存
    useEffect(() => {
        localStorage.setItem('sort_order', filterOptions.sortOrder)
        localStorage.setItem('sort_direction', filterOptions.sortDirection)
    }, [filterOptions.sortOrder, filterOptions.sortDirection])

    const restoreFromTrash = useCallback(async (id: number) => {
        // Optimistic: is_deletedフラグを更新
        setMediaFiles(prev => prev.map(m => {
            if (m.id === id) {
                return { ...m, is_deleted: false }
            }
            return m
        }))

        try {
            await api.restoreFromTrash(id)
        } catch (error) {
            console.error('Failed to restore from trash:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles])

    const deletePermanently = useCallback(async (id: number) => {
        // Optimistic
        setMediaFiles(prev => prev.filter(m => m.id !== id))

        try {
            await api.deletePermanently(id)
        } catch (error) {
            console.error('Failed to delete permanently:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles])

    const moveFilesToTrash = useCallback(async (ids: number[]) => {
        // Optimistic
        setMediaFiles(prev => prev.filter(m => !ids.includes(m.id)))

        try {
            for (const id of ids) {
                await api.moveToTrash(id)
            }
        } catch (error) {
            console.error('Failed to move files to trash:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles])

    const restoreFilesFromTrash = useCallback(async (ids: number[]) => {
        // Optimistic
        if (filterOptions.filterType === 'trash') {
            setMediaFiles(prev => prev.filter(m => !ids.includes(m.id)))
        }

        try {
            for (const id of ids) {
                await api.restoreFromTrash(id)
            }
        } catch (error) {
            console.error('Failed to restore files from trash:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, filterOptions.filterType])

    const deleteFilesPermanently = useCallback(async (ids: number[]) => {
        // Optimistic
        setMediaFiles(prev => prev.filter(m => !ids.includes(m.id)))

        try {
            if (activeRemoteLibrary) {
                try {
                    for (const id of ids) {
                        await api.deleteRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id)
                    }
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: '削除権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
                return
            }

            for (const id of ids) {
                await api.deletePermanently(id)
            }
        } catch (error) {
            console.error('Failed to delete files permanently:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    const updateDescription = useCallback(async (id: number, description: string | null) => {
        // Optimistic
        setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, description } : m))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { description })
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: '説明を更新する権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
            }
            await api.updateDescription(id, description)
        } catch (error) {
            console.error('Failed to update description:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    const updateUrl = useCallback(async (id: number, url: string | null) => {
        // Optimistic
        setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, url } : m))

        try {
            if (activeRemoteLibrary) {
                // Remote support for URL update (Check API availability or skip)
                // Assuming similar to description
                try {
                    await api.updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { url })
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'URLを更新する権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
            }
            await api.updateUrl(id, url)
        } catch (error) {
            console.error('Failed to update url:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    // 再生日時更新
    const updateLastPlayed = useCallback(async (id: number) => {
        try {
            await api.updateLastPlayed(id)
            // ローカルステートを即座に更新して再読み込みを回避
            setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, last_played_at: new Date().toISOString() } : m))
        } catch (error) {
            console.error('Failed to update last played:', error)
        }
    }, [])

    // メディアインポート
    const importMedia = useCallback(async (filePaths: string[], options?: { deleteSource?: boolean; importSource?: string }) => {
        if (filePaths.length === 0) return

        setLoading(true)
        const notificationId = activeRemoteLibrary
            ? addNotification({ type: 'progress', title: 'アップロード中', message: `${filePaths.length}個のファイルを転送しています...`, progress: 0, duration: 0 })
            : addNotification({ type: 'info', title: 'インポート中', message: `${filePaths.length}個のファイルを読み込んでいます...`, duration: 0 })

        try {
            if (activeRemoteLibrary) {
                // notificationId を渡して、バックエンドからそのIDで進捗イベントを送ってもらう
                const res = await api.uploadRemoteMedia(
                    activeRemoteLibrary.url,
                    activeRemoteLibrary.token,
                    filePaths,
                    { notificationId }
                )
                if (!res.success) {
                    throw new Error(res.message || 'Remote upload failed')
                }

                removeNotification(notificationId)
                addNotification({ type: 'success', title: 'アップロード完了', message: `${filePaths.length}個のファイルを追加しました。` })
                await loadMediaFiles()
                return res.results || []
            }

            const importedFiles = await (api.importMedia as any)(filePaths, options)
            removeNotification(notificationId)
            addNotification({ type: 'success', title: 'インポート完了', message: `${filePaths.length}個のファイルを追加しました。` })
            await loadMediaFiles()
            return importedFiles
        } catch (error) {
            console.error('Failed to import media:', error)
            removeNotification(notificationId)
            addNotification({ type: 'error', title: 'インポート失敗', message: String(error) })
            return []
        } finally {
            setLoading(false)
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification, removeNotification])

    // レーティング更新
    const updateRating = useCallback(async (id: number, rating: number) => {
        // Optimistic
        setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, rating } : m))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { rating })
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: '評価を更新する権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
            }
            await api.updateRating(id, rating)
        } catch (error) {
            console.error('Failed to update rating:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification])

    // メディア名変更
    const renameMedia = useCallback(async (id: number, newName: string) => {
        // Optimistic
        setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, file_name: newName } : m))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.renameRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, newName)
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: 'ファイル名変更の権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
            }
            const updatedMedia = await api.renameMedia(id, newName)
            if (updatedMedia) {
                setMediaFiles(prev => prev.map(m => m.id === id ? updatedMedia : m))
            }
        } catch (error) {
            console.error('Failed to rename media:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification])


    // 投稿者更新
    const updateArtist = useCallback(async (id: number, artist: string | null) => {
        // Optimistic
        setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, artist } : m))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { artist })
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: '編集権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
            }
            await api.updateArtist(id, artist)
        } catch (error) {
            console.error('Failed to update artist:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification])

    // フィルタリングされたメディアファイル
    const filteredMediaFiles = useMemo(() => {
        const hasExtraFilters =
            !!filterOptions.searchQuery ||
            filterOptions.fileType !== 'all' ||
            (filterOptions.selectedTags?.length || 0) > 0 ||
            (filterOptions.excludedTags?.length || 0) > 0 ||
            (filterOptions.selectedFolders?.length || 0) > 0 ||
            (filterOptions.excludedFolders?.length || 0) > 0 ||
            (filterOptions.selectedRatings?.length || 0) > 0 ||
            (filterOptions.excludedRatings?.length || 0) > 0 ||
            (filterOptions.selectedExtensions?.length || 0) > 0 ||
            (filterOptions.excludedExtensions?.length || 0) > 0 ||
            (filterOptions.selectedArtists?.length || 0) > 0 ||
            (filterOptions.excludedArtists?.length || 0) > 0 ||
            !!filterOptions.dateModifiedMin ||
            !!filterOptions.dateModifiedMax

        // Fast path for random tab with no extra filters.
        // Keeps behavior while bypassing expensive generic filter pipeline.
        if (filterOptions.filterType === 'random' && !hasExtraFilters) {
            return shuffleArray(mediaFiles.filter(m => !m.is_deleted), randomSeed)
        }

        let result = [...mediaFiles]
        const childFolderIdsByParentId = new Map<number, number[]>()
        folders.forEach((folder) => {
            const parentId = Number(folder.parentId)
            if (!Number.isFinite(parentId)) return
            const children = childFolderIdsByParentId.get(parentId) || []
            children.push(folder.id)
            childFolderIdsByParentId.set(parentId, children)
        })

        const collectFolderIds = (rootFolderId: number) => {
            const collected = new Set<number>([rootFolderId])
            if (!options?.showSubfolderContent) {
                return collected
            }

            const queue = [rootFolderId]
            while (queue.length > 0) {
                const currentId = queue.shift()
                if (currentId === undefined) continue
                const childIds = childFolderIdsByParentId.get(currentId) || []
                childIds.forEach((childId) => {
                    if (collected.has(childId)) return
                    collected.add(childId)
                    queue.push(childId)
                })
            }

            return collected
        }

        const selectedFolderGroups = filterOptions.selectedFolders.map((folderId) => collectFolderIds(folderId))
        const selectedFolderSet = new Set<number>(selectedFolderGroups.flatMap((group) => Array.from(group)))
        const excludedFolderSet = new Set<number>(filterOptions.excludedFolders.flatMap((folderId) => Array.from(collectFolderIds(folderId))))
        const selectedRatingSet = new Set(filterOptions.selectedRatings)
        const excludedRatingSet = new Set(filterOptions.excludedRatings)
        const selectedExtensionSet = new Set(filterOptions.selectedExtensions)
        const excludedExtensionSet = new Set(filterOptions.excludedExtensions)
        const selectedTagSet = new Set(filterOptions.selectedTags)
        const excludedTagSet = new Set(filterOptions.excludedTags)
        const selectedArtistSet = new Set(filterOptions.selectedArtists)
        const excludedArtistSet = new Set(filterOptions.excludedArtists)

        // 基本フィルター (Trash以外はis_deletedを除外)
        if (filterOptions.filterType === 'trash') {
            result = result.filter(m => m.is_deleted)
        } else if (filterOptions.filterType === 'tag_manager') {
            return [] // タグ管理画面では何も表示しない
        } else {
            result = result.filter(m => !m.is_deleted)
        }

        // セクションフィルター
        switch (filterOptions.filterType) {
            case 'uncategorized':
                result = result.filter(m => !m.folders || m.folders.length === 0)
                break
            case 'untagged':
                result = result.filter(m => !m.tags || m.tags.length === 0)
                break
            case 'recent':
                result = result.filter(m => m.last_played_at !== null)
                break
            // case 'random': removed to enable filtering, handled in sort logic

            default:
                break
        }

        // 検索クエリフィルター
        if (filterOptions.searchQuery) {
            const query = filterOptions.searchQuery.toLowerCase()
            const targets = filterOptions.searchTargets || {
                name: true,
                folder: true,
                description: true,
                extension: true,
                tags: true,
                url: true,
                comments: true,
                memo: true,
                artist: true
            }

            result = result.filter(m => {
                let match = false

                // 名前
                if (targets.name && m.file_name.toLowerCase().includes(query)) match = true
                if (match) return true

                // 拡張子
                if (targets.extension) {
                    const ext = m.file_name.split('.').pop()?.toLowerCase() || ''
                    if (ext.includes(query)) match = true
                }
                if (match) return true

                // フォルダ名
                if (targets.folder && m.folders) {
                    if (m.folders.some(f => f.name.toLowerCase().includes(query))) match = true
                }
                if (match) return true

                // タグ
                if (targets.tags && m.tags) {
                    if (m.tags.some(t => t.name.toLowerCase().includes(query))) match = true
                }
                if (match) return true

                // URL
                if (targets.url && m.url) {
                    if (m.url.toLowerCase().includes(query)) match = true
                }
                if (match) return true

                // 説明 (Memo含む)
                if ((targets.description || targets.memo) && m.description) {
                    if (m.description.toLowerCase().includes(query)) match = true
                }
                if (match) return true

                // コメント
                if (targets.comments && m.comments) {
                    if (m.comments.some(c => c.text.toLowerCase().includes(query))) match = true
                }
                if (match) return true

                // 投稿者 (artist / artists)
                if (targets.artist) {
                    if (m.artist && m.artist.toLowerCase().includes(query)) match = true
                    if (m.artists && m.artists.some(a => a.toLowerCase().includes(query))) match = true
                }

                return match
            })
        }

        // フォルダーフィルター (Sidebarのジャンル選択 & FolderFilterDropdown)
        if (filterOptions.selectedFolders.length > 0) {
            if (filterOptions.folderFilterMode === 'and') {
                // AND: すべてのフォルダーを含む
                result = result.filter(m =>
                    selectedFolderGroups.every((folderGroup) =>
                        m.folders?.some(g => folderGroup.has(g.id))
                    )
                )
            } else {
                // OR: いずれかのフォルダーを含む
                result = result.filter(m =>
                    m.folders?.some(g => selectedFolderSet.has(g.id))
                )
            }
        }



        // フォルダー除外フィルター
        if (filterOptions.excludedFolders && filterOptions.excludedFolders.length > 0) {
            result = result.filter(m =>
                !m.folders?.some(g => excludedFolderSet.has(g.id))
            )
        }

        // 評価フィルター
        if ((filterOptions.selectedRatings && filterOptions.selectedRatings.length > 0) ||
            (filterOptions.excludedRatings && filterOptions.excludedRatings.length > 0)) {
            result = result.filter(m => {
                const rating = m.rating || 0

                // 除外チェック
                if (excludedRatingSet.has(rating)) {
                    return false
                }

                // 選択チェック (選択されているものがある場合のみ)
                if (filterOptions.selectedRatings?.length > 0) {
                    return selectedRatingSet.has(rating)
                }

                return true
            })
        }

        // 拡張子フィルター
        if ((filterOptions.selectedExtensions && filterOptions.selectedExtensions.length > 0) ||
            (filterOptions.excludedExtensions && filterOptions.excludedExtensions.length > 0)) {
            result = result.filter(m => {
                const ext = m.file_name.split('.').pop()?.toLowerCase() || ''

                // 除外チェック
                if (excludedExtensionSet.has(ext)) {
                    return false
                }

                // 選択チェック (選択されているものがある場合のみ)
                if (filterOptions.selectedExtensions.length > 0) {
                    return selectedExtensionSet.has(ext)
                }

                return true
            })
        }

        // タグフィルター
        if (filterOptions.selectedTags.length > 0) {
            if (filterOptions.tagFilterMode === 'and') {
                // AND: すべてのタグを含む
                result = result.filter(m =>
                    filterOptions.selectedTags.every(tagId =>
                        m.tags?.some(t => t.id === tagId)
                    )
                )
            } else {
                // OR: いずれかのタグを含む
                result = result.filter(m =>
                    m.tags?.some(t => selectedTagSet.has(t.id))
                )
            }
        }

        // タグ除外フィルター
        if (filterOptions.excludedTags.length > 0) {
            result = result.filter(m =>
                !m.tags?.some(t => excludedTagSet.has(t.id))
            )
        }
        // 投稿者フィルター
        if ((filterOptions.selectedArtists && filterOptions.selectedArtists.length > 0) ||
            (filterOptions.excludedArtists && filterOptions.excludedArtists.length > 0)) {
            result = result.filter(m => {
                // artists配列を使うか、artistをカンマで分割して配列にする
                let artists: string[] = []
                if (m.artists && m.artists.length > 0) {
                    artists = m.artists
                } else if (m.artist) {
                    // カンマ区切りの場合は分割
                    artists = m.artist.split(',').map(a => a.trim()).filter(a => a)
                }
                if (artists.length === 0) {
                    artists = ['未設定']
                }

                // 除外チェック
                if (filterOptions.excludedArtists.length > 0) {
                    // 除外リストにあるアーティストが1つでも含まれていれば除外
                    if (artists.some(a => excludedArtistSet.has(a))) {
                        return false
                    }
                }

                // 選択チェック (選択されているものがある場合のみ)
                if (filterOptions.selectedArtists.length > 0) {
                    // 選択リストにあるアーティストが1つでも含まれていれば許可
                    return artists.some(a => selectedArtistSet.has(a))
                }

                return true
            })
        }

        // 再生時間フィルター
        if (filterOptions.durationMin !== null && filterOptions.durationMin !== undefined) {
            result = result.filter(m => (m.duration || 0) >= filterOptions.durationMin!)
        }
        if (filterOptions.durationMax !== null && filterOptions.durationMax !== undefined) {
            result = result.filter(m => (m.duration || 0) <= filterOptions.durationMax!)
        }

        // 変更日フィルター
        if (filterOptions.dateModifiedMin || filterOptions.dateModifiedMax) {
            const minModifiedDate = filterOptions.dateModifiedMin
                ? (() => {
                    const d = new Date(filterOptions.dateModifiedMin)
                    d.setHours(0, 0, 0, 0)
                    return d.getTime()
                })()
                : null
            const maxModifiedDate = filterOptions.dateModifiedMax
                ? (() => {
                    const d = new Date(filterOptions.dateModifiedMax)
                    d.setHours(23, 59, 59, 999)
                    return d.getTime()
                })()
                : null

            result = result.filter(m => {
                if (!m.modified_date) return false
                const modDate = new Date(m.modified_date).getTime()

                if (minModifiedDate !== null) {
                    if (modDate < minModifiedDate) return false
                }

                if (maxModifiedDate !== null) {
                    if (modDate > maxModifiedDate) return false
                }

                return true
            })
        }

        // フォルダーフィルター (ファイルパスベース - UIがジャンルベースに変更されたため無効化)
        // if (filterOptions.selectedFolders.length > 0) { ... }

        // フォルダー除外フィルター (ファイルパスベース - UIがジャンルベースに変更されたため無効化)
        // if (filterOptions.excludedFolders.length > 0) { ... }

        // ソート処理
        const effectiveSortOrder = filterOptions.filterType === 'random' ? 'random' : filterOptions.sortOrder

        if (effectiveSortOrder === 'random') {
            return shuffleArray(result, randomSeed)
        }

        const sortDirection = filterOptions.sortDirection === 'asc' ? 1 : -1
        const decorated = result.map((item) => {
            let key: string | number
            switch (effectiveSortOrder) {
                case 'name':
                    key = item.file_name
                    break
                case 'date':
                    key = new Date(item.created_at).getTime()
                    break
                case 'size':
                    key = item.file_size || 0
                    break
                case 'duration':
                    key = item.duration || 0
                    break
                case 'last_played':
                    key = item.last_played_at ? new Date(item.last_played_at).getTime() : 0
                    break
                case 'rating':
                    key = item.rating || 0
                    break
                case 'modified':
                    key = item.modified_date ? new Date(item.modified_date).getTime() : 0
                    break
                case 'artist':
                    key = (item.artist || (item.artists && item.artists[0]) || '').toLocaleLowerCase()
                    break
                case 'tags':
                    key = (item.tags || []).map(t => t.name).sort().join(', ')
                    break
                default:
                    key = item.file_name
                    break
            }
            return { item, key }
        })

        decorated.sort((a, b) => {
            let comparison = 0
            if (typeof a.key === 'number' && typeof b.key === 'number') {
                comparison = a.key - b.key
            } else if (effectiveSortOrder === 'tags') {
                comparison = String(a.key).localeCompare(String(b.key), 'ja')
            } else {
                comparison = String(a.key).localeCompare(String(b.key))
            }
            return comparison * sortDirection
        })

        result = decorated.map(entry => entry.item)

        return result
    }, [mediaFiles, filterOptions, randomSeed, folders, options?.showSubfolderContent])

    // ランダムフィルター選択時にシードを更新（毎回違う順序にするため）
    const prevFilterType = useRef(filterOptions.filterType)
    useEffect(() => {
        if (filterOptions.filterType === 'random' && prevFilterType.current !== 'random') {
            setRandomSeed(Date.now())
        }
        prevFilterType.current = filterOptions.filterType
    }, [filterOptions.filterType])

    // ライブラリ一覧読み込み
    const loadLibraries = useCallback(async () => {
        try {
            const loadedLibraries = await api.getLibraries()
            setLibraries(loadedLibraries)
        } catch (error) {
            console.error('Failed to load libraries:', error)
        }
    }, [])

    // ライブラリ切り替え
    const switchLibrary = useCallback(async (libraryPath: string) => {
        // 既にアクティブなら何もしない (またはリロードのみ)
        if (activeLibrary?.path === libraryPath && !activeRemoteLibrary) {
            return
        }

        try {
            await api.setActiveLibrary(libraryPath)
            const library = await api.getActiveLibrary()
            setActiveLibrary(library)
            setActiveRemoteLibrary(null)
            localStorage.removeItem('activeRemoteLibrary') // リモート状態をクリア
            // loadMediaFiles等はuseEffectで自動的に呼ばれる
        } catch (error) {
            console.error('Failed to switch library:', error)
        }
    }, [activeLibrary, activeRemoteLibrary])

    // ライブラリの再読み込み (ソフトリロード + 再ランダム化)
    const reloadLibrary = useCallback(async () => {
        // ランダムモードならシードを更新
        if (filterOptions.filterType === 'random' || filterOptions.sortOrder === 'random') {
            setRandomSeed(Date.now())
        }

        // データの再取得 (データベースからの最新情報の取得)
        await Promise.all([
            loadMediaFiles(),
            loadTags(),
            loadFolders()
        ])
    }, [filterOptions.filterType, filterOptions.sortOrder, loadMediaFiles, loadTags, loadFolders])

    // ライブラリ統計
    const libraryStats = useMemo(() => {
        const totalCount = mediaFiles.length
        const totalSize = mediaFiles.reduce((acc, file) => acc + (file.file_size || 0), 0)
        return { totalCount, totalSize }
    }, [mediaFiles])

    // アクティブなライブラリ読み込み (初期化時)
    const loadActiveLibrary = useCallback(async () => {
        try {
            // まずリモートの保存状態を確認
            const savedRemote = localStorage.getItem('activeRemoteLibrary')
            if (savedRemote) {
                try {
                    const remoteLib = JSON.parse(savedRemote)
                    if (remoteLib && remoteLib.url && remoteLib.token) {
                        setActiveRemoteLibrary(remoteLib)
                        setActiveLibrary(null)
                        return
                    }
                } catch (e) {
                    console.error('Failed to parse saved remote library:', e)
                    localStorage.removeItem('activeRemoteLibrary')
                }
            }

            const library = await api.getActiveLibrary()
            setActiveLibrary(library)
            setActiveRemoteLibrary(null)
        } catch (error) {
            console.error('Failed to load active library:', error)
        } finally {
            setInitialLibraryResolved(true)
        }
    }, [])

    // リモートライブラリへの切り替え
    const switchToRemoteLibrary = useCallback(async (lib: RemoteLibrary) => {
        // IDが同じでもURLが違う場合は更新を許可する
        if (activeRemoteLibrary?.id === lib.id && activeRemoteLibrary.url === lib.url && !activeLibrary) {
            return
        }

        try {
            const cachePath = await api.getRemoteCachePath(lib.id)
            if (cachePath) {
                // バックエンドでこのパスをアクティブなデータベースとして開く
                await api.setActiveLibrary(cachePath)
            }
        } catch (e) {
            console.error('Failed to set remote cache as active library:', e)
        }

        setActiveLibrary(null)
        setActiveRemoteLibrary(lib)
        localStorage.setItem('activeRemoteLibrary', JSON.stringify(lib)) // 状態を保存
        setMediaFiles([])
        setTags([])
        setFolders([])
    }, [activeRemoteLibrary, activeLibrary])

    // ローカルライブラリへの切り替え
    const switchToLocalLibrary = useCallback((lib: Library) => {
        if (activeLibrary?.path === lib.path && !activeRemoteLibrary) {
            return
        }

        api.setActiveLibrary(lib.path).then(async () => {
            setActiveLibrary(lib)
            setActiveRemoteLibrary(null)
            localStorage.removeItem('activeRemoteLibrary') // リモート状態をクリア
            // useEffectにより自動リロード
        })
    }, [activeLibrary, activeRemoteLibrary])

    const removeLocalLibraryHistory = useCallback(async (libraryPath: string) => {
        const normalizedTarget = String(libraryPath || '').trim().replace(/[\\\/]+$/, '')
        if (!normalizedTarget) return
        try {
            const config = await api.getClientConfig()
            const currentLocalLibraries = Array.isArray((config as any)?.localLibraries)
                ? (config as any).localLibraries
                : []
            const nextLocalLibraries = currentLocalLibraries
                .filter((entry: any) => {
                    const pathValue = String(entry?.path || '').trim().replace(/[\\\/]+$/, '')
                    return pathValue && pathValue !== normalizedTarget
                })
                .map((entry: any) => ({
                    name: String(entry?.name || '').trim() || String(entry?.path || '').split(/[\\\/]/).pop() || '',
                    path: String(entry?.path || '').trim().replace(/[\\\/]+$/, ''),
                }))
                .filter((entry: any) => entry.path)

            await api.updateClientConfig({ localLibraries: nextLocalLibraries } as any)
            setLibraries(nextLocalLibraries)
        } catch (error) {
            console.error('Failed to remove local library history:', error)
            setLibraries((prev) =>
                prev.filter((entry) => String(entry?.path || '').trim().replace(/[\\\/]+$/, '') !== normalizedTarget),
            )
        }
    }, [])

    // ライブラリ作成
    const createLibrary = useCallback(async (name: string, parentPath: string) => {
        try {
            const library = await api.createLibrary(name, parentPath)
            setActiveLibrary(library)
            setActiveRemoteLibrary(null)
            localStorage.removeItem('activeRemoteLibrary')
            await loadLibraries()
            await loadMediaFiles()
            await loadTags()
            await loadFolders()
        } catch (error) {
            console.error('Failed to create library:', error)
            throw error
        }
    }, [loadLibraries, loadMediaFiles, loadTags, loadFolders])

    // 既存のライブラリを開く
    const openLibrary = useCallback(async () => {
        try {
            const library = await api.openLibrary()
            if (library) {
                setActiveLibrary(library)
                setActiveRemoteLibrary(null)
                localStorage.removeItem('activeRemoteLibrary')
                await loadLibraries()
                await loadMediaFiles()
                await loadTags()
                await loadFolders()
                return library
            }
            return null
        } catch (error) {
            console.error('Failed to open library:', error)
            throw error
        }
    }, [loadLibraries, loadMediaFiles, loadTags, loadFolders])

    // 初期読み込み (ライブラリ自体のロード)
    useEffect(() => {
        loadActiveLibrary()
        loadLibraries()
    }, [loadActiveLibrary, loadLibraries])

    // データ読み込み (ライブラリ切り替え時などに再実行)
    useEffect(() => {
        if (!initialLibraryResolved) return

        const initialLoad = async () => {
            const currentLibraryLoadKey = activeRemoteLibrary
                ? `remote:${activeRemoteLibrary.id}:${activeRemoteLibrary.url}`
                : (activeLibrary ? `local:${activeLibrary.path}` : null)
            const isFirstLoad = !isInitialLoadDone.current
            const isLibrarySwitchLoad = !isFirstLoad && currentLibraryLoadKey !== previousLibraryLoadKey.current
            if (isFirstLoad || isLibrarySwitchLoad) {
                setStartupLoading(true)
                setLoading(true)
                setLoadingProgress(10)
            }

            try {
                const metadataTask = Promise.all([loadTags(), loadTagGroups(), loadFolders()]).catch((e) => {
                    console.error('Failed to load metadata in background:', e)
                })

                if (isFirstLoad || isLibrarySwitchLoad) setLoadingProgress(20)
                const shouldUseFastPreview = !activeRemoteLibrary && (isFirstLoad || isLibrarySwitchLoad)
                let loadedCount = await loadMediaFiles(true, false, shouldUseFastPreview ? { __fastPreview: true } : null)

                if (
                    !activeRemoteLibrary &&
                    currentLibraryLoadKey &&
                    loadedCount === 0 &&
                    startupRefreshAttemptedKey.current !== currentLibraryLoadKey
                ) {
                    startupRefreshAttemptedKey.current = currentLibraryLoadKey
                    try {
                        setLoadingProgress(30)
                        await api.refreshLibrary()
                        loadedCount = await loadMediaFiles(true, false)
                    } catch (e) {
                        console.error('Failed to refresh empty startup library:', e)
                    }
                }

                previousLibraryLoadKey.current = currentLibraryLoadKey
                if (isFirstLoad || isLibrarySwitchLoad) {
                    setLoadingProgress(100)
                    if (isFirstLoad) {
                        isInitialLoadDone.current = true
                    }
                    void metadataTask
                    if (shouldUseFastPreview && loadedCount > 0) {
                        void loadMediaFiles(true, true).catch((e) => {
                            console.error('Failed to load full media list after preview:', e)
                        })
                    }
                } else {
                    await metadataTask
                }
            } finally {
                if (isFirstLoad || isLibrarySwitchLoad) {
                    finalizeStartupLoading()
                }
            }
        }
        initialLoad()
    }, [initialLibraryResolved, activeLibrary, activeRemoteLibrary, loadMediaFiles, loadTags, loadTagGroups, loadFolders, finalizeStartupLoading])

    useEffect(() => {
        return () => {
            if (startupLoadingTimerRef.current) {
                clearTimeout(startupLoadingTimerRef.current)
                startupLoadingTimerRef.current = null
            }
        }
    }, [])

    // 全データの一括更新
    const refreshAll = useCallback(async () => {
        try {
            await Promise.all([
                loadMediaFiles(true),
                loadTags(),
                loadTagGroups(),
                loadFolders()
            ])
        } catch (e) {
            console.error('Failed to refresh library:', e)
        }
    }, [loadMediaFiles, loadTags, loadTagGroups, loadFolders])

    // Auto-import completion listener
    useEffect(() => {
        if (!api.on) return

        const removeListener = api.on('auto-import-complete', () => {
            console.log('[useLibrary] Auto-import complete event received. Refreshing library...')
            refreshAll()
        })

        return () => {
            if (removeListener) removeListener()
        }
    }, [refreshAll])

    return useMemo(() => ({
        mediaFiles: filteredMediaFiles,
        allMediaFiles: mediaFiles,
        tags,
        tagGroups,
        folders,
        libraries,
        loading,
        loadingProgress,
        startupLoading,
        activeLibrary,
        hasActiveLibrary: activeLibrary !== null,
        filterOptions,
        setFilterOptions,
        createLibrary,
        switchLibrary,
        selectAndScanFolder,
        createTag,
        deleteTag,
        createFolder,
        deleteFolder,
        addTagToMedia,
        removeTagFromMedia,
        addFolderToMedia,
        removeFolderFromMedia,
        moveToTrash,
        restoreFromTrash,
        deletePermanently,
        updateLastPlayed,
        importMedia,
        moveFilesToTrash,
        restoreFilesFromTrash,
        deleteFilesPermanently,
        updateRating,
        renameMedia,
        updateArtist,
        libraryStats,
        refreshLibrary: refreshAll,
        reloadLibrary,
        loadFolders,
        renameFolder,
        activeRemoteLibrary,
        switchToRemoteLibrary,
        switchToLocalLibrary,
        removeLocalLibraryHistory,
        openLibrary,
        myUserToken,
        updateDescription,
        setMediaFiles,
        addTagsToMedia,
        checkImportDuplicates: (filePaths: string[]) => api.checkImportDuplicates(filePaths),
        checkEntryDuplicates: async (mediaId: number) => {
            if (activeRemoteLibrary) {
                try {
                    const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                    let accessToken = activeRemoteLibrary.token
                    let userToken = myUserToken
                    if (activeRemoteLibrary.token.includes(':')) {
                        const parts = activeRemoteLibrary.token.split(':')
                        userToken = parts[0]
                        accessToken = parts[1]
                    }

                    const response = await fetch(`${baseUrl}/api/media/${mediaId}/duplicates`, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'X-User-Token': userToken || ''
                        }
                    })
                    if (response.ok) {
                        return await response.json()
                    }
                    return []
                } catch (e) {
                    console.error('Failed to check remote duplicates:', e)
                    return []
                }
            }
            return api.checkEntryDuplicates(mediaId)
        },
        updateUrl,
        loadMore,
        hasMore,
        loadingTime
    }), [
        filteredMediaFiles, mediaFiles, tags, tagGroups, folders, libraries, loading, activeLibrary,
        filterOptions, setFilterOptions, createLibrary, switchLibrary, selectAndScanFolder,
        createTag, deleteTag, createFolder, deleteFolder, addTagToMedia, removeTagFromMedia,
        addTagsToMedia, addFolderToMedia, removeFolderFromMedia, moveToTrash, restoreFromTrash, deletePermanently,
        moveFilesToTrash, restoreFilesFromTrash, deleteFilesPermanently,
        updateLastPlayed, importMedia, updateRating, renameMedia, updateArtist, libraryStats,
        loadMediaFiles, loadFolders, renameFolder, activeRemoteLibrary, switchToRemoteLibrary,
        switchToLocalLibrary, removeLocalLibraryHistory, openLibrary, myUserToken, updateDescription, updateUrl,
        page, hasMore, loadingTime
    ])
}

// Seeded Random Number Generator
function mulberry32(a: number) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Fisher-Yates Shuffle
function shuffleArray<T>(array: T[], seed: number): T[] {
    const rng = mulberry32(seed);
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}
