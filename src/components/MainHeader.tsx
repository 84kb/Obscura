import { useState, useRef, useEffect, useMemo } from 'react'
import { FilterOptions, ViewSettings, Tag, TagFolder, MediaFile, Folder, ItemInfoType, ElectronAPI } from '../types'
import { TagFilterDropdown } from './TagFilterDropdown'
import { FolderFilterDropdown } from './FolderFilterDropdown'
import { RatingFilterDropdown } from './RatingFilterDropdown'
import { TypeFilterDropdown } from './TypeFilterDropdown'
import { ArtistFilterDropdown } from './ArtistFilterDropdown'
import { DurationFilterDropdown } from './DurationFilterDropdown'
import { DateFilterDropdown } from './DateFilterDropdown'
import { ConfirmModal } from './ConfirmModal'
import './MainHeader.css'

interface MainHeaderProps {
    title: string
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    gridSize: number
    onGridSizeChange: (size: number) => void
    viewMode: 'grid' | 'list'
    onViewModeChange: (mode: 'grid' | 'list') => void
    tags: Tag[]
    tagFolders: TagFolder[]
    allMediaFiles: MediaFile[]
    viewSettings: ViewSettings
    onViewSettingsChange: (settings: ViewSettings) => void
    folders: Folder[]
    onRefreshLibrary: () => void
    onReload: () => void
}

export function MainHeader({
    title,
    filterOptions,
    onFilterChange,
    gridSize,
    onGridSizeChange,
    viewMode,
    onViewModeChange,
    tags,
    tagFolders,
    allMediaFiles,
    viewSettings,
    onViewSettingsChange,
    folders,
    onRefreshLibrary,
    onReload
}: MainHeaderProps) {
    const [isFilterBarOpen, setIsFilterBarOpen] = useState(false)
    const [isTagFilterOpen, setIsTagFilterOpen] = useState(false)
    const [isFolderFilterOpen, setIsFolderFilterOpen] = useState(false)
    const [isRatingFilterOpen, setIsRatingFilterOpen] = useState(false)
    const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false)
    const [isArtistFilterOpen, setIsArtistFilterOpen] = useState(false)
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false)
    const viewMenuRef = useRef<HTMLDivElement>(null)
    const tagFilterBtnRef = useRef<HTMLDivElement>(null)
    const folderFilterBtnRef = useRef<HTMLDivElement>(null)
    const ratingFilterBtnRef = useRef<HTMLDivElement>(null)
    const typeFilterBtnRef = useRef<HTMLDivElement>(null)
    const artistFilterBtnRef = useRef<HTMLDivElement>(null)
    const [isDurationFilterOpen, setIsDurationFilterOpen] = useState(false)
    const durationFilterBtnRef = useRef<HTMLDivElement>(null)
    const [isDateFilterOpen, setIsDateFilterOpen] = useState(false)
    const dateFilterBtnRef = useRef<HTMLDivElement>(null)

    const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false)

    const handleConfirmRefresh = () => {
        setIsRefreshModalOpen(false)
        onRefreshLibrary()
    }

    // 外部クリックで閉じる
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
                setIsViewMenuOpen(false)
            }
            if (tagFilterBtnRef.current && !tagFilterBtnRef.current.contains(event.target as Node)) {
                setIsTagFilterOpen(false)
            }
            if (folderFilterBtnRef.current && !folderFilterBtnRef.current.contains(event.target as Node)) {
                setIsFolderFilterOpen(false)
            }
            if (ratingFilterBtnRef.current && !ratingFilterBtnRef.current.contains(event.target as Node)) {
                setIsRatingFilterOpen(false)
            }
            if (typeFilterBtnRef.current && !typeFilterBtnRef.current.contains(event.target as Node)) {
                setIsTypeFilterOpen(false)
            }
            if (artistFilterBtnRef.current && !artistFilterBtnRef.current.contains(event.target as Node)) {
                setIsArtistFilterOpen(false)
            }
            if (durationFilterBtnRef.current && !durationFilterBtnRef.current.contains(event.target as Node)) {
                setIsDurationFilterOpen(false)
            }
            if (dateFilterBtnRef.current && !dateFilterBtnRef.current.contains(event.target as Node)) {
                setIsDateFilterOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // 選択されたタグ名を取得
    const getSelectedTagNames = () => {
        if (filterOptions.selectedTags.length === 0) return null
        const selectedTagNames = filterOptions.selectedTags
            .map(id => tags.find(t => t.id === id)?.name)
            .filter(Boolean)
        if (selectedTagNames.length === 1) return selectedTagNames[0]
        if (selectedTagNames.length <= 3) return selectedTagNames.join(', ')
        return `${selectedTagNames.slice(0, 2).join(', ')}...`
    }

    const tagLabel = getSelectedTagNames()

    const updateViewSetting = <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => {
        onViewSettingsChange({ ...viewSettings, [key]: value })

        // サムネイルモード変更時はバックエンドの設定も更新する
        if (key === 'thumbnailMode') {
            (window.electronAPI as unknown as ElectronAPI).updateClientConfig({ thumbnailMode: value as 'speed' | 'quality' })
        }
    }

    // メディアファイルからフォルダー一覧とカウントを生成
    const foldersWithCounts = useMemo(() => {
        // フォルダーごとのカウントを計算
        const folderCounts = new Map<number, number>()
        allMediaFiles.forEach(file => {
            if (file.is_deleted) return
            file.folders?.forEach(folder => {
                folderCounts.set(folder.id, (folderCounts.get(folder.id) || 0) + 1)
            })
        })

        // カウント情報を付与してソート
        return folders.map(f => ({
            id: f.id,
            name: f.name,
            count: folderCounts.get(f.id) || 0,
            parentId: f.parentId
        })).sort((a, b) => b.count - a.count)
    }, [allMediaFiles, folders])

    // 選択されたフォルダー名を取得
    const getSelectedFolderNames = () => {
        if (filterOptions.selectedFolders.length === 0) return null
        const selectedFolderNames = filterOptions.selectedFolders
            .map(id => {
                const folder = folders.find(f => f.id === id)
                return folder?.name
            })
            .filter(Boolean)

        if (selectedFolderNames.length === 1) return selectedFolderNames[0]
        if (selectedFolderNames.length <= 2) return selectedFolderNames.join(', ')
        return `${selectedFolderNames.slice(0, 1).join(', ')}...(${selectedFolderNames.length})`
    }

    const folderLabel = getSelectedFolderNames()

    // 評価ごとのカウントを計算
    const ratingCounts = useMemo(() => {
        const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        allMediaFiles.forEach(media => {
            if (media.is_deleted) return
            const rating = media.rating || 0
            counts[rating] = (counts[rating] || 0) + 1
        })
        return counts
    }, [allMediaFiles])

    const getSelectedRatingLabel = () => {
        if (!filterOptions.selectedRatings || filterOptions.selectedRatings.length === 0) return null
        const labels = filterOptions.selectedRatings.map(r => r === 0 ? 'なし' : `${r}★`)
        if (labels.length === 1) return labels[0]
        if (labels.length <= 2) return labels.join(', ')
        return `${labels[0]}...(${labels.length})`
    }

    const ratingLabel = getSelectedRatingLabel()

    // 拡張子ごとのカウントを計算
    const extensionCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        allMediaFiles.forEach(media => {
            if (media.is_deleted) return
            const name = media.file_name || ''
            const ext = name.split('.').pop()?.toLowerCase() || ''
            if (ext) {
                counts[ext] = (counts[ext] || 0) + 1
            }
        })
        return counts
    }, [allMediaFiles])

    const getSelectedTypeLabel = () => {
        const selected = filterOptions.selectedExtensions || []
        const excluded = filterOptions.excludedExtensions || []
        if (selected.length === 0 && excluded.length === 0) return null

        const labels = [
            ...selected.map(e => e.toUpperCase()),
            ...excluded.map(e => `!${e.toUpperCase()}`)
        ]

        if (labels.length === 1) return labels[0]
        if (labels.length <= 2) return labels.join(', ')
        return `${labels[0]}...(${labels.length})`
    }

    const typeLabel = getSelectedTypeLabel()

    // 投稿者ごとのカウントを計算
    const artistCounts = useMemo(() => {
        const counts: Map<string, number> = new Map()
        allMediaFiles.forEach(media => {
            if (media.is_deleted) return
            const artists = (media.artists && media.artists.length > 0) ? media.artists : [media.artist || '未設定']

            artists.forEach(artist => {
                const name = artist || '未設定'
                counts.set(name, (counts.get(name) || 0) + 1)
            })
        })

        return Array.from(counts.entries()).map(([name, count]) => ({
            name,
            count
        })).sort((a, b) => b.count - a.count)
    }, [allMediaFiles])

    const getSelectedArtistLabel = () => {
        const selected = filterOptions.selectedArtists || []
        const excluded = filterOptions.excludedArtists || []
        if (selected.length === 0 && excluded.length === 0) return null

        const labels = [
            ...selected,
            ...excluded.map(a => `!${a}`)
        ]

        if (labels.length === 1) return labels[0]
        if (labels.length <= 2) return labels.join(', ')
        return `${labels[0]}...(${labels.length})`
    }

    const artistLabel = getSelectedArtistLabel()

    return (
        <div className="main-header-container">
            <header className="main-header">
                <div className="header-left">
                    <div className="history-buttons">
                        <button className="icon-btn" title="戻る">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <button className="icon-btn" title="進む">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    </div>
                    <h2 className="current-title">{title}</h2>
                </div>

                <div className="header-center">
                    <div className="size-slider-container">
                        <span className="slider-icon minus">-</span>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={gridSize}
                            onChange={(e) => onGridSizeChange(Number(e.target.value))}
                            className="size-slider"
                        />
                        <span className="slider-icon plus">+</span>
                    </div>
                </div>

                <div className="header-right">

                    {/* リロードボタン */}
                    <button
                        className="icon-btn"
                        title="再読み込み"
                        onClick={onReload}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 4v6h-6"></path>
                            <path d="M1 20v-6h6"></path>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    </button>

                    {/* 表示オプションドロップダウン */}
                    <div className="view-menu-container" ref={viewMenuRef}>
                        <button
                            className={`icon-btn ${isViewMenuOpen ? 'active' : ''}`}
                            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                            title="表示オプション"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="6" x2="16" y2="6"></line>
                                <line x1="4" y1="12" x2="12" y2="12"></line>
                                <line x1="4" y1="18" x2="8" y2="18"></line>
                            </svg>
                        </button>

                        {isViewMenuOpen && (
                            <div className="view-options-dropdown">
                                <div className="dropdown-row">
                                    <span className="dropdown-label">レイアウト</span>
                                    <div className="dropdown-controls">
                                        <select
                                            value={viewMode}
                                            onChange={(e) => onViewModeChange(e.target.value as 'grid' | 'list')}
                                            className="dropdown-select"
                                        >
                                            <option value="grid">グリッド</option>
                                            <option value="list">一覧</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="dropdown-row">
                                    <span className="dropdown-label">サムネイル</span>
                                    <div className="dropdown-controls">
                                        <div className="toggle-group">
                                            <button
                                                className={`toggle-btn ${viewSettings.thumbnailMode === 'speed' ? 'active' : ''}`}
                                                onClick={() => updateViewSetting('thumbnailMode', 'speed')}
                                            >速度</button>
                                            <button
                                                className={`toggle-btn ${viewSettings.thumbnailMode === 'quality' ? 'active' : ''}`}
                                                onClick={() => updateViewSetting('thumbnailMode', 'quality')}
                                            >品質</button>
                                        </div>
                                    </div>
                                </div>

                                <div className="dropdown-row">
                                    <span className="dropdown-label">並べ替え</span>
                                    <div className="dropdown-controls">
                                        <select
                                            value={filterOptions.sortOrder}
                                            onChange={(e) => onFilterChange({ ...filterOptions, sortOrder: e.target.value as any })}
                                            className="dropdown-select"
                                        >
                                            <option value="name">タイトル</option>
                                            <option value="date">追加日</option>
                                            <option value="modified">変更日</option>
                                            <option value="size">ファイルサイズ</option>
                                            <option value="rating">評価</option>
                                            <option value="duration">再生時間</option>
                                            <option value="last_played">再生日</option>
                                        </select>
                                        <button
                                            className={`sort-dir-btn ${filterOptions.sortDirection === 'asc' ? 'active' : ''}`}
                                            onClick={() => onFilterChange({ ...filterOptions, sortDirection: 'asc' })}
                                            title="昇順"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 19V5M5 12l7-7 7 7" />
                                            </svg>
                                        </button>
                                        <button
                                            className={`sort-dir-btn ${filterOptions.sortDirection === 'desc' ? 'active' : ''}`}
                                            onClick={() => onFilterChange({ ...filterOptions, sortDirection: 'desc' })}
                                            title="降順"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 5v14M5 12l7 7 7-7" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                <div className="dropdown-row toggle-row">
                                    <span className="dropdown-label">名前を表示</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={viewSettings.showName}
                                            onChange={(e) => updateViewSetting('showName', e.target.checked)}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="dropdown-row toggle-row">
                                    <span className="dropdown-label">アイテム情報を表示</span>
                                    <div className="dropdown-controls">
                                        <select
                                            className="dropdown-select small"
                                            value={viewSettings.itemInfoType}
                                            onChange={(e) => updateViewSetting('itemInfoType', e.target.value as ItemInfoType)}
                                        >
                                            <option value="duration">再生時間</option>
                                            <option value="size">サイズ</option>
                                            <option value="tags">タグ</option>
                                            <option value="rating">評価</option>
                                            <option value="modified">変更日</option>
                                            <option value="created">作成日</option>
                                        </select>
                                        <label className="switch">
                                            <input
                                                type="checkbox"
                                                checked={viewSettings.showItemInfo}
                                                onChange={(e) => updateViewSetting('showItemInfo', e.target.checked)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                    </div>
                                </div>

                                <div className="dropdown-row toggle-row">
                                    <span className="dropdown-label">拡張子を表示</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={viewSettings.showExtension}
                                            onChange={(e) => updateViewSetting('showExtension', e.target.checked)}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="dropdown-row toggle-row">
                                    <span className="dropdown-label">拡張子ラベルを表示</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={viewSettings.showExtensionLabel}
                                            onChange={(e) => updateViewSetting('showExtensionLabel', e.target.checked)}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="dropdown-row toggle-row">
                                    <span className="dropdown-label">サブフォルダーの内容を表示する</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={viewSettings.showSubfolderContent}
                                            onChange={(e) => updateViewSetting('showSubfolderContent', e.target.checked)}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="dropdown-divider"></div>

                                <div className="dropdown-row toggle-row">
                                    <span className="dropdown-label">サイドバーを表示</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={viewSettings.showSidebar}
                                            onChange={(e) => updateViewSetting('showSidebar', e.target.checked)}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="dropdown-row toggle-row">
                                    <span className="dropdown-label">インスペクタを表示</span>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={viewSettings.showInspector}
                                            onChange={(e) => updateViewSetting('showInspector', e.target.checked)}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>

                                <div className="dropdown-divider"></div>

                                <div className="dropdown-row">
                                    <button
                                        className="btn btn-full btn-outline-danger"
                                        onClick={() => {
                                            setIsViewMenuOpen(false)
                                            setIsRefreshModalOpen(true)
                                        }}
                                    >
                                        ライブラリを更新
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        className={`icon-btn ${isFilterBarOpen ? 'active' : ''}`}
                        title="フィルター"
                        onClick={() => setIsFilterBarOpen(!isFilterBarOpen)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    </button>

                    <div className="header-search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input
                            type="text"
                            placeholder="検索..."
                            value={filterOptions.searchQuery}
                            onChange={(e) => onFilterChange({ ...filterOptions, searchQuery: e.target.value })}
                        />
                    </div>


                </div>
            </header>

            {/* フィルターバー */}
            {isFilterBarOpen && (
                <div className="filter-bar">
                    {/* フォルダーフィルター */}
                    <div className="filter-bar-item" ref={folderFilterBtnRef}>
                        <button
                            className={`filter-bar-btn ${filterOptions.selectedFolders.length > 0 ? 'active' : ''}`}
                            onClick={() => setIsFolderFilterOpen(!isFolderFilterOpen)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span>{folderLabel || 'フォルダー'}</span>
                        </button>
                        {isFolderFilterOpen && (
                            <FolderFilterDropdown
                                folders={foldersWithCounts}
                                filterOptions={filterOptions}
                                onFilterChange={onFilterChange}
                                onClose={() => setIsFolderFilterOpen(false)}
                            />
                        )}
                    </div>

                    {/* タグフィルター */}
                    <div className="filter-bar-item" ref={tagFilterBtnRef}>
                        <button
                            className={`filter-bar-btn ${filterOptions.selectedTags.length > 0 ? 'active' : ''}`}
                            onClick={() => setIsTagFilterOpen(!isTagFilterOpen)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                                <line x1="7" y1="7" x2="7.01" y2="7"></line>
                            </svg>
                            <span>{tagLabel || 'タグ'}</span>
                        </button>
                        {isTagFilterOpen && (
                            <TagFilterDropdown
                                tags={tags}
                                tagFolders={tagFolders}
                                filterOptions={filterOptions}
                                onFilterChange={onFilterChange}
                                onClose={() => setIsTagFilterOpen(false)}
                            />
                        )}
                    </div>

                    {/* 評価フィルター */}
                    <div className="filter-bar-item" ref={ratingFilterBtnRef}>
                        <button
                            className={`filter-bar-btn ${isRatingFilterOpen || ratingLabel ? 'active' : ''}`}
                            onClick={() => setIsRatingFilterOpen(!isRatingFilterOpen)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                            <span>{ratingLabel || '評価'}</span>
                        </button>
                        {isRatingFilterOpen && (
                            <RatingFilterDropdown
                                filterOptions={filterOptions}
                                counts={ratingCounts}
                                onFilterChange={onFilterChange}
                                onClose={() => setIsRatingFilterOpen(false)}
                            />
                        )}
                    </div>

                    {/* タイプフィルター */}
                    <div className="filter-bar-item" ref={typeFilterBtnRef}>
                        <button
                            className={`filter-bar-btn ${isTypeFilterOpen || typeLabel ? 'active' : ''}`}
                            onClick={() => setIsTypeFilterOpen(!isTypeFilterOpen)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                            </svg>
                            <span>{typeLabel || 'タイプ'}</span>
                        </button>
                        {isTypeFilterOpen && (
                            <TypeFilterDropdown
                                filterOptions={filterOptions}
                                counts={extensionCounts}
                                onFilterChange={onFilterChange}
                                onClose={() => setIsTypeFilterOpen(false)}
                            />
                        )}
                    </div>

                    {/* 投稿者フィルター */}
                    <div className="filter-bar-item" ref={artistFilterBtnRef}>
                        <button
                            className={`filter-bar-btn ${isArtistFilterOpen || artistLabel ? 'active' : ''}`}
                            onClick={() => setIsArtistFilterOpen(!isArtistFilterOpen)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <span>{artistLabel || '投稿者'}</span>
                        </button>
                        {isArtistFilterOpen && (
                            <ArtistFilterDropdown
                                artists={artistCounts}
                                filterOptions={filterOptions}
                                onFilterChange={onFilterChange}
                                onClose={() => setIsArtistFilterOpen(false)}
                            />
                        )}
                    </div>

                    {/* 再生時間フィルター */}
                    <div className="filter-bar-item" ref={durationFilterBtnRef}>
                        <button
                            className={`filter-bar-btn ${isDurationFilterOpen || filterOptions.durationMin !== undefined || filterOptions.durationMax !== undefined ? 'active' : ''}`}
                            onClick={() => setIsDurationFilterOpen(!isDurationFilterOpen)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span>再生時間</span>
                        </button>
                        {isDurationFilterOpen && (
                            <DurationFilterDropdown
                                filterOptions={filterOptions}
                                onFilterChange={onFilterChange}
                                onClose={() => setIsDurationFilterOpen(false)}
                            />
                        )}
                    </div>

                    {/* 変更日フィルター */}
                    <div className="filter-bar-item" ref={dateFilterBtnRef}>
                        <button
                            className={`filter-bar-btn ${isDateFilterOpen || filterOptions.dateModifiedMin || filterOptions.dateModifiedMax ? 'active' : ''}`}
                            onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            <span>変更日</span>
                        </button>
                        {isDateFilterOpen && (
                            <DateFilterDropdown
                                filterOptions={filterOptions}
                                onFilterChange={onFilterChange}
                                onClose={() => setIsDateFilterOpen(false)}
                            />
                        )}
                    </div>
                </div>
            )}

            {isRefreshModalOpen && (
                <ConfirmModal
                    title="ライブラリの更新"
                    message="すべてのライブラリファイルのサムネイルとメタデータを再取得します。ファイル数によっては時間がかかる可能性がありますが、実行しますか？"
                    confirmLabel="更新を開始"
                    isDestructive={true}
                    onConfirm={handleConfirmRefresh}
                    onCancel={() => setIsRefreshModalOpen(false)}
                />
            )}
        </div>
    )
}

