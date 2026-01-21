import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Tag, TagGroup, MediaFile } from '../types'
import SelectionBox from './SelectionBox'
import './TagManager.css'

interface TagManagerProps {
    tags: Tag[]
    tagGroups?: TagGroup[]
    onCreateTag: (name: string) => void
    onDeleteTag: (id: number) => void
    disabled?: boolean
    onRefresh?: () => void
    onInternalDragStart?: () => void
    onInternalDragEnd?: () => void
    allMediaFiles: MediaFile[]
}

export function TagManager({ tags, tagGroups: propTagGroups, onCreateTag, onDeleteTag, disabled = false, onRefresh, onInternalDragStart, onInternalDragEnd, allMediaFiles }: TagManagerProps) {
    const [newTagName, setNewTagName] = useState('')
    // const [newFolderName, setNewFolderName] = useState('') // Removed
    const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
    const [selectedGroupId, setSelectedGroupId] = useState<number | null | 'all'>('all')
    const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())
    const [lastSelectedTagId, setLastSelectedTagId] = useState<number | null>(null)
    const [draggedTagIds, setDraggedTagIds] = useState<number[]>([])
    const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; group: TagGroup } | null>(null)
    const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; tagId: number } | null>(null)
    const [editingGroupId, setEditingGroupId] = useState<number | null>(null)

    const [editingGroupName, setEditingGroupName] = useState('')

    // 範囲選択用
    const [selectionBoxStart, setSelectionBoxStart] = useState<{ x: number, y: number } | null>(null)
    const [selectionBoxEnd, setSelectionBoxEnd] = useState<{ x: number, y: number } | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const selectionBoxStartViewportRef = useRef<{ x: number, y: number } | null>(null)
    const initialSelectedIdsRef = useRef<Set<number>>(new Set())

    // イベントハンドラの最新版を保持するRef (Stale Closure対策)
    const handleMouseMoveRef = useRef<(e: MouseEvent) => void>()
    const handleMouseUpRef = useRef<(e: MouseEvent) => void>()

    // グループ一覧を取得
    useEffect(() => {
        if (propTagGroups) {
            setTagGroups(propTagGroups)
        } else {
            loadTagGroups()
        }
    }, [propTagGroups])

    const loadTagGroups = async () => {
        try {
            const groups = await window.electronAPI.getTagGroups()
            setTagGroups(groups)
        } catch (error) {
            console.error('Failed to load tag groups:', error)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (newTagName.trim()) {
            onCreateTag(newTagName.trim())
            setNewTagName('')
        }
    }

    const handleCreateGroup = async (e: React.MouseEvent) => {
        e.preventDefault()
        try {
            const group = await window.electronAPI.createTagGroup("無題")
            setTagGroups(prev => [...prev, group]) // 即時反映
            setEditingGroupId(group.id)
            setEditingGroupName(group.name)
            loadTagGroups() // 正確な同期
        } catch (error) {
            console.error('Failed to create tag group:', error)
        }
    }

    const handleDeleteGroup = async (id: number) => {
        try {
            await window.electronAPI.deleteTagGroup(id)
            if (selectedGroupId === id) {
                setSelectedGroupId('all')
            }
            loadTagGroups()
        } catch (error) {
            console.error('Failed to delete tag group:', error)
        }
    }

    const handleRenameGroup = async (id: number, newName: string) => {
        if (newName.trim()) {
            try {
                await window.electronAPI.renameTagGroup(id, newName.trim())
                loadTagGroups()
            } catch (error) {
                console.error('Failed to rename tag group:', error)
            }
        }
        setEditingGroupId(null)
    }

    // タグの使用回数を事前計算
    const tagUsageCount = useMemo(() => {
        const counts = new Map<number, number>()
        allMediaFiles.forEach(file => {
            if (file.tags) {
                file.tags.forEach(t => {
                    counts.set(t.id, (counts.get(t.id) || 0) + 1)
                })
            }
        })
        return counts
    }, [allMediaFiles])

    // グループ右クリックメニュー
    const handleGroupContextMenu = (e: React.MouseEvent, group: TagGroup) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, group })
    }

    const closeContextMenu = () => {
        setContextMenu(null)
        setTagContextMenu(null)
    }

    // タグ右クリックメニュー
    const handleTagContextMenu = (e: React.MouseEvent, tagId: number) => {
        e.preventDefault()
        e.stopPropagation()
        setTagContextMenu({ x: e.clientX, y: e.clientY, tagId })
        setContextMenu(null) // 他のメニューを閉じる
    }

    // ドラッグ&ドロップ
    const handleDragStart = (e: React.DragEvent, tagId: number) => {
        let draggingIds: number[] = []

        if (selectedTagIds.has(tagId)) {
            // 選択中のタグをドラッグする場合、選択中のタグすべてを対象にする
            draggingIds = Array.from(selectedTagIds)
        } else {
            // 選択されていないタグをドラッグする場合、そのタグだけを選択状態にしてドラッグ
            setSelectedTagIds(new Set([tagId]))
            setLastSelectedTagId(tagId)
            draggingIds = [tagId]
        }

        setDraggedTagIds(draggingIds)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/x-obscura-tag-ids', JSON.stringify(draggingIds))

        // カスタムドラッグイメージを作成（角丸の黒い背景を回避）
        const dragElement = e.currentTarget as HTMLElement
        const clone = dragElement.cloneNode(true) as HTMLElement
        clone.style.position = 'absolute'
        clone.style.top = '-9999px'
        clone.style.left = '-9999px'
        clone.style.background = 'var(--bg-card)'
        clone.style.borderRadius = 'var(--radius-sm)'
        clone.style.border = '1px solid var(--primary)'
        clone.style.padding = '8px 12px'
        clone.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)'
        document.body.appendChild(clone)
        e.dataTransfer.setDragImage(clone, clone.offsetWidth / 2, clone.offsetHeight / 2)

        // クリーンアップは少し遅延させる（ドラッグイメージ生成後）
        requestAnimationFrame(() => {
            document.body.removeChild(clone)
        })

        // グローバルハンドラーに内部ドラッグであることを通知
        if (onInternalDragStart) {
            onInternalDragStart()
        }
    }

    const handleDragEnd = () => {
        setDraggedTagIds([])
        setDragOverGroupId(null)

        // グローバルハンドラーに内部ドラッグ終了を通知
        if (onInternalDragEnd) {
            onInternalDragEnd()
        }
    }

    const handleDrop = async (e: React.DragEvent, groupId: number | null) => {
        e.preventDefault()
        e.stopPropagation()
        console.log('[TagManager] handleDrop called, groupId:', groupId)

        let ids = draggedTagIds

        // stateがクリアされていた場合、dataTransferから取得を試みる
        if (ids.length === 0) {
            const data = e.dataTransfer.getData('application/x-obscura-tag-ids')
            console.log('[TagManager] No state IDs, trying dataTransfer:', data)
            if (data) {
                try {
                    ids = JSON.parse(data)
                } catch (err) {
                    console.error('Failed to parse drag data:', err)
                }
            }
        }

        if (ids.length > 0) {
            try {
                // 複数のタグを更新
                await Promise.all(ids.map(id => window.electronAPI.updateTagGroup(id, groupId)))

                if (onRefresh) {
                    onRefresh()
                } else {
                    loadTagGroups()
                }
            } catch (error) {
                console.error('Failed to update tag group:', error)
            }
        }
        setDraggedTagIds([])
        setDragOverGroupId(null)
    }

    const handleDragOver = (e: React.DragEvent, targetId: number) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverGroupId(targetId)
    }


    // 範囲選択ロジック
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return // 左クリックのみ
        if ((e.target as HTMLElement).closest('.tag-manager-item')) return
        if ((e.target as HTMLElement).closest('.tag-manager-header')) return
        if ((e.target as HTMLElement).closest('.tag-manager-form')) return

        e.preventDefault()

        const startPos = { x: e.clientX, y: e.clientY }
        initialSelectedIdsRef.current = new Set(selectedTagIds)
        selectionBoxStartViewportRef.current = startPos

        setSelectionBoxStart(startPos)
        setSelectionBoxEnd(startPos)
    }

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!selectionBoxStartViewportRef.current || !containerRef.current) return

        const currentPos = { x: e.clientX, y: e.clientY }
        setSelectionBoxEnd(currentPos)

        const boxView = {
            left: Math.min(selectionBoxStartViewportRef.current.x, e.clientX),
            top: Math.min(selectionBoxStartViewportRef.current.y, e.clientY),
            right: Math.max(selectionBoxStartViewportRef.current.x, e.clientX),
            bottom: Math.max(selectionBoxStartViewportRef.current.y, e.clientY)
        }

        const newSelectedIds = new Set<number>()
        if (e.ctrlKey || e.metaKey) {
            initialSelectedIdsRef.current.forEach(id => newSelectedIds.add(id))
        }

        containerRef.current.querySelectorAll('.tag-manager-item').forEach(el => {
            const itemRect = el.getBoundingClientRect()
            const tagId = Number((el as HTMLElement).dataset.tagId)
            if (isNaN(tagId)) return

            if (
                boxView.left < itemRect.right &&
                boxView.right > itemRect.left &&
                boxView.top < itemRect.bottom &&
                boxView.bottom > itemRect.top
            ) {
                newSelectedIds.add(tagId)
            }
        })

        setSelectedTagIds(newSelectedIds)
    }, [containerRef])

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (!selectionBoxStartViewportRef.current) return

        const start = selectionBoxStartViewportRef.current
        const end = { x: e.clientX, y: e.clientY }
        const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))

        if (dist < 5) {
            if (!e.ctrlKey && !e.metaKey) {
                setSelectedTagIds(new Set())
                setLastSelectedTagId(null)
            }
        }

        setSelectionBoxStart(null)
        setSelectionBoxEnd(null)
        selectionBoxStartViewportRef.current = null
        initialSelectedIdsRef.current.clear()
    }, [])

    // Refを常に最新に更新
    useEffect(() => {
        handleMouseMoveRef.current = handleMouseMove
        handleMouseUpRef.current = handleMouseUp
    })

    useEffect(() => {
        if (selectionBoxStart) {
            const onMouseMove = (e: MouseEvent) => handleMouseMoveRef.current?.(e)
            const onMouseUp = (e: MouseEvent) => handleMouseUpRef.current?.(e)

            window.addEventListener('mousemove', onMouseMove)
            window.addEventListener('mouseup', onMouseUp)
            return () => {
                window.removeEventListener('mousemove', onMouseMove)
                window.removeEventListener('mouseup', onMouseUp)
            }
        }
    }, [!!selectionBoxStart]) // selectionBoxStartが変わるたびに再登録されるが、ドラッグ中は不変なのでOK

    const handleDragLeave = () => {
        setDragOverGroupId(null)
    }

    const handleTagClick = (e: React.MouseEvent, tagId: number) => {
        e.stopPropagation() // コンテナのクリックイベント（選択解除などあれば）への伝播を防ぐ

        if (e.shiftKey && lastSelectedTagId !== null) {
            // 範囲選択
            const currentIndex = filteredTags.findIndex(t => t.id === tagId)
            const lastIndex = filteredTags.findIndex(t => t.id === lastSelectedTagId)

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex)
                const end = Math.max(currentIndex, lastIndex)

                const newSelection = new Set(selectedTagIds)
                // Ctrlキーが押されていない場合は既存の選択をクリアしてから追加する仕様にするか、
                // 常に加算するか。エクスプローラー風ならCtrlなしShiftは範囲のみ選択。
                if (!e.ctrlKey && !e.metaKey) {
                    newSelection.clear()
                }

                for (let i = start; i <= end; i++) {
                    newSelection.add(filteredTags[i].id)
                }
                setSelectedTagIds(newSelection)
            }
        } else if (e.ctrlKey || e.metaKey) {
            // 追加/解除選択
            const newSelection = new Set(selectedTagIds)
            if (newSelection.has(tagId)) {
                newSelection.delete(tagId)
            } else {
                newSelection.add(tagId)
                setLastSelectedTagId(tagId)
            }
            setSelectedTagIds(newSelection)
        } else {
            // 単一選択
            setSelectedTagIds(new Set([tagId]))
            setLastSelectedTagId(tagId)
        }
    }

    // フィルタリングされたタグ
    // "all" の場合、視覚的なグループ順序（グループ1, グループ2..., 未分類）に合わせてソートする
    const getSortedFilteredTags = useCallback(() => {
        if (selectedGroupId === 'all') {
            const sorted: Tag[] = []
            // グループ順
            tagGroups.forEach(group => {
                const groupTags = tags.filter(t => t.groupId === group.id)
                sorted.push(...groupTags)
            })
            // 未分類 (または存在しないグループID)
            const existingGroupIds = new Set(tagGroups.map(g => g.id))
            const unclassifiedTags = tags.filter(t => !t.groupId || !existingGroupIds.has(t.groupId))
            sorted.push(...unclassifiedTags)
            return sorted
        } else if (selectedGroupId === null) {
            const existingGroupIds = new Set(tagGroups.map(g => g.id))
            return tags.filter(t => !t.groupId || !existingGroupIds.has(t.groupId))
        } else {
            return tags.filter(t => t.groupId === selectedGroupId)
        }
    }, [selectedGroupId, tags, tagGroups])

    const filteredTags = getSortedFilteredTags()

    // Render helper for a single tag items
    const renderTagItem = (tag: Tag) => {
        const count = tagUsageCount.get(tag.id) || 0
        return (
            <div
                key={tag.id}
                className={`tag-manager-item ${selectedTagIds.has(tag.id) ? 'selected' : ''}`}
                draggable
                data-tag-id={tag.id}
                onDragStart={(e) => handleDragStart(e, tag.id)}
                onDragEnd={handleDragEnd}
                onClick={(e) => handleTagClick(e, tag.id)}
                onContextMenu={(e) => handleTagContextMenu(e, tag.id)}
            >
                <span className="tag-manager-name">{tag.name}</span>
                <span className="tag-usage-count">{count}</span>
            </div>
        )
    }

    // グローバルクリックでコンテキストメニューを閉じる
    useEffect(() => {
        const handleClick = () => closeContextMenu()
        if (contextMenu || tagContextMenu) {
            document.addEventListener('click', handleClick)
            return () => document.removeEventListener('click', handleClick)
        }
    }, [contextMenu, tagContextMenu])

    return (
        <div className="tag-manager-container">
            {/* グループサイドバー */}
            <div className="tag-group-sidebar">
                {/* すべて */}
                <div
                    className={`tag-group-item ${selectedGroupId === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedGroupId('all')}
                >

                    <span className="folder-name">すべて</span>
                    <span className="tag-count">{tags.length}</span>
                </div>

                {/* 未分類 */}
                <div
                    className={`tag-group-item ${selectedGroupId === null ? 'active' : ''} ${dragOverGroupId === -1 ? 'drag-over' : ''}`}
                    onClick={() => setSelectedGroupId(null)}
                    onDrop={(e) => handleDrop(e, null)}
                    onDragOver={(e) => handleDragOver(e, -1)}
                    onDragLeave={handleDragLeave}
                >

                    <span className="folder-name">未分類</span>
                    <span className="tag-count">{(() => {
                        const existingGroupIds = new Set(tagGroups.map(g => g.id))
                        return tags.filter(t => !t.groupId || !existingGroupIds.has(t.groupId)).length
                    })()}</span>
                </div>

                {/* よく使うタグ */}
                <div className="tag-group-item disabled">

                    <span className="folder-name">よく使うタグ</span>
                </div>

                {/* タグ グループ ヘッダー */}
                <div className="tag-group-header">
                    <span>タグ グループ({tagGroups.length})</span>
                    <button
                        className="add-group-btn"
                        onClick={handleCreateGroup}
                        title={disabled ? "ライブラリが選択されていません" : "グループを追加"}
                        disabled={disabled}
                    >
                        +
                    </button>
                </div>

                {/* グループ一覧 */}
                <div className="tag-folder-list">
                    {tagGroups.map(group => (
                        <div
                            key={group.id}
                            className={`tag-group-item ${selectedGroupId === group.id ? 'active' : ''} ${dragOverGroupId === group.id ? 'drag-over' : ''}`}
                            onClick={() => setSelectedGroupId(group.id)}
                            onContextMenu={(e) => handleGroupContextMenu(e, group)}
                            onDrop={(e) => handleDrop(e, group.id)}
                            onDragOver={(e) => handleDragOver(e, group.id)}
                            onDragLeave={handleDragLeave}
                        >

                            {editingGroupId === group.id ? (
                                <input
                                    type="text"
                                    className="folder-rename-input"
                                    value={editingGroupName}
                                    onChange={(e) => setEditingGroupName(e.target.value)}
                                    onBlur={() => handleRenameGroup(group.id, editingGroupName)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                        if (e.key === 'Escape') setEditingGroupId(null)
                                    }}
                                    autoFocus
                                    onFocus={(e) => e.target.select()}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="folder-name">{group.name}</span>
                            )}
                            <span className="tag-count">{tags.filter(t => t.groupId === group.id).length}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* タグ一覧 */}
            <div className="tag-manager">
                <div className="tag-manager-header">
                    <h2 className="tag-manager-title">
                        {selectedGroupId === 'all' ? 'すべてのタグ' :
                            selectedGroupId === null ? '未分類のタグ' :
                                tagGroups.find(g => g.id === selectedGroupId)?.name || 'タグ'}
                    </h2>
                    <form onSubmit={handleSubmit} className="tag-manager-form">
                        <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder={disabled ? "ライブラリが選択されていません" : "新しいタグ名..."}
                            className="tag-manager-input"
                            disabled={disabled}
                        />
                        <button type="submit" className="btn btn-primary btn-small" disabled={disabled}>追加</button>
                    </form>
                </div>

                <div
                    className="tag-manager-grid"
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                >
                    {selectedGroupId === 'all' ? (
                        <>
                            {/* グループごとの表示 */}
                            {tagGroups.map(group => {
                                const groupTags = tags.filter(t => t.groupId === group.id)
                                if (groupTags.length === 0) return null

                                const totalUsage = groupTags.reduce((sum, tag) => sum + (tagUsageCount.get(tag.id) || 0), 0)

                                return (
                                    <div key={group.id} className="tag-manager-section">
                                        <div className="tag-manager-section-title">
                                            {group.name}
                                            <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                                                (計 {totalUsage} 件)
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--spacing-sm)' }}>
                                            {groupTags.map(tag => renderTagItem(tag))}
                                        </div>
                                    </div>
                                )
                            })}

                            {/* 未分類 */}
                            {(() => {
                                const existingGroupIds = new Set(tagGroups.map(g => g.id))
                                const unclassifiedTags = tags.filter(t => !t.groupId || !existingGroupIds.has(t.groupId))
                                if (unclassifiedTags.length === 0) return null

                                const totalUsage = unclassifiedTags.reduce((sum, tag) => sum + (tagUsageCount.get(tag.id) || 0), 0)

                                return (
                                    <div className="tag-manager-section">
                                        <div className="tag-manager-section-title">
                                            未分類
                                            <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                                                (計 {totalUsage} 件)
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--spacing-sm)' }}>
                                            {unclassifiedTags.map(tag => renderTagItem(tag))}
                                        </div>
                                    </div>
                                )
                            })()}
                        </>
                    ) : filteredTags.length === 0 ? (
                        <p className="tag-manager-empty">
                            {selectedGroupId === null ? '未分類のタグがありません' :
                                'このグループにはタグがありません'}
                        </p>
                    ) : (
                        // 通常のフラット表示
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--spacing-sm)' }}>
                            {filteredTags.map((tag) => renderTagItem(tag))}
                        </div>
                    )}
                    {selectionBoxStart && selectionBoxEnd && (
                        <SelectionBox
                            top={Math.min(selectionBoxStart.y, selectionBoxEnd.y)}
                            left={Math.min(selectionBoxStart.x, selectionBoxEnd.x)}
                            width={Math.abs(selectionBoxEnd.x - selectionBoxStart.x)}
                            height={Math.abs(selectionBoxEnd.y - selectionBoxStart.y)}
                            position="fixed"
                        />
                    )}
                </div>


            </div>

            {/* コンテキストメニュー */}
            {contextMenu && (
                <div
                    className="folder-context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={() => {
                        setEditingGroupId(contextMenu.group.id)
                        setEditingGroupName(contextMenu.group.name)
                        closeContextMenu()
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        名前を変更
                    </button>
                    <button
                        className="danger"
                        onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`グループ "${contextMenu.group.name}" を削除しますか？\n中のタグは「未分類」に移動されます。`)) {
                                handleDeleteGroup(contextMenu.group.id)
                            }
                            closeContextMenu()
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        削除
                    </button>
                </div>
            )}

            {/* タグコンテキストメニュー */}
            {tagContextMenu && (
                <div
                    className="folder-context-menu"
                    style={{ left: tagContextMenu.x, top: tagContextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="menu-item delete" onClick={() => {
                        const tag = tags.find(t => t.id === tagContextMenu.tagId)
                        if (tag && confirm(`タグ "${tag.name}" を削除しますか？`)) {
                            onDeleteTag(tag.id)
                            closeContextMenu()
                        }
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        削除
                    </div>
                </div>
            )}
        </div>
    )
}
