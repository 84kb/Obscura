import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { MediaFile, Tag, TagFolder, Folder, FilterOptions, Library, RemoteLibrary, ElectronAPI } from '../types'
import { useNotification } from '../contexts/NotificationContext'

export function useLibrary() {
    const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
    const [tags, setTags] = useState<Tag[]>([])
    const [tagFolders, setTagFolders] = useState<TagFolder[]>([])
    const [folders, setFolders] = useState<Folder[]>([]) // Renamed from genres
    const [libraries, setLibraries] = useState<Library[]>([])
    const [loading, setLoading] = useState(false)
    const [activeLibrary, setActiveLibrary] = useState<Library | null>(null)
    const [activeRemoteLibrary, setActiveRemoteLibrary] = useState<RemoteLibrary | null>(null)
    const [myUserToken, setMyUserToken] = useState<string>('')
    const [randomSeed, setRandomSeed] = useState<number>(Date.now())
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        searchQuery: '',
        selectedTags: [],
        excludedTags: [],
        selectedFolders: [], // Renamed from selectedGenres
        tagFilterMode: 'or',
        selectedSysDirs: [], // Renamed from selectedFolders
        excludedSysDirs: [], // Renamed from excludedFolders
        folderFilterMode: 'or',
        filterType: 'all',
        fileType: 'all',
        sortOrder: (localStorage.getItem('sort_order') as any) || 'name',
        sortDirection: (localStorage.getItem('sort_direction') as any) || 'desc',
        selectedRatings: [],
        selectedExtensions: [],
        excludedExtensions: [],
        selectedArtists: [],
        excludedArtists: []
    })

    // ... (intermediate lines skipped)

    // フォルダー (ex-Genre) 読み込み
    const loadFolders = useCallback(async () => {
        if (activeRemoteLibrary) {
            try {
                let userToken = myUserToken
                let accessToken = activeRemoteLibrary.token

                if (activeRemoteLibrary.token.includes(':')) {
                    const parts = activeRemoteLibrary.token.split(':')
                    userToken = parts[0]
                    accessToken = parts[1]
                }
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')

                const response = await fetch(`${baseUrl}/api/folders`, { // Api endpoint also renamed? Yes usually.
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-User-Token': userToken
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setFolders(data)
                }
            } catch (e) {
                console.error('Failed to load remote folders', e)
            }
        } else {
            try {
                const loadedFolders = await window.electronAPI.getFolders()
                setFolders(loadedFolders as Folder[])
            } catch (error) {
                console.error('Failed to load folders:', error)
            }
        }
    }, [activeRemoteLibrary, myUserToken])


    // ... 

    // フォルダー (ex-Genre) 作成
    const createFolder = useCallback(async (name: string, parentId?: number | null) => {
        if (!activeLibrary && !activeRemoteLibrary) return null
        try {
            const newFolder = await window.electronAPI.createFolder(name, parentId)
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
            await window.electronAPI.deleteFolder(id)
            await loadFolders()
        } catch (error) {
            console.error('Failed to delete folder:', error)
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])

    // フォルダー名変更
    const renameFolder = useCallback(async (id: number, newName: string) => {
        try {
            await window.electronAPI.renameFolder(id, newName)
            await loadFolders()
        } catch (error) {
            console.error('Failed to rename folder:', error)
        }
    }, [loadFolders, activeLibrary, activeRemoteLibrary])



    const { addNotification, removeNotification, updateProgress } = useNotification()

    // アップロード進捗リスナー
    useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.on) return

        const handleProgress = (_: any, data: { id: string, progress: number }) => {
            updateProgress(data.id, data.progress)
        }

        const removeUploadListener = window.electronAPI.on('upload-progress', handleProgress)
        const removeDownloadListener = window.electronAPI.on('download-progress', handleProgress)

        return () => {
            // @ts-ignore
            if (removeUploadListener) (removeUploadListener as any)()
            // @ts-ignore
            if (removeDownloadListener) (removeDownloadListener as any)()
        }
    }, [updateProgress])

    // クライアント設定（UserToken）読み込み
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const config = await (window.electronAPI as any).getClientConfig()
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
            // サムネイルとファイルパスをリモートURLに置換
            // クエリパラメータでトークンを渡す (imgタグなどで読み込むため)
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
                let userToken = myUserToken
                let accessToken = activeRemoteLibrary.token

                if (activeRemoteLibrary.token.includes(':')) {
                    const parts = activeRemoteLibrary.token.split(':')
                    userToken = parts[0]
                    accessToken = parts[1]
                }

                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')
                // 全件取得するために limit を大きく設定
                const response = await fetch(`${baseUrl}/api/media?limit=10000`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-User-Token': userToken
                    }
                })

                if (!response.ok) throw new Error('Failed to fetch remote media')

                const data = await response.json()
                // パス変換してセット
                const transformed = transformRemoteMedia(data.media, activeRemoteLibrary)
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
                const files = await window.electronAPI.getMediaFiles()
                setMediaFiles(files as MediaFile[])
            } catch (error) {
                console.error('Failed to load media files:', error)
            }
        }
    }, [activeRemoteLibrary, activeLibrary, transformRemoteMedia, myUserToken])

    // タグ読み込み
    const loadTags = useCallback(async () => {
        if (activeRemoteLibrary) {
            try {
                let userToken = myUserToken
                let accessToken = activeRemoteLibrary.token

                if (activeRemoteLibrary.token.includes(':')) {
                    const parts = activeRemoteLibrary.token.split(':')
                    userToken = parts[0]
                    accessToken = parts[1]
                }
                const baseUrl = activeRemoteLibrary.url.replace(/\/$/, '')

                const response = await fetch(`${baseUrl}/api/tags`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-User-Token': userToken
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setTags(data)
                }
            } catch (e) {
                console.error('Failed to load remote tags', e)
            }
        } else {
            try {
                const loadedTags = await window.electronAPI.getTags()
                setTags(loadedTags as Tag[])
            } catch (error) {
                console.error('Failed to load tags:', error)
            }
        }
    }, [activeRemoteLibrary, myUserToken])

    // タグフォルダー読み込み (現在リモートAPI未実装のためスキップまたは実装が必要。一旦スキップ)
    const loadTagFolders = useCallback(async () => {
        if (activeRemoteLibrary) {
            setTagFolders([]) // リモートは未対応とする
            return
        }
        try {
            const loadedFolders = await window.electronAPI.getTagFolders()
            setTagFolders(loadedFolders as TagFolder[])
        } catch (error) {
            console.error('Failed to load tag folders:', error)
        }
    }, [activeRemoteLibrary])


    // フォルダー選択とスキャン
    const selectAndScanFolder = useCallback(async () => {
        setLoading(true)
        try {
            const folderPath = await window.electronAPI.selectFolder()
            if (folderPath) {
                await window.electronAPI.scanFolder(folderPath)
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
            const newTag = await window.electronAPI.createTag(name)
            await loadTags()
            return newTag
        } catch (error) {
            console.error('Failed to create tag:', error)
            return null
        }
    }, [loadTags, activeLibrary, activeRemoteLibrary])

    // タグ削除
    const deleteTag = useCallback(async (id: number) => {
        try {
            await window.electronAPI.deleteTag(id)
            await loadTags()
        } catch (error) {
            console.error('Failed to delete tag:', error)
        }
    }, [loadTags, activeLibrary, activeRemoteLibrary])



    // メディアにタグ追加
    const addTagToMedia = useCallback(async (mediaId: number, tagId: number) => {
        try {
            await window.electronAPI.addTagToMedia(mediaId, tagId)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to add tag to media:', error)
        }
    }, [loadMediaFiles])

    // メディアからタグ削除
    const removeTagFromMedia = useCallback(async (mediaId: number, tagId: number) => {
        try {
            await window.electronAPI.removeTagFromMedia(mediaId, tagId)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to remove tag from media:', error)
        }
    }, [loadMediaFiles])

    // メディアにタグ一括追加
    const addTagsToMedia = useCallback(async (mediaIds: number[], tagIds: number[]) => {
        try {
            if (activeRemoteLibrary) {
                // リモートの場合は個別に呼ぶか、新しいAPIが必要（今回はローカル優先で実装し、リモートは未対応かループで対応）
                // 暫定的にループで対応
                for (const mId of mediaIds) {
                    for (const tId of tagIds) {
                        await (window.electronAPI as any).addRemoteTagToMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, mId, tId)
                    }
                }
                await loadMediaFiles()
                return
            }
            await window.electronAPI.addTagsToMedia(mediaIds, tagIds)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to add tags to media:', error)
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    // メディアにフォルダー追加
    const addFolderToMedia = useCallback(async (mediaId: number, folderId: number) => {
        try {
            await window.electronAPI.addFolderToMedia(mediaId, folderId)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to add folder to media:', error)
        }
    }, [loadMediaFiles])

    // メディアからフォルダー削除
    const removeFolderFromMedia = useCallback(async (mediaId: number, folderId: number) => {
        try {
            await window.electronAPI.removeFolderFromMedia(mediaId, folderId)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to remove folder from media:', error)
        }
    }, [loadMediaFiles])

    // ゴミ箱操作
    const moveToTrash = useCallback(async (id: number) => {
        try {
            await window.electronAPI.moveToTrash(id)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to move to trash:', error)
        }
    }, [loadMediaFiles])

    // ソート設定保存
    useEffect(() => {
        localStorage.setItem('sort_order', filterOptions.sortOrder)
        localStorage.setItem('sort_direction', filterOptions.sortDirection)
    }, [filterOptions.sortOrder, filterOptions.sortDirection])

    const restoreFromTrash = useCallback(async (id: number) => {
        try {
            await window.electronAPI.restoreFromTrash(id)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to restore from trash:', error)
        }
    }, [loadMediaFiles])

    const deletePermanently = useCallback(async (id: number) => {
        try {
            await window.electronAPI.deletePermanently(id)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to delete permanently:', error)
        }
    }, [loadMediaFiles])

    const moveFilesToTrash = useCallback(async (ids: number[]) => {
        try {
            for (const id of ids) {
                await window.electronAPI.moveToTrash(id)
            }
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to move files to trash:', error)
        }
    }, [loadMediaFiles])

    const restoreFilesFromTrash = useCallback(async (ids: number[]) => {
        try {
            for (const id of ids) {
                await window.electronAPI.restoreFromTrash(id)
            }
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to restore files from trash:', error)
        }
    }, [loadMediaFiles])

    const deleteFilesPermanently = useCallback(async (ids: number[]) => {
        try {
            if (activeRemoteLibrary) {
                for (const id of ids) {
                    await (window.electronAPI as any).deleteRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id)
                }
                await loadMediaFiles()
                return
            }

            // deletePermanently は単一IDを想定している可能性があるため、ループで処理するか、
            // サーバー側で複数削除に対応する必要があるが、現状のpreloadに合わせてループさせる
            for (const id of ids) {
                await window.electronAPI.deletePermanently(id)
            }
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to delete files permanently:', error)
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    const updateDescription = useCallback(async (id: number, description: string | null) => {
        try {
            if (activeRemoteLibrary) {
                await (window.electronAPI as any).updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { description })
                await loadMediaFiles()
                return
            }
            await window.electronAPI.updateDescription(id, description)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to update description:', error)
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    // 再生日時更新
    const updateLastPlayed = useCallback(async (id: number) => {
        try {
            await window.electronAPI.updateLastPlayed(id)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to update last played:', error)
        }
    }, [loadMediaFiles, activeLibrary, activeRemoteLibrary])

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
                const res = await (window.electronAPI as any).uploadRemoteMedia(
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
                return
            }

            await window.electronAPI.importMedia(filePaths)
            removeNotification(notificationId)
            addNotification({ type: 'success', title: 'インポート完了', message: `${filePaths.length}個のファイルを追加しました。` })
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to import media:', error)
            removeNotification(notificationId)
            addNotification({ type: 'error', title: 'インポート失敗', message: String(error) })
        } finally {
            setLoading(false)
        }
    }, [loadMediaFiles, activeRemoteLibrary, addNotification, removeNotification])

    // レーティング更新
    const updateRating = useCallback(async (id: number, rating: number) => {
        try {
            if (activeRemoteLibrary) {
                await (window.electronAPI as any).updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { rating })
                await loadMediaFiles()
                return
            }
            await window.electronAPI.updateRating(id, rating)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to update rating:', error)
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    // メディア名変更
    const renameMedia = useCallback(async (id: number, newName: string) => {
        try {
            if (activeRemoteLibrary) {
                await (window.electronAPI as any).renameRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, newName)
                await loadMediaFiles()
                return
            }
            await window.electronAPI.renameMedia(id, newName)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to rename media:', error)
        }
    }, [loadMediaFiles, activeRemoteLibrary])

    // 投稿者更新
    const updateArtist = useCallback(async (id: number, artist: string | null) => {
        try {
            if (activeRemoteLibrary) {
                await (window.electronAPI as any).updateRemoteMedia(activeRemoteLibrary.url, activeRemoteLibrary.token, id, { artist })
                await loadMediaFiles()
                return
            }
            await window.electronAPI.updateArtist(id, artist)
            await loadMediaFiles()
        } catch (error) {
            console.error('Failed to update artist:', error)
        }
    }, [loadMediaFiles, activeRemoteLibrary])

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
            case 'random':
                // シードに基づく決定論的なソート (再生開始時などにmediaFilesが更新されても順序を維持するため)
                result = result.sort((a, b) => {
                    const seedA = a.id + randomSeed
                    const seedB = b.id + randomSeed
                    // 簡易的なハッシュ関数 (Math.sinを使用)
                    const valA = Math.sin(seedA) * 10000 - Math.floor(Math.sin(seedA) * 10000)
                    const valB = Math.sin(seedB) * 10000 - Math.floor(Math.sin(seedB) * 10000)
                    return valA - valB
                })
                return result
            default:
                break
        }

        // 検索クエリフィルター
        if (filterOptions.searchQuery) {
            const query = filterOptions.searchQuery.toLowerCase()
            result = result.filter(m => m.file_name.toLowerCase().includes(query))
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
                const artists = (m.artists && m.artists.length > 0) ? m.artists : [m.artist || '未設定']

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
        result.sort((a, b) => {
            let comparison = 0
            switch (filterOptions.sortOrder) {
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
            const loadedLibraries = await window.electronAPI.getLibraries()
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
            await window.electronAPI.setActiveLibrary(libraryPath)
            const library = await window.electronAPI.getActiveLibrary()
            setActiveLibrary(library)
            setActiveRemoteLibrary(null)
            localStorage.removeItem('activeRemoteLibrary') // リモート状態をクリア
            // loadMediaFiles等はuseEffectで自動的に呼ばれる
        } catch (error) {
            console.error('Failed to switch library:', error)
        }
    }, [activeLibrary, activeRemoteLibrary])

    // ライブラリの再読み込み (ソフトリロード + 再ランダム化 + メタデータ更新)
    const reloadLibrary = useCallback(async () => {
        // ランダムモードならシードを更新
        if (filterOptions.filterType === 'random') {
            setRandomSeed(Date.now())
        }

        // リモートでない場合はローカルライブラリのハードリフレッシュを実行
        if (!activeRemoteLibrary) {
            try {
                await (window.electronAPI as unknown as ElectronAPI).refreshLibrary()
            } catch (e) {
                console.error('Failed to refresh library:', e)
            }
        }

        // データの再取得
        await Promise.all([
            loadMediaFiles(),
            loadTags(),
            loadFolders()
        ])
    }, [filterOptions.filterType, loadMediaFiles, loadTags, loadFolders, activeRemoteLibrary])

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

            const library = await window.electronAPI.getActiveLibrary()
            setActiveLibrary(library)
            setActiveRemoteLibrary(null)
        } catch (error) {
            console.error('Failed to load active library:', error)
        }
    }, [])

    // リモートライブラリへの切り替え
    const switchToRemoteLibrary = useCallback((lib: RemoteLibrary) => {
        if (activeRemoteLibrary?.id === lib.id && !activeLibrary) {
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

        window.electronAPI.setActiveLibrary(lib.path).then(async () => {
            setActiveLibrary(lib)
            setActiveRemoteLibrary(null)
            localStorage.removeItem('activeRemoteLibrary') // リモート状態をクリア
            // useEffectにより自動リロード
        })
    }, [activeLibrary, activeRemoteLibrary])

    // ライブラリ作成
    const createLibrary = useCallback(async (name: string, parentPath: string) => {
        try {
            const library = await window.electronAPI.createLibrary(name, parentPath)
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
            const library = await window.electronAPI.openLibrary()
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
        loadTagFolders()
        loadFolders()
    }, [loadMediaFiles, loadTags, loadTagFolders, loadFolders])

    // 全データの一括更新
    const refreshAll = useCallback(async () => {
        setLoading(true)
        try {
            await Promise.all([
                loadMediaFiles(),
                loadTags(),
                loadTagFolders(),
                loadFolders()
            ])
        } catch (e) {
            console.error('Failed to refresh library:', e)
        } finally {
            setLoading(false)
        }
    }, [loadMediaFiles, loadTags, loadTagFolders, loadFolders])

    return useMemo(() => ({
        mediaFiles: filteredMediaFiles,
        allMediaFiles: mediaFiles,
        tags,
        tagFolders,
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
        addTagsToMedia
    }), [
        filteredMediaFiles, mediaFiles, tags, tagFolders, folders, libraries, loading, activeLibrary,
        filterOptions, setFilterOptions, createLibrary, switchLibrary, selectAndScanFolder,
        createTag, deleteTag, createFolder, deleteFolder, addTagToMedia, removeTagFromMedia,
        addTagsToMedia, addFolderToMedia, removeFolderFromMedia, moveToTrash, restoreFromTrash, deletePermanently,
        moveFilesToTrash, restoreFilesFromTrash, deleteFilesPermanently,
        updateLastPlayed, importMedia, updateRating, renameMedia, updateArtist, libraryStats,
        loadMediaFiles, loadFolders, renameFolder, activeRemoteLibrary, switchToRemoteLibrary,
        switchToLocalLibrary, openLibrary, myUserToken, updateDescription
    ])
}
