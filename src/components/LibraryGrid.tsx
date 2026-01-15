import React, { useState, useRef, useEffect } from 'react'
import { MediaFile, ViewSettings } from '../types'
import { MediaCard } from './MediaCard'
import SelectionBox from './SelectionBox'
import './LibraryGrid.css'

interface LibraryGridProps {
    mediaFiles: MediaFile[]
    onMediaClick: (media: MediaFile, e: React.MouseEvent) => void
    onMediaDoubleClick: (media: MediaFile) => void
    onMediaContextMenu?: (media: MediaFile, e: React.MouseEvent) => void
    gridSize: number
    viewMode: 'grid' | 'list'
    selectedMediaIds: number[]
    viewSettings?: ViewSettings
    onClearSelection?: () => void
    onSelectionChange?: (ids: number[]) => void
    onInternalDragStart?: () => void
    onInternalDragEnd?: () => void
    renamingMediaId?: number | null
    onRenameSubmit?: (id: number, newName: string) => void
    onRenameCancel?: () => void
}

export function LibraryGrid({
    mediaFiles,
    onMediaClick,
    onMediaDoubleClick,
    onMediaContextMenu,
    gridSize,
    viewMode,
    selectedMediaIds,
    viewSettings,
    onClearSelection,
    onSelectionChange,
    onInternalDragStart,
    onInternalDragEnd,
    renamingMediaId,
    onRenameSubmit,
    onRenameCancel
}: LibraryGridProps) {
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
    const [dragEnd, setDragEnd] = useState<{ x: number, y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRectsRef = useRef<Map<number, DOMRect>>(new Map());
    const dragCurrentPosRef = useRef<{ x: number, y: number } | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Only trigger on left click on the grid itself (not on cards)
        if (e.button !== 0 || e.target !== e.currentTarget) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left + containerRef.current!.scrollLeft;
        const y = e.clientY - rect.top + containerRef.current!.scrollTop;
        const startPos = { x, y };

        setDragStart(startPos);
        setDragEnd(startPos);
        dragCurrentPosRef.current = startPos;

        // Cache item positions
        const newRects = new Map<number, DOMRect>();
        const container = containerRef.current;
        if (container) {
            const cards = container.querySelectorAll('.media-card');
            cards.forEach(card => {
                const id = Number(card.getAttribute('data-id'));
                if (!isNaN(id)) {
                    const cardRect = card.getBoundingClientRect();
                    // Store relative to container
                    const relativeRect = new DOMRect(
                        cardRect.left - rect.left + container.scrollLeft,
                        cardRect.top - rect.top + container.scrollTop,
                        cardRect.width,
                        cardRect.height
                    );
                    newRects.set(id, relativeRect);
                }
            });
        }
        itemRectsRef.current = newRects;
        console.log('[LibraryGrid] Drag started. Cached rects:', newRects.size, newRects);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!dragStart || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + containerRef.current.scrollLeft;
        const y = e.clientY - rect.top + containerRef.current.scrollTop;
        const currentPos = { x, y };

        setDragEnd(currentPos);
        dragCurrentPosRef.current = currentPos;

        // Calculate intersection
        const left = Math.min(dragStart.x, x);
        const top = Math.min(dragStart.y, y);
        const width = Math.abs(dragStart.x - x);
        const height = Math.abs(dragStart.y - y);

        const newSelectedIds: number[] = [];
        itemRectsRef.current.forEach((rect, id) => {
            if (
                rect.left < left + width &&
                rect.left + rect.width > left &&
                rect.top < top + height &&
                rect.top + rect.height > top
            ) {
                newSelectedIds.push(id);
            }
        });

        if (onSelectionChange) {
            // Update immediately during drag
            if (e.ctrlKey || e.metaKey) {
                const combined = Array.from(new Set([...selectedMediaIds, ...newSelectedIds]));
                onSelectionChange(combined);
            } else {
                onSelectionChange(newSelectedIds);
            }
        }
    };

    const handleMouseUp = (e: MouseEvent) => {
        if (!dragStart) {
            setDragStart(null);
            setDragEnd(null);
            return;
        }

        const currentPos = dragCurrentPosRef.current || dragStart;

        // Finalize selection logic
        const left = Math.min(dragStart.x, currentPos.x);
        const top = Math.min(dragStart.y, currentPos.y);
        const width = Math.abs(dragStart.x - currentPos.x);
        const height = Math.abs(dragStart.y - currentPos.y);

        // Treat as click if movement is very small
        if (width <= 5 && height <= 5) {
            if (onClearSelection) {
                onClearSelection();
            }
        } else {
            // Drag finished. Selection is assumed to be up-to-date from Move events.
            // But we can re-emit to be sure using proper logic, matching Move.
            // (Optional, mostly relies on Move having done its job)
            const newSelectedIds: number[] = [];
            itemRectsRef.current.forEach((rect, id) => {
                if (
                    rect.left < left + width &&
                    rect.left + rect.width > left &&
                    rect.top < top + height &&
                    rect.top + rect.height > top
                ) {
                    newSelectedIds.push(id);
                }
            });

            if (onSelectionChange) {
                if (e.ctrlKey || e.metaKey) {
                    const combined = Array.from(new Set([...selectedMediaIds, ...newSelectedIds]));
                    onSelectionChange(combined);
                } else {
                    onSelectionChange(newSelectedIds);
                }
            }
        }

        setDragStart(null);
        setDragEnd(null);
        dragCurrentPosRef.current = null;
    };

    useEffect(() => {
        if (dragStart) {
            // Use window listeners to capture drag even if mouse leaves grid
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragStart]);

    if (mediaFiles.length === 0) {
        return (
            <div className="library-empty">
                <div className="empty-icon-container">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </div>
                <h2>ライブラリは空です</h2>
                <p>動画や音楽ファイルをここにドラッグ＆ドロップして追加してください</p>
                <p className="sub-text">または、サイドバーからライブラリを作成/切り替えできます</p>
            </div>
        )
    }

    const selectionBox = dragStart && dragEnd && (
        <SelectionBox
            top={Math.min(dragStart.y, dragEnd.y)}
            left={Math.min(dragStart.x, dragEnd.x)}
            width={Math.abs(dragStart.x - dragEnd.x)}
            height={Math.abs(dragStart.y - dragEnd.y)}
        />
    );

    return (
        <div
            ref={containerRef}
            className={`library-grid view-${viewMode}`}
            style={{ '--grid-size': gridSize, position: 'relative' } as React.CSSProperties}
            onMouseDown={handleMouseDown}
            onClick={(e) => {
                // Prevent bubbling to parent handlers that might clear selection
                e.stopPropagation();
            }}
        >
            {selectionBox}
            {mediaFiles.map((media) => (
                <MediaCard
                    key={media.id}
                    media={media}
                    onClick={(e) => onMediaClick(media, e)}
                    onDoubleClick={() => onMediaDoubleClick(media)}
                    onContextMenu={(e) => onMediaContextMenu?.(media, e)}
                    isSelected={selectedMediaIds.includes(media.id)}
                    showName={viewSettings?.showName ?? true}
                    showItemInfo={viewSettings?.showItemInfo ?? true}
                    itemInfoType={viewSettings?.itemInfoType ?? 'duration'}
                    showExtension={viewSettings?.showExtension ?? true}
                    showExtensionLabel={viewSettings?.showExtensionLabel ?? true}
                    data-id={media.id}
                    onInternalDragStart={onInternalDragStart}
                    onInternalDragEnd={onInternalDragEnd}
                    isRenaming={renamingMediaId === media.id}
                    onRenameSubmit={(newName) => onRenameSubmit?.(media.id, newName)}
                    onRenameCancel={onRenameCancel}
                />
            ))}
        </div>
    )
}
