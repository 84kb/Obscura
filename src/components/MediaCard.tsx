import { useState, useEffect } from 'react'
import { MediaFile, ItemInfoType } from '../types'
import './MediaCard.css'
import { toMediaUrl } from '../utils/fileUrl'

interface MediaCardProps extends React.HTMLAttributes<HTMLDivElement> {
    media: MediaFile
    onClick: (e: React.MouseEvent) => void
    onDoubleClick: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    isSelected?: boolean
    showName?: boolean
    showItemInfo?: boolean
    itemInfoType?: ItemInfoType
    showExtension?: boolean
    showExtensionLabel?: boolean
    onInternalDragStart?: () => void
    onInternalDragEnd?: () => void
    isRenaming?: boolean
    onRenameSubmit?: (newName: string) => void
    onRenameCancel?: () => void
    thumbnailMode?: 'speed' | 'quality'
}

export function MediaCard({
    media,
    onClick,
    onDoubleClick,
    onContextMenu,
    isSelected = false,
    showName = true,
    showItemInfo = true,
    itemInfoType = 'duration',
    showExtension = true,
    showExtensionLabel = true,
    onInternalDragStart,
    onInternalDragEnd,
    isRenaming = false,
    onRenameSubmit,
    onRenameCancel,
    thumbnailMode = 'speed',
    ...props
}: MediaCardProps) {
    const getInitialThumbnailUrl = () => {
        if (!media.thumbnail_path) return null
        const url = toMediaUrl(media.thumbnail_path)
        if (thumbnailMode === 'speed') {
            return `${url}?width=250`
        }
        return url
    }

    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(getInitialThumbnailUrl())

    // サムネイルがない場合は自動生成をトリガー（品質優先モードの場合のみ）
    useEffect(() => {
        // propが変わったときにURLを更新
        if (media.thumbnail_path) {
            const url = toMediaUrl(media.thumbnail_path)
            setThumbnailUrl(thumbnailMode === 'speed' ? `${url}?width=250` : url)
        }

        // speedモードの場合は生成をスキップ (既存のサムネイルがあれば利用される)
        if (thumbnailMode === 'speed') return

        if (!media.thumbnail_path && media.file_type === 'video' && window.electronAPI) {
            window.electronAPI.generateThumbnail(media.id, media.file_path)
                .then((path: string | null) => {
                    if (path) {
                        setThumbnailUrl(toMediaUrl(path))
                    }
                })
                .catch((err: Error) => console.error('Thumbnail generation failed:', err))
        }
    }, [media.id, media.file_path, media.thumbnail_path, media.file_type, thumbnailMode])

    // ファイルタイプに応じたアイコン
    const getIcon = () => {
        if (media.file_type === 'video') {
            return (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                </svg>
            )
        } else {
            return (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
            )
        }
    }

    // 時間フォーマット
    const formatDuration = (seconds: number | null) => {
        if (!seconds) return ''
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    // ファイルサイズフォーマット
    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
    }

    // 日付フォーマット
    const formatDate = (dateString: string | undefined | null) => {
        if (!dateString) return ''
        const date = new Date(dateString)
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    }

    // 評価表示
    const formatRating = (rating: number | undefined) => {
        if (!rating) return '未評価'
        return '★'.repeat(rating) + '☆'.repeat(5 - rating)
    }

    // タグ表示
    const formatTags = (tags: { id: number; name: string }[] | undefined) => {
        if (!tags || tags.length === 0) return 'タグなし'
        if (tags.length <= 2) return tags.map(t => t.name).join(', ')
        return `${tags[0].name}, ${tags[1].name}...`
    }

    // アイテム情報を取得
    const getItemInfo = (): string => {
        switch (itemInfoType) {
            case 'duration':
                return formatDuration(media.duration)
            case 'size':
                return formatFileSize(media.file_size)
            case 'tags':
                return formatTags(media.tags)
            case 'rating':
                return formatRating(media.rating)
            case 'modified':
                return formatDate(media.modified_date)
            case 'created':
                return formatDate(media.created_date)
            default:
                return formatDuration(media.duration)
        }
    }

    // ファイル拡張子を取得
    const getFileExtension = () => {
        const ext = media.file_name.split('.').pop()?.toUpperCase() || ''
        return ext
    }



    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e)
    }

    // infoが表示されるかどうか
    const hasVisibleInfo = showName || (showItemInfo && getItemInfo())

    // ネイティブファイルドラッグ開始
    const handleDragStart = (e: React.DragEvent) => {
        console.log('[MediaCard] Drag start triggered for:', media.file_path)

        // 内部ドラッグ開始を通知
        onInternalDragStart?.()

        e.preventDefault()

        if (window.electronAPI?.startDrag) {
            console.log('[MediaCard] Calling startDrag IPC')
            window.electronAPI.startDrag([media.file_path])
        } else {
            console.error('[MediaCard] electronAPI.startDrag not available')
        }
    }

    // ドラッグ終了時
    const handleDragEnd = (_e: React.DragEvent) => {
        // 内部ドラッグ終了を通知
        onInternalDragEnd?.()
    }

    // 画像読み込み完了状態
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        // メディアが変わったらリセット
        setIsLoaded(false)
        setThumbnailUrl(getInitialThumbnailUrl())
    }, [media.id, media.file_path, media.thumbnail_path, thumbnailMode])

    return (
        <div
            className={`media-card ${isSelected ? 'selected' : ''}`}
            onMouseDown={(e) => onClick(e)}
            onDoubleClick={onDoubleClick}
            onContextMenu={handleContextMenu}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            {...props}
        >
            <div
                className="media-card-thumbnail"
                style={{
                    backgroundColor: media.dominant_color || '#2a2a2a',
                    transition: 'background-color 0.3s ease'
                }}
            >
                {/* ファイルタイプバッジ（左上） - showExtensionLabelで制御 */}
                {showExtensionLabel && (
                    <div className="media-card-badge">
                        {getFileExtension()}
                    </div>
                )}

                {thumbnailUrl ? (
                    <img
                        src={thumbnailUrl}
                        alt={media.file_name}
                        loading="lazy"
                        decoding="async"
                        onLoad={() => setIsLoaded(true)}
                        style={{
                            opacity: isLoaded ? 1 : 0,
                            transition: 'opacity 0.3s ease'
                        }}
                    />
                ) : (
                    <div className="media-card-placeholder" style={{ opacity: 1 }}>
                        {getIcon()}
                    </div>
                )}
            </div>
            {/* ファイル情報（下部） */}
            {hasVisibleInfo && (
                <div className="media-card-info">
                    {showName && <div className="media-card-title" title={media.file_name}>
                        {isRenaming ? (
                            <textarea
                                defaultValue={(() => {
                                    // 拡張子を除いた名前を表示
                                    const lastDotIndex = media.file_name.lastIndexOf('.')
                                    if (lastDotIndex > 0) {
                                        return media.file_name.substring(0, lastDotIndex)
                                    }
                                    return media.file_name
                                })()}
                                autoFocus
                                className="preview-filename-input"
                                rows={1}
                                style={{
                                    padding: '0 4px',
                                    margin: 0,
                                    fontSize: '13px',
                                    textAlign: 'center',
                                    background: 'var(--bg-hover)',
                                    border: '1px solid var(--primary)',
                                    resize: 'none',
                                    overflow: 'hidden',
                                    minHeight: '20px',
                                    maxHeight: '80px', // 約4行分
                                    lineHeight: '1.4',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    fontFamily: 'inherit'
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                    e.target.select()
                                    // 高さを自動調整
                                    e.target.style.height = 'auto'
                                    e.target.style.height = e.target.scrollHeight + 'px'
                                }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement
                                    target.style.height = 'auto'
                                    target.style.height = target.scrollHeight + 'px'
                                }}
                                onBlur={(e) => {
                                    const baseName = e.target.value.trim()
                                    if (!baseName) {
                                        onRenameCancel?.()
                                        return
                                    }

                                    // 拡張子を復元して保存
                                    const lastDotIndex = media.file_name.lastIndexOf('.')
                                    let newName = baseName
                                    if (lastDotIndex > 0) {
                                        const ext = media.file_name.substring(lastDotIndex)
                                        newName = baseName + ext
                                    }

                                    if (newName !== media.file_name) {
                                        onRenameSubmit?.(newName)
                                    } else {
                                        onRenameCancel?.()
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault() // 改行を防止
                                        e.currentTarget.blur()
                                    } else if (e.key === 'Escape') {
                                        onRenameCancel?.()
                                    }
                                }}
                            />
                        ) : (
                            <>
                                {showExtension ? media.file_name : media.file_name.replace(/\.[^/.]+$/, "")}
                            </>
                        )}
                    </div>
                    }
                    {showItemInfo && (
                        <span className="media-card-duration">
                            {getItemInfo()}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

