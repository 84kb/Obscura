import { useState, useEffect, useRef } from 'react'
import { Tag, TagFolder, FilterOptions } from '../types'
import './TagFilterDropdown.css'

interface TagFilterDropdownProps {
    tags: Tag[]
    tagFolders: TagFolder[]
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    onClose: () => void
}

export function TagFilterDropdown({
    tags,
    tagFolders,
    filterOptions,
    onFilterChange,
    onClose
}: TagFilterDropdownProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedFolderId, setSelectedFolderId] = useState<number | null | 'all'>('all')
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

    // フィルタされたタグ
    const getFilteredTags = () => {
        let filtered = tags

        // フォルダーフィルタ
        if (selectedFolderId === null) {
            filtered = filtered.filter(t => !t.folderId)
        } else if (selectedFolderId !== 'all') {
            filtered = filtered.filter(t => t.folderId === selectedFolderId)
        }

        // 検索フィルタ
        if (searchQuery) {
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
        }

        return filtered.sort((a, b) => a.name.localeCompare(b.name))
    }

    const filteredTags = getFilteredTags()

    // タグの選択/解除（左クリック）
    const toggleTag = (tagId: number) => {
        let newSelectedTags = [...filterOptions.selectedTags]
        let newExcludedTags = [...filterOptions.excludedTags]

        if (newSelectedTags.includes(tagId)) {
            newSelectedTags = newSelectedTags.filter(id => id !== tagId)
        } else {
            newSelectedTags.push(tagId)
            // 除外リストに含まれていれば削除
            newExcludedTags = newExcludedTags.filter(id => id !== tagId)
        }

        onFilterChange({
            ...filterOptions,
            selectedTags: newSelectedTags,
            excludedTags: newExcludedTags
        })
    }

    // タグの除外/解除（右クリック）
    const handleTagContextMenu = (e: React.MouseEvent, tagId: number) => {
        e.preventDefault()
        let newSelectedTags = [...filterOptions.selectedTags]
        let newExcludedTags = [...filterOptions.excludedTags]

        if (newExcludedTags.includes(tagId)) {
            newExcludedTags = newExcludedTags.filter(id => id !== tagId)
        } else {
            newExcludedTags.push(tagId)
            // 選択リストに含まれていれば削除
            newSelectedTags = newSelectedTags.filter(id => id !== tagId)
        }

        onFilterChange({
            ...filterOptions,
            selectedTags: newSelectedTags,
            excludedTags: newExcludedTags
        })
    }

    // すべて選択/解除
    const selectAll = () => {
        const visibleTagIds = filteredTags.map(t => t.id)
        // 表示されているタグがすべて選択済みかどうか
        const isAllSelected = visibleTagIds.length > 0 && visibleTagIds.every(id => filterOptions.selectedTags.includes(id))

        let newSelectedTags = [...filterOptions.selectedTags]
        let newExcludedTags = [...filterOptions.excludedTags]

        if (isAllSelected) {
            // すべて解除
            newSelectedTags = newSelectedTags.filter(id => !visibleTagIds.includes(id))
        } else {
            // すべて選択（未選択のものだけ追加）
            visibleTagIds.forEach(id => {
                if (!newSelectedTags.includes(id)) {
                    newSelectedTags.push(id)
                }
                // 除外リストからは削除
                newExcludedTags = newExcludedTags.filter(exId => exId !== id)
            })
        }

        onFilterChange({
            ...filterOptions,
            selectedTags: newSelectedTags,
            excludedTags: newExcludedTags
        })
    }

    // すべて解除


    // AND/ORモード切替
    const toggleMode = (mode: 'and' | 'or') => {
        onFilterChange({ ...filterOptions, tagFilterMode: mode })
    }

    // タグの使用数を取得（メディアに紐付いている数を表示するには別途実装が必要、ここでは1を表示）
    const getTagCount = (_tagId: number) => {
        // TODO: 実際のメディア紐付け数を取得
        return 1
    }

    const isAllVisibleSelected = filteredTags.length > 0 && filteredTags.every(t => filterOptions.selectedTags.includes(t.id))

    return (
        <div className="tag-filter-dropdown" ref={dropdownRef}>
            {/* ヘッダー: 検索とルール */}
            <div className="tag-filter-header">
                <div className="tag-filter-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                        type="text"
                        placeholder="タグを検索"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="tag-filter-mode">
                    <span>ルール:</span>
                    <button
                        className={`mode-btn ${filterOptions.tagFilterMode === 'or' ? 'active' : ''}`}
                        onClick={() => toggleMode('or')}
                        title="いずれかのタグを含む"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        </svg>
                    </button>
                    <button
                        className={`mode-btn ${filterOptions.tagFilterMode === 'and' ? 'active' : ''}`}
                        onClick={() => toggleMode('and')}
                        title="すべてのタグを含む"
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

            {/* メインコンテンツ */}
            <div className="tag-filter-content">
                {/* 左: フォルダー一覧 */}
                <div className="tag-filter-folders">
                    <div
                        className={`folder-item ${selectedFolderId === 'all' ? 'active' : ''}`}
                        onClick={() => setSelectedFolderId('all')}
                    >
                        <span>全てのタグ</span>
                        <span className="count">{tags.length}</span>
                    </div>
                    {tagFolders.map(folder => (
                        <div
                            key={folder.id}
                            className={`folder-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                            onClick={() => setSelectedFolderId(folder.id)}
                        >
                            <span>{folder.name}</span>
                            <span className="count">{tags.filter(t => t.folderId === folder.id).length}</span>
                        </div>
                    ))}
                </div>

                {/* 右: タグ一覧 */}
                <div className="tag-filter-tags">
                    {filteredTags.map(tag => {
                        const isSelected = filterOptions.selectedTags.includes(tag.id)
                        const isExcluded = filterOptions.excludedTags.includes(tag.id)
                        return (
                            <div
                                key={tag.id}
                                className={`tag-item ${isSelected ? 'selected' : ''} ${isExcluded ? 'excluded' : ''}`}
                                onClick={() => toggleTag(tag.id)}
                                onContextMenu={(e) => handleTagContextMenu(e, tag.id)}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly // click handler handles change
                                />
                                <span className={`tag-name ${isExcluded ? 'excluded-text' : ''}`}>{tag.name}</span>
                                <span className="tag-count">{getTagCount(tag.id)}</span>
                            </div>
                        )
                    })}
                    {filteredTags.length > 0 && (
                        <div className="tag-item select-all" onClick={selectAll}>
                            <input
                                type="checkbox"
                                checked={isAllVisibleSelected}
                                readOnly
                            />
                            <span className="tag-name">すべてを選択</span>
                        </div>
                    )}
                </div>
            </div>

            {/* フッター */}
            <div className="tag-filter-footer">
                <span>選択 <u>左クリック</u></span>
                <span>除外 <u>右クリック</u></span>
                <div className="footer-actions">
                    <button onClick={onClose}>閉じる</button>
                    <span className="esc-hint">ESC</span>
                </div>
            </div>
        </div>
    )
}
