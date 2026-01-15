import React, { useState, useEffect } from 'react'
import { MediaFile, RemoteLibrary } from '../types'
import { usePlayer } from '../hooks/usePlayer'
import './Player.css'
import { toMediaUrl } from '../utils/fileUrl'

interface PlayerProps {
    media: MediaFile | null
    onBack: () => void
    onNext?: () => void
    onPrev?: () => void
    hasNext?: boolean
    hasPrev?: boolean
    autoPlayEnabled?: boolean
    onToggleAutoPlay?: () => void
    onPlayFirst?: () => void
    activeRemoteLibrary?: RemoteLibrary | null
    myUserToken?: string
}

export const Player: React.FC<PlayerProps> = ({
    media,
    onBack,
    onNext,
    onPrev,
    hasNext = false,
    hasPrev = false,
    autoPlayEnabled = false,
    onToggleAutoPlay,
    onPlayFirst,
    activeRemoteLibrary,
    myUserToken
}) => {
    const {
        containerRef,
        videoRef,
        audioRef,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        playbackRate,
        isLooping,
        togglePlay,
        seek,
        forward,
        rewind,
        changeVolume,
        toggleMute,
        changePlaybackRate,
        toggleLoop,
        toggleFullscreen,
    } = usePlayer()

    const [commentText, setCommentText] = useState('')
    const [showCommentInput, setShowCommentInput] = useState(false)
    const [previews, setPreviews] = useState<string[]>([])
    const [previewTime, setPreviewTime] = useState<number | null>(null)
    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [previewX, setPreviewX] = useState(0)

    // 表示モード（ウィンドウに合わせる / オリジナルサイズ）をlocalStorageから復元
    const [resizeMode, setResizeModeState] = useState<'contain' | 'scale-down'>(() => {
        try {
            const saved = localStorage.getItem('player_resize_mode')
            if (saved === 'contain' || saved === 'scale-down') return saved
        } catch (e) { /* ignore */ }
        return 'contain'
    })

    // 表示モード変更時にlocalStorageに保存
    const setResizeMode = (mode: 'contain' | 'scale-down') => {
        setResizeModeState(mode)
        localStorage.setItem('player_resize_mode', mode)
    }

    // showControls関連のロジックを削除（常時表示のため）

    // プレビュー生成と取得
    useEffect(() => {
        if (media && media.file_type === 'video') {
            window.electronAPI.generatePreviews(media.id)
                .then(files => {
                    console.log('Previews loaded:', files.length)
                    setPreviews(files)
                })
                .catch(err => console.error('Failed to load previews:', err))
        } else {
            setPreviews([])
        }
    }, [media])

    // 動画読み込み後に自動再生を開始（mediaが変更された時のみ）
    useEffect(() => {
        console.log('[Player] Auto-play useEffect triggered, media:', media?.id)
        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) {
            console.log('[Player] No media element found')
            return
        }

        const handleLoadedMetadata = () => {
            console.log('[Player] Metadata loaded, starting auto-play')
            mediaElement.play().catch(err => console.error('Auto-play failed:', err))
        }

        // 既にメタデータがロードされている場合は即座に再生
        if (mediaElement.readyState >= 1) {
            console.log('[Player] Metadata already loaded, starting auto-play immediately')
            mediaElement.play().catch(err => console.error('Auto-play failed:', err))
        } else {
            console.log('[Player] Waiting for metadata to load')
            mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata)
        }

        return () => {
            console.log('[Player] Cleaning up auto-play useEffect')
            mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata)
        }
    }, [media]) // mediaが変更された時のみ実行

    // ループと自動再生の連携
    useEffect(() => {
        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) return

        if (autoPlayEnabled && isLooping) {
            mediaElement.loop = false
        } else {
            mediaElement.loop = isLooping
        }
    }, [autoPlayEnabled, isLooping, media])


    // シークバーのマウス移動ハンドラ
    const handleSeekMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!media || !duration || previews.length === 0) return

        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const width = rect.width
        const hoverTime = (x / width) * duration

        setPreviewTime(hoverTime)
        setPreviewX(x)

        // 適切なプレビュー画像を選択 (1秒間隔に変更: Eagleスタイル)
        const interval = 1
        const index = Math.floor(hoverTime / interval) + 1
        // ゼロ埋め3桁
        const filename = `preview_${index.toString().padStart(3, '0')}.jpg`

        // パスの一部が含まれるファイルを探す
        const found = previews.find(p => p.endsWith(filename) || p.endsWith(`\\${filename}`) || p.endsWith(`/${filename}`))

        setPreviewImage(found ? toMediaUrl(found) : null)
    }

    const handleSeekMouseLeave = () => {
        setPreviewTime(null)
        setPreviewImage(null)
    }

    // コメント送信
    const handleSendComment = async () => {
        if (!media || !commentText.trim()) return
        try {
            if (activeRemoteLibrary) {
                // リモート
                const response = await fetch(`${activeRemoteLibrary.url}/api/media/${media.id}/comments`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${activeRemoteLibrary.token}`,
                        'X-User-Token': myUserToken || ''
                    },
                    body: JSON.stringify({
                        text: commentText,
                        time: currentTime
                    })
                })

                if (!response.ok) {
                    throw new Error('Failed to post remote comment')
                }
            } else {
                // ローカル
                await (window.electronAPI as any).addComment(media.id, commentText, currentTime)
            }

            setCommentText('')
            setShowCommentInput(false)
            console.log('Comment added')
        } catch (error) {
            console.error('Failed to add comment:', error)
        }
    }

    // キャプチャ機能
    const captureCurrentFrame = (): string | null => {
        const video = videoRef.current
        if (!video) return null

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/jpeg', 0.9) // JPEG品質90%
    }

    // コンテキストメニューからのキャプチャ要求をリッスン
    useEffect(() => {
        if (!media) return

        const cleanup = window.electronAPI.onTriggerFrameCapture(async (action) => {
            console.log('[Player] Frame capture trigger:', action)
            const dataUrl = captureCurrentFrame()
            if (!dataUrl) {
                console.error('[Player] Failed to capture frame')
                return
            }

            try {
                if (action === 'copy-frame') {
                    // Electron IPCを使用してクリップボードにコピー（フォーカス問題を回避）
                    await window.electronAPI.copyFrameToClipboard(dataUrl)
                    console.log('[Player] Frame copied to clipboard via Electron')
                } else if (action === 'save-frame') {
                    // ファイルに保存
                    await window.electronAPI.saveCapturedFrame(dataUrl)
                } else if (action === 'set-thumbnail') {
                    // サムネイルに設定
                    await window.electronAPI.setCapturedThumbnail(media.id, dataUrl)
                    console.log('[Player] Thumbnail updated')
                }
            } catch (error) {
                console.error('[Player] Capture action failed:', error)
            }
        })

        return cleanup
    }, [media])

    if (!media) return null

    const formatTime = (seconds: number) => {
        if (!isFinite(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    const isVideo = media.file_type === 'video'
    // media:// プロトコルを使用 (httpの場合はそのまま)
    const fileUrl = window.electronAPI ? toMediaUrl(media.file_path) : media.file_path

    return (
        <div
            className="player-container"
            ref={containerRef}
        /* 常時表示のためマウス制御は削除 */
        >
            {/* コメント表示 (オーバーレイ) */}
            <div className="player-comment-overlay">
                {(media.comments || []).filter(c => Math.abs(c.time - currentTime) < 3).map(c => (
                    <div key={c.id} className="comment-bubble">
                        {c.nickname && <span className="comment-nickname">{c.nickname}: </span>}
                        <span className="comment-text">{c.text}</span>
                    </div>
                ))}
            </div>

            {/* ヘッダーバー (上部固定) */}
            <div className="player-header-bar">
                <div className="header-left">
                    <button className="header-back-button" onClick={onBack}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </button>
                    <div className="header-title">{media.file_name}</div>
                </div>

                <div className="header-right">
                    {/* リサイズモード切り替えボタン */}
                    <div className="nav-buttons" style={{ marginRight: '16px' }}>
                        <button
                            className={`nav-btn ${resizeMode === 'contain' ? 'active' : ''}`}
                            onClick={() => setResizeMode('contain')}
                            title="ウィンドウに合わせる"
                            style={resizeMode === 'contain' ? { color: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                            </svg>
                        </button>
                        <button
                            className={`nav-btn ${resizeMode === 'scale-down' ? 'active' : ''}`}
                            onClick={() => setResizeMode('scale-down')}
                            title="オリジナルサイズ（拡大なし）"
                            style={resizeMode === 'scale-down' ? { color: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="8" y="8" width="8" height="8" rx="1" />
                                <path d="M4 4h16v16H4z" strokeOpacity="0.3" />
                            </svg>
                        </button>
                    </div>

                    <div className="nav-buttons">
                        <button
                            className="nav-btn"
                            disabled={!hasPrev}
                            onClick={onPrev}
                            title="前のメディア"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                        <button
                            className="nav-btn"
                            disabled={!hasNext}
                            onClick={onNext}
                            title="次のメディア"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <div className="player-content">
                {isVideo ? (
                    <video
                        ref={videoRef}
                        src={fileUrl}
                        className="player-video"
                        style={resizeMode === 'contain'
                            ? { width: '100%', height: '100%', objectFit: 'contain' }
                            : { maxWidth: '100%', maxHeight: '100%', objectFit: 'scale-down' }
                        }
                        onClick={togglePlay}
                        onEnded={() => {
                            if (autoPlayEnabled) {
                                if (onNext && hasNext) {
                                    onNext()
                                } else if (isLooping && onPlayFirst && !hasNext) {
                                    onPlayFirst()
                                }
                            }
                        }}
                    />
                ) : (
                    <div className="player-audio-visual">
                        <div className="audio-icon">
                            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                            </svg>
                        </div>
                        <h2 className="player-audio-title">{media.file_name}</h2>
                        <audio
                            ref={audioRef}
                            src={fileUrl}
                            onEnded={() => {
                                if (autoPlayEnabled) {
                                    if (onNext && hasNext) {
                                        onNext()
                                    } else if (isLooping && onPlayFirst && !hasNext) {
                                        onPlayFirst()
                                    }
                                }
                            }}
                        />
                    </div>
                )}

            </div>

            {/* コントロールバー (下部固定) */}
            <div className="player-controls-bar">
                <div className="controls-left">
                    <button className="control-btn" onClick={togglePlay}>
                        {isPlaying ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        )}
                    </button>

                    <button className="control-btn" onClick={() => rewind()}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
                        </svg>
                    </button>

                    <button className="control-btn" onClick={() => forward()}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                        </svg>
                    </button>

                    <div className="volume-control-group">
                        <button className="control-btn" onClick={toggleMute}>
                            {isMuted || volume === 0 ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                            )}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            onChange={(e) => changeVolume(parseFloat(e.target.value))}
                            className="volume-slider"
                            style={{ backgroundSize: `${volume * 100}% 100%` }}
                        />
                    </div>

                    <div className="time-display">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                </div>

                {/* シークバー (中央) */}
                <div
                    className="player-seek-container"
                    onMouseMove={handleSeekMouseMove}
                    onMouseLeave={handleSeekMouseLeave}
                >
                    {/* プレビューツールチップ */}
                    {previewTime !== null && (
                        <div
                            className="seek-preview-tooltip"
                            style={{ left: previewX }}
                        >
                            {previewImage && (
                                <div className="preview-image-box">
                                    <img src={previewImage} alt="preview" />
                                </div>
                            )}
                            <div className="preview-time">{formatTime(previewTime)}</div>
                        </div>
                    )}

                    <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        step="any"
                        value={currentTime}
                        onChange={(e) => seek(parseFloat(e.target.value))}
                        className="player-seek-slider"
                        style={{ backgroundSize: `${progress}% 100%` }}
                    />
                </div>

                <div className="controls-right">
                    {/* 再生速度 */}
                    <div className="speed-control-group">
                        <button className="control-btn text-btn">
                            {playbackRate}x
                        </button>
                        <div className="speed-menu">
                            {[0.5, 1.0, 1.25, 1.5, 2.0].map(rate => (
                                <div
                                    key={rate}
                                    className={`speed-option ${playbackRate === rate ? 'active' : ''}`}
                                    onClick={() => changePlaybackRate(rate)}
                                >
                                    {rate}x
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 自動再生 */}
                    {onToggleAutoPlay && (
                        <button
                            className={`control-btn ${autoPlayEnabled ? 'active' : ''}`}
                            onClick={onToggleAutoPlay}
                            title="自動再生"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 4v6h6" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                            </svg>
                        </button>
                    )}

                    {/* リピート */}
                    <button className={`control-btn ${isLooping ? 'active' : ''}`} onClick={toggleLoop} title="リピート">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="17 1 21 5 17 9" />
                            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                            <polyline points="7 23 3 19 7 15" />
                            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                    </button>

                    {/* コメント */}
                    <div className="comment-control-group">
                        <button className={`control-btn ${showCommentInput ? 'active' : ''}`} onClick={() => setShowCommentInput(!showCommentInput)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                        </button>
                        {showCommentInput && (
                            <div className="comment-input-popup">
                                <input
                                    type="text"
                                    placeholder="コメントを入力..."
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
                                    autoFocus
                                />
                                <button onClick={handleSendComment}>送信</button>
                            </div>
                        )}
                    </div>

                    {/* フルスクリーン */}
                    <button className="control-btn" onClick={toggleFullscreen}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* 以前のback-button-overlayは削除済み */}
        </div>
    )
}
