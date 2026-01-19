import React, { useState } from 'react'
import { MediaFile } from '../types'
import './DuplicateModal.css'

interface DuplicateModalProps {
    duplicate: {
        newMedia: MediaFile
        existingMedia: MediaFile
    }
    onResolve: (action: 'skip' | 'replace' | 'both') => void
}

// ファイルサイズを読みやすい形式に変換
const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const DuplicateModal: React.FC<DuplicateModalProps> = ({ duplicate, onResolve }) => {
    const [selectedOption, setSelectedOption] = useState<'existing' | 'new' | 'both'>('existing')

    const { newMedia, existingMedia } = duplicate

    // 既存ファイルのサムネイルURL
    const existingThumbUrl = existingMedia.thumbnail_path
        ? `media://${existingMedia.thumbnail_path.replace(/\\/g, '/')}`
        : ''

    // 新規ファイルのサムネイルURL (すでにインポート済みなので thumbnail_path がある)
    const newThumbUrl = newMedia.thumbnail_path
        ? `media://${newMedia.thumbnail_path.replace(/\\/g, '/')}`
        : ''

    const handleConfirm = () => {
        if (selectedOption === 'existing') {
            onResolve('skip')
        } else if (selectedOption === 'new') {
            onResolve('replace')
        } else {
            onResolve('both')
        }
    }

    return (
        <div className="duplicate-modal-overlay">
            <div className="duplicate-modal">
                <div className="duplicate-modal-header">
                    <h3>重複追加の警告</h3>
                    <button className="close-btn" onClick={() => onResolve('skip')}>×</button>
                </div>

                <div className="duplicate-comparison">
                    {/* 既存ファイル */}
                    <div className={`duplicate-card existing ${selectedOption === 'existing' ? 'active' : ''}`} onClick={() => setSelectedOption('existing')}>
                        <div className="preview-container">
                            {existingThumbUrl ? (
                                <img src={existingThumbUrl} alt="Existing" />
                            ) : (
                                <div className="no-preview">No Preview</div>
                            )}
                            <span className="status-badge existing">すでに存在しています</span>
                        </div>
                        <div className="file-info">
                            <div className="file-name">{existingMedia.file_name}</div>
                            <div className="file-meta">
                                {existingMedia.width} × {existingMedia.height} / {formatSize(existingMedia.file_size)} / {existingMedia.file_type.toUpperCase()}
                            </div>
                            <div className="card-footer">
                                {existingMedia.folders && existingMedia.folders.length > 0 ? (
                                    existingMedia.folders.map(f => (
                                        <span key={f.id} className="info-tag">{f.name}</span>
                                    ))
                                ) : (
                                    <span className="info-tag empty">フォルダーなし</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 新しいファイル */}
                    <div className={`duplicate-card new ${selectedOption === 'new' ? 'active' : ''}`} onClick={() => setSelectedOption('new')}>
                        <div className="preview-container">
                            {newThumbUrl ? (
                                <img src={newThumbUrl} alt="New" />
                            ) : (
                                <div className="no-preview">No Preview</div>
                            )}
                            <span className="status-badge new">新しいファイル</span>
                        </div>
                        <div className="file-info">
                            <div className="file-name">{newMedia.file_name}</div>
                            <div className="file-meta">
                                {newMedia.width} × {newMedia.height} / {formatSize(newMedia.file_size)} / {newMedia.file_type.toUpperCase()}
                            </div>
                            <div className="card-footer">
                                {newMedia.folders && newMedia.folders.length > 0 ? (
                                    newMedia.folders.map(f => (
                                        <span key={f.id} className="info-tag">{f.name}</span>
                                    ))
                                ) : (
                                    <span className="info-tag empty">フォルダーなし</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="duplicate-modal-footer">
                    <div className="option-group">
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="duplicate-action"
                                checked={selectedOption === 'existing'}
                                onChange={() => setSelectedOption('existing')}
                            />
                            既存の項目を使用
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="duplicate-action"
                                checked={selectedOption === 'new'}
                                onChange={() => setSelectedOption('new')}
                            />
                            新しいファイルを使用
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="duplicate-action"
                                checked={selectedOption === 'both'}
                                onChange={() => setSelectedOption('both')}
                            />
                            両方を保持
                        </label>
                    </div>

                    <button className="confirm-btn" onClick={handleConfirm}>
                        インポート
                    </button>
                </div>
            </div>
        </div>
    )
}
