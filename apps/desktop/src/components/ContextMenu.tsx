import { useRef, useEffect, useCallback } from 'react'
import { MediaFile, Folder, RemoteLibrary } from '@obscura/core'
import { useFloatingPosition } from '../hooks/useFloatingPosition'
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
    availableLibraries?: { name: string; path: string }[]
    remoteLibraries?: RemoteLibrary[]
    onAddToLibrary?: (libraryId: string) => void
    isRemote?: boolean
    onRefreshMetadata?: () => void
    onArmShellAction?: (action: 'open-default' | 'open-with' | 'show-in-explorer') => void
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
    onExport,
    availableLibraries,
    remoteLibraries,
    onAddToLibrary,
    isRemote,
    onRefreshMetadata,
    onArmShellAction
}: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)
    const openedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now())
    const armedActionRef = useRef<{ id: string; at: number; clientX: number; clientY: number } | null>(null)

    const armMenuAction = useCallback((event: React.MouseEvent, actionId: string) => {
        event.preventDefault()
        event.stopPropagation()

        const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - openedAtRef.current
        if (!event.isTrusted || event.button !== 0 || elapsedMs < 150) {
            armedActionRef.current = null
            return
        }

        armedActionRef.current = {
            id: actionId,
            at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            clientX: event.clientX,
            clientY: event.clientY,
        }
        if (
            actionId === 'open-default' ||
            actionId === 'open-with' ||
            actionId === 'show-in-explorer'
        ) {
            onArmShellAction?.(actionId)
        }
    }, [onArmShellAction])

    const handleMenuAction = useCallback((event: React.MouseEvent, actionId: string, action: () => void) => {
        event.preventDefault()
        event.stopPropagation()

        const armedAction = armedActionRef.current
        armedActionRef.current = null

        if (!event.isTrusted || event.button !== 0 || !armedAction || armedAction.id !== actionId) {
            return
        }

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const elapsedMs = now - armedAction.at
        const movedPx = Math.hypot(event.clientX - armedAction.clientX, event.clientY - armedAction.clientY)
        if (elapsedMs > 500 || movedPx > 6 || !document.hasFocus()) {
            armedActionRef.current = null
            return
        }

        action()
    }, [])

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

        const handleBlur = () => {
            armedActionRef.current = null
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)
        window.addEventListener('blur', handleBlur)

        return () => {
            armedActionRef.current = null
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEscape)
            window.removeEventListener('blur', handleBlur)
        }
    }, [onClose])

    // メニュー位置を画面内に収める
    useFloatingPosition(menuRef, x, y, true)

    // フォルダーに追加済みかどうか
    const mediaFolderIds = media.folders?.map(f => f.id) || []

    return (
        <div
            ref={menuRef}
            className="context-menu"
            style={{ left: x, top: y }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
            }}
        >
            <div
                className={`context-menu-item ${isRemote ? 'disabled' : ''}`}
                onMouseDown={!isRemote ? (e) => armMenuAction(e, 'open-default') : undefined}
                onMouseUp={!isRemote ? (e) => handleMenuAction(e, 'open-default', onOpenDefault) : undefined}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>規定のアプリで開く</span>
            </div>

            <div
                className={`context-menu-item ${isRemote ? 'disabled' : ''}`}
                onMouseDown={!isRemote ? (e) => armMenuAction(e, 'open-with') : undefined}
                onMouseUp={!isRemote ? (e) => handleMenuAction(e, 'open-with', onOpenWith) : undefined}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                <span>他のプログラムで開く</span>
            </div>

            <div
                className={`context-menu-item ${isRemote ? 'disabled' : ''}`}
                onMouseDown={!isRemote ? (e) => armMenuAction(e, 'show-in-explorer') : undefined}
                onMouseUp={!isRemote ? (e) => handleMenuAction(e, 'show-in-explorer', onShowInExplorer) : undefined}
            >
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
                        folders.map(folder => {
                            const isChecked = mediaFolderIds.includes(folder.id)
                            return (
                                <div
                                    key={folder.id}
                                    className={`context-menu-item context-menu-folder-item ${isChecked ? 'checked' : ''}`}
                                    onMouseDown={(e) => armMenuAction(e, `folder:${folder.id}`)}
                                    onMouseUp={(e) => handleMenuAction(e, `folder:${folder.id}`, () => onAddToFolder(folder.id))}
                                >
                                    <span className={`context-menu-checkbox ${isChecked ? 'checked' : ''}`} aria-hidden="true">
                                        {isChecked && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </span>
                                    <span>{folder.name}</span>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>


            {/* 他のライブラリに追加サブメニュー */}
            {
                onAddToLibrary && (
                    <div className="context-menu-item has-submenu">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34" />
                            <polygon points="18 2 22 6 12 16 8 16 8 12 18 2" />
                        </svg>
                        <span>他のライブラリに追加</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="submenu-arrow">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <div className="context-submenu">
                            {availableLibraries && availableLibraries.length > 0 && (
                                <>
                                    <div className="context-menu-header">ローカル</div>
                                    {availableLibraries.map(lib => (
                                        <div
                                            key={lib.path}
                                            className="context-menu-item"
                                            onMouseDown={(e) => armMenuAction(e, `library-path:${lib.path}`)}
                                            onMouseUp={(e) => handleMenuAction(e, `library-path:${lib.path}`, () => onAddToLibrary(lib.path))}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                            </svg>
                                            <span>{lib.name}</span>
                                        </div>
                                    ))}
                                </>
                            )}

                            {remoteLibraries && remoteLibraries.length > 0 && (
                                <>
                                    {availableLibraries && availableLibraries.length > 0 && (
                                        <div className="context-menu-separator" />
                                    )}
                                    <div className="context-menu-header">リモート</div>
                                    {remoteLibraries.map(lib => (
                                        <div
                                            key={lib.id}
                                            className="context-menu-item"
                                            onMouseDown={(e) => armMenuAction(e, `library-id:${lib.id}`)}
                                            onMouseUp={(e) => handleMenuAction(e, `library-id:${lib.id}`, () => onAddToLibrary(lib.id))}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                                            </svg>
                                            <span>{lib.name}</span>
                                        </div>
                                    ))}
                                </>
                            )}

                            {(!availableLibraries || availableLibraries.length === 0) && (!remoteLibraries || remoteLibraries.length === 0) && (
                                <div className="context-menu-item disabled">
                                    <span>ライブラリがありません</span>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            <div className="context-menu-separator" />

            <div
                className="context-menu-item"
                onMouseDown={(e) => armMenuAction(e, 'rename')}
                onMouseUp={(e) => handleMenuAction(e, 'rename', onRename)}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>名前の変更</span>
            </div>

            {
                onRefreshMetadata && (
                    <div
                        className="context-menu-item"
                        onMouseDown={(e) => armMenuAction(e, 'refresh-metadata')}
                        onMouseUp={(e) => handleMenuAction(e, 'refresh-metadata', onRefreshMetadata)}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        <span>メタデータを再取得</span>
                    </div>
                )
            }

            {
                onExport && (
                    <div
                        className="context-menu-item"
                        onMouseDown={(e) => armMenuAction(e, 'export')}
                        onMouseUp={(e) => handleMenuAction(e, 'export', () => onExport(media))}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>エクスポート</span>
                    </div>
                )
            }

            {
                onDownload && (
                    <div
                        className="context-menu-item"
                        onMouseDown={(e) => armMenuAction(e, 'download')}
                        onMouseUp={(e) => handleMenuAction(e, 'download', onDownload)}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>ダウンロード</span>
                    </div>
                )
            }

            <div
                className="context-menu-item"
                onMouseDown={(e) => armMenuAction(e, 'copy')}
                onMouseUp={(e) => handleMenuAction(e, 'copy', onCopy)}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>コピー</span>
            </div>

            <div
                className="context-menu-item"
                onMouseDown={(e) => armMenuAction(e, 'copy-path')}
                onMouseUp={(e) => handleMenuAction(e, 'copy-path', onCopyPath)}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
                <span>パスをコピー</span>
            </div>

            <div className="context-menu-separator" />

            <div
                className="context-menu-item danger"
                onMouseDown={(e) => armMenuAction(e, 'move-to-trash')}
                onMouseUp={(e) => handleMenuAction(e, 'move-to-trash', onMoveToTrash)}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>ゴミ箱へ移動</span>
            </div>
        </div >
    )
}
