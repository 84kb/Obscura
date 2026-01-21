import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MediaFile, Tag, Folder, MediaComment } from '../types'
import './Inspector.css'
import { toMediaUrl } from '../utils/fileUrl'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { InspectorSection, InfoSectionContent, CommentSectionContent, PlaylistSectionContent } from './InspectorSections'
import { useNotification } from '../contexts/NotificationContext'

interface InspectorProps {
    media: MediaFile[]
    playingMedia?: MediaFile | null
    allTags: Tag[]
    allFolders: Folder[]
    onAddTag: (mediaId: number, tagId: number) => void
    onRemoveTag: (mediaId: number, tagId: number) => void
    onCreateTag?: (name: string) => Promise<Tag | null>
    onAddFolder: (mediaId: number, folderId: number) => void
    onRemoveFolder: (mediaId: number, folderId: number) => void
    onCreateFolder?: (name: string) => Promise<Folder | null>
    onPlay: (media: MediaFile) => void
    onAddTags?: (mediaIds: number[], tagIds: number[]) => void
    onMoveToTrash: (id: number) => void
    onMoveFilesToTrash: (ids: number[]) => void
    onRestore: (id: number) => void
    onRestoreFiles: (ids: number[]) => void
    onDeletePermanently: (id: number) => void
    onDeleteFilesPermanently: (ids: number[]) => void
    onClose: () => void
    onRenameMedia?: (id: number, newName: string) => void
    onUpdateRating?: (id: number, rating: number) => void
    onUpdateArtist?: (id: number, artist: string | null) => void
    onUpdateDescription?: (id: number, description: string | null) => void
    onUpdateUrl?: (id: number, url: string | null) => void
    totalStats: { totalCount: number; totalSize: number }
    currentContextMedia?: MediaFile[]
    enableRichText?: boolean
}

export function Inspector({
    media,
    playingMedia,
    allTags,
    allFolders,
    onAddTag,
    onRemoveTag,
    onCreateTag,
    onAddFolder,
    onRemoveFolder,
    onCreateFolder,
    onPlay,
    onAddTags,


    onRestore,
    onRestoreFiles,
    onDeletePermanently,
    onDeleteFilesPermanently,
    onClose,
    onRenameMedia,
    onUpdateRating,
    onUpdateArtist,
    onUpdateDescription,
    onUpdateUrl,
    totalStats,
    currentContextMedia,
    enableRichText
}: InspectorProps) {
    const { addNotification } = useNotification()

    // ユーザー要望により基本すべて展開状態に変更されていたが、DnD導入でセクション個別管理へ移行
    const [comments, setComments] = useState<MediaComment[]>([])

    // タグ・ジャンル追加用のモーダル状態
    const [showTagInput, setShowTagInput] = useState(false)
    const [showFolderInput, setShowFolderInput] = useState(false)
    const [tagInput, setTagInput] = useState('')
    const [folderInput, setFolderInput] = useState('')

    // ファイル名編集用
    const [fileName, setFileName] = useState('')
    const [hoverRating, setHoverRating] = useState<number | null>(null)
    const [currentRating, setCurrentRating] = useState(0)

    // 投稿者編集用
    const [artistName, setArtistName] = useState('')

    // URL編集用
    const [url, setUrl] = useState('')

    // 説明欄の展開状態
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

    // ポップオーバー位置
    const [tagPickerPos, setTagPickerPos] = useState<{ top: number; right: number } | null>(null)
    const [folderPickerPos, setFolderPickerPos] = useState<{ top: number; right: number } | null>(null)
    const tagButtonRef = useRef<HTMLButtonElement>(null)
    const folderButtonRef = useRef<HTMLButtonElement>(null)
    const inspectorRef = useRef<HTMLDivElement>(null)
    const tagPickerRef = useRef<HTMLDivElement>(null)
    const folderPickerRef = useRef<HTMLDivElement>(null)

    // テキストエリアの自動リサイズ用
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
        }
    }, [fileName])

    const getFileNameWithoutExt = (name: string) => {
        const lastDotIndex = name.lastIndexOf('.')
        if (lastDotIndex === -1) return name
        return name.substring(0, lastDotIndex)
    }

    const getExtension = (name: string) => {
        const lastDotIndex = name.lastIndexOf('.')
        if (lastDotIndex === -1) return ''
        return name.substring(lastDotIndex)
    }

    // mediaが変わったらファイル名と投稿者をリセット
    useEffect(() => {
        if (media.length === 1) {
            setFileName(media[0].title || getFileNameWithoutExt(media[0].file_name))
            setCurrentRating(media[0].rating || 0)
            setArtistName(media[0].artist || '')
            setUrl(media[0].url || '')
            // メディア変更時に説明欄を閉じる
            setIsDescriptionExpanded(false)
        } else if (media.length > 1) {
            setFileName('')
            // 共通の評価を確認
            const ratings = media.map(m => m.rating || 0)
            const allSameRating = ratings.every(r => r === ratings[0])
            setCurrentRating(allSameRating ? ratings[0] : 0)

            // 共通の投稿者を確認
            const artists = media.map(m => m.artist || '')
            const allSameArtist = artists.every(a => a === artists[0])
            setArtistName(allSameArtist ? artists[0] : '')

            // 共通のURLを確認
            const urls = media.map(m => m.url || '')
            const allSameUrl = urls.every(u => u === urls[0])
            setUrl(allSameUrl ? urls[0] : '')

            setIsDescriptionExpanded(false)
        }
    }, [media])

    // 共通のタグ・ジャンルを計算
    const commonTags = media.length === 0 ? [] : media.reduce((acc, m) => {
        if (acc === null) return m.tags || []
        return acc.filter(t => (m.tags || []).some(mt => mt.id === t.id))
    }, null as Tag[] | null) || []

    const commonFolders = media.length === 0 ? [] : media.reduce((acc, m) => {
        if (acc === null) return m.folders || []
        return acc.filter(f => (m.folders || []).some(mf => mf.id === f.id))
    }, null as Folder[] | null) || []

    // コメントの定期フェッチ (複数選択時は非表示か、最初のアイテムのみにするが、基本は単一時のみ)
    useEffect(() => {
        if (media.length === 1) {
            const fetchComments = () => {
                window.electronAPI.getComments(media[0].id).then(setComments).catch(console.error)
            }
            fetchComments()
            const interval = setInterval(fetchComments, 2000)
            return () => clearInterval(interval)
        } else {
            setComments([])
        }
    }, [media])

    // ESCキーでピッカーを閉じる
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showTagInput) {
                    setShowTagInput(false)
                    setTagInput('')
                }
                if (showFolderInput) {
                    setShowFolderInput(false)
                    setFolderInput('')
                }
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [showTagInput, showFolderInput])

    // 外側クリックでピッカーを閉じる
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            // 要素がDOMから削除されている場合（例：作成ボタンクリックで非表示になった場合）は無視
            if (!document.contains(target)) return

            // タグピッカーが開いている時
            if (showTagInput && tagPickerRef.current && !tagPickerRef.current.contains(target) &&
                tagButtonRef.current && !tagButtonRef.current.contains(target)) {
                setShowTagInput(false)
                setTagInput('')
            }
            // フォルダーピッカーが開いている時
            if (showFolderInput && folderPickerRef.current && !folderPickerRef.current.contains(target) &&
                folderButtonRef.current && !folderButtonRef.current.contains(target)) {
                setShowFolderInput(false)
                setFolderInput('')
            }
        }
        // Use mousedown instead of click to fix issue where dragging from inside to outside closes the menu
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showTagInput, showFolderInput])

    // ボタンクリック時にポップオーバー位置を計算
    const handleTagButtonClick = () => {
        // フォルダーピッカーが開いていたら閉じる（排他）
        if (showFolderInput) setShowFolderInput(false)

        if (!showTagInput && tagButtonRef.current) {
            const rect = tagButtonRef.current.getBoundingClientRect()
            let right = window.innerWidth - rect.left + 8

            // インスペクタの外側（左側）に配置し、少しだけ重ねる
            if (inspectorRef.current) {
                const inspectorRect = inspectorRef.current.getBoundingClientRect()
                // 画面右端からの距離 = (画面幅 - インスペクタ左端) - 重なり(8px)
                // 余白の中間あたりに配置
                right = (window.innerWidth - inspectorRect.left) - 8
            }
            setTagPickerPos({ top: rect.top, right })
        }
        setShowTagInput(!showTagInput)
    }

    const handleFolderButtonClick = () => {
        // タグピッカーが開いていたら閉じる（排他）
        if (showTagInput) setShowTagInput(false)

        if (!showFolderInput && folderButtonRef.current) {
            const rect = folderButtonRef.current.getBoundingClientRect()
            let right = window.innerWidth - rect.left + 8

            // インスペクタの外側（左側）に配置し、少しだけ重ねる
            if (inspectorRef.current) {
                const inspectorRect = inspectorRef.current.getBoundingClientRect()
                right = (window.innerWidth - inspectorRect.left) - 8
            }
            setFolderPickerPos({ top: rect.top, right })
        }
        setShowFolderInput(!showFolderInput)
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const formatTime = (seconds: number) => {
        if (!isFinite(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const createOrAddTags = async (inputStr: string) => {
        if (!inputStr.trim() || media.length === 0) return

        // カンマ、改行、全角カンマ、スペースなどで分割
        const inputs = inputStr.split(/[,，\n]/).map(s => s.trim()).filter(s => s.length > 0)

        // 重複除去
        const uniqueInputs = Array.from(new Set(inputs))

        const mediaIds = media.map(m => m.id)
        const tagIdsToAdd: number[] = []

        for (const input of uniqueInputs) {
            // [A,B] のような形式は A,B という1つのタグとして扱うのではなく、すでに分割済みと仮定
            // ただし、ユーザー要望で [AB] -> ABタグ作成 とあるので、角括弧を取り除く処理を入れる
            const cleanedInput = input.replace(/^\[|\]$/g, '')
            if (!cleanedInput) continue

            const existingTag = allTags.find(t => t.name.toLowerCase() === cleanedInput.toLowerCase())

            if (existingTag) {
                tagIdsToAdd.push(existingTag.id)
            } else if (onCreateTag) {
                const newTag = await onCreateTag(cleanedInput)
                if (newTag) {
                    tagIdsToAdd.push(newTag.id)
                }
            }
        }

        if (tagIdsToAdd.length > 0) {
            if (onAddTags) {
                onAddTags(mediaIds, tagIdsToAdd)
            } else {
                // Fallback: loop individually if batch prop not provided
                media.forEach(m => {
                    tagIdsToAdd.forEach(tagId => onAddTag(m.id, tagId))
                })
            }
        }
        setTagInput('')
    }

    const handleCreateTag = () => {
        createOrAddTags(tagInput)
    }

    const handleCreateFolder = async () => {
        if (folderInput.trim() && media.length > 0) {
            const trimmedInput = folderInput.trim()
            const existingFolder = allFolders.find(f => f.name.toLowerCase() === trimmedInput.toLowerCase())

            if (existingFolder) {
                media.forEach(m => {
                    const isAdded = m.folders?.some(mf => mf.id === existingFolder.id)
                    if (!isAdded) onAddFolder(m.id, existingFolder.id)
                })
            } else if (onCreateFolder) {
                const newFolder = await onCreateFolder(trimmedInput)
                if (newFolder) {
                    media.forEach(m => onAddFolder(m.id, newFolder.id))
                }
            }
            setFolderInput('')
        }
    }

    const handleTagInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleCreateTag()
        } else if (e.key === ',') {
            e.preventDefault()
            handleCreateTag()
        }
    }

    const handleTagInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pastedText = e.clipboardData.getData('text')
        createOrAddTags(pastedText)
    }

    const handleFolderInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleCreateFolder()
        }
    }

    const handleFileNameSave = () => {
        if (media.length === 1 && onRenameMedia && fileName.trim()) {
            const ext = getExtension(media[0].file_name)
            const newName = fileName.trim() + ext
            if (newName !== media[0].file_name) {
                onRenameMedia(media[0].id, newName)
            }
        }
    }

    const handleArtistSave = () => {
        if (media.length > 0 && onUpdateArtist) {
            const newArtist = artistName.trim() || null
            media.forEach(m => {
                if (newArtist !== (m.artist || null)) {
                    onUpdateArtist(m.id, newArtist)
                }
            })
        }
    }

    const handleUrlSave = () => {
        if (media.length > 0 && onUpdateUrl) {
            const newUrl = url.trim() || null
            media.forEach(m => {
                if (newUrl !== (m.url || null)) {
                    onUpdateUrl(m.id, newUrl)
                }
            })
        }
    }

    // --- DnD & Layout State ---
    const initialOrder = ['artist', 'description', 'url', 'tags', 'folders', 'info', 'comments', 'playlist']
    const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('inspector_layout_order_v2')
            if (saved) {
                let parsed = JSON.parse(saved) as string[]
                // Migration: genres -> folders
                if (parsed.includes('genres') && !parsed.includes('folders')) {
                    parsed = parsed.map(p => p === 'genres' ? 'folders' : p)
                }

                const missing = initialOrder.filter(item => !parsed.includes(item))
                if (missing.length > 0) {
                    return [...parsed, ...missing]
                }
                return parsed
            }
        } catch (e) { }
        return initialOrder
    })

    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem('inspector_collapsed_sections')
            if (saved) return JSON.parse(saved)
        } catch (e) { }
        return {} // default all open
    })

    useEffect(() => {
        localStorage.setItem('inspector_layout_order_v2', JSON.stringify(sectionOrder))
    }, [sectionOrder])

    useEffect(() => {
        localStorage.setItem('inspector_collapsed_sections', JSON.stringify(collapsedSections))
    }, [collapsedSections])

    const toggleSection = (id: string) => {
        setCollapsedSections(prev => ({
            ...prev,
            [id]: !prev[id]
        }))
    }

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (active.id !== over?.id) {
            setSectionOrder((items) => {
                const oldIndex = items.indexOf(active.id.toString())
                const newIndex = items.indexOf(over!.id.toString())
                return arrayMove(items, oldIndex, newIndex)
            })
        }
    }

    if (media.length === 0) {
        return (
            <div className="inspector slide-in-right">
                <div className="inspector-header">
                    <h2 className="inspector-title">ライブラリ統計</h2>
                    <div className="window-controls">
                        <button className="control-btn" title="常に手前に表示">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="17" x2="12" y2="22"></line>
                                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
                            </svg>
                        </button>
                        <button className="control-btn" onClick={() => window.electronAPI?.minimizeWindow()} title="最小化">
                            <svg viewBox="0 0 10 1" fill="currentColor" width="10" height="10">
                                <rect width="10" height="1" y="4.5" />
                            </svg>
                        </button>
                        <button className="control-btn" onClick={() => window.electronAPI?.maximizeWindow()} title="最大化">
                            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" width="10" height="10">
                                <rect x="0.5" y="0.5" width="9" height="9" />
                            </svg>
                        </button>
                        <button className="control-btn close-btn" onClick={() => window.electronAPI?.closeWindow()} title="閉じる">
                            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" width="10" height="10">
                                <path d="M1,1 L9,9 M9,1 L1,9" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="inspector-content">
                    <div className="stats-container">
                        <div className="info-group">
                            <label>総アイテム数</label>
                            <div className="info-value">{totalStats.totalCount} 件</div>
                        </div>
                        <div className="info-group">
                            <label>総ファイルサイズ</label>
                            <div className="info-value">{formatFileSize(totalStats.totalSize)}</div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="inspector slide-in-right" ref={inspectorRef}>
            <div className="inspector-header">
                <h2 className="inspector-title">インスペクタ</h2>
                <div className="window-controls">
                    <button className="control-btn" title="常に手前に表示">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="17" x2="12" y2="22"></line>
                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
                        </svg>
                    </button>
                    <button className="control-btn" onClick={() => window.electronAPI?.minimizeWindow()} title="最小化">
                        <svg viewBox="0 0 10 1" fill="currentColor" width="10" height="10">
                            <rect width="10" height="1" y="4.5" />
                        </svg>
                    </button>
                    <button className="control-btn" onClick={() => window.electronAPI?.maximizeWindow()} title="最大化">
                        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" width="10" height="10">
                            <rect x="0.5" y="0.5" width="9" height="9" />
                        </svg>
                    </button>
                    <button className="control-btn close-btn" onClick={() => window.electronAPI?.closeWindow()} title="閉じる">
                        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" width="10" height="10">
                            <path d="M1,1 L9,9 M9,1 L1,9" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="inspector-content">
                <div className="inspector-preview">
                    {media.length === 1 ? (
                        <div className="inspector-preview-container" onDoubleClick={() => onPlay(media[0])}>
                            {media[0].thumbnail_path ? (
                                <img src={toMediaUrl(media[0].thumbnail_path)} alt={media[0].file_name} />
                            ) : (
                                <div className="preview-placeholder">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                                        {media[0].file_type === 'video' ? (
                                            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4z" />
                                        ) : (
                                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                        )}
                                    </svg>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="multi-select-preview">
                            <div className="multi-select-stack">
                                <div className="stack-card card-3"></div>
                                <div className="stack-card card-2"></div>
                                <div className="stack-card card-1">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <line x1="9" y1="9" x2="15" y2="15" />
                                        <line x1="15" y1="9" x2="9" y2="15" />
                                    </svg>
                                </div>
                            </div>
                            <div className="multi-select-count">{media.length} 個のアイテムを選択中</div>
                        </div>
                    )}
                </div>

                {media.length === 1 && (
                    <div className="preview-info-header">
                        <textarea
                            ref={textareaRef}
                            value={fileName}
                            onChange={(e) => {
                                setFileName(e.target.value)
                                e.target.style.height = 'auto'
                                e.target.style.height = e.target.scrollHeight + 'px'
                            }}
                            onFocus={(e) => {
                                e.target.style.height = 'auto'
                                e.target.style.height = e.target.scrollHeight + 'px'
                            }}
                            onBlur={handleFileNameSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    (e.target as HTMLTextAreaElement).blur();
                                    handleFileNameSave();
                                }
                            }}
                            className="preview-filename-input"
                            rows={1}
                        />
                    </div>
                )}

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={sectionOrder}
                        strategy={verticalListSortingStrategy}
                    >
                        {sectionOrder.map(sectionId => {
                            const isOpen = !collapsedSections[sectionId]

                            switch (sectionId) {
                                case 'tags':
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="タグ"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <div className="tags-container">
                                                {commonTags.map(tag => (
                                                    <div key={tag.id} className="detail-tag">
                                                        <span>{tag.name}</span>
                                                        <button onClick={() => media.forEach(m => onRemoveTag(m.id, tag.id))}>×</button>
                                                    </div>
                                                ))}
                                                <button ref={tagButtonRef} className="add-tag-chip" onClick={handleTagButtonClick}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                </button>
                                            </div>
                                        </InspectorSection>
                                    )
                                case 'folders':
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="フォルダー"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <div className="tags-container">
                                                {commonFolders.map(folder => (
                                                    <div key={folder.id} className="detail-genre">
                                                        <span>{folder.name}</span>
                                                        <button onClick={() => media.forEach(m => onRemoveFolder(m.id, folder.id))}>×</button>
                                                    </div>
                                                ))}
                                                <button ref={folderButtonRef} className="add-tag-chip" onClick={handleFolderButtonClick}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                </button>
                                            </div>
                                        </InspectorSection>
                                    )
                                case 'artist':
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="投稿者"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <input
                                                type="text"
                                                className="artist-input"
                                                placeholder={media.length > 1 && !artistName ? "（複数の値が存在します）" : "投稿者名を入力..."}
                                                value={artistName}
                                                onChange={(e) => setArtistName(e.target.value)}
                                                onBlur={handleArtistSave}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        (e.target as HTMLInputElement).blur()
                                                    }
                                                }}
                                            />
                                        </InspectorSection>
                                    )
                                case 'description':
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="説明"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >

                                            {enableRichText && !isDescriptionExpanded ? (
                                                <div
                                                    className="description-preview-html artist-input"
                                                    style={{
                                                        minHeight: '60px',
                                                        lineHeight: '1.5',
                                                        width: '100%',
                                                        padding: '8px',
                                                        cursor: 'text',
                                                        overflowY: 'auto',
                                                        maxHeight: '200px',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-all'
                                                    }}
                                                    dangerouslySetInnerHTML={{ __html: media.length === 1 ? (media[0].description || '<span style="color:var(--text-muted)">説明を入力...</span>') : '' }}
                                                    onClick={(e) => {
                                                        const target = e.target as HTMLElement
                                                        if (target.tagName === 'A') {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            const href = (target as HTMLAnchorElement).href
                                                            if (href) {
                                                                window.electronAPI.openExternal(href)
                                                            }
                                                            return
                                                        }

                                                        if (media.length === 1) {
                                                            setIsDescriptionExpanded(true)
                                                            // フォーカスを移すための遅延
                                                            setTimeout(() => {
                                                                const el = document.querySelector('.inspector-content .artist-input.expanded') as HTMLTextAreaElement
                                                                if (el) {
                                                                    el.focus()
                                                                    el.style.height = 'auto'
                                                                    el.style.height = el.scrollHeight + 'px'
                                                                }
                                                            }, 0)
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <textarea
                                                    key={media.length === 1 ? media[0].id : 'multi'}
                                                    className={`artist-input ${isDescriptionExpanded ? 'expanded' : ''}`}
                                                    placeholder="説明を入力..."
                                                    rows={3}
                                                    autoFocus={isDescriptionExpanded && enableRichText}
                                                    style={{
                                                        resize: 'none',
                                                        minHeight: '60px',
                                                        fontFamily: 'inherit',
                                                        lineHeight: '1.5',
                                                        width: '100%',
                                                        boxSizing: 'border-box',
                                                        height: isDescriptionExpanded ? 'auto' : undefined,
                                                        overflow: isDescriptionExpanded ? 'hidden' : 'auto'
                                                    }}
                                                    value={media.length === 1 ? (media[0].description || '') : ''}
                                                    onClick={() => {
                                                        if (!isDescriptionExpanded) {
                                                            setIsDescriptionExpanded(true)
                                                            // 次のレンダリング後に高さを調整するためにsetTimeoutを使用
                                                            setTimeout(() => {
                                                                const el = document.activeElement as HTMLTextAreaElement
                                                                if (el && el.tagName === 'TEXTAREA') {
                                                                    el.style.height = 'auto'
                                                                    el.style.height = el.scrollHeight + 'px'
                                                                }
                                                            }, 0)
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (enableRichText) {
                                                            setIsDescriptionExpanded(false)
                                                        }
                                                    }}
                                                    onChange={(e) => {
                                                        const val = e.target.value
                                                        if (media.length === 1 && onUpdateDescription) {
                                                            onUpdateDescription(media[0].id, val)
                                                        }
                                                        // 高さ自動調整 (展開時のみ)
                                                        if (isDescriptionExpanded) {
                                                            e.target.style.height = 'auto'
                                                            e.target.style.height = e.target.scrollHeight + 'px'
                                                        }
                                                    }}
                                                    disabled={media.length !== 1}
                                                />
                                            )}
                                        </InspectorSection>
                                    )
                                case 'url':
                                    // URL Field
                                    if (media.length === 0) return null
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="URL"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <div className="url-input-container">
                                                <input
                                                    type="text"
                                                    className="url-input"
                                                    value={url}
                                                    onChange={(e) => setUrl(e.target.value)}
                                                    onBlur={handleUrlSave}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            (e.target as HTMLInputElement).blur();
                                                            handleUrlSave();
                                                        }
                                                    }}
                                                    placeholder="URLを入力..."
                                                />
                                            </div>
                                            <div className="url-actions">
                                                <button
                                                    className="url-action-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.electronAPI.copyToClipboard(url)
                                                        addNotification({
                                                            type: 'success',
                                                            title: 'コピーしました',
                                                            message: 'URLをクリップボードにコピーしました',
                                                            duration: 2000
                                                        })
                                                    }}
                                                    title="URLをコピー"
                                                    disabled={!url}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                    コピー
                                                </button>
                                                <button
                                                    className="url-action-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (url) window.electronAPI.openExternal(url)
                                                    }}
                                                    title="ブラウザで開く"
                                                    disabled={!url}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                    開く
                                                </button>
                                            </div>
                                        </InspectorSection>
                                    )
                                case 'info':
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="インフォメーション"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <InfoSectionContent
                                                media={media}
                                                hoverRating={hoverRating}
                                                currentRating={currentRating}
                                                setHoverRating={setHoverRating}
                                                setCurrentRating={setCurrentRating}
                                                onUpdateRating={onUpdateRating}
                                                formatFileSize={formatFileSize}
                                                formatTime={formatTime}
                                                formatDate={formatDate}
                                            />
                                        </InspectorSection>
                                    )
                                case 'comments':
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title={`コメント (${comments.length})`}
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <CommentSectionContent comments={comments} formatTime={formatTime} />
                                        </InspectorSection>
                                    )
                                case 'playlist':
                                    // Only show if available
                                    if (!playingMedia || !currentContextMedia) return null
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="プレイリスト"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <PlaylistSectionContent
                                                currentContextMedia={currentContextMedia}
                                                playingMedia={playingMedia}
                                                onPlay={onPlay}
                                                toMediaUrl={toMediaUrl}
                                                formatTime={formatTime}
                                                formatFileSize={formatFileSize}
                                            />
                                        </InspectorSection>
                                    )
                                default:
                                    return null
                            }
                        })}
                    </SortableContext >
                </DndContext >

                {/* Modals/Popovers from original code... */}
                {
                    showTagInput && tagPickerPos && createPortal(
                        // ... existing tag picker code ...
                        <div
                            ref={tagPickerRef}
                            className="picker-popover-fixed"
                            style={{ top: tagPickerPos.top, right: tagPickerPos.right }}
                        >
                            <div className="picker-popover-header">
                                <input
                                    type="text"
                                    placeholder="タグを検索..."
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleTagInputKeyDown}
                                    onPaste={handleTagInputPaste}
                                    className="picker-popover-search"
                                    autoFocus
                                />
                            </div>
                            <div className="picker-popover-list">
                                {allTags.filter(t => t.name.toLowerCase().includes(tagInput.toLowerCase())).map(tag => {
                                    const isAdded = commonTags.some(ct => ct.id === tag.id)
                                    const isPartial = !isAdded && media.some(m => m.tags?.some(mt => mt.id === tag.id))

                                    return (
                                        <div
                                            key={tag.id}
                                            className={`picker-popover-item ${isAdded ? 'added' : ''} ${isPartial ? 'partial' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (isAdded) {
                                                    media.forEach(m => onRemoveTag(m.id, tag.id))
                                                } else {
                                                    media.forEach(m => onAddTag(m.id, tag.id))
                                                }
                                            }}
                                        >
                                            <span className="picker-checkbox">
                                                {isAdded && (
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                )}
                                                {isPartial && (
                                                    <div className="partial-mark"></div>
                                                )}
                                            </span>
                                            <span>{tag.name}</span>
                                        </div>
                                    )
                                })}
                                {tagInput.trim() && !allTags.some(t => t.name.toLowerCase() === tagInput.trim().toLowerCase()) && (
                                    <button className="picker-popover-create-btn" onClick={handleCreateTag}>
                                        <span className="create-plus">+</span>
                                        <span className="create-label">作成</span>
                                        <span className="create-name">"{tagInput.trim()}"</span>
                                    </button>
                                )}
                                {tagInput.trim() === '' && allTags.length === 0 && (
                                    <div className="picker-popover-empty">タグがありません</div>
                                )}
                            </div>
                            <div className="picker-popover-footer">
                                <button className="picker-close-btn" onClick={() => { setShowTagInput(false); setTagInput(''); }}>
                                    閉じる ESC
                                </button>
                            </div>
                        </div>,
                        document.body
                    )
                }

                {
                    showFolderInput && folderPickerPos && createPortal(
                        <div
                            ref={folderPickerRef}
                            className="picker-popover-fixed"
                            style={{ top: folderPickerPos.top, right: folderPickerPos.right }}
                        >
                            <div className="picker-popover-header">
                                <input
                                    type="text"
                                    placeholder="フォルダーを検索..."
                                    value={folderInput}
                                    onChange={(e) => setFolderInput(e.target.value)}
                                    onKeyDown={handleFolderInputKeyDown}
                                    className="picker-popover-search"
                                    autoFocus
                                />
                            </div>
                            <div className="picker-popover-list">
                                {allFolders.filter(f => f.name.toLowerCase().includes(folderInput.toLowerCase())).map(folder => {
                                    const isAdded = commonFolders.some(cf => cf.id === folder.id)
                                    const isPartial = !isAdded && media.some(m => m.folders?.some(mf => mf.id === folder.id))

                                    return (
                                        <div
                                            key={folder.id}
                                            className={`picker-popover-item ${isAdded ? 'added' : ''} ${isPartial ? 'partial' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (isAdded) {
                                                    media.forEach(m => onRemoveFolder(m.id, folder.id))
                                                } else {
                                                    media.forEach(m => onAddFolder(m.id, folder.id))
                                                }
                                            }}
                                        >
                                            <span className="picker-checkbox">
                                                {isAdded && (
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                )}
                                                {isPartial && (
                                                    <div className="partial-mark"></div>
                                                )}
                                            </span>
                                            <span>{folder.name}</span>
                                        </div>
                                    )
                                })}
                                {folderInput.trim() && !allFolders.some(f => f.name.toLowerCase() === folderInput.trim().toLowerCase()) && (
                                    <button className="picker-popover-create-btn" onClick={handleCreateFolder}>
                                        <span className="create-plus">+</span>
                                        <span className="create-label">作成</span>
                                        <span className="create-name">"{folderInput.trim()}"</span>
                                    </button>
                                )}
                                {folderInput.trim() === '' && allFolders.length === 0 && (
                                    <div className="picker-popover-empty">フォルダーがありません</div>
                                )}
                            </div>
                            <div className="picker-popover-footer">
                                <button className="picker-close-btn" onClick={() => { setShowFolderInput(false); setFolderInput(''); }}>
                                    閉じる ESC
                                </button>
                            </div>
                        </div>,
                        document.body
                    )
                }

                {
                    (media.length === 1 && media[0].is_deleted) && (
                        <div className="actions-section">
                            <div className="trash-actions">
                                <button className="btn btn-primary btn-full btn-small" onClick={() => onRestore(media[0].id)}>元に戻す</button>
                                <button
                                    className="btn btn-danger btn-full btn-small"
                                    onClick={() => {
                                        if (confirm('ファイルをデバイスから完全に削除しますか？\nこの操作は取り消せません。')) {
                                            onDeletePermanently(media[0].id)
                                            onClose()
                                        }
                                    }}
                                >
                                    完全に削除
                                </button>
                            </div>
                        </div>
                    )
                }
                {
                    (media.length > 1 && media.every(m => m.is_deleted)) && (
                        <div className="actions-section">
                            <div className="trash-actions">
                                <button className="btn btn-primary btn-full btn-small" onClick={() => onRestoreFiles(media.map(m => m.id))}>すべて元に戻す</button>
                                <button
                                    className="btn btn-danger btn-full btn-small"
                                    onClick={() => {
                                        if (confirm(`${media.length}個のファイルをデバイスから完全に削除しますか？\nこの操作は取り消せません。`)) {
                                            onDeleteFilesPermanently(media.map(m => m.id))
                                            onClose()
                                        }
                                    }}
                                >
                                    すべて完全に削除
                                </button>
                            </div>
                        </div>
                    )
                }
            </div >
        </div >
    )
}
