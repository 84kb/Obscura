import { useEffect, useRef } from 'react'
import { MediaFile, Folder } from '../types'
import './ContextMenu.css'

interface ContextMenuProps {
    x: number
    y: number
    media: MediaFile
    folders: Folder[]
    onClose: () => void
    onOpenDefault: () => void
    onOpenWith: () => void
    onShowInExplorer: () => void
    onAddToFolder: (folderId: number) => void
    onRename: () => void
    onCopy: () => void
    onCopyPath: () => void
    onMoveToTrash: () => void
    onDownload?: () => void
    onExport?: (media: MediaFile) => void
}

export function ContextMenu({
    x,
    y,
    media,
    folders,
    onClose,
    onOpenDefault,
    onOpenWith,
    onShowInExplorer,
    onAddToFolder,
    onRename,
    onCopy,
    onCopyPath,
    onMoveToTrash,
    onDownload,
    onExport
}: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)

    // クリック外で閉じる
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [onClose])

    // メニュー位置を画面内に収める
    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect()
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight

            let adjustedX = x
            let adjustedY = y

            if (x + rect.width > viewportWidth) {
                adjustedX = viewportWidth - rect.width - 10
            }
            if (y + rect.height > viewportHeight) {
                adjustedY = viewportHeight - rect.height - 10
            }

            menuRef.current.style.left = `${adjustedX}px`
            menuRef.current.style.top = `${adjustedY}px`
        }
    }, [x, y])

    // フォルダーに追加済みかどうか
    const mediaFolderIds = media.folders?.map(f => f.id) || []

    return (
        <div
            ref={menuRef}
            className="context-menu"
            style={{ left: x, top: y }}
        >
            <div className="context-menu-item" onClick={onOpenDefault}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>規定のアプリで開く</span>
            </div>

            <div className="context-menu-item" onClick={onOpenWith}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                <span>他のプログラムで開く</span>
            </div>

            <div className="context-menu-item" onClick={onShowInExplorer}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>エクスプローラーで表示</span>
            </div>

            <div className="context-menu-separator" />

            {/* フォルダーに追加サブメニュー */}
            <div className="context-menu-item has-submenu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span>フォルダに追加</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="submenu-arrow">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
                <div className="context-submenu">
                    {folders.length === 0 ? (
                        <div className="context-menu-item disabled">
                            <span>フォルダがありません</span>
                        </div>
                    ) : (
                        folders.map(folder => (
                            <div
                                key={folder.id}
                                className={`context-menu-item ${mediaFolderIds.includes(folder.id) ? 'checked' : ''}`}
                                onClick={() => onAddToFolder(folder.id)}
                            >
                                {mediaFolderIds.includes(folder.id) && (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                                <span>{folder.name}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-item" onClick={onRename}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>名前の変更</span>
            </div>

            {onExport && (
                <div className="context-menu-item" onClick={() => onExport(media)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>エクスポート</span>
                </div>
            )}

            {onDownload && (
                <div className="context-menu-item" onClick={onDownload}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>ダウンロード</span>
                </div>
            )}

            <div className="context-menu-item" onClick={onCopy}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>コピー</span>
            </div>

            <div className="context-menu-item" onClick={onCopyPath}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
                <span>パスをコピー</span>
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-item danger" onClick={onMoveToTrash}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>ゴミ箱へ移動</span>
            </div>
        </div>
    )
}
