import React, { useState, useRef, useEffect } from 'react'
import { MediaFile, ViewSettings } from '../types'
import { MediaCard } from './MediaCard'
import SelectionBox from './SelectionBox'
import { experimental_VGrid as VGrid, VGridHandle } from 'virtua'
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
    const containerRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<VGridHandle>(null);
    const dragCurrentPosRef = useRef<{ x: number, y: number } | null>(null);

    // Track container size for math-based selection
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    // Use a callback ref to ensure we observe the element as soon as it mounts
    const observerRef = useRef<ResizeObserver | null>(null);

    useEffect(() => {
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, []);

    const setContainerRef = (node: HTMLDivElement | null) => {
        containerRef.current = node;

        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        if (node) {
            observerRef.current = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (entry) {
                    setContainerSize({
                        width: entry.contentRect.width,
                        height: entry.contentRect.height
                    });
                }
            });
            observerRef.current.observe(node);
        }
    };

    // Add window resize listener as a backup to force re-render/re-check
    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerSize(prev => {
                    // Only update if actually changed to avoid render loop
                    if (prev.width === rect.width && prev.height === rect.height) return prev;
                    return { width: rect.width, height: rect.height };
                });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Grid layout constants (match CSS)
    const GAP = 24;
    const PADDING = 24;
    const ASPECT_RATIO = 16 / 9;
    const INFO_HEIGHT = 80; // media-card-info padding + title + duration approximate
    const SCROLLBAR_WIDTH = 18;

    const getLayoutInfo = () => {
        // Fallback width used if container is 0 (initial render)
        const isInspectorVisible = viewSettings?.showInspector ?? true;
        const chromeWidth = 280 + (isInspectorVisible ? 320 : 0); // 280 (Left) + 320 (Right approx)
        const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth - chromeWidth : 1200;

        // Effective width: prefer Observer, else fallback
        const width = containerSize.width > 0 ? containerSize.width : fallbackWidth;

        // Effective available width for items, subtracting Scrollbar and Padding
        const availableWidth = Math.max(0, width - SCROLLBAR_WIDTH - (PADDING * 2) + GAP);

        // Define Min/Max item widths to determine valid column range
        const MIN_ITEM_WIDTH = 100;
        const MAX_ITEM_WIDTH = 480;

        // Calculate maximum possible columns (Smallest items)
        let maxCols = Math.floor((availableWidth + GAP) / (MIN_ITEM_WIDTH + GAP));
        maxCols = Math.max(1, maxCols);

        // Calculate minimum possible columns (Largest items)
        let minCols = Math.floor((availableWidth + GAP) / (MAX_ITEM_WIDTH + GAP));
        minCols = Math.max(1, minCols);

        // Ensure maxCols >= minCols (safety)
        if (maxCols < minCols) maxCols = minCols;

        // Interpolate gridSize (1-10) to Column Count
        // GridSize 1 (Left) -> maxCols (Small items)
        // GridSize 10 (Right) -> minCols (Large items)
        // normalized: 0.0 (Size 1) to 1.0 (Size 10)
        const normalized = (gridSize - 1) / 9;

        // Target columns: Lerp from maxCols down to minCols
        // We round to nearest integer to snap to columns
        let columnCount = Math.round(maxCols - (normalized * (maxCols - minCols)));

        // Clamp (just in case)
        columnCount = Math.max(minCols, Math.min(maxCols, columnCount));

        // Calculate dimensions based on chosen column count
        const stride = availableWidth / columnCount;
        const itemWidth = Math.floor(stride - GAP);
        const itemHeight = Math.floor((itemWidth / ASPECT_RATIO) + INFO_HEIGHT);
        const finalCellWidth = stride > 0 ? stride : 200;

        return { columnCount, itemWidth, itemHeight, cellWidth: finalCellWidth };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Only trigger on left click
        if (e.button !== 0) return;

        // If clicking inside a media card, ignore (let card handle it)
        if ((e.target as HTMLElement).closest('.media-card')) return;

        // Otherwise, start drag selection
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Try to get scroll from virtua handle or fallback
        const scrollLeft = gridRef.current?.scrollLeft || 0;
        const scrollTop = gridRef.current?.scrollTop || 0;

        const x = e.clientX - rect.left + scrollLeft;
        const y = e.clientY - rect.top + scrollTop;
        const startPos = { x, y };

        setDragStart(startPos);
        setDragEnd(startPos);
        dragCurrentPosRef.current = startPos;
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!dragStart || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();

        // Get current scroll position to calculate content coordinates
        const scrollLeft = gridRef.current?.scrollLeft || 0;
        const scrollTop = gridRef.current?.scrollTop || 0;

        // Calculate current position in Content Coordinates (same as dragStart)
        const x = e.clientX - rect.left + scrollLeft;
        const y = e.clientY - rect.top + scrollTop;
        const currentPos = { x, y };

        setDragEnd(currentPos);
        dragCurrentPosRef.current = currentPos;

        // Calculate intersection using Content Coordinates
        const selectionLeft = Math.min(dragStart.x, x);
        const selectionTop = Math.min(dragStart.y, y);
        const selectionRight = Math.max(dragStart.x, x);
        const selectionBottom = Math.max(dragStart.y, y);

        const { columnCount, itemWidth, itemHeight } = getLayoutInfo();

        const newSelectedIds: number[] = [];

        // Only check items that could potentially be in the selection area
        // Translate selection coords to grid indices
        const startCol = Math.max(0, Math.floor((selectionLeft - PADDING) / (itemWidth + GAP)));
        const endCol = Math.min(columnCount - 1, Math.floor((selectionRight - PADDING) / (itemWidth + GAP)));
        const startRow = Math.max(0, Math.floor((selectionTop - PADDING) / (itemHeight + GAP)));
        const endRow = Math.floor((selectionBottom - PADDING) / (itemHeight + GAP));

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const index = row * columnCount + col;
                if (index >= 0 && index < mediaFiles.length) {
                    const item = mediaFiles[index];

                    // Precise check (incorporating gaps)
                    const itemLeft = PADDING + col * (itemWidth + GAP);
                    const itemTop = PADDING + row * (itemHeight + GAP);
                    const itemRight = itemLeft + itemWidth;
                    const itemBottom = itemTop + itemHeight;

                    if (
                        itemLeft < selectionRight &&
                        itemRight > selectionLeft &&
                        itemTop < selectionBottom &&
                        itemBottom > selectionTop
                    ) {
                        newSelectedIds.push(item.id);
                    }
                }
            }
        }

        if (onSelectionChange) {
            if (e.ctrlKey || e.metaKey) {
                const combined = Array.from(new Set([...selectedMediaIds, ...newSelectedIds]));
                onSelectionChange(combined);
            } else {
                onSelectionChange(newSelectedIds);
            }
        }
    };

    const handleMouseUp = (_e: MouseEvent) => {
        if (!dragStart) {
            setDragStart(null);
            setDragEnd(null);
            return;
        }

        const currentPos = dragCurrentPosRef.current || dragStart;
        const width = Math.abs(dragStart.x - currentPos.x);
        const height = Math.abs(dragStart.y - currentPos.y);

        // Treat as click if movement is very small
        if (width <= 5 && height <= 5) {
            if (onClearSelection) {
                onClearSelection();
            }
        }
        // Selection is already updated during Move

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

    // Calculate selection box in Viewport Coordinates for rendering
    // We need to subtract scroll position because SelectionBox is fixed relative to container
    const currentScrollLeft = gridRef.current?.scrollLeft || 0;
    const currentScrollTop = gridRef.current?.scrollTop || 0;

    const selectionBox = dragStart && dragEnd && (
        <SelectionBox
            top={Math.min(dragStart.y, dragEnd.y) - currentScrollTop}
            left={Math.min(dragStart.x, dragEnd.x) - currentScrollLeft}
            width={Math.abs(dragStart.x - dragEnd.x)}
            height={Math.abs(dragStart.y - dragEnd.y)}
        />
    );

    const { itemWidth, itemHeight, cellWidth, columnCount } = getLayoutInfo();

    return (
        <div
            ref={setContainerRef}
            className={`library-grid view-${viewMode}`}
            style={{ '--grid-size': gridSize, position: 'relative' } as React.CSSProperties}
            onMouseDown={handleMouseDown}
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            {selectionBox}
            <VGrid
                ref={gridRef}
                key={`${gridSize}-${columnCount}-${containerSize.width}-${mediaFiles.length}-${mediaFiles[0]?.id || 'empty'}`}
                row={Math.ceil(mediaFiles.length / columnCount)}
                col={columnCount}
                cellHeight={itemHeight + GAP}
                cellWidth={cellWidth}
                style={{
                    height: '100%',
                    width: '100%',
                    overflowX: 'hidden',
                    padding: `${PADDING}px`,
                    boxSizing: 'border-box'
                }}
            >
                {({ rowIndex, colIndex }) => {
                    const index = rowIndex * columnCount + colIndex;
                    const media = mediaFiles[index];
                    if (!media) return null;
                    return (
                        <div style={{ width: itemWidth, height: itemHeight }}>
                            <MediaCard
                                key={media.id}
                                media={media}
                                onClick={(ev) => onMediaClick(media, ev)}
                                onDoubleClick={() => onMediaDoubleClick(media)}
                                onContextMenu={(ev) => onMediaContextMenu?.(media, ev)}
                                isSelected={selectedMediaIds.includes(media.id)}
                                showName={viewSettings?.showName ?? true}
                                showItemInfo={viewSettings?.showItemInfo ?? true}
                                itemInfoType={viewSettings?.itemInfoType ?? 'duration'}
                                showExtension={viewSettings?.showExtension ?? true}
                                showExtensionLabel={viewSettings?.showExtensionLabel ?? true}
                                thumbnailMode={viewSettings?.thumbnailMode ?? 'speed'}
                                data-id={media.id}
                                onInternalDragStart={onInternalDragStart}
                                onInternalDragEnd={onInternalDragEnd}
                                isRenaming={renamingMediaId === media.id}
                                onRenameSubmit={(newName) => onRenameSubmit?.(media.id, newName)}
                                onRenameCancel={onRenameCancel}
                            />
                        </div>
                    );
                }}
            </VGrid>
        </div>
    );
}
