import { useState, useRef, useEffect, useMemo } from 'react'
import { FilterOptions, Folder, Library } from '../types'
import './Sidebar.css'

import { RemoteLibrary } from '../types'
import { ConfirmModal } from './ConfirmModal'

interface SidebarProps {
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
    folders: Folder[]
    libraries: Library[]
    remoteLibraries: RemoteLibrary[] // Added
    activeLibrary: Library | null
    activeRemoteLibrary: RemoteLibrary | null // Added
    onCreateFolder: (name: string, parentId?: number | null) => Promise<Folder | null>
    onDeleteFolder: (id: number) => Promise<void>
    onRenameFolder: (id: number, newName: string) => void
    onOpenLibraryModal: () => void
    onOpenLibrary: () => Promise<any>
    onSwitchLibrary: (lib: Library) => void
    onSwitchRemoteLibrary: (lib: RemoteLibrary) => void
    onOpenSettings: () => void
    hasActiveLibrary: boolean
    onRefreshFolders?: () => void
    onDropFileOnFolder?: (folderId: number, files: FileList) => void
    onInternalDragStart?: () => void
    onInternalDragEnd?: () => void
}

// サブフォルダー対応のためのヘルパー型と関数
interface FolderWithChildren extends Folder {
    children: FolderWithChildren[]
    level: number
}

// フラットなリストをツリー構造に変換
const buildFolderTree = (folders: Folder[]): FolderWithChildren[] => {
    const folderMap = new Map<number, FolderWithChildren>()
    const roots: FolderWithChildren[] = []

    // まず全てのフォルダーをマップに登録
    folders.forEach(f => {
        folderMap.set(f.id, { ...f, children: [], level: 0 })
    })

    // 親子関係を構築
    folders.forEach(f => {
        const node = folderMap.get(f.id)!
        if (f.parentId && folderMap.has(f.parentId)) {
            const parent = folderMap.get(f.parentId)!
            node.level = parent.level + 1
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    })

    // orderIndexでソート
    const sortNodes = (nodes: FolderWithChildren[]) => {
        nodes.sort((a, b) => {
            const orderA = a.orderIndex || 0
            const orderB = b.orderIndex || 0
            if (orderA !== orderB) return orderA - orderB
            return a.name.localeCompare(b.name)
        })
        nodes.forEach(n => sortNodes(n.children))
    }
    sortNodes(roots)

    return roots
}

// アイコンコンポーネント（シンプル）
const Icons = {
    All: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
    Uncategorized: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    Untagged: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>,
    Recent: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    Random: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>,
    Tags: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><path d="M7 7h.01"></path></svg>,
    Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
    Folder: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    FolderOpen: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    Cloud: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>,
    Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
}

// リネーム用入力コンポーネント
function RenameInput({
    initialValue,
    onSubmit,
    onCancel
}: {
    initialValue: string,
    onSubmit: (value: string) => void,
    onCancel: () => void
}) {
    const [value, setValue] = useState(initialValue)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // マウント時に確実にフォーカスを当てる
        const timer = setTimeout(() => {
            if (inputRef.current) {
                console.log('[RenameInput] Focusing...')
                inputRef.current.focus()
                inputRef.current.select()
            }
        }, 50) // レンダリング完了とイベントループのクリーンアップを待つ
        return () => clearTimeout(timer)
    }, [])

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
                console.log('[RenameInput] Blurred')
                onSubmit(value)
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    onSubmit(value)
                } else if (e.key === 'Escape') {
                    onCancel()
                }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="sidebar-input-tiny"
            style={{ flex: 1, height: '22px', minWidth: 0, position: 'relative', zIndex: 10001 }}
        />
    )
}

export function Sidebar({
    filterOptions,
    onFilterChange,
    folders,
    libraries,
    remoteLibraries,
    activeLibrary,
    activeRemoteLibrary,
    onCreateFolder,
    onDeleteFolder,
    onRenameFolder,
    onOpenLibraryModal,
    onOpenLibrary,
    onSwitchLibrary,
    onSwitchRemoteLibrary,
    onOpenSettings,
    hasActiveLibrary,
    onRefreshFolders,
    onDropFileOnFolder,
    onInternalDragStart,
    onInternalDragEnd
}: SidebarProps) {
    const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null)
    const [renamingName, setRenamingName] = useState("")
    const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false)
    const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
    const [draggedFolderId, setDraggedFolderId] = useState<number | null>(null)
    const [dropTarget, setDropTarget] = useState<{ id: number; position: 'top' | 'middle' | 'bottom' } | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: number } | null>(null)
    const [folderToDelete, setFolderToDelete] = useState<number | null>(null)
    const libraryMenuRef = useRef<HTMLDivElement>(null)

    // フォルダーツリーの構築 (メモ化)
    const folderTree = useMemo(() => buildFolderTree(folders), [folders])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (libraryMenuRef.current && !libraryMenuRef.current.contains(event.target as Node)) {
                setIsLibraryMenuOpen(false)
            }
            if (contextMenu && !(event.target as Element).closest('.context-menu')) {
                setContextMenu(null)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [contextMenu])

    const handleCreateClick = async (e: React.MouseEvent) => {
        e.preventDefault()
        try {
            // ユーザー要望により、選択状態に関わらず常にルートに作成する
            const parentId = null

            const newFolder = await onCreateFolder("無題", parentId)
            if (newFolder) {
                setRenamingFolderId(newFolder.id)
                setRenamingName(newFolder.name)
            }
        } catch (error) {
            console.error("Failed to create folder", error)
        }
    }

    const handleRenameSubmit = (id: number, newName: string) => {
        const trimmed = newName.trim()
        const originalName = folders.find(f => f.id === id)?.name
        if (trimmed && trimmed !== "無題" && trimmed !== originalName) {
            onRenameFolder(id, trimmed)
        }
        setRenamingFolderId(null)
        setRenamingName("")
    }

    // コンテキストメニュー関連
    const handleContextMenu = (e: React.MouseEvent, folderId: number) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, folderId })
    }

    const handleContextAction = async (action: 'delete' | 'rename' | 'new-folder' | 'new-subfolder') => {
        if (!contextMenu) return
        const folderId = contextMenu.folderId
        const folder = folders.find(f => f.id === folderId)
        setContextMenu(null)

        if (!folder) return

        if (action === 'delete') {
            setFolderToDelete(folderId)
        } else if (action === 'rename') {
            setRenamingFolderId(folderId)
            setRenamingName(folder.name)
        } else if (action === 'new-folder') {
            // 兄弟を作成 (同じparentId)
            try {
                const newFolder = await onCreateFolder("無題", folder.parentId)
                if (newFolder) {
                    setRenamingFolderId(newFolder.id)
                    setRenamingName(newFolder.name)
                }
            } catch (error) {
                console.error("Failed to create sibling folder", error)
            }
        } else if (action === 'new-subfolder') {
            // 子を作成 (parentId = folderId)
            try {
                // 親を展開
                setExpandedFolders(prev => new Set(prev).add(folderId))
                const newFolder = await onCreateFolder("無題", folderId)
                if (newFolder) {
                    setRenamingFolderId(newFolder.id)
                    setRenamingName(newFolder.name)
                }
            } catch (error) {
                console.error("Failed to create subfolder", error)
            }
        }
    }

    const setFilterType = (type: FilterOptions['filterType']) => {
        onFilterChange({ ...filterOptions, filterType: type, selectedFolders: [] })
    }

    const toggleFolderFilter = (folderId: number) => {
        const currentFolders = filterOptions.selectedFolders
        const isSelected = currentFolders.includes(folderId)
        const newFolders = isSelected ? [] : [folderId]
        onFilterChange({ ...filterOptions, filterType: 'all', selectedFolders: newFolders })
    }

    // フォルダーの開閉
    const toggleFolderExpand = (e: React.MouseEvent, genreId: number) => {
        e.stopPropagation()
        setExpandedFolders(prev => {
            const next = new Set(prev)
            if (next.has(genreId)) {
                next.delete(genreId)
            } else {
                next.add(genreId)
            }
            return next
        })
    }

    // D&D ハンドラー
    const handleDragStart = (e: React.DragEvent, folderId: number) => {
        onInternalDragStart?.()
        e.stopPropagation()
        setDraggedFolderId(folderId)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.dropEffect = 'move'
        const data = JSON.stringify({ type: 'folder', id: folderId })
        e.dataTransfer.setData('application/json', data)
        // ブラウザ互換性のためのプレーンテキスト
        e.dataTransfer.setData('text/plain', data)
    }

    const handleDragEnd = () => {
        setDraggedFolderId(null)
        setDropTarget(null)
        onInternalDragEnd?.()
    }

    const getDropPosition = (e: React.DragEvent, element: HTMLElement): 'top' | 'middle' | 'bottom' => {
        const rect = element.getBoundingClientRect()
        const y = e.clientY - rect.top
        const height = rect.height

        if (y < height * 0.35) return 'top'
        if (y > height * 0.65) return 'bottom'
        return 'middle'
    }

    const handleDragOver = (e: React.DragEvent, targetId: number) => {
        e.preventDefault()
        const isFileDrag = e.dataTransfer.types.includes('Files')

        // ファイルドラッグでない場合のみバブリングを止める（グローバルなインポート表示を優先するため）
        if (!isFileDrag) {
            e.stopPropagation()
        }

        if (draggedFolderId === null && !isFileDrag) return
        if (draggedFolderId === targetId) return

        if (isFileDrag) {
            // ファイルドラッグの場合は常に「中に入れる」扱いにする
            setDropTarget({ id: targetId, position: 'middle' })
            // ドロップ効果を copy にする（追加の意味）
            e.dataTransfer.dropEffect = 'copy'
            return
        }

        // 内部ドラッグの場合は move を明示
        e.dataTransfer.dropEffect = 'move'

        const position = getDropPosition(e, e.currentTarget as HTMLElement)
        setDropTarget({ id: targetId, position })
    }

    const handleDragLeave = (e: React.DragEvent) => {
        // 子要素への移動でも発火するので、currentTargetの外に出た場合のみクリアする
        if (e.currentTarget.contains(e.relatedTarget as Node)) {
            return
        }
        setDropTarget(null)
    }

    // IDの正規化と比較（null, undefined, 0, 文字列の混在に対応）
    const normalizeId = (id: any): number | null => {
        if (id === null || id === undefined || id === '' || id === 0) return null
        const num = Number(id)
        return isNaN(num) ? null : num
    }

    const handleDrop = async (e: React.DragEvent, targetId: number) => {
        e.preventDefault()
        e.stopPropagation()

        // 常に最新のドロップ位置を使用
        const position = getDropPosition(e, e.currentTarget as HTMLElement)
        const currentDropTarget = { id: targetId, position }

        setDropTarget(null)

        // ドラッグ中のIDを取得（ステート優先、バックアップとしてdataTransferも確認）
        let effectiveDraggedId = normalizeId(draggedFolderId)

        if (effectiveDraggedId === null) {
            try {
                const data = e.dataTransfer.getData('application/json')
                if (data) {
                    const parsed = JSON.parse(data)
                    if (parsed.type === 'folder') {
                        effectiveDraggedId = normalizeId(parsed.id)
                    }
                }
            } catch (err) {
                console.error("Failed to parse drag data", err)
            }
        }

        // ファイルドロップの処理
        if (effectiveDraggedId === null) {
            if (e.dataTransfer.types.includes('Files') && onDropFileOnFolder) {
                onDropFileOnFolder(targetId, e.dataTransfer.files)
                setExpandedFolders(prev => new Set(prev).add(targetId))
            }
            return
        }

        const normalizedTargetId = normalizeId(targetId)
        if (effectiveDraggedId === normalizedTargetId || normalizedTargetId === null) {
            return
        }

        const updates: { id: number; parentId: number | null; orderIndex: number }[] = []

        let newParentId: number | null = null
        let newOrderIndex = 0

        const targetFolder = folders.find(f => normalizeId(f.id) === normalizedTargetId)
        if (!targetFolder) return

        if (currentDropTarget.position === 'middle') {
            // 子にする
            newParentId = normalizedTargetId
            // 末尾に追加（現在の子供の最大orderIndex + 1）
            const children = folders.filter(f => normalizeId(f.parentId) === normalizedTargetId)
            const maxOrder = children.reduce((max, c) => Math.max(max, c.orderIndex || 0), 0)
            newOrderIndex = maxOrder + 100

            // 親フォルダーを展開する
            setExpandedFolders(prev => new Set(prev).add(normalizedTargetId))
        } else {
            // 兄弟にする
            newParentId = normalizeId(targetFolder.parentId)

            // 兄弟を抽出（正規化したIDで比較）
            const siblings = folders.filter(f =>
                normalizeId(f.parentId) === newParentId &&
                normalizeId(f.id) !== effectiveDraggedId
            ).sort((a, b) => {
                const orderA = a.orderIndex || 0
                const orderB = b.orderIndex || 0
                if (orderA !== orderB) return orderA - orderB
                return a.name.localeCompare(b.name)
            })

            const targetIndex = siblings.findIndex(s => normalizeId(s.id) === normalizedTargetId)

            const newSiblings = [...siblings]
            const draggedFolder = folders.find(f => normalizeId(f.id) === effectiveDraggedId)!

            if (currentDropTarget.position === 'top') {
                newSiblings.splice(targetIndex, 0, draggedFolder)
            } else {
                newSiblings.splice(targetIndex + 1, 0, draggedFolder)
            }

            newSiblings.forEach((s, index) => {
                updates.push({
                    id: s.id,
                    parentId: newParentId,
                    orderIndex: index * 10
                })
            })
        }

        if (currentDropTarget.position === 'middle') {
            updates.push({
                id: effectiveDraggedId,
                parentId: newParentId,
                orderIndex: newOrderIndex
            })
        }

        if (updates.length > 0) {
            console.log('[Sidebar] Sending updateFolderStructure:', updates)
            await window.electronAPI.updateFolderStructure(updates)
            if (onRefreshFolders) {
                onRefreshFolders()
            }
        }

        setDraggedFolderId(null)
    }

    const handleContainerDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        // 少なくともサイドバーの上にいる間はドロップ可とする
        if (draggedFolderId !== null) {
            e.dataTransfer.dropEffect = 'move'
        }
    }

    const handleContainerDrop = (_e: React.DragEvent) => {
        // 子要素（renderFolderNode）でキャッチされなかったドロップを処理
        // 何もせずに dragEnd に任せるか、必要なら末尾への移動などを検討
        console.log('[Sidebar] Container drop (ignored or fallback)')
        setDropTarget(null)
    }

    // 再帰レンダリング関数
    const renderFolderNode = (node: FolderWithChildren) => {
        const isSelected = filterOptions.selectedFolders.includes(node.id)
        const isExpanded = expandedFolders.has(node.id)
        const isDropTarget = dropTarget?.id === node.id
        const isRenaming = renamingFolderId === node.id

        let dropClass = ''
        if (isDropTarget && dropTarget) {
            if (dropTarget.position === 'top') dropClass = 'drop-top'
            else if (dropTarget.position === 'bottom') dropClass = 'drop-bottom'
            else if (dropTarget.position === 'middle') dropClass = 'drop-middle'
        }

        const hasChildren = node.children.length > 0

        return (
            <div key={node.id} className="folder-tree-container">
                <div
                    className={`sidebar-nav-item folder-tree-node ${isSelected ? 'active' : ''} ${dropClass}`}
                    onClick={() => {
                        if (!isRenaming) toggleFolderFilter(node.id)
                    }}
                    onContextMenu={(e) => handleContextMenu(e, node.id)}
                    draggable={!isRenaming}
                    onDragStart={(e) => handleDragStart(e, node.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, node.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, node.id)}
                >
                    {/* 展開トグル（左端） */}
                    <div
                        className="folder-toggle-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            toggleFolderExpand(e, node.id)
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                            visibility: hasChildren ? 'visible' : 'hidden',
                            position: 'absolute',
                            left: '-22px',
                        }}
                    >
                        <svg
                            width="10" height="10"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            stroke="none"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                        >
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>

                    {/* フォルダーアイコン */}
                    <div className="folder-icon">
                        {isExpanded ? <Icons.FolderOpen /> : <Icons.Folder />}
                    </div>

                    {isRenaming ? (
                        <RenameInput
                            initialValue={renamingName}
                            onSubmit={(val) => handleRenameSubmit(node.id, val)}
                            onCancel={() => {
                                setRenamingFolderId(null)
                                setRenamingName("")
                            }}
                        />
                    ) : (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                    )}
                </div>

                {/* 子要素（再帰） */}
                {isExpanded && hasChildren && (
                    <div className="sidebar-sub-genres">
                        {node.children.map(renderFolderNode)}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div
            className="sidebar"
            onDragOver={handleContainerDragOver}
            onDrop={handleContainerDrop}
        >
            <div className="sidebar-header">
                {activeRemoteLibrary && (
                    <div className="sidebar-remote-status">
                        {/* Remote status indicator or controls if needed */}
                    </div>
                )}
                <div className="library-menu-container" ref={libraryMenuRef}>
                    <button
                        className="current-library-btn"
                        onClick={() => setIsLibraryMenuOpen(!isLibraryMenuOpen)}
                    >
                        <span className="library-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                        </span>
                        <span className="library-name">
                            {hasActiveLibrary && activeLibrary
                                ? activeLibrary.name
                                : activeRemoteLibrary
                                    ? activeRemoteLibrary.name
                                    : 'ライブラリを選択...'}
                        </span>
                        <svg className={`chevron ${isLibraryMenuOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>

                    {isLibraryMenuOpen && (
                        <div className="library-dropdown-menu">
                            <div className="library-search-container">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <input type="text" placeholder="検索..." className="library-menu-search" />
                                <button className="close-menu-btn" onClick={() => setIsLibraryMenuOpen(false)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                            <div className="library-menu-divider"></div>
                            <button
                                className="library-menu-item"
                                onClick={() => {
                                    onOpenLibraryModal()
                                    setIsLibraryMenuOpen(false)
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="12" y1="18" x2="12" y2="12"></line>
                                    <line x1="9" y1="15" x2="15" y2="15"></line>
                                </svg>
                                <span>新しいライブラリを作成...</span>
                            </button>

                            <button
                                className="library-menu-item"
                                onClick={async () => {
                                    await onOpenLibrary()
                                    setIsLibraryMenuOpen(false)
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                    <line x1="9" y1="13" x2="15" y2="13"></line>
                                    <line x1="12" y1="10" x2="12" y2="16"></line>
                                </svg>
                                <span>既存のライブラリを開く...</span>
                            </button>

                            <div className="library-menu-item-header">ローカルライブラリ</div>
                            {libraries.map(lib => (
                                <button
                                    key={lib.path}
                                    className={`library-menu-item library-option ${activeLibrary?.path === lib.path ? 'active' : ''}`}
                                    onClick={() => {
                                        onSwitchLibrary(lib)
                                        setIsLibraryMenuOpen(false)
                                    }}
                                >
                                    <Icons.Folder />
                                    <span>{lib.name}</span>
                                    {activeLibrary?.path === lib.path && <div className="active-dot" />}
                                </button>
                            ))}

                            {remoteLibraries && remoteLibraries.length > 0 && (
                                <>
                                    <div className="library-menu-item-header" style={{ marginTop: '8px' }}>リモートライブラリ</div>
                                    {remoteLibraries.map(lib => (
                                        <button
                                            key={lib.id}
                                            className={`library-menu-item library-option ${activeRemoteLibrary?.id === lib.id ? 'active' : ''}`}
                                            onClick={() => {
                                                onSwitchRemoteLibrary(lib)
                                                setIsLibraryMenuOpen(false)
                                            }}
                                        >
                                            <Icons.Cloud />
                                            <span>{lib.name}</span>
                                            {activeRemoteLibrary?.id === lib.id && <div className="active-dot" />}
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="sidebar-content">
                <div className="sidebar-section">
                    <div className="sidebar-nav">
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'all' && filterOptions.selectedFolders.length === 0 ? 'active' : ''}`}
                            onClick={() => setFilterType('all')}
                        >
                            <Icons.All />
                            <span>すべて</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'uncategorized' ? 'active' : ''}`}
                            onClick={() => setFilterType('uncategorized')}
                        >
                            <Icons.Uncategorized />
                            <span>未分類</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'untagged' ? 'active' : ''}`}
                            onClick={() => setFilterType('untagged')}
                        >
                            <Icons.Untagged />
                            <span>タグなし</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'recent' ? 'active' : ''}`}
                            onClick={() => setFilterType('recent')}
                        >
                            <Icons.Recent />
                            <span>最近使用</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'random' ? 'active' : ''}`}
                            onClick={() => setFilterType('random')}
                        >
                            <Icons.Random />
                            <span>ランダム</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'tag_manager' ? 'active' : ''}`}
                            onClick={() => setFilterType('tag_manager')}
                        >
                            <Icons.Tags />
                            <span>すべてのタグ</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${filterOptions.filterType === 'trash' ? 'active' : ''}`}
                            onClick={() => setFilterType('trash')}
                        >
                            <Icons.Trash />
                            <span>ゴミ箱</span>
                        </div>
                    </div>
                </div>

                <div className="sidebar-section">
                    <div className="flex justify-between items-center px-2 mb-1">
                        <div className="sidebar-section-header">
                            <span>フォルダー</span>
                            <button
                                className="sidebar-action-btn"
                                onClick={handleCreateClick}
                                title={(!hasActiveLibrary && !activeRemoteLibrary) ? "ライブラリが選択されていません" : "フォルダーを作成"}
                                disabled={!hasActiveLibrary && !activeRemoteLibrary}
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="sidebar-genre-list">
                        {folderTree.map(renderFolderNode)}
                    </div>
                </div>
            </div>

            <div className="sidebar-footer">
                <button className="sidebar-settings-btn" onClick={onOpenSettings} title="設定">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-0.44a2 2 0 0 0-2 2v0.18a2 2 0 0 1-1 1.73l-0.43 0.25a2 2 0 0 1-2 0l-0.15-0.08a2 2 0 0 0-2.73 0.73l-0.22 0.38a2 2 0 0 0 0.73 2.73l0.15 0.1a2 2 0 0 1 1 1.72v0.51a2 2 0 0 1-1 1.74l-0.15 0.09a2 2 0 0 0-0.73 2.73l-0.22-0.38a2 2 0 0 0-2.73-0.73l-0.15 0.08a2 2 0 0 1-2 0l-0.43-0.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>設定</span>
                </button>
            </div>

            {/* コンテキストメニュー */}
            {
                contextMenu && (
                    <div
                        className="context-menu"
                        style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
                    >
                        <div className="context-menu-item" onClick={() => handleContextAction('rename')}>
                            名前を変更
                        </div>
                        <div className="context-menu-item" onClick={() => handleContextAction('new-folder')}>
                            新しいフォルダーを作成
                        </div>
                        <div className="context-menu-item" onClick={() => handleContextAction('new-subfolder')}>
                            新しいサブフォルダーを作成
                        </div>
                        <div className="context-menu-divider"></div>
                        <div className="context-menu-item delete" onClick={() => handleContextAction('delete')}>
                            削除
                        </div>
                    </div>
                )
            }
            {
                folderToDelete !== null && (
                    <ConfirmModal
                        title="フォルダーを削除"
                        message="このフォルダーを削除してもよろしいですか？"
                        confirmLabel="削除"
                        cancelLabel="キャンセル"
                        isDestructive={true}
                        onConfirm={async () => {
                            const id = folderToDelete
                            setFolderToDelete(null)
                            await onDeleteFolder(id)
                        }}
                        onCancel={() => setFolderToDelete(null)}
                    />
                )
            }
        </div >
    )
}
