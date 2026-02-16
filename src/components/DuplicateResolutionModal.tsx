import React, { useState, useEffect } from 'react'
import { MediaFile } from '../types'
import { api } from '../api'
// Reuse existing styles to match the standard duplicate warning
import './DuplicateModal.css'

interface DuplicateResolutionModalProps {
    duplicates: { [key: string]: MediaFile[] }[]
    onClose: () => void
}



// Helper to format file size
const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const DuplicateResolutionModal: React.FC<DuplicateResolutionModalProps> = ({ duplicates, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0)
    // 'left', 'right', 'both' -> which one to KEEP.
    // left = keep left (delete right), right = keep right (delete left), both = keep both.
    const [selectedOption, setSelectedOption] = useState<'left' | 'right' | 'both'>('left')
    const [isProcessing, setIsProcessing] = useState(false)

    // Current group being resolved
    const currentGroupObj = duplicates[currentIndex]

    // Extract files from the group object (it might be an array or object based on previous findings)
    let currentFiles: MediaFile[] = []
    if (currentGroupObj) {
        if (Array.isArray(currentGroupObj)) {
            currentFiles = currentGroupObj
        } else {
            currentFiles = Object.values(currentGroupObj).flat()
        }
    }

    // If we finished all groups, show completion or close
    useEffect(() => {
        if (currentIndex >= duplicates.length) {
            onClose()
        }
    }, [currentIndex, duplicates.length, onClose])

    if (!currentGroupObj || currentIndex >= duplicates.length) {
        return null // Or render a "Completed" screen if desired
    }

    // We only compare the first two for now. Any extras are ignored in this pass.
    // Ideally, we'd handle >2, but the UI is designed for pairs.
    const fileA = currentFiles[0]
    const fileB = currentFiles[1]

    if (!fileA || !fileB) {
        // Should not happen if filtered correctly, but just in case skip to next
        setTimeout(() => setCurrentIndex(prev => prev + 1), 0)
        return null
    }

    const thumbA = fileA.thumbnail_path ? `media://${fileA.thumbnail_path.replace(/\\/g, '/')}` : ''
    const thumbB = fileB.thumbnail_path ? `media://${fileB.thumbnail_path.replace(/\\/g, '/')}` : ''

    const handleConfirm = async () => {
        if (isProcessing) return
        setIsProcessing(true)

        try {
            if (selectedOption === 'left') {
                // Keep A, Delete B
                await api.moveToTrash(fileB.id)
            } else if (selectedOption === 'right') {
                // Keep B, Delete A
                await api.moveToTrash(fileA.id)
            }
            // 'both' does nothing (keeps both)

            // Move to next
            setSelectedOption('left') // Reset default
            setCurrentIndex(prev => prev + 1)
        } catch (error) {
            console.error("Failed to resolve duplicate:", error)
            alert("エラーが発生しました。")
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="duplicate-modal-overlay">
            <div className="duplicate-modal">
                <div className="duplicate-modal-header">
                    <h3>重複の解消 ({currentIndex + 1} / {duplicates.length})</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="duplicate-comparison">
                    {/* File A (Left) */}
                    <div
                        className={`duplicate-card ${selectedOption === 'left' ? 'active' : ''}`}
                        onClick={() => setSelectedOption('left')}
                    >
                        <div className="preview-container">
                            {thumbA ? (
                                <img src={thumbA} alt="File A" />
                            ) : (
                                <div className="no-preview">No Preview</div>
                            )}
                            <span className="status-badge" style={{ backgroundColor: '#444' }}>ファイル A</span>
                        </div>
                        <div className="file-info">
                            <div className="file-name">{fileA.file_name}</div>
                            <div className="file-meta">
                                {fileA.width} × {fileA.height} / {formatSize(fileA.file_size)}
                            </div>
                            <div className="path-hint" style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                                {fileA.file_path}
                            </div>
                            <div className="card-footer">
                                {fileA.folders && fileA.folders.length > 0 ? (
                                    fileA.folders.map(f => <span key={f.id} className="info-tag">{f.name}</span>)
                                ) : (
                                    <span className="info-tag empty">フォルダーなし</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* File B (Right) */}
                    <div
                        className={`duplicate-card ${selectedOption === 'right' ? 'active' : ''}`}
                        onClick={() => setSelectedOption('right')}
                    >
                        <div className="preview-container">
                            {thumbB ? (
                                <img src={thumbB} alt="File B" />
                            ) : (
                                <div className="no-preview">No Preview</div>
                            )}
                            <span className="status-badge" style={{ backgroundColor: '#444' }}>ファイル B</span>
                        </div>
                        <div className="file-info">
                            <div className="file-name">{fileB.file_name}</div>
                            <div className="file-meta">
                                {fileB.width} × {fileB.height} / {formatSize(fileB.file_size)}
                            </div>
                            <div className="path-hint" style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                                {fileB.file_path}
                            </div>
                            <div className="card-footer">
                                {fileB.folders && fileB.folders.length > 0 ? (
                                    fileB.folders.map(f => <span key={f.id} className="info-tag">{f.name}</span>)
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
                                name="duplicate-res-action"
                                checked={selectedOption === 'left'}
                                onChange={() => setSelectedOption('left')}
                            />
                            ファイルAを保持 (Bを削除)
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="duplicate-res-action"
                                checked={selectedOption === 'right'}
                                onChange={() => setSelectedOption('right')}
                            />
                            ファイルBを保持 (Aを削除)
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="duplicate-res-action"
                                checked={selectedOption === 'both'}
                                onChange={() => setSelectedOption('both')}
                            />
                            両方を保持 (スキップ)
                        </label>
                    </div>

                    <button className="confirm-btn" onClick={handleConfirm} disabled={isProcessing}>
                        {isProcessing ? '処理中...' : '決定して次へ'}
                    </button>
                </div>
            </div>
        </div>
    )
}
