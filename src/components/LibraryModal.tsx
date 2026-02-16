import { useState } from 'react'
import { api } from '../api'
import './LibraryModal.css'

interface LibraryModalProps {
    onClose: () => void
    onCreateLibrary: (name: string, parentPath: string) => Promise<void>
    onOpenLibrary: () => Promise<any>
}

export function LibraryModal({ onClose, onCreateLibrary, onOpenLibrary }: LibraryModalProps) {
    const [libraryName, setLibraryName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleOpen = async () => {
        setIsCreating(true)
        try {
            const result = await onOpenLibrary()
            if (result) {
                onClose()
            }
        } catch (e) {
            setError('ライブラリを開けませんでした。')
        } finally {
            setIsCreating(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!libraryName.trim()) return

        // Electron APIの確認
        /*
        if (!window.electronAPI) {
            setError('この機能はElectronアプリでのみ利用可能です。ブラウザではなく、Electronウィンドウを使用してください。')
            return
        }
        */

        setIsCreating(true)
        setError(null)
        try {
            // エクスプローラーでフォルダー選択
            const parentPath = await api.selectFolder()
            if (parentPath) {
                await onCreateLibrary(libraryName.trim(), parentPath)
                onClose()
            }
        } catch (error) {
            console.error('Failed to create library:', error)
            setError('ライブラリの作成に失敗しました。')
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className="library-modal-overlay" onClick={onClose}>
            <div className="library-modal" onClick={(e) => e.stopPropagation()}>
                <div className="library-modal-header">
                    <h2 className="library-modal-title">新しいライブラリを作成</h2>
                    <button className="library-modal-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="library-modal-form">
                    <div className="library-modal-field">
                        <label htmlFor="library-name">ライブラリ名</label>
                        <input
                            id="library-name"
                            type="text"
                            value={libraryName}
                            onChange={(e) => setLibraryName(e.target.value)}
                            placeholder="例: マイライブラリ"
                            autoFocus
                            disabled={isCreating}
                        />
                    </div>

                    {error && (
                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 77, 79, 0.1)',
                            border: '1px solid rgba(255, 77, 79, 0.3)',
                            borderRadius: 'var(--radius-md)',
                            color: '#ff4d4f',
                            fontSize: '13px',
                        }}>
                            {error}
                        </div>
                    )}

                    <div className="library-modal-info">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                        </svg>
                        <span>保存場所を選択すると、選択したフォルダー内に「{libraryName || 'ライブラリ名'}.library」フォルダーが作成されます</span>
                    </div>

                    <div className="library-modal-actions">
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={handleOpen}
                            disabled={isCreating}
                            style={{ marginRight: 'auto' }}
                        >
                            既存を開く
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={onClose}
                            disabled={isCreating}
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={!libraryName.trim() || isCreating}
                        >
                            {isCreating ? '作成中...' : '保存場所を選択'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
