import React, { useState } from 'react'
import { DuplicateCriteria } from '@obscura/core'
import './DuplicateModal.css'

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
        setCriteria((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const canSearch = mode === 'filesystem' || Object.values(criteria).some(Boolean)

    const handleSearch = () => {
        if (mode === 'filesystem') {
            if (onFileSystemScan) onFileSystemScan()
            onClose()
            return
        }
        onSearch(criteria)
    }

    return (
        <div className="duplicate-modal-overlay">
            <div className="duplicate-modal duplicate-search-modal">
                <div className="duplicate-modal-header">
                    <h3>重複ファイル検索</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="duplicate-modal-tabs">
                    <button
                        className={`duplicate-modal-tab-btn ${mode === 'database' ? 'active' : ''}`}
                        onClick={() => setMode('database')}
                    >
                        DB検索
                    </button>
                    <button
                        className={`duplicate-modal-tab-btn ${mode === 'filesystem' ? 'active' : ''}`}
                        onClick={() => setMode('filesystem')}
                    >
                        ファイルスキャン (詳細)
                    </button>
                </div>

                <div className="duplicate-search-content">
                    {mode === 'database' ? (
                        <>
                            <p className="duplicate-search-note">
                                ライブラリDB内で登録済みメディアの重複候補を検索します。
                            </p>
                            <div className="criteria-list">
                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={criteria.name}
                                        onChange={() => handleToggle('name')}
                                    />
                                    ファイル名
                                </label>
                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={criteria.size}
                                        onChange={() => handleToggle('size')}
                                    />
                                    ファイルサイズ
                                </label>
                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={criteria.duration}
                                        onChange={() => handleToggle('duration')}
                                    />
                                    再生時間
                                </label>
                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={criteria.modified}
                                        onChange={() => handleToggle('modified')}
                                    />
                                    更新日時
                                </label>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="duplicate-search-warning">
                                <strong>注意:</strong> この操作はライブラリフォルダー全体をスキャンします。
                            </p>
                            <p className="duplicate-search-note">
                                データベースに登録されていないファイル（インポートエラーの残骸など）を検索し、必要に応じてリストを再構築できます。
                            </p>
                            <p className="duplicate-search-hint">
                                スキャンには時間がかかる場合があります。
                            </p>
                        </>
                    )}
                </div>

                <div className="duplicate-modal-footer">
                    <button className="cancel-btn" onClick={onClose}>
                        キャンセル
                    </button>
                    <button
                        className={`confirm-btn ${mode === 'filesystem' ? 'danger' : ''}`}
                        onClick={handleSearch}
                        disabled={!canSearch}
                    >
                        {mode === 'filesystem' ? 'スキャン開始' : '検索開始'}
                    </button>
                </div>
            </div>
        </div>
    )
}
