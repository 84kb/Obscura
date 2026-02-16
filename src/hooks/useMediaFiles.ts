import { useState, useCallback, useEffect, useRef } from 'react'
import { MediaFile, Tag, Folder, FilterOptions, Library, RemoteLibrary } from '../types'
import { useNotification } from '../contexts/NotificationContext'
import { api } from '../api'

export function useMediaFiles(
    activeLibrary: Library | null,
    activeRemoteLibrary: RemoteLibrary | null,
    myUserToken: string,
    filterOptions: FilterOptions,
    tags: Tag[],
    folders: Folder[]
) {
    const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
    const [loading, setLoading] = useState(false)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [totalCount, setTotalCount] = useState(0)
    const LIMIT = 100
    const { addNotification } = useNotification()

    // メディアファイルのパスをリモート用に変換するヘルパー
    const transformRemoteMedia = useCallback((mediaList: MediaFile[], remoteLib: RemoteLibrary): MediaFile[] => {
        // トークンのパース
        let userToken = myUserToken
        let accessToken = remoteLib.token

        if (remoteLib.token.includes(':')) {
            const parts = remoteLib.token.split(':')
            userToken = parts[0]
            accessToken = parts[1]
        }

        const baseUrl = remoteLib.url.replace(/\/$/, '')

        return mediaList.map(m => ({
            ...m,
            thumbnail_path: m.thumbnail_path ? `${baseUrl}/api/thumbnails/${m.id}?userToken=${userToken}&accessToken=${accessToken}` : '',
            file_path: `${baseUrl}/api/stream/${m.id}?userToken=${userToken}&accessToken=${accessToken}`,
        }))
    }, [myUserToken])

    // メディアファイル読み込み
    const loadMediaFiles = useCallback(async (reset = false) => {
        if (activeRemoteLibrary) {
            // リモートから取得
            try {
                setLoading(true)

                // トークンヘッダー準備
                let userToken = myUserToken
                let accessToken = activeRemoteLibrary.token

                if (activeRemoteLibrary.token.includes(':')) {
                    const parts = activeRemoteLibrary.token.split(':')
                    userToken = parts[0]
                    accessToken = parts[1]
                }

                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                // 全件取得するために limit を大きく設定 (TODO: Remote Pagination)
                const response = await fetch(`${baseUrl}/api/media?limit=10000`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-User-Token': userToken
                    }
                })

                if (!response.ok) {
                    if (response.status === 403) {
                        addNotification({ type: 'error', title: '権限不足', message: 'この操作を行う権限がありません。管理者にお問い合わせください。' })
                    }
                    throw new Error('Failed to fetch remote media')
                }

                const data = await response.json()
                // パス変換してセット
                const transformed = transformRemoteMedia(data.media, activeRemoteLibrary)

                setMediaFiles(transformed)
                setTotalCount(transformed.length)
                setHasMore(false)
            } catch (error: any) {
                console.error('Failed to load remote media files:', error)
            } finally {
                setLoading(false)
            }
        } else {
            // ローカル (IPC)
            try {
                if (reset) {
                    setLoading(true)
                    setPage(1)
                }

                const targetPage = reset ? 1 : page + 1
                const result = await api.getMediaFiles(targetPage, LIMIT, filterOptions)

                if (reset) {
                    setMediaFiles(result.media)
                } else {
                    setMediaFiles(prev => [...prev, ...result.media]) // Append
                }

                setPage(targetPage)
                setHasMore(result.media.length === LIMIT) // if less than limit, no more
                setTotalCount(result.total)
            } catch (error) {
                console.error('Failed to load media files:', error)
            } finally {
                setLoading(false)
            }
        }
    }, [activeRemoteLibrary, activeLibrary, transformRemoteMedia, myUserToken, addNotification, page, filterOptions])

    const loadMore = useCallback(() => {
        if (!loading && hasMore) {
            console.log('[useMediaFiles] loadMore triggered. Page:', page + 1)
            loadMediaFiles(false)
        }
    }, [loading, hasMore, loadMediaFiles, page])

    // Filter Change Effect
    const prevFilterRef = useRef(filterOptions);
    const isFirstRun = useRef(true);

    useEffect(() => {
        // Check deep equality for filterOptions
        const currentJson = JSON.stringify(filterOptions);
        const prevJson = JSON.stringify(prevFilterRef.current);

        if (currentJson === prevJson && !isFirstRun.current && (activeLibrary || activeRemoteLibrary)) {
            // If filters are effectively same, and not first run, ignore.
            // However, if library changed, we MUST reload.
            // We need to check if library changed.
        }

        // Update Ref
        prevFilterRef.current = filterOptions;
        isFirstRun.current = false;

        console.log('[useMediaFiles] Loading media files (Effect trigger)')
        loadMediaFiles(true)
    }, [
        // We use JSON string to ensure stability check, 
        // passing object directly causes effect to fire on every render if parent creates new object
        JSON.stringify(filterOptions),
        activeLibrary?.path,
        activeRemoteLibrary?.id
    ])


    // メディアインポート
    const importMedia = useCallback(async (filePaths: string[]) => {
        if (filePaths.length === 0) return

        if (activeRemoteLibrary) {
            // Remote Import (Upload)
            try {
                // Upload logic
                const notificationId = addNotification({
                    type: 'progress',
                    title: 'アップロード中',
                    message: '準備中...',
                    progress: 0,
                    duration: 0
                })

                // uploadRemoteMedia IPC
                await api.uploadRemoteMedia(
                    activeRemoteLibrary.url,
                    activeRemoteLibrary.token,
                    filePaths,
                    { notificationId }
                )

                // 完了はSocketイベントまたはリロードで検知
                // Notificationは backend handles progress updates via IPC logic in main/preload
                return [] // Remote import doesn't return MediaFiles immediately in the same way
            } catch (error) {
                console.error('Failed to upload media:', error)
                addNotification({ type: 'error', title: 'アップロード失敗', message: 'ファイルのアップロードに失敗しました。' })
                return null
            }
        } else {
            // Local Import
            try {
                const imported = await api.importMedia(filePaths)
                await loadMediaFiles()
                return imported
            } catch (error) {
                console.error('Failed to import media:', error)
                return null
            }
        }
    }, [activeRemoteLibrary, addNotification, loadMediaFiles])


    // メディアにタグ追加
    const addTagToMedia = useCallback(async (mediaId: number, tagId: number) => {
        // Optimistic Update
        const targetTag = tags.find(t => t.id === tagId)
        if (!targetTag) return

        setMediaFiles(prev => prev.map(m => {
            if (m.id === mediaId) {
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
                    await loadMediaFiles()
                    throw e
                }
            }
            await api.addTagToMedia(mediaId, tagId)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to add tag to media:', error)
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
    }, [loadMediaFiles, activeRemoteLibrary, addNotification])

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
    }, [loadMediaFiles, activeRemoteLibrary, addNotification])

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

    // 評価更新
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

    // 投稿者更新
    const updateArtist = useCallback(async (id: number, artist: string | null) => {
        // Optimistic - artistとartistsの両方を考慮する必要があるが、一旦簡易実装
        setMediaFiles(prev => prev.map(m => m.id === id ? { ...m, artist } : m))

        try {
            if (activeRemoteLibrary) {
                try {
                    await api.updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { artist })
                    return
                } catch (e: any) {
                    if (e.message && e.message.includes('403')) {
                        addNotification({ type: 'error', title: '権限不足', message: '投稿者を更新する権限がありません。' })
                    }
                    await loadMediaFiles()
                    throw e
                }
            }
            // artist カラムを更新
            await api.updateArtist(id, artist)
            // 関連付けの一貫性のため再読み込み推奨
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to update artist:', error)
            await loadMediaFiles()
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification])


    // 名前変更
    const renameMedia = useCallback(async (id: number, newName: string) => {
        // Optimistic
        setMediaFiles(prev => prev.map(m => m.id === id ? {
            ...m,
            file_name: newName // 表示上はこれでOKだが、パスが変わる可能性があるので注意
        } : m))

        try {
            await api.renameMedia(id, newName)
            await loadMediaFiles() // パスが変わるためリロード必須
        } catch (error) {
            console.error('Failed to rename media:', error)
            await loadMediaFiles()
            throw error
        }
    }, [loadMediaFiles])


    return {
        mediaFiles,
        setMediaFiles,
        loading,
        setLoading,
        loadMediaFiles,
        importMedia,
        addTagToMedia,
        removeTagFromMedia,
        addTagsToMedia, // Bulk add
        addFolderToMedia,
        removeFolderFromMedia,
        moveToTrash,
        moveFilesToTrash,
        restoreFromTrash,
        restoreFilesFromTrash,
        deletePermanently,
        deleteFilesPermanently,
        updateDescription,
        updateLastPlayed,
        updateRating,
        renameMedia,
        updateArtist,
        loadMore,
        hasMore,
        totalCount
    }
}
