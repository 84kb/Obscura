import { useState, useEffect, useRef } from 'react'
import { FilterOptions } from '../types'
import './FolderFilterDropdown.css'

interface GenreFolderInfo {
    id: number
    name: string
    count: number
    parentId?: number | null
}

interface FolderFilterDropdownProps {
    folders: GenreFolderInfo[]
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
}

export function FolderFilterDropdown({
    folders,
    filterOptions,
    onFilterChange,
    onClose
}: FolderFilterDropdownProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const dropdownRef = useRef<HTMLDivElement>(null)

    // 外側クリックで閉じる
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

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
        let newSelectedGenres = [...filterOptions.selectedGenres]

        if (newSelectedGenres.includes(folderId)) {
            newSelectedGenres = newSelectedGenres.filter(id => id !== folderId)
        } else {
            // 現在の仕様では単一選択または複数選択か確認が必要だが、Sidebarに合わせて複数選択可とする
            // ただしSidebarは通常単一選択挙動に近いことが多いが、FilterOptionsは配列。
            // ここではシンプルにトグルする。
            newSelectedGenres.push(folderId)
        }

        onFilterChange({
            ...filterOptions,
            selectedGenres: newSelectedGenres
        })
    }

    // フォルダーの除外/解除（右クリック） - ジャンルには未実装のため無効化
    const handleFolderContextMenu = (e: React.MouseEvent, _folderId: number) => {
        e.preventDefault()
        // 将来的にジャンル除外が必要なら実装
    }

    // すべて選択/解除
    const selectAll = () => {
        const visibleFolderIds = filteredFolders.map(f => f.id)
        const isAllSelected = visibleFolderIds.length > 0 && visibleFolderIds.every(id => filterOptions.selectedGenres.includes(id))

        let newSelectedGenres = [...filterOptions.selectedGenres]

        if (isAllSelected) {
            newSelectedGenres = newSelectedGenres.filter(id => !visibleFolderIds.includes(id))
        } else {
            visibleFolderIds.forEach(id => {
                if (!newSelectedGenres.includes(id)) {
                    newSelectedGenres.push(id)
                }
            })
        }

        onFilterChange({
            ...filterOptions,
            selectedGenres: newSelectedGenres
        })
    }

    const isAllVisibleSelected = filteredFolders.length > 0 && filteredFolders.every(f => filterOptions.selectedGenres.includes(f.id))

    return (
        <div className="folder-filter-dropdown" ref={dropdownRef}>
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
                </div>
            </div>

            {/* フォルダー一覧 */}
            <div className="folder-filter-list">
                {filteredFolders.map(folder => {
                    const isSelected = filterOptions.selectedGenres.includes(folder.id)
                    // const isExcluded = filterOptions.excludedGenres.includes(folder.id) // 未対応
                    return (
                        <div
                            key={folder.id}
                            className={`folder-filter-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleFolder(folder.id)}
                            onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
                        >
                            <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                            />
                            <span className={`folder-name`}>{folder.name}</span>
                            <span className="folder-count">{folder.count.toLocaleString()}</span>
                        </div>
                    )
                })}
                {filteredFolders.length > 0 && (
                    <div className="folder-filter-item select-all" onClick={selectAll}>
                        <input
                            type="checkbox"
                            checked={isAllVisibleSelected}
                            readOnly
                        />
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
