import React from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import { MediaFile, ViewSettings, FilterOptions } from '../types'
import { formatSize, formatDate } from '../utils/format'
import { toMediaUrl } from '../utils/fileUrl'
import './ListView.css'

interface ListViewProps {
    mediaFiles: MediaFile[]
    selectedIds: number[]
    onSelect: (media: MediaFile, e: React.MouseEvent) => void
    onDoubleClick: (media: MediaFile) => void
    onContextMenu: (media: MediaFile, e: React.MouseEvent) => void
    viewSettings: ViewSettings
    updateViewSettings: (updates: Partial<ViewSettings>) => void
    filterOptions: FilterOptions
    onFilterChange: (options: FilterOptions) => void
}

interface ListViewContext {
    mediaFiles: MediaFile[]
    selectedIds: number[]
    onSelect: (media: MediaFile, e: React.MouseEvent) => void
    onDoubleClick: (media: MediaFile) => void
    onContextMenu: (media: MediaFile, e: React.MouseEvent) => void
}

const COLUMN_DEFS = {
    tags: { label: 'タグ', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg> },
    resolution: { label: '解像度', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18M9 21V9"></path></svg> },
    rating: { label: '評価', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> },
    extension: { label: '拡張子', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> },
    size: { label: 'ファイル サイズ', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> },
    modified: { label: '変更日', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> },
    created: { label: '追加日', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> },
    artist: { label: '投稿者', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },
}

// ヘッダー用コンテキストメニュー
const HeaderContextMenu: React.FC<{
    x: number, y: number,
    settings: ViewSettings['listColumns'],
    onToggle: (key: keyof NonNullable<ViewSettings['listColumns']>) => void,
    onClose: () => void
}> = ({ x, y, settings, onToggle, onClose }) => {
    const menuRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    if (!settings) return null

    return (
        <div ref={menuRef} className="list-view-header-menu" style={{ left: x, top: y }}>
            {(Object.keys(COLUMN_DEFS) as Array<keyof typeof COLUMN_DEFS>).map(key => (
                <div key={key} className="header-menu-item" onClick={() => onToggle(key)}>
                    <span className="menu-icon">{COLUMN_DEFS[key].icon}</span>
                    <span className="menu-label">{COLUMN_DEFS[key].label}</span>
                    <span className="menu-check">{settings[key] ? '✓' : ''}</span>
                </div>
            ))}
        </div>
    )
}

// 一覧表示用のサムネイルコンポーネント (高速スクロール対策)
const ListThumbnail: React.FC<{ media: MediaFile, thumbnailMode: 'speed' | 'quality' }> = ({ media, thumbnailMode }) => {
    const [src, setSrc] = React.useState<string | null>(null);

    React.useEffect(() => {
        setSrc(null);
        if (!media.thumbnail_path) return;

        let timeoutId: NodeJS.Timeout | null = null;
        const update = () => {
            const url = toMediaUrl(media.thumbnail_path!)
            setSrc(thumbnailMode === 'speed' ? `${url}?width=48` : url);
        };

        if (thumbnailMode === 'speed') {
            timeoutId = setTimeout(update, 150);
        } else {
            update();
        }

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [media.id, media.thumbnail_path, thumbnailMode]);

    if (!media.thumbnail_path) return null;
    if (!src) return (
        <div
            className="list-view-thumbnail placeholder"
            style={{ backgroundColor: media.dominant_color || 'var(--bg-card)' }}
        />
    );

    return <img src={src} alt="" className="list-view-thumbnail" loading="lazy" />;
};

export const ListView: React.FC<ListViewProps> = ({
    mediaFiles,
    selectedIds,
    onSelect,
    onDoubleClick,
    onContextMenu,
    viewSettings: _viewSettings,
    updateViewSettings,
    filterOptions,
    onFilterChange
}) => {
    const [headerMenu, setHeaderMenu] = React.useState<{ x: number, y: number } | null>(null)
    const listColumns = _viewSettings.listColumns || {
        tags: true, resolution: true, rating: true, extension: true,
        size: true, modified: true, created: true, artist: true
    }

    // ファイルタイプに応じたアイコンを表示
    const renderIcon = React.useCallback((media: MediaFile) => {
        if (media.thumbnail_path) {
            return <ListThumbnail media={media} thumbnailMode={_viewSettings.thumbnailMode || 'speed'} />
        }

        // サムネイルがない場合のみアイコンを表示
        return (
            <div
                className="list-view-icon"
                style={{ backgroundColor: media.dominant_color || 'var(--bg-secondary)' }}
            >
                {media.file_type === 'video' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                )}
            </div>
        )
    }, [_viewSettings.thumbnailMode])

    const renderRating = (rating?: number) => {
        if (!rating) return null
        return '★'.repeat(rating) + '☆'.repeat(5 - rating)
    }

    const handleHeaderClick = React.useCallback((field: string) => {
        const isCurrent = filterOptions.sortOrder === field
        const defaultDir = field === 'name' ? 'asc' : 'desc'

        if (isCurrent) {
            onFilterChange({
                ...filterOptions,
                sortDirection: filterOptions.sortDirection === 'asc' ? 'desc' : 'asc'
            })
        } else {
            onFilterChange({ ...filterOptions, sortOrder: field as any, sortDirection: defaultDir })
        }
    }, [filterOptions, onFilterChange])

    const handleHeaderContextMenu = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setHeaderMenu({ x: e.clientX, y: e.clientY })
    }, [])

    const toggleColumn = React.useCallback((key: keyof NonNullable<ViewSettings['listColumns']>) => {
        updateViewSettings({
            listColumns: {
                ...listColumns,
                [key]: !listColumns[key]
            }
        })
    }, [listColumns, updateViewSettings])

    const renderSortIcon = React.useCallback((field: string) => {
        if (filterOptions.sortOrder !== field) return null
        return (
            <span className={`sort-icon ${filterOptions.sortDirection}`}>
                {filterOptions.sortDirection === 'asc' ? '▲' : '▼'}
            </span>
        )
    }, [filterOptions.sortOrder, filterOptions.sortDirection])

    const fixedHeaderContent = React.useCallback(() => (
        <tr className="list-view-header-row" onContextMenu={handleHeaderContextMenu}>
            <th style={{ width: 'auto' }} onClick={() => handleHeaderClick('name')}>
                <div className="header-cell-content">名前 {renderSortIcon('name')}</div>
            </th>
            {listColumns.tags && <th style={{ width: '200px' }}>タグ</th>}
            {listColumns.resolution && <th style={{ width: '100px' }}>解像度</th>}
            {listColumns.rating && (
                <th style={{ width: '100px' }} onClick={() => handleHeaderClick('rating')}>
                    <div className="header-cell-content">評価 {renderSortIcon('rating')}</div>
                </th>
            )}
            {listColumns.extension && <th style={{ width: '80px' }}>拡張子</th>}
            {listColumns.size && (
                <th style={{ width: '100px' }} onClick={() => handleHeaderClick('size')}>
                    <div className="header-cell-content">サイズ {renderSortIcon('size')}</div>
                </th>
            )}
            {listColumns.modified && (
                <th style={{ width: '160px' }} onClick={() => handleHeaderClick('modified')}>
                    <div className="header-cell-content">変更日 {renderSortIcon('modified')}</div>
                </th>
            )}
            {listColumns.created && (
                <th style={{ width: '160px' }} onClick={() => handleHeaderClick('date')}>
                    <div className="header-cell-content">追加日 {renderSortIcon('date')}</div>
                </th>
            )}
            {listColumns.artist && (
                <th style={{ width: '180px' }} onClick={() => handleHeaderClick('artist')}>
                    <div className="header-cell-content">投稿者 {renderSortIcon('artist')}</div>
                </th>
            )}
        </tr>
    ), [listColumns, handleHeaderContextMenu, handleHeaderClick, renderSortIcon])

    const rowContent = React.useCallback((_index: number, media: MediaFile) => {
        const resolution = media.width && media.height ? `${media.width}x${media.height}` : '-'
        const ext = media.file_name.split('.').pop()?.toUpperCase() || '-'

        return (
            <>
                <td className="list-view-cell name-cell">
                    {renderIcon(media)}
                    <span title={media.file_name}>{media.file_name}</span>
                </td>
                {listColumns.tags && (
                    <td className="list-view-cell">
                        <div className="list-view-tags">
                            {media.tags?.slice(0, 3).map(t => (
                                <span key={t.id} className="list-view-tag-chip">{t.name}</span>
                            ))}
                            {(media.tags?.length || 0) > 3 && <span className="tag-more">...</span>}
                        </div>
                    </td>
                )}
                {listColumns.resolution && <td className="list-view-cell">{resolution}</td>}
                {listColumns.rating && <td className="list-view-cell rating-cell">{renderRating(media.rating)}</td>}
                {listColumns.extension && <td className="list-view-cell">{ext}</td>}
                {listColumns.size && <td className="list-view-cell">{formatSize(media.file_size)}</td>}
                {listColumns.modified && <td className="list-view-cell">{formatDate(media.modified_date || media.created_at)}</td>}
                {listColumns.created && <td className="list-view-cell">{formatDate(media.created_at)}</td>}
                {listColumns.artist && <td className="list-view-cell">{media.artist || media.artists?.join(', ')}</td>}
            </>
        )
    }, [listColumns, renderIcon, renderRating])

    const virtuosoComponents = React.useMemo(() => ({
        Table: React.forwardRef<HTMLTableElement, React.ComponentProps<'table'>>((props, ref) => (
            <table {...props} ref={ref} className="list-view-table" style={{ ...props.style, borderCollapse: 'collapse' }} />
        )),
        TableHead: React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'thead'>>((props, ref) => (
            <thead {...props} ref={ref} className="list-view-header" />
        )),
        TableRow: React.forwardRef<HTMLTableRowElement, React.ComponentProps<'tr'> & { context?: ListViewContext }>((props, ref) => {
            const index = (props as any)['data-index']
            const context = props.context!
            const media = context.mediaFiles[index]
            if (!media) return <tr {...props} ref={ref} />
            const isSelected = context.selectedIds.includes(media.id)

            return (
                <tr
                    {...props}
                    ref={ref}
                    className={`list-view-row ${isSelected ? 'selected' : ''}`}
                    onClick={(e) => context.onSelect(media, e)}
                    onDoubleClick={() => context.onDoubleClick(media)}
                    onContextMenu={(e) => context.onContextMenu(media, e)}
                    draggable={true}
                    onDragStart={(e) => {
                        e.preventDefault()
                        const dragIds = isSelected ? context.selectedIds : [media.id]
                        const dragFiles = context.mediaFiles.filter(m => dragIds.includes(m.id)).map(m => m.file_path)
                        window.electronAPI.startDrag(dragFiles)
                    }}
                />
            )
        })
    }), []) // Dependencies removed for complete stability

    const virtuosoContext = React.useMemo<ListViewContext>(() => ({
        mediaFiles,
        selectedIds,
        onSelect,
        onDoubleClick,
        onContextMenu
    }), [mediaFiles, selectedIds, onSelect, onDoubleClick, onContextMenu])

    return (
        <div className="list-view-container">
            <TableVirtuoso
                style={{ height: '100%' }}
                data={mediaFiles}
                fixedHeaderContent={fixedHeaderContent}
                itemContent={rowContent}
                components={virtuosoComponents}
                context={virtuosoContext}
            />
            {headerMenu && (
                <HeaderContextMenu
                    x={headerMenu.x}
                    y={headerMenu.y}
                    settings={listColumns}
                    onToggle={toggleColumn}
                    onClose={() => setHeaderMenu(null)}
                />
            )}
        </div>
    )
}
