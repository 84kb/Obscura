import { useState, useEffect, useRef } from 'react'
import { FilterOptions } from '../types'
import './FolderFilterDropdown.css'

interface FolderInfo {
    id: number
    name: string
    count: number
    parentId?: number | null
}

interface FolderFilterDropdownProps {
    folders: FolderInfo[]
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
    className?: string
}

export function FolderFilterDropdown({
    folders,
    filterOptions,
    onFilterChange,
    onClose,
    className
}: FolderFilterDropdownProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const dropdownRef = useRef<HTMLDivElement>(null)

    // ESCで閉じる
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    // フィルタされたフォルダー
    const getFilteredFolders = () => {
        let filtered = folders

        // 検索フィルタ
        if (searchQuery) {
            filtered = filtered.filter(f =>
                f.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
        }

        return filtered.sort((a, b) => b.count - a.count) // カウントの多い順
    }

    const filteredFolders = getFilteredFolders()

    // フォルダーの選択/解除（左クリック）
    const toggleFolder = (folderId: number) => {
        let newSelectedFolders = [...filterOptions.selectedFolders]
        let newExcludedFolders = [...(filterOptions.excludedFolders || [])]

        if (newSelectedFolders.includes(folderId)) {
            newSelectedFolders = newSelectedFolders.filter(id => id !== folderId)
        } else {
            newSelectedFolders.push(folderId)
            // 除外されていたら解除
            newExcludedFolders = newExcludedFolders.filter(id => id !== folderId)
        }

        onFilterChange({
            ...filterOptions,
            selectedFolders: newSelectedFolders,
            excludedFolders: newExcludedFolders
        })
    }

    // フォルダーの除外/解除（右クリック）
    const handleFolderContextMenu = (e: React.MouseEvent, folderId: number) => {
        e.preventDefault()

        let newExcludedFolders = [...(filterOptions.excludedFolders || [])]
        let newSelectedFolders = [...filterOptions.selectedFolders]

        if (newExcludedFolders.includes(folderId)) {
            newExcludedFolders = newExcludedFolders.filter(id => id !== folderId)
        } else {
            newExcludedFolders.push(folderId)
            // 選択されていたら解除
            newSelectedFolders = newSelectedFolders.filter(id => id !== folderId)
        }

        onFilterChange({
            ...filterOptions,
            excludedFolders: newExcludedFolders,
            selectedFolders: newSelectedFolders
        })
    }

    // すべて選択/解除
    const selectAll = () => {
        const visibleFolderIds = filteredFolders.map(f => f.id)
        const isAllSelected = visibleFolderIds.length > 0 && visibleFolderIds.every(id => filterOptions.selectedFolders.includes(id))

        let newSelectedFolders = [...filterOptions.selectedFolders]
        let newExcludedFolders = [...(filterOptions.excludedFolders || [])]

        if (isAllSelected) {
            newSelectedFolders = newSelectedFolders.filter(id => !visibleFolderIds.includes(id))
        } else {
            visibleFolderIds.forEach(id => {
                if (!newSelectedFolders.includes(id)) {
                    newSelectedFolders.push(id)
                    // 除外から削除
                    newExcludedFolders = newExcludedFolders.filter(exId => exId !== id)
                }
            })
        }

        onFilterChange({
            ...filterOptions,
            selectedFolders: newSelectedFolders,
            excludedFolders: newExcludedFolders
        })
    }

    const clearFilters = () => {
        onFilterChange({
            ...filterOptions,
            selectedFolders: [],
            excludedFolders: []
        })
    }

    const isAllVisibleSelected = filteredFolders.length > 0 && filteredFolders.every(f => filterOptions.selectedFolders.includes(f.id))

    return (
        <div className={`folder-filter-dropdown ${className || ''}`} ref={dropdownRef}>
            {/* ヘッダー: 検索とルール */}
            <div className="folder-filter-header">
                <div className="folder-filter-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        type="text"
                        placeholder="検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="folder-filter-rule">
                    <span>ルール:</span>
                    <button
                        className={`mode-btn ${filterOptions.folderFilterMode === 'or' ? 'active' : ''}`}
                        onClick={() => onFilterChange({ ...filterOptions, folderFilterMode: 'or' })}
                        title="いずれかのフォルダを含む"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        </svg>
                    </button>
                    <button
                        className={`mode-btn ${filterOptions.folderFilterMode === 'and' ? 'active' : ''}`}
                        onClick={() => onFilterChange({ ...filterOptions, folderFilterMode: 'and' })}
                        title="すべてのフォルダを含む"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </button>
                    <button
                        className="clear-btn"
                        onClick={clearFilters}
                        title="フィルターをクリア"
                        disabled={filterOptions.selectedFolders.length === 0 && (!filterOptions.excludedFolders || filterOptions.excludedFolders.length === 0)}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>

            {/* フォルダー一覧 */}
            <div className="folder-filter-list">
                {filteredFolders.map(folder => {
                    const isSelected = filterOptions.selectedFolders.includes(folder.id)
                    const isExcluded = filterOptions.excludedFolders?.includes(folder.id)
                    return (
                        <div
                            key={folder.id}
                            className={`folder-filter-item ${isSelected ? 'selected' : ''} ${isExcluded ? 'excluded' : ''}`}
                            onClick={() => toggleFolder(folder.id)}
                            onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
                        >
                            <div className="folder-checkbox">
                                {isSelected && <span className="check-mark">✓</span>}
                                {isExcluded && <span className="exclude-mark">✕</span>}
                            </div>
                            <span className={`folder-name ${isExcluded ? 'excluded-text' : ''}`}>{folder.name}</span>
                            <span className="folder-count">{folder.count.toLocaleString()}</span>
                        </div>
                    )
                })}
                {filteredFolders.length > 0 && (
                    <div className="folder-filter-item select-all" onClick={selectAll}>
                        <div className="folder-checkbox">
                            {isAllVisibleSelected && <span className="check-mark">✓</span>}
                        </div>
                        <span className="folder-name">すべてを選択</span>
                    </div>
                )}
            </div>

            {/* フッター */}
            <div className="folder-filter-footer">
                <span>選択 <u>左クリック</u></span>
                <span>除外 <u>右クリック</u></span>
            </div>
        </div>
    )
}
