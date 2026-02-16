import React, { useState, useMemo } from 'react'
import { api } from '../api'

interface OrphanItem {
    type: 'folder_orphan' | 'empty_orphan'
    path: string // Folders path
    file_path?: string // Representative file path
    name?: string
    size?: number
    reason: string
}

interface FileSystemCleanupModalProps {
    orphans: OrphanItem[]
    onClose: () => void
    onDeleted: () => void
}

const formatSize = (bytes?: number) => {
    if (bytes === undefined) return '-'
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const FileSystemCleanupModal: React.FC<FileSystemCleanupModalProps> = ({ orphans, onClose, onDeleted }) => {
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
    const [isDeleting, setIsDeleting] = useState(false)

    const toggleSelection = (path: string) => {
        const newSet = new Set(selectedPaths)
        if (newSet.has(path)) {
            newSet.delete(path)
        } else {
            newSet.add(path)
        }
        setSelectedPaths(newSet)
    }

    const toggleAll = () => {
        if (selectedPaths.size === orphans.length) {
            setSelectedPaths(new Set())
        } else {
            setSelectedPaths(new Set(orphans.map(o => o.path)))
        }
    }

    const handleDelete = async () => {
        if (selectedPaths.size === 0) return
        if (!confirm(`${selectedPaths.size} 件の項目を完全に削除しますか？\nこの操作は取り消せません。`)) return

        setIsDeleting(true)
        try {
            await api.deleteFileSystemFiles(Array.from(selectedPaths))
            alert('削除が完了しました')
            onDeleted()
            onClose()
        } catch (e) {
            console.error('Deletion failed:', e)
            alert('一部の削除に失敗しました')
        } finally {
            setIsDeleting(false)
        }
    }

    const totalSize = useMemo(() => {
        return orphans.reduce((acc, item) => acc + (item.size || 0), 0)
    }, [orphans])

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <div className="modal-content" style={{
                backgroundColor: '#1e1e1e', width: '800px', maxHeight: '90vh',
                borderRadius: '8px', display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', border: '1px solid #333'
            }}>
                <div className="modal-header" style={{
                    padding: '15px 20px', borderBottom: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h3 style={{ margin: 0, color: '#e74c3c' }}>ファイルシステム残骸スキャン結果</h3>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer'
                    }}>×</button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    <div className="summary" style={{ marginBottom: '20px', color: '#ccc' }}>
                        <p>
                            <strong>{orphans.length}</strong> 件の管理外フォルダー/ファイルが見つかりました。<br />
                            推定合計サイズ: <strong>{formatSize(totalSize)}</strong>
                        </p>
                        <p style={{ fontSize: '0.9em', color: '#888' }}>
                            これらはデータベースに登録されていないファイルです。インポートに失敗した残骸の可能性があります。
                        </p>
                    </div>

                    <div className="file-list" style={{ border: '1px solid #333', borderRadius: '4px', maxHeight: '500px', overflowY: 'auto' }}>
                        <div className="file-list-header" style={{
                            display: 'flex', padding: '10px', background: '#252525', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '0.9em'
                        }}>
                            <div style={{ width: '40px', textAlign: 'center' }}>
                                <input type="checkbox"
                                    checked={orphans.length > 0 && selectedPaths.size === orphans.length}
                                    onChange={toggleAll}
                                />
                            </div>
                            <div style={{ flex: 2 }}>パス / ファイル名</div>
                            <div style={{ width: '100px' }}>サイズ</div>
                            <div style={{ width: '150px' }}>理由</div>
                        </div>
                        {orphans.map((item) => (
                            <div key={item.path} className="file-list-row" style={{
                                display: 'flex', padding: '10px', alignItems: 'center', borderBottom: '1px solid #333',
                                backgroundColor: selectedPaths.has(item.path) ? '#2c3e50' : 'transparent'
                            }}>
                                <div style={{ width: '40px', textAlign: 'center' }}>
                                    <input type="checkbox"
                                        checked={selectedPaths.has(item.path)}
                                        onChange={() => toggleSelection(item.path)}
                                    />
                                </div>
                                <div style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '10px' }} title={item.path}>
                                    <div style={{ fontWeight: 'bold', color: '#fff' }}>{item.name || 'Unknown'}</div>
                                    <div style={{ fontSize: '0.8em', color: '#888' }}>{item.path}</div>
                                </div>
                                <div style={{ width: '100px', color: '#ccc' }}>{formatSize(item.size)}</div>
                                <div style={{ width: '150px', color: '#e74c3c', fontSize: '0.9em' }}>{item.reason}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-footer" style={{
                    padding: '15px 20px', borderTop: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <span style={{ color: '#888' }}>
                        {selectedPaths.size} 項目選択中
                    </span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={onClose} style={{
                            padding: '8px 16px', background: 'transparent', color: '#ccc', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer'
                        }}>キャンセル</button>
                        <button onClick={handleDelete} disabled={selectedPaths.size === 0 || isDeleting} style={{
                            padding: '8px 20px', background: '#c0392b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
                            opacity: (selectedPaths.size === 0 || isDeleting) ? 0.5 : 1
                        }}>
                            {isDeleting ? '削除中...' : '選択項目を削除'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
