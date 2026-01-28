import { MediaFile, MediaComment } from '../types'
import React from 'react'
import { useSortable } from '@dnd-kit/sortable'

// --- Types ---
export interface InspectorSectionProps {
    id: string
    title: string
    isOpen: boolean
    onToggle: () => void
    children: React.ReactNode
    extraHeaderContent?: React.ReactNode
}

// --- Wrapper Component for DnD & Collapse ---
export function InspectorSection({
    id,
    title,
    isOpen,
    onToggle,
    children,
    extraHeaderContent
}: InspectorSectionProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id })

    // スケール変換を無効にし、translateのみを使用することでアスペクト比の変化を防ぐ
    const style = {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 'auto',
        position: 'relative' as const,
    }

    return (
        <div ref={setNodeRef} style={style} className="inspector-section sortable-section">
            <div
                className="section-header"
                {...attributes}
                {...listeners}
                onClick={() => onToggle()}
            >
                <h3>{title}</h3>
                {extraHeaderContent}
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', marginLeft: 'auto', opacity: 0.6 }}
                >
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
            </div>
            {isOpen && (
                <div className="section-content">
                    {children}
                </div>
            )}
        </div>
    )
}

// --- Content Components (Extracted from Inspector.tsx) ---

export const InfoSectionContent = ({
    media,
    hoverRating,
    currentRating,
    setHoverRating,
    setCurrentRating,
    onUpdateRating,
    formatFileSize,
    formatTime,
    formatDate
}: {
    media: MediaFile[],
    hoverRating: number | null,
    currentRating: number,
    setHoverRating: (r: number | null) => void,
    setCurrentRating: (r: number) => void,
    onUpdateRating?: (id: number, rating: number) => void,
    formatFileSize: (b: number) => string,
    formatTime: (s: number) => string,
    formatDate: (d: string) => string
}) => {
    return (
        <div className="info-section">
            <div className="info-row">
                <span className="info-label">評価</span>
                <div className="inspector-rating-stars" onMouseLeave={() => setHoverRating(null)}>
                    {[1, 2, 3, 4, 5].map(star => (
                        <span
                            key={star}
                            className={`star ${(hoverRating !== null ? hoverRating : currentRating) >= star ? 'filled' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setCurrentRating(star)
                                if (onUpdateRating) {
                                    media.forEach(m => onUpdateRating(m.id, star))
                                }
                            }}
                            onMouseEnter={() => setHoverRating(star)}
                        >★</span>
                    ))}
                </div>
            </div>
            {media.length === 1 && (
                <>
                    {(media[0].width && media[0].height) ? (
                        <div className="info-row">
                            <span className="info-label">解像度</span>
                            <span className="info-value-inline">{media[0].width} x {media[0].height}</span>
                        </div>
                    ) : null}
                    <div className="info-row">
                        <span className="info-label">再生時間</span>
                        <span className="info-value-inline">{media[0].duration ? formatTime(media[0].duration) : '-'}</span>
                    </div>
                </>
            )}
            <div className="info-row">
                <span className="info-label">ファイルサイズ</span>
                <span className="info-value-inline">
                    {media.length === 1
                        ? formatFileSize(media[0].file_size)
                        : `${formatFileSize(media.reduce((acc, m) => acc + m.file_size, 0))} (合計)`}
                </span>
            </div>
            {media.length === 1 && (
                <>
                    <div className="info-row">
                        <span className="info-label">追加日</span>
                        <span className="info-value-inline">{formatDate(media[0].created_at)}</span>
                    </div>
                    {media[0].created_date && (
                        <div className="info-row">
                            <span className="info-label">作成日</span>
                            <span className="info-value-inline">{formatDate(media[0].created_date)}</span>
                        </div>
                    )}
                    {media[0].modified_date && (
                        <div className="info-row">
                            <span className="info-label">変更日</span>
                            <span className="info-value-inline">{formatDate(media[0].modified_date)}</span>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export const CommentSectionContent = ({
    comments,
    formatTime
}: {
    comments: MediaComment[],
    formatTime: (s: number) => string
}) => {
    return (
        <div className="comments-list">
            {comments.length === 0 ? (
                <div className="no-comments">コメントはありません</div>
            ) : (
                comments.map(c => (
                    <div key={c.id} className="comment-item">
                        <div className="comment-meta">
                            <span className="comment-time">{formatTime(c.time)}</span>
                            {c.nickname && <span className="comment-nickname">{c.nickname}</span>}
                        </div>
                        <div className="comment-text">{c.text}</div>
                    </div>
                ))
            )}
        </div>
    )
}


export const PlaylistSectionContent = ({
    currentContextMedia,
    playingMedia,
    onPlay,
    toMediaUrl,
    formatTime,
    formatFileSize
}: {
    currentContextMedia: MediaFile[],
    playingMedia: MediaFile,
    onPlay: (m: MediaFile) => void,
    toMediaUrl: (path: string) => string,
    formatTime: (s: number) => string,
    formatFileSize: (b: number) => string
}) => {

    const currentIndex = currentContextMedia.findIndex(m => m.id === playingMedia.id)
    if (currentIndex === -1) return null

    const start = Math.max(0, currentIndex - 1)
    const end = Math.min(currentContextMedia.length, currentIndex + 11) // Current + 10 next
    const playlistItems = currentContextMedia.slice(start, end)

    return (
        <div className="playlist-container">
            {playlistItems.map((item) => {
                const isPlaying = item.id === playingMedia.id
                return (
                    <div
                        key={item.id}
                        className={`playlist-item ${isPlaying ? 'active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation()
                            onPlay(item)
                        }}
                    >
                        <div className="playlist-thumbnail">
                            {item.thumbnail_path ? (
                                <img src={toMediaUrl(item.thumbnail_path)} alt={item.file_name} />
                            ) : (
                                <div className="playlist-placeholder">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                    </svg>
                                </div>
                            )}
                            {(item.duration ?? 0) > 0 && (
                                <div className="playlist-duration">{formatTime(item.duration ?? 0)}</div>
                            )}
                        </div>
                        <div className="playlist-info">
                            <div className="playlist-title" title={item.file_name}>{item.file_name}</div>
                            <div className="playlist-meta">
                                {formatFileSize(item.file_size)}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export const RelationSectionContent = ({
    media,
    toMediaUrl,
    onUpdateRelation,
    onSelectMedia,
    onOpenPicker
}: {
    media: MediaFile[],
    toMediaUrl: (path: string) => string,
    onUpdateRelation: (childId: number, parentId: number | null) => void,
    onSelectMedia: (m: MediaFile) => void,
    onOpenPicker: (rect: DOMRect) => void
}) => {
    // Only support single selection for editing relationships for now
    if (media.length !== 1) return <div className="no-comments">複数選択時は編集できません</div>

    const item = media[0]
    const hasParent = !!item.parent
    const parentCount = hasParent ? 1 : 0
    const childrenCount = item.children?.length || 0

    const handleOpenPicker = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onOpenPicker(rect)
    }

    return (
        <div className="relation-section">
            <button className="relation-register-btn" onClick={handleOpenPicker}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                    <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
                親子登録
            </button>

            {/* Parent Work */}
            <div className="relation-group-header">
                親作品 ({parentCount})
            </div>
            <div className="relation-group">
                {hasParent ? (
                    <div className="relation-item-card">
                        <div className="relation-thumbnail" onClick={() => onSelectMedia(item.parent!)}>
                            {item.parent!.thumbnail_path ? (
                                <img src={toMediaUrl(item.parent!.thumbnail_path)} alt="" />
                            ) : (
                                <div className="relation-placeholder">No Img</div>
                            )}
                        </div>
                        <div className="relation-info" onClick={() => onSelectMedia(item.parent!)}>
                            <div className="relation-title" title={item.parent!.file_name}>{item.parent!.title || item.parent!.file_name}</div>
                        </div>
                        <button className="relation-remove-btn" onClick={(e) => {
                            e.stopPropagation()
                            onUpdateRelation(item.id, null)
                        }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                ) : (
                    <div className="no-relation-placeholder">親作品はありません</div>
                )}
            </div>

            {/* Children Works */}
            <div className="relation-group-header">
                子作品 ({childrenCount})
            </div>
            <div className="relation-group">
                <div className="children-list">
                    {item.children?.map(child => (
                        <div key={child.id} className="relation-item-card small">
                            <div className="relation-thumbnail" onClick={() => onSelectMedia(child)}>
                                {child.thumbnail_path ? (
                                    <img src={toMediaUrl(child.thumbnail_path)} alt="" />
                                ) : (
                                    <div className="relation-placeholder"></div>
                                )}
                            </div>
                            <div className="relation-info" onClick={() => onSelectMedia(child)}>
                                <div className="relation-title" title={child.file_name}>{child.title || child.file_name}</div>
                            </div>
                            <button className="relation-remove-btn" onClick={(e) => {
                                e.stopPropagation()
                                onUpdateRelation(child.id, null)
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    ))}
                    {(!item.children || item.children.length === 0) && <div className="no-relation-placeholder">子作品はありません</div>}
                </div>
            </div>
        </div>
    )
}

const DefaultSearchTargets = {
    name: true,
    folder: true,
    artist: true,
    tags: true,
    description: true
}

type SearchTargets = typeof DefaultSearchTargets

export const MediaPicker = ({
    onSelect,
    onClose,
    onSearch,
    toMediaUrl,
    style
}: {
    onSelect: (media: any, type: 'parent' | 'child') => void
    onClose: () => void
    onSearch: (query: string, targets: SearchTargets) => Promise<any[]>
    toMediaUrl: (path: string) => string
    style?: React.CSSProperties
}) => {
    const [query, setQuery] = React.useState('')
    const [results, setResults] = React.useState<any[]>([])
    const [loading, setLoading] = React.useState(false)
    const [searchTargets, setSearchTargets] = React.useState<SearchTargets>(DefaultSearchTargets)
    const [isOptionsOpen, setIsOptionsOpen] = React.useState(false)
    const pickerRef = React.useRef<HTMLDivElement>(null) // Kept pickerRef for the main popover div

    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    React.useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.trim()) {
                setLoading(true)
                try {
                    const res = await onSearch(query, searchTargets)
                    setResults(res)
                } finally {
                    setLoading(false)
                }
            } else {
                setResults([])
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [query, onSearch, searchTargets])

    return (
        <div className="media-picker-popover" ref={pickerRef} style={style}>
            <div className="media-picker-header">
                <div className="media-picker-search">
                    <button
                        className={`media-picker-search-btn ${isOptionsOpen ? 'active' : ''}`}
                        onClick={() => setIsOptionsOpen(!isOptionsOpen)}
                        title="検索範囲"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <input
                        type="text"
                        placeholder="動画を検索..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                {isOptionsOpen && (
                    <div className="picker-search-options-dropdown">
                        <div className="picker-search-options-header">検索範囲</div>
                        {[
                            { key: 'name', label: '名前' },
                            { key: 'folder', label: 'フォルダ' },
                            { key: 'artist', label: '投稿者' },
                            { key: 'tags', label: 'タグ' },
                            { key: 'description', label: '説明' },
                        ].map((opt) => (
                            <div
                                key={opt.key}
                                className={`picker-search-option-row ${searchTargets[opt.key as keyof SearchTargets] ? 'active' : ''}`}
                                onClick={() => setSearchTargets(prev => ({ ...prev, [opt.key]: !prev[opt.key as keyof SearchTargets] }))}
                            >
                                <span>{opt.label}</span>
                                <svg className="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="media-picker-content">
                {loading && <div className="picker-loading">検索中...</div>}
                {!loading && results.length === 0 && query.length > 0 && <div className="picker-no-results">見つかりませんでした</div>}
                <div className="picker-results-list">
                    {results.map(item => (
                        <div key={item.id} className="picker-result-item">
                            <div className="picker-result-thumbnail">
                                {item.thumbnail_path ? (
                                    <img src={toMediaUrl(item.thumbnail_path)} alt="" />
                                ) : (
                                    <div className="picker-thumbnail-placeholder" />
                                )}
                            </div>
                            <div className="picker-result-info">
                                <div className="picker-result-title" title={item.file_name}>{item.title || item.file_name}</div>
                                <div className="picker-result-path">{item.file_name}</div>
                            </div>
                            <div className="picker-result-actions">
                                <button
                                    className="picker-action-btn parent"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onSelect(item, 'parent')
                                    }}
                                >
                                    親に追加
                                </button>
                                <button
                                    className="picker-action-btn child"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onSelect(item, 'child')
                                    }}
                                >
                                    子に追加
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
