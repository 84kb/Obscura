import { MediaFile, MediaComment } from '../types'
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
                        <div className="comment-time">{formatTime(c.time)}</div>
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
