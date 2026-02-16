import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { MediaFile, Tag, TagGroup, Folder, FilterOptions, Library, RemoteLibrary } from '../types'
import { useNotification } from '../contexts/NotificationContext'
import { api } from '../api'
import { getAuthHeaders, getAuthQuery } from '../utils/auth'

export function useLibrary() {
    const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
    const [tags, setTags] = useState<Tag[]>([])
    const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
    const [folders, setFolders] = useState<Folder[]>([]) // Renamed from genres
    const [libraries, setLibraries] = useState<Library[]>([])
    const [loading, setLoading] = useState(false)
    const [activeLibrary, setActiveLibrary] = useState<Library | null>(null)
    const [activeRemoteLibrary, setActiveRemoteLibrary] = useState<RemoteLibrary | null>(null)
    const [myUserToken, setMyUserToken] = useState<string>('')
    const [randomSeed, setRandomSeed] = useState<number>(Date.now())
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
        selectedExtensions: [],
        excludedExtensions: [],
        selectedArtists: [],
        excludedArtists: []
    })

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
        if (activeRemoteLibrary) {
            try {
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                const response = await fetch(`${baseUrl}/api/folders`, {
                    headers: getAuthHeaders(activeRemoteLibrary.token, myUserToken)
                })
                if (response.ok) {
                    const data = await response.json()
                    setFolders(Array.isArray(data) ? data : [])
                }
            } catch (e) {
                console.error('Failed to load remote folders', e)
            }
        } else {
            try {
                const loadedFolders = await api.getFolders()
                setFolders(Array.isArray(loadedFolders) ? loadedFolders : [])
            } catch (error) {
                console.error('Failed to load folders:', error)
                setFolders([])
            }
        }
    }, [activeRemoteLibrary, myUserToken])


    // ... 

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
                if (config && config.myUserToken) {
                    setMyUserToken(config.myUserToken)
                }
            } catch (e) {
                console.error('Failed to load client config in useLibrary', e)
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

    // メディアファイル読み込み
    const loadMediaFiles = useCallback(async () => {
        if (activeRemoteLibrary) {
            // リモートから取得
            try {
                setLoading(true)
                // トークンヘッダー準備
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                // 全件取得するために limit を大きく設定
                const response = await fetch(`${baseUrl}/api/media?limit=10000`, {
                    headers: getAuthHeaders(activeRemoteLibrary.token, myUserToken)
                })

                if (!response.ok) {
                    if (response.status === 403) {
                        addNotification({ type: 'error', title: '権限不足', message: 'この操作を行う権限がありません。管理者にお問い合わせください。' })
                    }
                    throw new Error('Failed to fetch remote media')
                }

                const data = await response.json()
                // パス変換してセット
                const transformed = transformRemoteMedia(Array.isArray(data.media) ? data.media : [], activeRemoteLibrary)
                setMediaFiles(transformed)
            } catch (error: any) {
                console.error('Failed to load remote media files:', error)
                throw error // エラーを上位に伝播させる
            } finally {
                setLoading(false)
            }
        } else {
            // ローカル (IPC)
            try {
                const files = await api.getMediaFiles()
                setMediaFiles(Array.isArray(files) ? files : [])
            } catch (error) {
                console.error('Failed to load media files:', error)
            }
        }
    }, [activeRemoteLibrary, activeLibrary, transformRemoteMedia, myUserToken])

    // タグ読み込み
    const loadTags = useCallback(async () => {
        if (activeRemoteLibrary) {
            try {
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                const response = await fetch(`${baseUrl}/api/tags`, {
                    headers: getAuthHeaders(activeRemoteLibrary.token, myUserToken)
                })
                if (response.ok) {
                    const data = await response.json()
                    setTags(Array.isArray(data) ? data : [])
                }
            } catch (e) {
                console.error('Failed to load remote tags', e)
            }
        } else {
            try {
                const loadedTags = await api.getTags()
                setTags(Array.isArray(loadedTags) ? loadedTags : [])
            } catch (error) {
                console.error('Failed to load tags:', error)
            }
        }
    }, [activeRemoteLibrary, myUserToken])

    // タググループ読み込み (現在リモートAPI未実装のためスキップまたは実装が必要。一旦スキップ)
    const loadTagGroups = useCallback(async () => {
        if (activeRemoteLibrary) {
            try {
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                const response = await fetch(`${baseUrl}/api/tag-groups`, {
                    headers: getAuthHeaders(activeRemoteLibrary.token, myUserToken)
                })
                if (response.ok) {
                    const data = await response.json()
                    setTagGroups(Array.isArray(data) ? data : [])
                }
            } catch (e) {
                console.error('Failed to load remote tag groups', e)
            }
            return
        }
        try {
            const loadedGroups = await api.getTagGroups()
            setTagGroups(Array.isArray(loadedGroups) ? loadedGroups : [])
        } catch (error) {
            console.error('Failed to load tag groups:', error)
        }
    }, [activeRemoteLibrary, myUserToken])


    // フォルダー選択とスキャン
    const selectAndScanFolder = useCallback(async () => {
        setLoading(true)
        try {
            const folderPath = await api.selectFolder()
            if (folderPath) {
                await api.scanFolder(folderPath)
                await loadMediaFiles()
            }
        } catch (error) {
            console.error('Failed to scan folder:', error)
        } finally {
            setLoading(false)
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
    const addFolderToMedia = useCallback(async (mediaId: number, folderId: number) => {
        // Optimistic Update
        const targetFolder = folders.find(f => f.id === folderId)
        if (!targetFolder) return

        setMediaFiles(prev => prev.map(m => {
            if (m.id === mediaId) {
                // 既に持っている場合はスキップ
                if (m.folders?.some(f => f.id === folderId)) return m
                return { ...m, folders: [...(m.folders || []), targetFolder] }
            }
            return m
        }))

        try {
            await api.addFolderToMedia(mediaId, folderId)
            await loadMediaFiles()
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
    const importMedia = useCallback(async (filePaths: string[]) => {
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

            const importedFiles = await api.importMedia(filePaths)
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
        let result = [...mediaFiles]

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
                    filterOptions.selectedFolders.every(folderId =>
                        m.folders?.some(g => g.id === folderId)
                    )
                )
            } else {
                // OR: いずれかのフォルダーを含む
                result = result.filter(m =>
                    m.folders?.some(g => filterOptions.selectedFolders.includes(g.id))
                )
            }
        }



        // フォルダー除外フィルター
        if (filterOptions.excludedFolders && filterOptions.excludedFolders.length > 0) {
            result = result.filter(m =>
                !m.folders?.some(g => filterOptions.excludedFolders.includes(g.id))
            )
        }

        // 評価フィルター
        if (filterOptions.selectedRatings && filterOptions.selectedRatings.length > 0) {
            result = result.filter(m => {
                const rating = m.rating || 0
                return filterOptions.selectedRatings.includes(rating)
            })
        }

        // 拡張子フィルター
        if ((filterOptions.selectedExtensions && filterOptions.selectedExtensions.length > 0) ||
            (filterOptions.excludedExtensions && filterOptions.excludedExtensions.length > 0)) {
            result = result.filter(m => {
                const ext = m.file_name.split('.').pop()?.toLowerCase() || ''

                // 除外チェック
                if (filterOptions.excludedExtensions.includes(ext)) {
                    return false
                }

                // 選択チェック (選択されているものがある場合のみ)
                if (filterOptions.selectedExtensions.length > 0) {
                    return filterOptions.selectedExtensions.includes(ext)
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
                    m.tags?.some(t => filterOptions.selectedTags.includes(t.id))
                )
            }
        }

        // タグ除外フィルター
        if (filterOptions.excludedTags.length > 0) {
            result = result.filter(m =>
                !m.tags?.some(t => filterOptions.excludedTags.includes(t.id))
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
                    if (artists.some(a => filterOptions.excludedArtists.includes(a))) {
                        return false
                    }
                }

                // 選択チェック (選択されているものがある場合のみ)
                if (filterOptions.selectedArtists.length > 0) {
                    // 選択リストにあるアーティストが1つでも含まれていれば許可
                    return artists.some(a => filterOptions.selectedArtists.includes(a))
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

        if (filterOptions.durationMax !== null && filterOptions.durationMax !== undefined) {
            result = result.filter(m => (m.duration || 0) <= filterOptions.durationMax!)
        }

        // 変更日フィルター
        if (filterOptions.dateModifiedMin || filterOptions.dateModifiedMax) {
            result = result.filter(m => {
                if (!m.modified_date) return false
                const modDate = new Date(m.modified_date).getTime()

                if (filterOptions.dateModifiedMin) {
                    const minDate = new Date(filterOptions.dateModifiedMin)
                    minDate.setHours(0, 0, 0, 0)
                    if (modDate < minDate.getTime()) return false
                }

                if (filterOptions.dateModifiedMax) {
                    const maxDate = new Date(filterOptions.dateModifiedMax)
                    maxDate.setHours(23, 59, 59, 999)
                    if (modDate > maxDate.getTime()) return false
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

        result.sort((a, b) => {
            let comparison = 0
            switch (effectiveSortOrder) {
                case 'name':
                    comparison = a.file_name.localeCompare(b.file_name)
                    break
                case 'date':
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    break
                case 'size':
                    comparison = (a.file_size || 0) - (b.file_size || 0)
                    break
                case 'duration':
                    comparison = (a.duration || 0) - (b.duration || 0)
                    break
                case 'last_played':
                    const dateA = a.last_played_at ? new Date(a.last_played_at).getTime() : 0
                    const dateB = b.last_played_at ? new Date(b.last_played_at).getTime() : 0
                    comparison = dateA - dateB
                    break
                case 'rating':
                    comparison = (a.rating || 0) - (b.rating || 0)
                    break
                case 'modified':
                    const modA = a.modified_date ? new Date(a.modified_date).getTime() : 0
                    const modB = b.modified_date ? new Date(b.modified_date).getTime() : 0
                    comparison = modA - modB
                    break
                case 'artist':
                    const artistA = a.artist || (a.artists && a.artists[0]) || ''
                    const artistB = b.artist || (b.artists && b.artists[0]) || ''
                    comparison = artistA.toLocaleLowerCase().localeCompare(artistB.toLocaleLowerCase())
                    break
                case 'tags':
                    const tagsA = (a.tags || []).map(t => t.name).sort().join(', ')
                    const tagsB = (b.tags || []).map(t => t.name).sort().join(', ')
                    comparison = tagsA.localeCompare(tagsB, 'ja')
                    break

            }
            return filterOptions.sortDirection === 'asc' ? comparison : -comparison
        })

        return result
    }, [mediaFiles, filterOptions, randomSeed])

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
        }
    }, [])

    // リモートライブラリへの切り替え
    const switchToRemoteLibrary = useCallback((lib: RemoteLibrary) => {
        // IDが同じでもURLが違う場合は更新を許可する
        if (activeRemoteLibrary?.id === lib.id && activeRemoteLibrary.url === lib.url && !activeLibrary) {
            return
        }

        // 接続テストを行ってから切り替える
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
        } catch (error) {
            console.error('Failed to open library:', error)
        }
        return null
    }, [loadLibraries, loadMediaFiles, loadTags, loadFolders])

    // 初期読み込み (ライブラリ自体のロード)
    useEffect(() => {
        loadActiveLibrary()
        loadLibraries()
    }, [loadActiveLibrary, loadLibraries])

    // データ読み込み (ライブラリ切り替え時などに再実行)
    useEffect(() => {
        loadMediaFiles()
        loadTags()
        loadTagGroups()
        loadFolders()
    }, [loadMediaFiles, loadTags, loadTagGroups, loadFolders])

    // 全データの一括更新
    const refreshAll = useCallback(async () => {
        setLoading(true)
        try {
            await Promise.all([
                loadMediaFiles(),
                loadTags(),
                loadTagGroups(),
                loadFolders()
            ])
        } catch (e) {
            console.error('Failed to refresh library:', e)
        } finally {
            setLoading(false)
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
        updateUrl
    }), [
        filteredMediaFiles, mediaFiles, tags, tagGroups, folders, libraries, loading, activeLibrary,
        filterOptions, setFilterOptions, createLibrary, switchLibrary, selectAndScanFolder,
        createTag, deleteTag, createFolder, deleteFolder, addTagToMedia, removeTagFromMedia,
        addTagsToMedia, addFolderToMedia, removeFolderFromMedia, moveToTrash, restoreFromTrash, deletePermanently,
        moveFilesToTrash, restoreFilesFromTrash, deleteFilesPermanently,
        updateLastPlayed, importMedia, updateRating, renameMedia, updateArtist, libraryStats,
        loadMediaFiles, loadFolders, renameFolder, activeRemoteLibrary, switchToRemoteLibrary,
        switchToLocalLibrary, openLibrary, myUserToken, updateDescription, updateUrl
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
