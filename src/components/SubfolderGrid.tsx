import { Folder } from '../types'
import './SubfolderGrid.css'

interface SubfolderGridProps {
    subfolders: Folder[]
    onSelectFolder: (folderId: number) => void
    getMediaCount: (folderId: number) => number
}

// フォルダーアイコン
const FolderIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
)

export function SubfolderGrid({ subfolders, onSelectFolder, getMediaCount }: SubfolderGridProps) {
    if (subfolders.length === 0) return null

    return (
        <div className="subfolder-section">
            <h3 className="subfolder-section-title">
                サブフォルダー ({subfolders.length})
            </h3>
            <div className="subfolder-grid">
                {subfolders.map(folder => (
                    <div
                        key={folder.id}
                        className="subfolder-card"
                        onClick={() => onSelectFolder(folder.id)}
                    >
                        <div className="subfolder-icon">
                            <FolderIcon />
                        </div>
                        <div className="subfolder-info">
                            <span className="subfolder-name">{folder.name}</span>
                            <span className="subfolder-count">{getMediaCount(folder.id)} 項目</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
