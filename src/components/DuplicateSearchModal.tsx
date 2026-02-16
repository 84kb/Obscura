import React, { useState } from 'react'
import { DuplicateCriteria } from '../types'
import './DuplicateModal.css' // Use existing styles or create new one if needed, assuming reusing typical modal styles

interface DuplicateSearchModalProps {
    onSearch: (criteria: DuplicateCriteria) => void
    onClose: () => void
    onFileSystemScan?: () => void
}

export const DuplicateSearchModal: React.FC<DuplicateSearchModalProps> = ({ onSearch, onClose, onFileSystemScan }) => {
    const [mode, setMode] = useState<'database' | 'filesystem'>('database')
    const [criteria, setCriteria] = useState<DuplicateCriteria>({
        name: true,
        size: true,
        duration: false,
        modified: false
    })

    const handleToggle = (key: keyof DuplicateCriteria) => {
        setCriteria(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const handleSearch = () => {
        if (mode === 'filesystem') {
            if (onFileSystemScan) onFileSystemScan()
            onClose() // Close modal after triggering
        } else {
            onSearch(criteria)
        }
    }

    return (
        <div className="duplicate-modal-overlay">
            <div className="duplicate-modal" style={{ maxWidth: '450px' }}>
                <div className="duplicate-modal-header">
                    <h3>重複・孤立ファイル検索</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="duplicate-modal-tabs" style={{ display: 'flex', borderBottom: '1px solid #444', marginBottom: '15px' }}>
                    <button
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: mode === 'database' ? '#333' : 'transparent',
                            color: mode === 'database' ? '#fff' : '#888',
                            border: 'none',
                            cursor: 'pointer',
                            borderBottom: mode === 'database' ? '2px solid #007bff' : 'none'
                        }}
                        onClick={() => setMode('database')}
                    >
                        DB内重複
                    </button>
                    <button
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: mode === 'filesystem' ? '#333' : 'transparent',
                            color: mode === 'filesystem' ? '#fff' : '#888',
                            border: 'none',
                            cursor: 'pointer',
                            borderBottom: mode === 'filesystem' ? '2px solid #007bff' : 'none'
                        }}
                        onClick={() => setMode('filesystem')}
                    >
                        完全スキャン (残骸)
                    </button>
                </div>

                <div className="duplicate-search-content" style={{ padding: '0 20px 20px 20px' }}>
                    {mode === 'database' ? (
                        <>
                            <p style={{ marginBottom: '15px', fontSize: '0.9rem', color: '#ccc' }}>
                                ライブラリDB内で登録済みの重複アイテムを検索します。
                            </p>
                            <div className="criteria-list">
                                <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={criteria.name}
                                        onChange={() => handleToggle('name')}
                                        style={{ marginRight: '10px' }}
                                    />
                                    ファイル名
                                </label>
                                <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={criteria.size}
                                        onChange={() => handleToggle('size')}
                                        style={{ marginRight: '10px' }}
                                    />
                                    ファイルサイズ
                                </label>
                                <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={criteria.duration}
                                        onChange={() => handleToggle('duration')}
                                        style={{ marginRight: '10px' }}
                                    />
                                    再生時間
                                </label>
                                <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={criteria.modified}
                                        onChange={() => handleToggle('modified')}
                                        style={{ marginRight: '10px' }}
                                    />
                                    変更日
                                </label>
                            </div>
                        </>
                    ) : (
                        <>
                            <p style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#e74c3c' }}>
                                <strong>注意:</strong> この機能はライブラリフォルダ内の全ファイルを物理スキャンします。
                            </p>
                            <p style={{ marginBottom: '15px', fontSize: '0.9rem', color: '#ccc' }}>
                                データベースに登録されていない動画ファイル（インポートエラーの残骸など）を検出し、削除候補としてリストアップします。
                            </p>
                            <p style={{ fontSize: '0.85rem', color: '#888' }}>
                                ※ 処理には時間がかかる場合があります。
                            </p>
                        </>
                    )}
                </div>

                <div className="duplicate-modal-footer">
                    <button className="cancel-btn" onClick={onClose} style={{
                        padding: '8px 16px',
                        border: '1px solid #444',
                        background: 'transparent',
                        color: '#ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginRight: '10px'
                    }}>
                        キャンセル
                    </button>
                    <button className="confirm-btn" onClick={handleSearch} disabled={mode === 'database' && !Object.values(criteria).some(Boolean)} style={{
                        opacity: (mode === 'filesystem' || Object.values(criteria).some(Boolean)) ? 1 : 0.5,
                        background: mode === 'filesystem' ? '#e74c3c' : undefined,
                        border: mode === 'filesystem' ? '1px solid #c0392b' : undefined
                    }}>
                        {mode === 'filesystem' ? 'スキャン開始' : '検索開始'}
                    </button>
                </div>
            </div>
        </div>
    )
}
