import React, { useState } from 'react'
import { DuplicateCriteria } from '../types'
import './DuplicateModal.css' // Use existing styles or create new one if needed, assuming reusing typical modal styles

interface DuplicateSearchModalProps {
    onSearch: (criteria: DuplicateCriteria) => void
    onClose: () => void
}

export const DuplicateSearchModal: React.FC<DuplicateSearchModalProps> = ({ onSearch, onClose }) => {
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
        // Ensure at least one criterion is selected is handled by backend or allowed generally?
        // Let's allow whatever, but maybe warn if nothing selected?
        // For now, just pass it.
        onSearch(criteria)
    }

    // Reuse duplicate-modal logic for backdrop/container if possible, or simple modal structure
    return (
        <div className="duplicate-modal-overlay">
            <div className="duplicate-modal" style={{ maxWidth: '400px', height: 'auto', minHeight: 'auto' }}>
                <div className="duplicate-modal-header">
                    <h3>重複検索の設定</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="duplicate-search-content" style={{ padding: '20px' }}>
                    <p style={{ marginBottom: '15px' }}>検索に使用する条件を選択してください。</p>

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
                    <button className="confirm-btn" onClick={handleSearch} disabled={!Object.values(criteria).some(Boolean)} style={{
                        opacity: Object.values(criteria).some(Boolean) ? 1 : 0.5
                    }}>
                        検索開始
                    </button>
                </div>
            </div>
        </div>
    )
}
