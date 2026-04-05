import { useState, useEffect, useRef } from 'react'
import { MediaFile, ItemInfoType } from '@obscura/core'
import { api } from '../api'
import './MediaCard.css'
import { toMediaUrl } from '../utils/fileUrl'
import { enqueueThumbnailLoad } from '../utils/thumbnailLoadQueue'

const thumbnailUrlCache = new Map<string, string>()

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
    onInternalDragStart?: (mediaIds?: number[]) => void
    onInternalDragEnd?: () => void
    isRenaming?: boolean
    onRenameSubmit?: (newName: string) => void
    onRenameCancel?: () => void
    thumbnailMode?: 'speed' | 'quality'
    width?: number
    onDragGetPaths?: (id: string) => string[]
    onDragGetMediaIds?: (id: string) => number[]
    priorityLoad?: boolean
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
    width = 250,
    onDragGetPaths,
    onDragGetMediaIds,
    priorityLoad = false,
    ...props
}: MediaCardProps) {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)
    const mouseDownHandled = useRef(false) // MouseDown縺ｧ驕ｸ謚槫・逅・ｒ陦後▲縺溘°繧定ｿｽ霍｡
    const pendingThumbnailLoadRef = useRef<{ release: () => void, cancel: () => void } | null>(null)

    // 繧ｵ繝繝阪う繝ｫ縺後↑縺・ｴ蜷医・閾ｪ蜍慕函謌舌ｒ繝医Μ繧ｬ繝ｼ・亥刀雉ｪ蜆ｪ蜈医Δ繝ｼ繝峨・蝣ｴ蜷医・縺ｿ・・
    useEffect(() => {
        pendingThumbnailLoadRef.current?.cancel()
        pendingThumbnailLoadRef.current = null

        const cacheKey = `${media.id}|${thumbnailMode}|${width}|${media.thumbnail_path || ''}`
        const cachedUrl = thumbnailUrlCache.get(cacheKey)

        if (cachedUrl) {
            setThumbnailUrl(cachedUrl)
            setIsLoaded(true)
            return
        }

        setIsLoaded(false)
        setThumbnailUrl(null)
        if (!media.thumbnail_path) return

        // Use already generated thumbnail as-is. Do not trigger resize/generation on render.
        const resolved = toMediaUrl(media.thumbnail_path)
        thumbnailUrlCache.set(cacheKey, resolved)

        const startLoad = () => {
            const perf = (window as any).__obscuraRandomPerf
            if (perf && !perf.firstThumbRequestLogged) {
                perf.firstThumbRequestLogged = true
                const elapsed = performance.now() - Number(perf.start || 0)
                console.log(`[Perf][Random] first thumbnail request in ${elapsed.toFixed(1)}ms (mediaId=${media.id})`)
            }
            setThumbnailUrl(resolved)
        }

        if (priorityLoad) {
            startLoad()
        } else {
            pendingThumbnailLoadRef.current = enqueueThumbnailLoad(startLoad)
        }

        return () => {
            pendingThumbnailLoadRef.current?.cancel()
            pendingThumbnailLoadRef.current = null
        }
    }, [media.id, media.thumbnail_path, thumbnailMode, width, priorityLoad])

    // 繝輔ぃ繧､繝ｫ繧ｿ繧､繝励↓蠢懊§縺溘い繧､繧ｳ繝ｳ
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

    // 譎る俣繝輔か繝ｼ繝槭ャ繝・
    const formatDuration = (seconds: number | null) => {
        if (!seconds) return ''
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    // 繝輔ぃ繧､繝ｫ繧ｵ繧､繧ｺ繝輔か繝ｼ繝槭ャ繝・
    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
    }

    // 譌･莉倥ヵ繧ｩ繝ｼ繝槭ャ繝・
    const formatDate = (dateString: string | undefined | null) => {
        if (!dateString) return ''
        const date = new Date(dateString)
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    }

    // 隧穂ｾ｡陦ｨ遉ｺ
    const formatRating = (rating: number | undefined) => {
        if (!rating) return '譛ｪ隧穂ｾ｡'
        return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating)
    }

    // 繧ｿ繧ｰ陦ｨ遉ｺ
    const formatTags = (tags: { id: number; name: string }[] | undefined) => {
        if (!tags || tags.length === 0) return '\u30BF\u30B0\u306A\u3057'
        if (tags.length <= 2) return tags.map(t => t.name).join(', ')
        return `${tags[0].name}, ${tags[1].name}...`
    }

    // 繧｢繧､繝・Β諠・ｱ繧貞叙蠕・
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

    // 繝輔ぃ繧､繝ｫ諡｡蠑ｵ蟄舌ｒ蜿門ｾ・
    const getFileExtension = () => {
        const ext = media.file_name.split('.').pop()?.toUpperCase() || ''
        return ext
    }

    const getDisplayTitle = () => {
        const rawTitle = String(media.title || media.file_name || '').trim()
        const hasExtension = /\.[^/.]+$/.test(rawTitle)
        const lastDotIndex = media.file_name.lastIndexOf('.')
        const fileExtWithDot = lastDotIndex > 0 ? media.file_name.substring(lastDotIndex) : ''

        if (showExtension) {
            if (hasExtension) return rawTitle
            return fileExtWithDot ? `${rawTitle}${fileExtWithDot}` : rawTitle
        }

        return rawTitle.replace(/\.[^/.]+$/, "")
    }



    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e)
    }

    // info縺瑚｡ｨ遉ｺ縺輔ｌ繧九°縺ｩ縺・°
    const hasVisibleInfo = showName || (showItemInfo && getItemInfo())

    // 繝阪う繝・ぅ繝悶ヵ繧｡繧､繝ｫ繝峨Λ繝・げ髢句ｧ・
    const handleDragStart = (e: React.DragEvent) => {
        const dragPaths = [media.file_path]
        const dragMediaIds = onDragGetMediaIds ? onDragGetMediaIds(String(media.id)) : [media.id]
        console.log('[MediaCard] Drag start triggered for:', dragPaths)

        if (e.shiftKey) {
            onInternalDragStart?.(dragMediaIds)
            e.stopPropagation()
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.dropEffect = 'move'
            e.dataTransfer.setData('application/x-obscura-media-ids', JSON.stringify(dragMediaIds))
            return
        }

        e.preventDefault()
        onInternalDragStart?.(dragMediaIds)
        if (api.startDrag) {
            console.log('[MediaCard] Calling startDrag IPC with', dragPaths.length, 'files')
            api.startDrag(dragPaths)
        } else {
            console.error('[MediaCard] api.startDrag not available')
        }
    }

    // 繝峨Λ繝・げ邨ゆｺ・凾
    const handleDragEnd = (e: React.DragEvent) => {
        onInternalDragEnd?.()
    }

    // 繝槭え繧ｹ繝繧ｦ繝ｳ譎ゅ・莨晄眺繧呈ｭ｢繧√※縲´ibraryGrid縺ｮ遽・峇驕ｸ謚槭Ο繧ｸ繝・け縺瑚ｵｰ繧峨↑縺・ｈ縺・↓縺吶ｋ to fix selection clear issue on drag
    // 縺九▽縲∵悴驕ｸ謚槭い繧､繝・Β縺ｮ蝣ｴ蜷医・蜊ｳ蠎ｧ縺ｫ驕ｸ謚樒憾諷九↓縺吶ｋ・医ラ繝ｩ繝・げ髢句ｧ九↓髢薙↓蜷医ｏ縺帙ｋ縺溘ａ・・
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0) { // 蟾ｦ繧ｯ繝ｪ繝・け縺ｮ縺ｿ
            e.stopPropagation()

            if (!isSelected) {
                // 譛ｪ驕ｸ謚樊凾縺ｯ縺薙％縺ｧ驕ｸ謚槫・逅・ｒ螳溯｡・
                // 縺薙ｌ縺ｫ繧医ｊ繝峨Λ繝・げ髢句ｧ区凾縺ｫ縺ｯ縲碁∈謚樊ｸ医∩縲肴桶縺・↓縺ｪ繧・
                onClick(e)
                mouseDownHandled.current = true
            } else {
                // 譌｢縺ｫ驕ｸ謚樊ｸ医∩縺ｮ蝣ｴ蜷医・菴輔ｂ縺励↑縺・ｼ医ラ繝ｩ繝・げ蠕・ｩ滂ｼ・
                // 繝槭え繧ｹ繧｢繝・・・医け繝ｪ繝・け・画凾縺ｫ驕ｸ謚櫁ｧ｣髯､遲峨・蜃ｦ逅・′襍ｰ繧・
                mouseDownHandled.current = false
            }
        }
    }

    const handleClick = (e: React.MouseEvent) => {
        // MouseDown縺ｧ縺吶〒縺ｫ蜃ｦ逅・ｸ医∩縺ｮ蝣ｴ蜷医・繧ｹ繧ｭ繝・・
        if (mouseDownHandled.current) {
            mouseDownHandled.current = false
            return
        }
        onClick(e)
    }

    const handleThumbnailLoad = () => {
        setIsLoaded(true)
        pendingThumbnailLoadRef.current?.release()
        pendingThumbnailLoadRef.current = null
        const perf = (window as any).__obscuraRandomPerf
        if (!perf || perf.firstThumbLogged) return
        perf.firstThumbLogged = true
        const elapsed = performance.now() - Number(perf.start || 0)
        const src = String(thumbnailUrl || '')
        const srcKind = /\/api\/thumbnails\//.test(src)
            ? 'api'
            : src.includes('asset.localhost')
                ? 'asset'
                : /^https?:\/\//.test(src)
                    ? 'http'
                    : 'other'
        console.log(`[Perf][Random] first thumbnail loaded in ${elapsed.toFixed(1)}ms (mediaId=${media.id}, type=${media.file_type}, src=${srcKind})`)
    }

    const handleThumbnailError = () => {
        pendingThumbnailLoadRef.current?.release()
        pendingThumbnailLoadRef.current = null
    }

    const imgLoadingMode: 'eager' | 'lazy' = priorityLoad ? 'eager' : 'lazy'
    const imgPriorityProps = priorityLoad ? ({ fetchpriority: 'high' } as any) : ({} as any)

    return (
        <div
            className={`media-card ${isSelected ? 'selected' : ''} ${isRenaming ? 'renaming' : ''}`}
            onClick={handleClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={handleContextMenu}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMouseDown={handleMouseDown}
            style={{ width }}
            {...props}
        >
            <div
                className="media-card-thumbnail"
                style={{
                    backgroundColor: media.dominant_color || '#2a2a2a',
                    transition: 'background-color 0.3s ease'
                }}
            >
                {/* 繝輔ぃ繧､繝ｫ繧ｿ繧､繝励ヰ繝・ず・亥ｷｦ荳奇ｼ・- showExtensionLabel縺ｧ蛻ｶ蠕｡ */}
                {showExtensionLabel && (
                    <div className="media-card-badge">
                        {getFileExtension()}
                    </div>
                )}

                {thumbnailUrl ? (
                    <img
                        src={thumbnailUrl}
                        alt={media.file_name}
                        draggable={false}
                        loading={imgLoadingMode}
                        decoding="async"
                        {...imgPriorityProps}
                        onLoad={handleThumbnailLoad}
                        onError={handleThumbnailError}
                        onDragStart={(e) => e.preventDefault()}
                        style={{
                            opacity: 1,
                            transition: 'opacity 0.3s ease'
                        }}
                    />
                ) : (
                    <div className="media-card-placeholder" style={{ opacity: 1 }}>
                        {!media.thumbnail_path && getIcon()}
                    </div>
                )}
            </div>
            {/* 繝輔ぃ繧､繝ｫ諠・ｱ・井ｸ矩Κ・・*/}
            {hasVisibleInfo && (
                <div className="media-card-info">
                    {showName && <div className="media-card-title" title={getDisplayTitle()}>
                        {isRenaming ? (
                            <textarea
                                defaultValue={(() => {
                                    // 諡｡蠑ｵ蟄舌ｒ髯､縺・◆蜷榊燕繧定｡ｨ遉ｺ
                                    // 諡｡蠑ｵ蟄舌ｒ髯､縺・◆蜷榊燕繧定｡ｨ遉ｺ
                                    const displayValue = media.title || media.file_name
                                    const lastDotIndex = displayValue.lastIndexOf('.')
                                    if (lastDotIndex > 0) {
                                        return displayValue.substring(0, lastDotIndex)
                                    }
                                    return displayValue
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
                                    maxHeight: '80px', // 邏・陦悟・
                                    lineHeight: '1.4',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    fontFamily: 'inherit'
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                    e.target.select()
                                    // 鬮倥＆繧定・蜍戊ｪｿ謨ｴ
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

                                    // 諡｡蠑ｵ蟄舌ｒ蠕ｩ蜈・＠縺ｦ菫晏ｭ・
                                    const displayValue = media.title || media.file_name
                                    const lastDotIndex = displayValue.lastIndexOf('.')
                                    let newName = baseName
                                    if (lastDotIndex > 0) {
                                        const ext = displayValue.substring(lastDotIndex)
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
                                        e.preventDefault() // 謾ｹ陦後ｒ髦ｲ豁｢
                                        e.currentTarget.blur()
                                    } else if (e.key === 'Escape') {
                                        onRenameCancel?.()
                                    }
                                }}
                            />
                        ) : (
                            <>
                                <>{getDisplayTitle()}</>
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

