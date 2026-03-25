import { MediaFile, MediaComment } from '@obscura/core'
import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { t as i18nT, AppLanguage } from '../i18n'

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

    // translate only to avoid aspect-ratio distortion
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
    language = 'ja',
    media,
    hoverRating,
    currentRating,
    setHoverRating,
    setCurrentRating,
    onUpdateRating,
    formatFileSize,
    formatTime,
    formatDate,
    infoVisibility,
    extensionInfoRows
}: {
    language?: AppLanguage
    media: MediaFile[],
    hoverRating: number | null,
    currentRating: number,
    setHoverRating: (r: number | null) => void,
    setCurrentRating: (r: number) => void,
    onUpdateRating?: (id: number, rating: number) => void,
    formatFileSize: (b: number) => string,
    formatTime: (s: number) => string,
    formatDate: (d: string) => string,
    infoVisibility?: {
        rating?: boolean
        resolution?: boolean
        duration?: boolean
        fileSize?: boolean
        importedAt?: boolean
        createdAt?: boolean
        modifiedAt?: boolean
        audioBitrate?: boolean
        framerate?: boolean
        formatName?: boolean
        codecId?: boolean
    },
    extensionInfoRows?: Array<{
        id: string
        label: string
        value: string | number | boolean | null | undefined
    }>
}) => {
    const visible = {
        rating: infoVisibility?.rating ?? true,
        resolution: infoVisibility?.resolution ?? true,
        duration: infoVisibility?.duration ?? true,
        fileSize: infoVisibility?.fileSize ?? true,
        importedAt: infoVisibility?.importedAt ?? true,
        createdAt: infoVisibility?.createdAt ?? true,
        modifiedAt: infoVisibility?.modifiedAt ?? true,
        audioBitrate: infoVisibility?.audioBitrate ?? true,
        framerate: infoVisibility?.framerate ?? true,
        formatName: infoVisibility?.formatName ?? true,
        codecId: infoVisibility?.codecId ?? true
    }

    const formatBitrate = (bitrate?: number) => {
        if (!Number.isFinite(Number(bitrate)) || Number(bitrate) <= 0) return '-'
        return `${Math.round(Number(bitrate) / 1000)} kbps`
    }

    const formatFramerate = (fps?: number) => {
        if (!Number.isFinite(Number(fps)) || Number(fps) <= 0) return '-'
        return `${Number(fps).toFixed(2)} fps`
    }

    const formatContainer = (value?: string) => {
        const raw = String(value || '').trim()
        if (!raw) return '-'
        const low = raw.toLowerCase()
        if (low === 'mp4' || low.includes('mov,mp4,m4a,3gp,3g2,mj2') || low.includes('mpeg-4')) {
            return 'MPEG-4'
        }
        if (low === 'mkv' || low.includes('matroska')) {
            return 'Matroska'
        }
        return raw
    }

    const formatCodecId = (value?: string) => {
        const raw = String(value || '').trim()
        if (!raw) return '-'
        const low = raw.toLowerCase()
        if (low === '[0][0][0][0]' || low === '0x00000000') {
            return '-'
        }
        if (low === 'h264' || low === 'avc' || low === 'avc/h.264') {
            return 'avc1'
        }
        if (low === 'h265' || low === 'hevc') {
            return 'hvc1'
        }
        return raw
    }

    return (
        <div className="info-section">
            {visible.rating && <div className="info-row">
                <span className="info-label">{i18nT(language, 'inspector.rating')}</span>
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
            </div>}
            {media.length === 1 && (
                <>
                    {visible.resolution && (media[0].width && media[0].height) ? (
                        <div className="info-row">
                            <span className="info-label">{i18nT(language, 'inspector.resolution')}</span>
                            <span className="info-value-inline">{media[0].width} x {media[0].height}</span>
                        </div>
                    ) : null}
                    {visible.duration && <div className="info-row">
                        <span className="info-label">{i18nT(language, 'inspector.duration')}</span>
                        <span className="info-value-inline">{media[0].duration ? formatTime(media[0].duration) : '-'}</span>
                    </div>}
                </>
            )}
            {visible.fileSize && <div className="info-row">
                <span className="info-label">{i18nT(language, 'inspector.fileSize')}</span>
                <span className="info-value-inline">
                    {media.length === 1
                        ? formatFileSize(media[0].file_size)
                        : `${formatFileSize(media.reduce((acc, m) => acc + m.file_size, 0))} (${i18nT(language, 'inspector.total')})`}
                </span>
            </div>}
            {media.length === 1 && (
                <>
                    {visible.audioBitrate && (
                        <div className="info-row">
                            <span className="info-label">{i18nT(language, 'inspector.audioBitrate')}</span>
                            <span className="info-value-inline">{formatBitrate(media[0].audio_bitrate)}</span>
                        </div>
                    )}
                    {visible.framerate && (
                        <div className="info-row">
                            <span className="info-label">{i18nT(language, 'inspector.frameRate')}</span>
                            <span className="info-value-inline">{formatFramerate(media[0].framerate)}</span>
                        </div>
                    )}
                    {visible.formatName && (
                        <div className="info-row">
                            <span className="info-label">{i18nT(language, 'inspector.fileFormat')}</span>
                            <span className="info-value-inline">{formatContainer(media[0].format_name)}</span>
                        </div>
                    )}
                    {visible.codecId && (
                        <div className="info-row">
                            <span className="info-label">{i18nT(language, 'inspector.codecId')}</span>
                            <span className="info-value-inline">{formatCodecId(media[0].codec_id)}</span>
                        </div>
                    )}
                    {visible.importedAt && <div className="info-row">
                        <span className="info-label">{i18nT(language, 'inspector.importedAt')}</span>
                        <span className="info-value-inline">{formatDate(media[0].created_at)}</span>
                    </div>}
                    {visible.createdAt && media[0].created_date && (
                        <div className="info-row">
                            <span className="info-label">{i18nT(language, 'inspector.createdAt')}</span>
                            <span className="info-value-inline">{formatDate(media[0].created_date)}</span>
                        </div>
                    )}
                    {visible.modifiedAt && media[0].modified_date && (
                        <div className="info-row">
                            <span className="info-label">{i18nT(language, 'inspector.modifiedAt')}</span>
                            <span className="info-value-inline">{formatDate(media[0].modified_date)}</span>
                        </div>
                    )}
                </>
            )}
            {extensionInfoRows && extensionInfoRows
                .filter((row) => row && row.value !== null && row.value !== undefined && String(row.value).trim() !== '')
                .map((row) => (
                    <div className="info-row" key={row.id}>
                        <span className="info-label">{row.label}</span>
                        <span className="info-value-inline">{String(row.value)}</span>
                    </div>
                ))}
        </div>
    )
}

export const CommentSectionContent = ({
    language = 'ja',
    comments,
    formatTime,
    providers,
    extensionButtons
}: {
    language?: AppLanguage
    comments: MediaComment[],
    formatTime: (s: number) => string,
    providers?: Array<{ id: string; name: string; onClick: () => void; isFetching: boolean; disabled: boolean }>,
    extensionButtons?: Array<{ id: string; label: string; onClick: () => void; icon?: string; disabled?: boolean }>
}) => {
    return (
        <div className="comments-list">
            {providers && providers.length > 0 && (
                <div className="plugin-fetch-actions" style={{ marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {providers.map(p => (
                        <button
                            key={p.id}
                            className={`btn btn-small btn-full ${p.isFetching ? 'loading' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation()
                                p.onClick()
                            }}
                            disabled={p.disabled || p.isFetching}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px' }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {p.isFetching ? i18nT(language, 'inspector.fetching') : i18nT(language, 'inspector.fetchCommentsFrom', { name: p.name })}
                        </button>
                    ))}
                    {providers.every(p => p.disabled) && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'center', opacity: 0.8 }}>
                            {i18nT(language, 'inspector.enterUrlHint')}
                        </p>
                    )}
                </div>
            )}
            {extensionButtons && extensionButtons.length > 0 && (
                <div className="plugin-extension-actions" style={{ marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {extensionButtons.map(btn => (
                        <button
                            key={btn.id}
                            className="btn btn-small btn-full"
                            onClick={(e) => {
                                e.stopPropagation()
                                btn.onClick()
                            }}
                            disabled={btn.disabled}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px' }}
                        >
                            {btn.icon ? (
                                <span dangerouslySetInnerHTML={{ __html: btn.icon }} style={{ width: 14, height: 14, display: 'flex' }} />
                            ) : null}
                            {btn.label}
                        </button>
                    ))}
                </div>
            )}
            {comments.length === 0 ? (
                <div className="no-comments">{i18nT(language, 'inspector.noComments')}</div>
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
    formatFileSize,
    prevVisibleCount = 1,
    nextVisibleCount = 10
}: {
    currentContextMedia: MediaFile[],
    playingMedia: MediaFile,
    onPlay: (m: MediaFile) => void,
    toMediaUrl: (path: string) => string,
    formatTime: (s: number) => string,
    formatFileSize: (b: number) => string,
    prevVisibleCount?: number
    nextVisibleCount?: number
}) => {

    const currentIndex = currentContextMedia.findIndex(m => m.id === playingMedia.id)
    if (currentIndex === -1) return null

    const safePrev = Math.max(0, Math.min(50, Number(prevVisibleCount || 0)))
    const safeNext = Math.max(0, Math.min(50, Number(nextVisibleCount || 0)))
    const start = Math.max(0, currentIndex - safePrev)
    const end = Math.min(currentContextMedia.length, currentIndex + safeNext + 1)
    const playlistItems = currentContextMedia.slice(start, end)

    return (
        <div className="playlist-container">
            {playlistItems.map((item, index) => {
                const isPlaying = item.id === playingMedia.id
                return (
                    <div
                        key={`${item.id}-${index}`}
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
    language = 'ja',
    media,
    toMediaUrl,
    onRemoveParent,
    onSelectMedia,
    onOpenPicker
}: {
    language?: AppLanguage
    media: MediaFile[],
    toMediaUrl: (path: string) => string,
    onRemoveParent: (childId: number, parentId: number) => void,
    onSelectMedia: (m: MediaFile) => void,
    onOpenPicker: (rect: DOMRect) => void
}) => {
    // 単一選択時のみ表示
    if (media.length !== 1) return <div className="no-comments">{i18nT(language, 'inspector.singleSelectOnly')}</div>

    const item = media[0]
    const parents = item.parents || []
    const parentCount = parents.length
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
                {i18nT(language, 'inspector.registerRelations')}
            </button>

            {/* 親作品 */}
            <div className="relation-group-header">
                {i18nT(language, 'inspector.parentWorks')} ({parentCount})
            </div>
            <div className="relation-group">
                {parents.length > 0 ? (
                    parents.map(parent => (
                        <div key={parent.id} className="relation-item-card">
                            <div className="relation-thumbnail" onClick={() => onSelectMedia(parent)}>
                                {parent.thumbnail_path ? (
                                    <img src={toMediaUrl(parent.thumbnail_path)} alt="" />
                                ) : (
                                    <div className="relation-placeholder">No Img</div>
                                )}
                            </div>
                            <div className="relation-info" onClick={() => onSelectMedia(parent)}>
                                <div className="relation-title" title={parent.file_name}>{parent.title || parent.file_name}</div>
                            </div>
                            <button className="relation-remove-btn" onClick={(e) => {
                                e.stopPropagation()
                                onRemoveParent(item.id, parent.id)
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="no-relation-placeholder">{i18nT(language, 'inspector.parentEmpty')}</div>
                )}
            </div>

            {/* 子作品 */}
            <div className="relation-group-header">
                {i18nT(language, 'inspector.childWorks')} ({childrenCount})
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
                                onRemoveParent(child.id, item.id)
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    ))}
                    {(!item.children || item.children.length === 0) && <div className="no-relation-placeholder">{i18nT(language, 'inspector.childEmpty')}</div>}
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
    language = 'ja',
    onSelect,
    onClose,
    onSearch,
    toMediaUrl,
    style
}: {
    language?: AppLanguage
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
            setLoading(true)
            try {
                const res = await onSearch(query, searchTargets)
                setResults(res)
            } finally {
                setLoading(false)
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
                        title={i18nT(language, 'inspector.searchOptions')}
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
                        placeholder={i18nT(language, 'inspector.searchByTitle')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                {isOptionsOpen && (
                    <div className="picker-search-options-dropdown">
                        <div className="picker-search-options-header">{i18nT(language, 'inspector.searchOptions')}</div>
                        {[
                            { key: 'name', label: i18nT(language, 'inspector.name') },
                            { key: 'folder', label: i18nT(language, 'inspector.folder') },
                            { key: 'artist', label: i18nT(language, 'inspector.artist') },
                            { key: 'tags', label: i18nT(language, 'inspector.tags') },
                            { key: 'description', label: i18nT(language, 'inspector.description') },
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
                {loading && <div className="picker-loading">{i18nT(language, 'inspector.searching')}</div>}
                {!loading && results.length === 0 && query.length > 0 && <div className="picker-no-results">{i18nT(language, 'inspector.noResults')}</div>}
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
                                    {i18nT(language, 'inspector.addAsParent')}
                                </button>
                                <button
                                    className="picker-action-btn child"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onSelect(item, 'child')
                                    }}
                                >
                                    {i18nT(language, 'inspector.addAsChild')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
