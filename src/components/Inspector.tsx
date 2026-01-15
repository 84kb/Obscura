import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MediaFile, Tag, Genre, MediaComment } from '../types'
import './Inspector.css'
import { toMediaUrl } from '../utils/fileUrl'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { InspectorSection, InfoSectionContent, CommentSectionContent, PlaylistSectionContent } from './InspectorSections'

interface InspectorProps {
    media: MediaFile[]
    playingMedia?: MediaFile | null
    allTags: Tag[]
    allGenres: Genre[]
    onAddTag: (mediaId: number, tagId: number) => void
    onRemoveTag: (mediaId: number, tagId: number) => void
    onCreateTag?: (name: string) => Promise<Tag | null>
    onAddGenre: (mediaId: number, genreId: number) => void
    onRemoveGenre: (mediaId: number, genreId: number) => void
    onCreateGenre?: (name: string) => Promise<Genre | null>
    onPlay: (media: MediaFile) => void
    onMoveToTrash: (id: number) => void
    onRestore: (id: number) => void
    onDeletePermanently: (id: number) => void
    onClose: () => void
    onRenameMedia?: (id: number, newName: string) => void
    onUpdateRating?: (id: number, rating: number) => void
    onUpdateArtist?: (id: number, artist: string | null) => void
    onUpdateDescription?: (id: number, description: string | null) => void
    totalStats: { totalCount: number; totalSize: number }
    currentContextMedia?: MediaFile[]
}

export function Inspector({
    media,
    playingMedia,
    allTags,
    allGenres,
    onAddTag,
    onRemoveTag,
    onCreateTag,
    onAddGenre,
    onRemoveGenre,
    onCreateGenre,
    onPlay,
    onRestore,
    onDeletePermanently,
    onClose,
    onRenameMedia,
    onUpdateRating,
    onUpdateArtist,
    onUpdateDescription,
    totalStats,
    currentContextMedia
}: InspectorProps) {
    // ユーザー要望により基本すべて展開状態に変更されていたが、DnD導入でセクション個別管理へ移行
    const [comments, setComments] = useState<MediaComment[]>([])

    // タグ・ジャンル追加用のモーダル状態
    const [showTagInput, setShowTagInput] = useState(false)
    const [showGenreInput, setShowGenreInput] = useState(false)
    const [tagInput, setTagInput] = useState('')
    const [genreInput, setGenreInput] = useState('')

    // ファイル名編集用
    const [fileName, setFileName] = useState('')
    const [hoverRating, setHoverRating] = useState<number | null>(null)
    const [currentRating, setCurrentRating] = useState(0)

    // 投稿者編集用
    const [artistName, setArtistName] = useState('')

    // ポップオーバー位置
    const [tagPickerPos, setTagPickerPos] = useState<{ top: number; right: number } | null>(null)
    const [genrePickerPos, setGenrePickerPos] = useState<{ top: number; right: number } | null>(null)
    const tagButtonRef = useRef<HTMLButtonElement>(null)
    const genreButtonRef = useRef<HTMLButtonElement>(null)
    const tagPickerRef = useRef<HTMLDivElement>(null)
    const genrePickerRef = useRef<HTMLDivElement>(null)

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
            setFileName(getFileNameWithoutExt(media[0].file_name))
            setCurrentRating(media[0].rating || 0)
            setArtistName(media[0].artist || '')
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
        }
    }, [media])

    // 共通のタグ・ジャンルを計算
    const commonTags = media.length === 0 ? [] : media.reduce((acc, m) => {
        if (acc === null) return m.tags || []
        return acc.filter(t => (m.tags || []).some(mt => mt.id === t.id))
    }, null as Tag[] | null) || []

    const commonGenres = media.length === 0 ? [] : media.reduce((acc, m) => {
        if (acc === null) return m.genres || []
        return acc.filter(g => (m.genres || []).some(mg => mg.id === g.id))
    }, null as Genre[] | null) || []

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
                if (showGenreInput) {
                    setShowGenreInput(false)
                    setGenreInput('')
                }
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [showTagInput, showGenreInput])

    // 外側クリックでピッカーを閉じる
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            // タグピッカーが開いている時
            if (showTagInput && tagPickerRef.current && !tagPickerRef.current.contains(target) &&
                tagButtonRef.current && !tagButtonRef.current.contains(target)) {
                setShowTagInput(false)
                setTagInput('')
            }
            // フォルダーピッカーが開いている時
            if (showGenreInput && genrePickerRef.current && !genrePickerRef.current.contains(target) &&
                genreButtonRef.current && !genreButtonRef.current.contains(target)) {
                setShowGenreInput(false)
                setGenreInput('')
            }
        }
        // Use click instead of mousedown to allow item clicks to process first
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [showTagInput, showGenreInput])

    // ボタンクリック時にポップオーバー位置を計算
    const handleTagButtonClick = () => {
        // フォルダーピッカーが開いていたら閉じる（排他）
        if (showGenreInput) setShowGenreInput(false)

        if (!showTagInput && tagButtonRef.current) {
            const rect = tagButtonRef.current.getBoundingClientRect()
            setTagPickerPos({ top: rect.top, right: window.innerWidth - rect.left + 8 })
        }
        setShowTagInput(!showTagInput)
    }

    const handleGenreButtonClick = () => {
        // タグピッカーが開いていたら閉じる（排他）
        if (showTagInput) setShowTagInput(false)

        if (!showGenreInput && genreButtonRef.current) {
            const rect = genreButtonRef.current.getBoundingClientRect()
            setGenrePickerPos({ top: rect.top, right: window.innerWidth - rect.left + 8 })
        }
        setShowGenreInput(!showGenreInput)
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

    const handleCreateTag = async () => {
        if (tagInput.trim() && media.length > 0) {
            const trimmedInput = tagInput.trim()
            const existingTag = allTags.find(t => t.name.toLowerCase() === trimmedInput.toLowerCase())

            if (existingTag) {
                media.forEach(m => {
                    const isAdded = m.tags?.some(mt => mt.id === existingTag.id)
                    if (!isAdded) onAddTag(m.id, existingTag.id)
                })
            } else if (onCreateTag) {
                const newTag = await onCreateTag(trimmedInput)
                if (newTag) {
                    media.forEach(m => onAddTag(m.id, newTag.id))
                }
            }
            setTagInput('')
        }
    }

    const handleCreateGenre = async () => {
        if (genreInput.trim() && media.length > 0) {
            const trimmedInput = genreInput.trim()
            const existingGenre = allGenres.find(g => g.name.toLowerCase() === trimmedInput.toLowerCase())

            if (existingGenre) {
                media.forEach(m => {
                    const isAdded = m.genres?.some(mg => mg.id === existingGenre.id)
                    if (!isAdded) onAddGenre(m.id, existingGenre.id)
                })
            } else if (onCreateGenre) {
                const newGenre = await onCreateGenre(trimmedInput)
                if (newGenre) {
                    media.forEach(m => onAddGenre(m.id, newGenre.id))
                }
            }
            setGenreInput('')
        }
    }

    const handleTagInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleCreateTag()
        }
    }

    const handleGenreInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleCreateGenre()
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

    // --- DnD & Layout State ---
    const initialOrder = ['artist', 'description', 'tags', 'genres', 'info', 'comments', 'playlist']
    const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('inspector_layout_order_v2')
            if (saved) {
                const parsed = JSON.parse(saved) as string[]
                // initialOrderに含まれていて、保存されたリストに含まれていない項目を追加
                const missing = initialOrder.filter(item => !parsed.includes(item))
                if (missing.length > 0) {
                    // artistの後にdescriptionを追加したいなどの要望があるが、
                    // 既存の並び順を壊さないように、デフォルト位置（配列の特定位置）に挿入するのは難しい。
                    // 単純に不足分を末尾に追加、または初期順序に基づいて再構築する

                    // 戦略: 初期順序を維持しつつ、保存された順序を優先する...は複雑。
                    // シンプルに: 保存された配列にないものは、initialOrderの登場順で、とりあえずartistの後ろあたり（もしあれば）あるいは末尾に追加する。

                    // 今回はシンプルに末尾に追加ではなく、
                    // もし 'description' が足りないなら 'artist' の後ろに入れる、などの配慮をしたいが、
                    // 汎用的に「不足しているものは initialOrder の順序で末尾に追加」とする。
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
                distance: 5 // 5px movement required to start drag, prevents accidental drags on click
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

    // --- Render Helpers ---



    // ... logic for handlers ...

    // --- Sections Map ---
    // We render content conditionally.

    // Need imports
    // import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
    // import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
    // import { InspectorSection, InfoSectionContent, CommentSectionContent, PlaylistSectionContent } from './InspectorSections'


    if (media.length === 0) {
        // ... empty state (same as before) ...
        // (Copied existing empty state logic below in full implementation)
        const displayMedia = playingMedia
        if (displayMedia) {
            // プレイヤー再生中のみ表示する場合のロジック（オプション）
            // ここでは一旦統計にするか、playingMediaがあればそれを表示するように戻す
            // ただし App.tsx で media={selectedMediaIds...} としているので、空なら統計。
        }
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
        <div className="inspector slide-in-right">
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
                {/* Preview Section (Static) */}
                <div className="inspector-preview">
                    {media.length === 1 ? (
                        <div className="preview-container" onDoubleClick={() => onPlay(media[0])}>
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

                {/* Draggable Sections */}
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
                                case 'genres':
                                    return (
                                        <InspectorSection
                                            key={sectionId}
                                            id={sectionId}
                                            title="フォルダー"
                                            isOpen={isOpen}
                                            onToggle={() => toggleSection(sectionId)}
                                        >
                                            <div className="tags-container">
                                                {commonGenres.map(genre => (
                                                    <div key={genre.id} className="detail-genre">
                                                        <span>{genre.name}</span>
                                                        <button onClick={() => media.forEach(m => onRemoveGenre(m.id, genre.id))}>×</button>
                                                    </div>
                                                ))}
                                                <button ref={genreButtonRef} className="add-tag-chip" onClick={handleGenreButtonClick}>
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
                                            <textarea
                                                className="artist-input"
                                                placeholder="説明を入力..."
                                                rows={3}
                                                style={{
                                                    resize: 'none',
                                                    minHeight: '60px',
                                                    fontFamily: 'inherit',
                                                    lineHeight: '1.5',
                                                    width: '100%',
                                                    boxSizing: 'border-box'
                                                }}
                                                value={media.length === 1 ? (media[0].description || '') : ''}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    if (media.length === 1 && onUpdateDescription) {
                                                        onUpdateDescription(media[0].id, val)
                                                    }
                                                    // 高さ自動調整
                                                    e.target.style.height = 'auto'
                                                    e.target.style.height = e.target.scrollHeight + 'px'
                                                }}
                                                onFocus={(e) => {
                                                    e.target.style.height = 'auto'
                                                    e.target.style.height = e.target.scrollHeight + 'px'
                                                }}
                                                disabled={media.length !== 1}
                                            />
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
                    </SortableContext>
                </DndContext>

                {/* Modals/Popovers from original code... */}
                {showTagInput && tagPickerPos && createPortal(
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
                )}

                {showGenreInput && genrePickerPos && createPortal(
                    // ... existing genre picker code ...
                    <div
                        ref={genrePickerRef}
                        className="picker-popover-fixed"
                        style={{ top: genrePickerPos.top, right: genrePickerPos.right }}
                    >
                        <div className="picker-popover-header">
                            <input
                                type="text"
                                placeholder="フォルダーを検索..."
                                value={genreInput}
                                onChange={(e) => setGenreInput(e.target.value)}
                                onKeyDown={handleGenreInputKeyDown}
                                className="picker-popover-search"
                                autoFocus
                            />
                        </div>
                        <div className="picker-popover-list">
                            {allGenres.filter(g => g.name.toLowerCase().includes(genreInput.toLowerCase())).map(genre => {
                                const isAdded = commonGenres.some(cg => cg.id === genre.id)
                                const isPartial = !isAdded && media.some(m => m.genres?.some(mg => mg.id === genre.id))

                                return (
                                    <div
                                        key={genre.id}
                                        className={`picker-popover-item ${isAdded ? 'added' : ''} ${isPartial ? 'partial' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (isAdded) {
                                                media.forEach(m => onRemoveGenre(m.id, genre.id))
                                            } else {
                                                media.forEach(m => onAddGenre(m.id, genre.id))
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
                                        <span>{genre.name}</span>
                                    </div>
                                )
                            })}
                            {genreInput.trim() && !allGenres.some(g => g.name.toLowerCase() === genreInput.trim().toLowerCase()) && (
                                <button className="picker-popover-create-btn" onClick={handleCreateGenre}>
                                    <span className="create-plus">+</span>
                                    <span className="create-label">作成</span>
                                    <span className="create-name">"{genreInput.trim()}"</span>
                                </button>
                            )}
                            {genreInput.trim() === '' && allGenres.length === 0 && (
                                <div className="picker-popover-empty">フォルダーがありません</div>
                            )}
                        </div>
                        <div className="picker-popover-footer">
                            <button className="picker-close-btn" onClick={() => { setShowGenreInput(false); setGenreInput(''); }}>
                                閉じる ESC
                            </button>
                        </div>
                    </div>,
                    document.body
                )}

                {(media.length === 1 && media[0].is_deleted) && (
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
                )}
                {(media.length > 1 && media.every(m => m.is_deleted)) && (
                    <div className="actions-section">
                        <div className="trash-actions">
                            <button className="btn btn-primary btn-full btn-small" onClick={() => media.forEach(m => onRestore(m.id))}>すべて元に戻す</button>
                            <button
                                className="btn btn-danger btn-full btn-small"
                                onClick={() => {
                                    if (confirm(`${media.length}個のファイルをデバイスから完全に削除しますか？\nこの操作は取り消せません。`)) {
                                        media.forEach(m => onDeletePermanently(m.id))
                                        onClose()
                                    }
                                }}
                            >
                                すべて完全に削除
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >
    )
}
