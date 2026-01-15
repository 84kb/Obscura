import { useState, useEffect } from 'react'
import { Tag, TagFolder } from '../types'
import './TagManager.css'

interface TagManagerProps {
    tags: Tag[]
    onCreateTag: (name: string) => void
    onDeleteTag: (id: number) => void
}

export function TagManager({ tags, onCreateTag, onDeleteTag }: TagManagerProps) {
    const [newTagName, setNewTagName] = useState('')
    const [newFolderName, setNewFolderName] = useState('')
    const [tagFolders, setTagFolders] = useState<TagFolder[]>([])
    const [selectedFolderId, setSelectedFolderId] = useState<number | null | 'all'>('all')
    const [showFolderInput, setShowFolderInput] = useState(false)
    const [draggedTagId, setDraggedTagId] = useState<number | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folder: TagFolder } | null>(null)
    const [editingFolderId, setEditingFolderId] = useState<number | null>(null)
    const [editingFolderName, setEditingFolderName] = useState('')

    // フォルダー一覧を取得
    useEffect(() => {
        loadTagFolders()
    }, [])

    const loadTagFolders = async () => {
        try {
            const folders = await window.electronAPI.getTagFolders()
            setTagFolders(folders)
        } catch (error) {
            console.error('Failed to load tag folders:', error)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (newTagName.trim()) {
            onCreateTag(newTagName.trim())
            setNewTagName('')
        }
    }

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const folder = await window.electronAPI.createTagFolder("無題")
            setTagFolders(prev => [...prev, folder]) // 即時反映
            setEditingFolderId(folder.id)
            setEditingFolderName(folder.name)
            loadTagFolders() // 正確な同期
        } catch (error) {
            console.error('Failed to create tag folder:', error)
        }
    }

    const handleDeleteFolder = async (id: number) => {
        try {
            await window.electronAPI.deleteTagFolder(id)
            if (selectedFolderId === id) {
                setSelectedFolderId('all')
            }
            loadTagFolders()
        } catch (error) {
            console.error('Failed to delete tag folder:', error)
        }
    }

    const handleRenameFolder = async (id: number, newName: string) => {
        if (newName.trim()) {
            try {
                await window.electronAPI.renameTagFolder(id, newName.trim())
                loadTagFolders()
            } catch (error) {
                console.error('Failed to rename tag folder:', error)
            }
        }
        setEditingFolderId(null)
    }

    // 右クリックメニュー
    const handleFolderContextMenu = (e: React.MouseEvent, folder: TagFolder) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, folder })
    }

    const closeContextMenu = () => {
        setContextMenu(null)
    }

    // ドラッグ&ドロップ
    const handleDragStart = (tagId: number) => {
        setDraggedTagId(tagId)
    }

    const handleDragEnd = () => {
        setDraggedTagId(null)
    }

    const handleDrop = async (folderId: number | null) => {
        if (draggedTagId !== null) {
            try {
                await window.electronAPI.updateTagFolder(draggedTagId, folderId)
                window.location.reload()
            } catch (error) {
                console.error('Failed to update tag folder:', error)
            }
        }
        setDraggedTagId(null)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    // フィルタリングされたタグ
    const filteredTags = selectedFolderId === 'all'
        ? tags
        : selectedFolderId === null
            ? tags.filter(t => !t.folderId)
            : tags.filter(t => t.folderId === selectedFolderId)

    // グローバルクリックでコンテキストメニューを閉じる
    useEffect(() => {
        const handleClick = () => closeContextMenu()
        if (contextMenu) {
            document.addEventListener('click', handleClick)
            return () => document.removeEventListener('click', handleClick)
        }
    }, [contextMenu])

    return (
        <div className="tag-manager-container">
            {/* フォルダーサイドバー */}
            <div className="tag-folder-sidebar">
                {/* すべて */}
                <div
                    className={`tag-folder-item ${selectedFolderId === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedFolderId('all')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    </svg>
                    <span className="folder-name">すべて</span>
                    <span className="tag-count">{tags.length}</span>
                </div>

                {/* 未分類 */}
                <div
                    className={`tag-folder-item ${selectedFolderId === null ? 'active' : ''}`}
                    onClick={() => setSelectedFolderId(null)}
                    onDrop={() => handleDrop(null)}
                    onDragOver={handleDragOver}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8"></path>
                    </svg>
                    <span className="folder-name">未分類</span>
                    <span className="tag-count">{tags.filter(t => !t.folderId).length}</span>
                </div>

                {/* よく使うタグ */}
                <div className="tag-folder-item disabled">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <span className="folder-name">よく使うタグ</span>
                </div>

                {/* タグ グループ ヘッダー */}
                <div className="tag-group-header">
                    <span>タグ グループ({tagFolders.length})</span>
                    <button
                        className="add-folder-btn"
                        onClick={() => setShowFolderInput(!showFolderInput)}
                        title="グループを追加"
                    >
                        +
                    </button>
                </div>

                {showFolderInput && (
                    <form onSubmit={handleCreateFolder} className="new-folder-form">
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="グループ名..."
                            autoFocus
                        />
                        <button type="submit">作成</button>
                    </form>
                )}

                {/* フォルダー一覧 */}
                <div className="tag-folder-list">
                    {tagFolders.map(folder => (
                        <div
                            key={folder.id}
                            className={`tag-folder-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                            onClick={() => setSelectedFolderId(folder.id)}
                            onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                            onDrop={() => handleDrop(folder.id)}
                            onDragOver={handleDragOver}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            </svg>
                            {editingFolderId === folder.id ? (
                                <input
                                    type="text"
                                    className="folder-rename-input"
                                    value={editingFolderName}
                                    onChange={(e) => setEditingFolderName(e.target.value)}
                                    onBlur={() => handleRenameFolder(folder.id, editingFolderName)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameFolder(folder.id, editingFolderName)
                                        if (e.key === 'Escape') setEditingFolderId(null)
                                    }}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="folder-name">{folder.name}</span>
                            )}
                            <span className="tag-count">{tags.filter(t => t.folderId === folder.id).length}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* タグ一覧 */}
            <div className="tag-manager">
                <div className="tag-manager-header">
                    <h2 className="tag-manager-title">
                        {selectedFolderId === 'all' ? 'すべてのタグ' :
                            selectedFolderId === null ? '未分類のタグ' :
                                tagFolders.find(f => f.id === selectedFolderId)?.name || 'タグ'}
                    </h2>
                    <form onSubmit={handleSubmit} className="tag-manager-form">
                        <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder="新しいタグ名..."
                            className="tag-manager-input"
                        />
                        <button type="submit" className="btn btn-primary btn-small">追加</button>
                    </form>
                </div>

                <div className="tag-manager-grid">
                    {filteredTags.length === 0 ? (
                        <p className="tag-manager-empty">
                            {selectedFolderId === 'all' ? 'タグがありません' :
                                selectedFolderId === null ? '未分類のタグがありません' :
                                    'このグループにはタグがありません'}
                        </p>
                    ) : (
                        filteredTags.map((tag) => (
                            <div
                                key={tag.id}
                                className="tag-manager-item"
                                draggable
                                onDragStart={() => handleDragStart(tag.id)}
                                onDragEnd={handleDragEnd}
                            >
                                <span className="tag-manager-name"># {tag.name}</span>
                                <button
                                    className="tag-manager-delete"
                                    onClick={() => {
                                        if (confirm(`タグ "${tag.name}" を削除しますか？`)) {
                                            onDeleteTag(tag.id)
                                        }
                                    }}
                                >
                                    &times;
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <p className="drag-hint">💡 タグを左のグループにドラッグ&ドロップで移動できます</p>
            </div>

            {/* コンテキストメニュー */}
            {contextMenu && (
                <div
                    className="folder-context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={() => {
                        setEditingFolderId(contextMenu.folder.id)
                        setEditingFolderName(contextMenu.folder.name)
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
                        onClick={() => {
                            if (confirm(`グループ "${contextMenu.folder.name}" を削除しますか？\n中のタグは「未分類」に移動されます。`)) {
                                handleDeleteFolder(contextMenu.folder.id)
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
        </div>
    )
}
