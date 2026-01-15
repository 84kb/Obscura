import { useState, useEffect, useRef } from 'react'
import './ProfileSetupModal.css'

interface ProfileSetupModalProps {
    isOpen: boolean
    libraryName: string
    onSave: (profile: { nickname: string; iconUrl?: string }) => Promise<void>
    onClose: () => void
}

// デフォルトのアイコンオプション（絵文字ベース）
const DEFAULT_ICONS = [
    '👤', '😀', '😎', '🐱', '🐶', '🦊', '🐻', '🐼',
    '🐸', '🦁', '🐯', '🐨', '🐰', '🦄', '🐉', '🌟'
]

export function ProfileSetupModal({ isOpen, libraryName, onSave, onClose }: ProfileSetupModalProps) {
    const [nickname, setNickname] = useState('')
    const [selectedIcon, setSelectedIcon] = useState(DEFAULT_ICONS[0])
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // モーダルが開いたときに入力フィールドにフォーカスを当てる
    useEffect(() => {
        if (isOpen) {
            // アニメーションなどの影響を考慮し、わずかな遅延を入れる
            const timer = setTimeout(() => {
                inputRef.current?.focus()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleSave = async () => {
        // バリデーション
        if (!nickname.trim()) {
            setError('ニックネームを入力してください')
            return
        }
        if (nickname.length > 50) {
            setError('ニックネームは50文字以内で入力してください')
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            await onSave({
                nickname: nickname.trim(),
                iconUrl: selectedIcon
            })
        } catch (e: any) {
            setError(e.message || 'プロファイルの保存に失敗しました')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="profile-setup-overlay" onClick={onClose}>
            <div className="profile-setup-modal" onClick={e => e.stopPropagation()}>
                <h2 className="profile-setup-title">プロファイル設定</h2>
                <p className="profile-setup-description">
                    「{libraryName}」で使用するニックネームとアイコンを設定してください。
                </p>

                {error && (
                    <div className="profile-setup-error">
                        {error}
                    </div>
                )}

                <div className="profile-setup-form">
                    <label className="profile-setup-label">ニックネーム</label>
                    <input
                        ref={inputRef}
                        type="text"
                        className="profile-setup-input"
                        placeholder="あなたの表示名"
                        value={nickname}
                        onChange={e => setNickname(e.target.value)}
                        maxLength={50}
                    />

                    <label className="profile-setup-label">アイコン</label>
                    <div className="profile-setup-icons">
                        {DEFAULT_ICONS.map(icon => (
                            <button
                                key={icon}
                                type="button"
                                className={`profile-icon-btn ${selectedIcon === icon ? 'selected' : ''}`}
                                onClick={() => setSelectedIcon(icon)}
                            >
                                {icon}
                            </button>
                        ))}
                    </div>

                    <div className="profile-setup-preview">
                        <span className="profile-preview-icon">{selectedIcon}</span>
                        <span className="profile-preview-name">{nickname || 'ニックネーム'}</span>
                    </div>
                </div>

                <div className="profile-setup-actions">
                    <button
                        className="profile-setup-btn secondary"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        後で設定
                    </button>
                    <button
                        className="profile-setup-btn primary"
                        onClick={handleSave}
                        disabled={isSaving || !nickname.trim()}
                    >
                        {isSaving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    )
}
