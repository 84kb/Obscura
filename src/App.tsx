import React, { useState, useEffect, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { LibraryGrid } from './components/LibraryGrid'
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
import { MediaFile, AppSettings, RemoteLibrary, ViewSettings, defaultViewSettings } from './types'
import { MainHeader } from './components/MainHeader'
import { useSocket } from './hooks/useSocket'
import './styles/index.css'
import './styles/drag-overlay.css'

const DEFAULT_SETTINGS: AppSettings = {
    autoPlay: true,
    allowUpscale: false,
    gridSize: 4,
    viewMode: 'grid'
}


export default function App() {
    const {
        mediaFiles,
        allMediaFiles,
        filterOptions,
        setFilterOptions,
        tags,
        tagFolders,
        genres,
        libraries,
        activeLibrary,
        createTag,
        deleteTag,
        createGenre,
        addTagToMedia,
        removeTagFromMedia,
        addGenreToMedia,
        removeGenreFromMedia,
        moveToTrash,
        restoreFromTrash,
        deletePermanently,
        updateLastPlayed,
        createLibrary,
        hasActiveLibrary,
        importMedia,
        libraryStats,
        updateRating,
        renameMedia,
        updateArtist,
        refreshLibrary,
        loadGenres,
        renameGenre,
        deleteGenre,
        activeRemoteLibrary,
        switchToRemoteLibrary,
        switchToLocalLibrary,
        openLibrary,
        myUserToken
    } = useLibrary()


    // Socket.io 接続 (リモートライブラリ選択時のみ)
    const { isConnected: isSocketConnected, subscribe } = useSocket({
        enabled: !!activeRemoteLibrary,
        url: activeRemoteLibrary?.url,
        userToken: myUserToken,
        accessToken: activeRemoteLibrary?.token
    })

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

    // 選択されたメディアのIDリスト
    const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([])
    // 最後に選択されたメディアID (Shift選択用)
    const [lastSelectedId, setLastSelectedId] = useState<number | null>(null)
    const [renamingMediaId, setRenamingMediaId] = useState<number | null>(null)

    // 再生中のメディア(プレイヤー用)
    const [playingMedia, setPlayingMedia] = useState<MediaFile | null>(null)

    // 設定
    const [settings, setSettings] = useState<AppSettings>(() => {
        const saved = localStorage.getItem('app_settings')
        if (saved) {
            const parsed = JSON.parse(saved)
            return { ...DEFAULT_SETTINGS, ...parsed }
        }
        return DEFAULT_SETTINGS
    })
    const [showSettingsModal, setShowSettingsModal] = useState(false)

    // グリッド表示設定をsettingsから取得または同期
    const [gridSize, setGridSize] = useState<number>(settings.gridSize)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(settings.viewMode)

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

    useEffect(() => {
        setSettings(prev => ({ ...prev, gridSize, viewMode }))
    }, [gridSize, viewMode])

    // 設定保存
    useEffect(() => {
        localStorage.setItem('app_settings', JSON.stringify(settings))
    }, [settings])

    // リモートライブラリ管理
    const [remoteLibraries, setRemoteLibraries] = useState<RemoteLibrary[]>([])

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

    // ライブラリモーダルの表示状態
    const [showLibraryModal, setShowLibraryModal] = useState(false)

    // ドラッグ中の状態
    const [isDragging, setIsDragging] = useState(false)
    // 内部ドラッグかどうかを追跡するためのref
    const isInternalDrag = useRef(false)

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

    const handleMediaClick = (media: MediaFile, e: React.MouseEvent) => {
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
    }

    const handleMediaDoubleClick = (media: MediaFile) => {
        setPlayingMedia(media)
        setSelectedMediaIds([media.id]) // 再生時も単一選択に
        setLastSelectedId(media.id)
        updateLastPlayed(media.id)
    }

    const handleClosePlayer = () => {
        setPlayingMedia(null)
    }

    const handleCloseInspector = () => {
        setSelectedMediaIds([])
        setLastSelectedId(null)
    }

    // コンテキストメニューハンドラー
    const handleContextMenu = (media: MediaFile, e: React.MouseEvent) => {
        setContextMenu({ x: e.clientX, y: e.clientY, media })
        // 右クリック時には、そのアイテムが選択されていなければそれのみを選択
        if (!selectedMediaIds.includes(media.id)) {
            setSelectedMediaIds([media.id])
            setLastSelectedId(media.id)
        }
    }

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

    const handleAddToGenre = async (genreId: number) => {
        if (contextMenu?.media) {
            await addGenreToMedia(contextMenu.media.id, genreId)
        }
        closeContextMenu()
    }

    const handleDropOnGenre = async (genreId: number, files: FileList) => {
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
                await addGenreToMedia(mediaId, genreId)
            }
        } else {
            // 外部ドラッグ：インポートしてから追加
            try {
                const importedFiles = await window.electronAPI.importMedia(filePaths)
                if (importedFiles && importedFiles.length > 0) {
                    for (const media of importedFiles) {
                        await addGenreToMedia(media.id, genreId)
                    }
                    // ライブラリをリフレッシュ
                    await refreshLibrary()
                }
            } catch (error) {
                console.error("Failed to import and add to genre:", error)
            }
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



    // ドラッグ＆ドロップハンドリング
    // ドラッグ＆ドロップハンドリング
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        // 内部ドラッグ中はオーバーレイを表示しない
        if (isInternalDrag.current) return

        // 外部からのファイルドラッグのみオーバーレイを表示（内部ドラッグは無視）
        // dataTransfer.typesに'Files'が含まれ、かつファイルがある場合は外部ドラッグ
        const hasExternalFiles = e.dataTransfer.types.includes('Files') &&
            e.dataTransfer.items.length > 0 &&
            Array.from(e.dataTransfer.items).some(item => item.kind === 'file')

        if (hasActiveLibrary && hasExternalFiles) {
            setIsDragging(true)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        // 関連ターゲット(移動先)が現在の要素内の場合はドラッグ継続とみなす
        if (e.currentTarget.contains(e.relatedTarget as Node)) {
            return
        }
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        // 内部ドラッグの場合はインポートしない
        if (isInternalDrag.current) return

        if (!hasActiveLibrary) return

        const files = Array.from(e.dataTransfer.files)
        const filePaths = files.map(file => (file as any).path) // Electron環境では path プロパティがある

        if (filePaths.length > 0) {
            await importMedia(filePaths)
        }
    }

    const updateDescription = async (id: number, description: string | null) => {
        await window.electronAPI.updateDescription(id, description)
        refreshLibrary()
    }

    // ヘッダータイトルの取得
    const getHeaderTitle = () => {
        if (filterOptions.filterType === 'tag_manager') return 'タグ管理'
        if (filterOptions.filterType === 'trash') return 'ゴミ箱'
        if (filterOptions.filterType === 'uncategorized') return '未分類'
        if (filterOptions.filterType === 'untagged') return 'タグなし'
        if (filterOptions.filterType === 'recent') return '最近使用'
        if (filterOptions.filterType === 'random') return 'ランダム'

        if (filterOptions.selectedGenres.length > 0) {
            const genre = genres.find(g => filterOptions.selectedGenres.includes(g.id))
            return genre ? genre.name : 'すべて'
        }

        return activeLibrary ? activeLibrary.name : 'すべて'
    }

    const renderMainContent = () => {
        // プレイヤー再生中はプレイヤーを表示
        if (playingMedia) {
            const currentIndex = mediaFiles.findIndex(m => m.id === playingMedia.id)
            const hasNext = currentIndex !== -1 && currentIndex < mediaFiles.length - 1
            const hasPrev = currentIndex !== -1 && currentIndex > 0

            const handleNextMedia = () => {
                if (hasNext) {
                    const nextMedia = mediaFiles[currentIndex + 1]
                    setPlayingMedia(nextMedia)
                    setSelectedMediaIds([nextMedia.id])
                    setLastSelectedId(nextMedia.id)
                    updateLastPlayed(nextMedia.id)
                }
            }

            const handlePrevMedia = () => {
                if (hasPrev) {
                    const prevMedia = mediaFiles[currentIndex - 1]
                    setPlayingMedia(prevMedia)
                    setSelectedMediaIds([prevMedia.id])
                    setLastSelectedId(prevMedia.id)
                    updateLastPlayed(prevMedia.id)
                }
            }

            const handlePlayFirstMedia = () => {
                if (mediaFiles.length > 0) {
                    const firstMedia = mediaFiles[0]
                    setPlayingMedia(firstMedia)
                    setSelectedMediaIds([firstMedia.id])
                    setLastSelectedId(firstMedia.id)
                    updateLastPlayed(firstMedia.id)
                }
            }

            const toggleAutoPlay = () => {
                setSettings(prev => ({ ...prev, autoPlay: !prev.autoPlay }))
            }

            return (
                <Player
                    media={playingMedia}
                    onBack={handleClosePlayer}
                    onNext={handleNextMedia}
                    onPrev={handlePrevMedia}
                    hasNext={hasNext}
                    hasPrev={hasPrev}
                    autoPlayEnabled={settings.autoPlay}
                    onToggleAutoPlay={toggleAutoPlay}
                    onPlayFirst={handlePlayFirstMedia}
                />
            )
        }

        if (filterOptions.filterType === 'tag_manager') {
            return (
                <TagManager
                    tags={tags}
                    onCreateTag={createTag}
                    onDeleteTag={deleteTag}
                />
            )
        }

        return (
            <div
                className={`content-container ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
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
                    tagFolders={tagFolders}
                    allMediaFiles={allMediaFiles}
                    viewSettings={viewSettings}
                    onViewSettingsChange={setViewSettings}
                    onRefresh={refreshLibrary}
                    genres={genres}
                />
                {/* サブフォルダー表示 */}
                {filterOptions.selectedGenres.length > 0 && (
                    <SubfolderGrid
                        subfolders={genres.filter(g => g.parentId === filterOptions.selectedGenres[0])}
                        onSelectFolder={(genreId) => {
                            setFilterOptions(prev => ({ ...prev, selectedGenres: [genreId] }))
                        }}
                        getMediaCount={(genreId) => {
                            // TODO: 実際のメディアカウントを計算
                            return mediaFiles.filter(m => m.genres?.some(g => g.id === genreId)).length
                        }}
                    />
                )}

                {/* 内容ヘッダー */}
                {filterOptions.selectedGenres.length > 0 && genres.filter(g => g.parentId === filterOptions.selectedGenres[0]).length > 0 && (
                    <div className="content-section-header">
                        <span>内容 ({mediaFiles.length})</span>
                    </div>
                )}

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
                        setTimeout(() => {
                            isInternalDrag.current = false
                        }, 100)
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
            </div>
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
        <div
            className="app"
        >

            <Sidebar
                filterOptions={filterOptions}
                onFilterChange={setFilterOptions}
                genres={genres}
                libraries={libraries}
                remoteLibraries={remoteLibraries}
                activeLibrary={activeLibrary}
                activeRemoteLibrary={activeRemoteLibrary}
                onCreateGenre={createGenre}
                onRenameGenre={renameGenre}
                onDeleteGenre={deleteGenre}
                onOpenLibraryModal={() => setShowLibraryModal(true)}
                onOpenLibrary={openLibrary}
                onSwitchLibrary={switchToLocalLibrary}
                onSwitchRemoteLibrary={switchToRemoteLibrary}
                onOpenSettings={() => setShowSettingsModal(true)}
                hasActiveLibrary={hasActiveLibrary}
                onRefreshGenres={loadGenres}
                onDropFileOnGenre={handleDropOnGenre}
            />

            <main className={`main-content ${playingMedia ? 'is-playing' : ''}`} onClick={(e) => {
                // グリッドの空きスペースをクリックしたら選択解除
                if (e.target === e.currentTarget) {
                    setSelectedMediaIds([])
                    setLastSelectedId(null)
                }
            }}>
                {renderMainContent()}
            </main>

            {viewSettings.showInspector && (
                <Inspector
                    media={selectedMediaIds.map(id => mediaFiles.find(m => m.id === id)).filter(Boolean) as MediaFile[]}
                    playingMedia={playingMedia}
                    allTags={tags}
                    allGenres={genres}
                    onAddTag={addTagToMedia}
                    onRemoveTag={removeTagFromMedia}
                    onCreateTag={createTag}
                    onAddGenre={addGenreToMedia}
                    onRemoveGenre={removeGenreFromMedia}
                    onCreateGenre={createGenre}
                    onPlay={(media) => {
                        setPlayingMedia(media)
                        setSelectedMediaIds([media.id])
                        setLastSelectedId(media.id)
                        updateLastPlayed(media.id)
                    }}
                    onMoveToTrash={moveToTrash}
                    onRestore={restoreFromTrash}
                    onDeletePermanently={deletePermanently}
                    onClose={handleCloseInspector}
                    onRenameMedia={renameMedia}
                    onUpdateRating={updateRating}
                    onUpdateArtist={updateArtist}
                    onUpdateDescription={updateDescription}
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
                    onUpdateSettings={setSettings}
                    onClose={() => setShowSettingsModal(false)}
                />
            )}

            {/* コンテキストメニュー */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    media={contextMenu.media}
                    genres={genres}
                    onClose={closeContextMenu}
                    onOpenDefault={handleOpenDefault}
                    onOpenWith={handleOpenWith}
                    onShowInExplorer={handleShowInExplorer}
                    onAddToGenre={handleAddToGenre}
                    onRename={() => {
                        setRenamingMediaId(contextMenu.media.id)
                        closeContextMenu()
                    }}
                    onCopy={handleCopy}
                    onCopyPath={handleCopyPath}
                    onMoveToTrash={handleMoveToTrash}
                    onDownload={activeRemoteLibrary ? async () => {
                        if (!contextMenu?.media || !window.electronAPI) return

                        // 型安全性のため確認 (anyキャストしているので実行時エラー回避も兼ねて)
                        if (!(window.electronAPI as any).downloadRemoteMedia) {
                            alert('ダウンロード機能はサポートされていません。')
                            return
                        }

                        const media = contextMenu.media
                        const downloadUrl = media.file_path
                        // file_name を使用し、無ければデフォルト名を指定
                        const filename = media.file_name || 'download.mp4'

                        console.log('Downloading:', downloadUrl, filename)
                        try {
                            const result = await (window.electronAPI as any).downloadRemoteMedia(downloadUrl, filename)
                            if (result.success) {
                                alert(`ダウンロード完了: ${result.path}`)
                            } else {
                                alert(`ダウンロード失敗: ${result.message}`)
                            }
                        } catch (e: any) {
                            alert(`エラー: ${e.message}`)
                        }
                        closeContextMenu()
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
                    onConfirm={() => {
                        deleteConfirmIds.forEach(id => deletePermanently(id))
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
        </div>
    )
}


