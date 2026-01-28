import React, { useState, useEffect, useRef } from 'react'
import { MediaFile, RemoteLibrary } from '../types'
import { usePlayer } from '../hooks/usePlayer'
import './Player.css'
import { toMediaUrl } from '../utils/fileUrl'
import { useContext } from 'react'
import { ShortcutContext } from '../contexts/ShortcutContext'
import { AudioSettingsModal } from './AudioSettingsModal'

interface PlayerProps {
    media: MediaFile
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
    pipControlMode?: 'navigation' | 'skip'
    onCommentAdded?: () => void
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
    myUserToken,
    pipControlMode = 'navigation',
    onCommentAdded
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
        isPiP,
        togglePiP,

        audioEngine,
        isMpv,
        configLoaded
    } = usePlayer({
        media,
        onNext,
        onPrev,
        onPlayFirst,
        hasNext,
        autoPlayEnabled,
        pipControlMode
    })

    // ショートカットスコープの管理
    const context = useContext(ShortcutContext)
    useEffect(() => {
        if (context) {
            context.pushScope('player')
            return () => {
                context.popScope('player')
            }
        }
    }, [])

    // 戻るボタン押下時にメディアを明示的に停止してから戻る
    const handleBack = () => {
        const mediaElement = videoRef.current || audioRef.current
        if (mediaElement) {
            mediaElement.pause()
            // ロード中の動画を完全に停止するためにsrcをクリアしてload()を呼ぶ
            mediaElement.src = ''
            mediaElement.load()
        }
        onBack()
    }

    // ESCキーで戻る
    // キーボードショートカット (ESC, Ctrl+C, Ctrl+Shift+C)
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // ESC: 戻る
            if (e.key === 'Escape') {
                e.preventDefault()
                handleBack()
                return
            }

            // Ctrl+C / Ctrl+Shift+C
            if (e.ctrlKey && (e.code === 'KeyC')) {
                // テキスト選択中、または入力フォーカス中なら無視してブラウザのデフォルトコピーを優先
                const selection = window.getSelection()?.toString()
                const activeElement = document.activeElement
                const isInputField = activeElement instanceof HTMLInputElement ||
                    activeElement instanceof HTMLTextAreaElement ||
                    (activeElement as HTMLElement)?.isContentEditable

                if ((selection && selection.length > 0) || isInputField) {
                    return
                }

                e.preventDefault()

                // Shiftあり: ファイルコピー
                if (e.shiftKey) {
                    if (media.file_path) {
                        try {
                            const success = await window.electronAPI.copyFileToClipboard(media.file_path)
                            console.log(success ? '[Player] File copied to clipboard' : '[Player] Failed to copy file')
                        } catch (err) {
                            console.error('[Player] Failed to copy file:', err)
                        }
                    }
                }
                // Shiftなし: フレームコピー
                else {
                    const dataUrl = captureCurrentFrame()
                    if (dataUrl) {
                        try {
                            await window.electronAPI.copyFrameToClipboard(dataUrl)
                            console.log('[Player] Frame copied to clipboard')
                        } catch (err) {
                            console.error('[Player] Failed to copy frame:', err)
                        }
                    }
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onBack, media])

    const [commentText, setCommentText] = useState('')
    const [showCommentInput, setShowCommentInput] = useState(false)
    const [previewTime, setPreviewTime] = useState<number | null>(null)
    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [previewX, setPreviewX] = useState(0)
    const [showAudioSettings, setShowAudioSettings] = useState(false)

    // GPU加速プレビュー用のスロットリング
    const lastPreviewTimeRef = useRef<number>(-1)
    const lastRequestTimestampRef = useRef<number>(0) // 10msスロットル用
    const previewVideoRef = useRef<HTMLVideoElement | null>(null)
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)

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

    // バックグラウンド判定（音声ラグ対策）
    const [isBackground, setIsBackground] = useState(document.visibilityState === 'hidden')
    useEffect(() => {
        const handleVisibilityChange = () => {
            const hidden = document.visibilityState === 'hidden'
            setIsBackground(hidden)
            console.log('[Player] Visibility changed. Hidden:', hidden)
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

    // showControls関連のロジックを削除（常時表示のため）
    // GPU加速プレビューを使用するため、ファイルベースのプレビュー読み込みは不要

    // プレビュー用ビデオ要素を事前に初期化（ホバー時の初回遅延を防ぐ）
    useEffect(() => {
        if (!media || media.file_type !== 'video') {
            // クリーンアップ
            if (previewVideoRef.current) {
                previewVideoRef.current.src = ''
                previewVideoRef.current = null
            }
            return
        }

        // 隠しビデオ要素を事前に作成・読み込み開始
        const video = document.createElement('video')
        video.src = toMediaUrl(media.file_path)
        video.muted = true
        video.preload = 'auto'  // メタデータとバッファを事前読み込み
        video.style.display = 'none'
        previewVideoRef.current = video

        return () => {
            if (previewVideoRef.current) {
                previewVideoRef.current.src = ''
                previewVideoRef.current = null
            }
        }
    }, [media?.id])

    // 動画読み込み後に自動再生を開始（mediaが変更された時のみ）
    useEffect(() => {
        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) return

        // 既にメタデータがロードされている場合は即座に再生
        if (mediaElement.readyState >= 1) {
            mediaElement.play().catch(() => { })
        } else {
            // メタデータロード後に再生（onceで自動的にリスナー解除）
            mediaElement.addEventListener('loadedmetadata', () => {
                mediaElement.play().catch(() => { })
            }, { once: true })
        }
    }, [media?.id]) // media.idのみに依存（オブジェクト参照変更による再トリガーを防止）

    // Buffered Time State
    const [bufferedTime, setBufferedTime] = useState(0)

    // Monitor buffering progress
    useEffect(() => {
        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) return

        const handleProgress = () => {
            if (mediaElement.buffered.length > 0) {
                // Find the buffered range that covers the current time
                for (let i = 0; i < mediaElement.buffered.length; i++) {
                    if (mediaElement.buffered.start(i) <= mediaElement.currentTime && mediaElement.buffered.end(i) >= mediaElement.currentTime) {
                        setBufferedTime(mediaElement.buffered.end(i))
                        break
                    }
                    // Fallback: just take the last buffered end if we haven't started playing or seeked yet
                    if (i === mediaElement.buffered.length - 1 && mediaElement.currentTime === 0) {
                        setBufferedTime(mediaElement.buffered.end(i))
                    }
                }
            }
        }

        mediaElement.addEventListener('progress', handleProgress)
        mediaElement.addEventListener('timeupdate', handleProgress) // Check on timeupdate too for smoother updates

        return () => {
            mediaElement.removeEventListener('progress', handleProgress)
            mediaElement.removeEventListener('timeupdate', handleProgress)
        }
    }, [media?.id])

    // ループと自動再生の連携
    useEffect(() => {
        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) return

        if (autoPlayEnabled && isLooping) {
            mediaElement.loop = false
        } else {
            mediaElement.loop = isLooping
        }
    }, [autoPlayEnabled, isLooping, media?.id])


    // Discord RPC Integration
    useEffect(() => {
        if (!media || !window.electronAPI) return

        const updateDiscord = () => {
            const el = videoRef.current || audioRef.current
            // 実際の要素の状態を優先取得
            const curTime = el ? el.currentTime : currentTime
            const dur = el ? el.duration : duration
            const rate = el ? el.playbackRate : playbackRate

            // 状態に応じたアクティビティ更新
            if (isPlaying) {
                const now = Date.now()
                // 残り時間を計算
                const remainingSec = (dur - curTime) / (rate || 1)
                const endTimestamp = Math.floor(now + remainingSec * 1000)

                window.electronAPI.updateDiscordActivity({
                    details: media.file_name,
                    state: 'Playing',
                    endTimestamp: (dur && isFinite(endTimestamp)) ? endTimestamp : undefined,
                    largeImageKey: 'app_icon',
                    largeImageText: 'Obscura',
                    smallImageKey: 'play_icon',
                    smallImageText: 'Playing'
                })
            } else {
                window.electronAPI.updateDiscordActivity({
                    details: media.file_name,
                    state: 'Paused',
                    largeImageKey: 'app_icon',
                    largeImageText: 'Obscura',
                    smallImageKey: 'pause_icon',
                    smallImageText: 'Paused'
                })
            }
        }

        // 初期実行
        updateDiscord()

        // Seekイベントの監視 (シーク時に時間を更新するため)
        const el = videoRef.current || audioRef.current
        if (el) {
            const handleSeeked = () => {
                // シーク直後はステートが安定しない場合があるため少し待つか、
                // 単に再実行する。
                updateDiscord()
            }
            el.addEventListener('seeked', handleSeeked)
            return () => {
                el.removeEventListener('seeked', handleSeeked)
            }
        }
    }, [media, isPlaying, playbackRate]) // currentTimeを含めないことで過剰な更新を防ぐ





    // シークバーのマウス移動ハンドラ（ブラウザGPU加速プレビュー）
    const handleSeekMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!media || !duration || media.file_type !== 'video') return

        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const width = rect.width
        // 0以上duration以下にクランプ
        const hoverTime = Math.max(0, Math.min(duration, (x / width) * duration))

        // 時間は常に表示
        setPreviewTime(hoverTime)
        setPreviewX(x)

        // 10msスロットル: 前回のリクエストから10ms以内ならスキップ
        const now = Date.now()
        if (now - lastRequestTimestampRef.current < 10) return
        lastRequestTimestampRef.current = now

        // キャンバスを初期化（初回のみ）
        if (!previewCanvasRef.current) {
            previewCanvasRef.current = document.createElement('canvas')
            previewCanvasRef.current.width = 160 // プレビューサイズ
            previewCanvasRef.current.height = 90
        }

        // プレビュー用ビデオ要素がまだなければスキップ（useEffectで初期化中）
        if (!previewVideoRef.current) return

        const video = previewVideoRef.current
        const canvas = previewCanvasRef.current

        // 同じ時間（秒単位）ならスキップ（パフォーマンス最適化）
        const roundedTime = Math.floor(hoverTime)
        if (roundedTime === lastPreviewTimeRef.current) return
        lastPreviewTimeRef.current = roundedTime

        // シークしてフレームをキャプチャ
        video.currentTime = hoverTime

        // seeked イベントでフレームキャプチャ
        const handleSeeked = () => {
            const ctx = canvas.getContext('2d')
            if (ctx && video.videoWidth > 0) {
                // アスペクト比を維持してキャンバスサイズを調整
                const aspectRatio = video.videoWidth / video.videoHeight
                canvas.width = 160
                canvas.height = Math.round(160 / aspectRatio)
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                setPreviewImage(canvas.toDataURL('image/jpeg', 0.7))
            }
            video.removeEventListener('seeked', handleSeeked)
        }
        video.addEventListener('seeked', handleSeeked)
    }

    const handleSeekMouseLeave = () => {
        setPreviewTime(null)
        setPreviewImage(null)
        lastPreviewTimeRef.current = -1
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
            // コメント追加後に通知（Inspector更新用）
            if (onCommentAdded) {
                onCommentAdded()
            }
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
        return cleanup
    }, [media])

    const formatTime = (seconds: number) => {
        if (!isFinite(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    // media:// プロトコルを使用 (httpの場合はそのまま)
    const fileUrl = window.electronAPI ? toMediaUrl(media.file_path) : media.file_path

    const isVideo = media.file_type === 'video'

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
                    <button className="header-back-button" onClick={handleBack}>
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
                        </button >
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
                    </div >

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
                        <button
                            className={`nav-btn ${audioEngine.settings.enabled ? 'active' : ''}`}
                            onClick={() => setShowAudioSettings(true)}
                            title="オーディオエンジン設定"
                            style={audioEngine.settings.enabled ? { color: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                                <line x1="2" y1="14" x2="6" y2="14" /><line x1="10" y1="12" x2="14" y2="12" /><line x1="18" y1="16" x2="22" y2="16" />
                            </svg>
                        </button>
                    </div>
                </div >
            </div >

            <div className="player-content">
                {!configLoaded ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                        Loading configuration...
                    </div>
                ) : isVideo && !isMpv ? (
                    <video
                        ref={videoRef}
                        src={fileUrl}
                        crossOrigin="anonymous"
                        className="player-video"
                        autoPlay
                        preload="auto"
                        onLoadStart={() => {
                            console.log(`[Player] Video load start: ${fileUrl}`);
                            console.time('VideoLoad');
                        }}
                        onLoadedMetadata={() => {
                            console.timeEnd('VideoLoad');
                            console.log('[Player] Metadata loaded', { duration: videoRef.current?.duration });
                        }}
                        onWaiting={() => console.log('[Player] Waiting for data...')}
                        onCanPlay={() => console.log('[Player] Can play')}
                        onStalled={() => console.warn('[Player] Stalled!')}
                        style={{
                            ...(resizeMode === 'contain'
                                ? { width: '100%', height: '100%', objectFit: 'contain' }
                                : { maxWidth: '100%', maxHeight: '100%', objectFit: 'scale-down' }
                            ),
                            // バックグラウンド時は描画を停止してリソースを節約（音声ラグ対策）
                            visibility: isBackground ? 'hidden' : 'visible'
                        }}
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
                        {isMpv ? (
                            <div className="mpv-indicator" style={{
                                marginTop: '16px',
                                padding: '8px 16px',
                                background: 'rgba(255, 170, 0, 0.15)',
                                border: '1px solid rgba(255, 170, 0, 0.3)',
                                borderRadius: '4px',
                                color: '#ffaa00',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                {isVideo ? 'WASAPI Video Mode (Audio Only)' : 'WASAPI Exclusive Mode (MPV Backend)'}
                            </div>
                        ) : (
                            <audio
                                ref={audioRef}
                                src={fileUrl}
                                crossOrigin="anonymous"
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
                        )}
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

                    {/* Visual Track Background */}
                    <div className="player-seek-track-bg" />

                    {/* Buffered Progress Bar */}
                    <div
                        className="buffered-progress-bar"
                        style={{ width: `${(bufferedTime / (duration || 1)) * 100}%` }}
                    />

                    {/* Play Progress Bar */}
                    <div
                        className="player-seek-progress-bar"
                        style={{ width: `${progress}%` }}
                    />

                    <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        step="any"
                        value={currentTime}
                        onChange={(e) => seek(parseFloat(e.target.value))}
                        className="player-seek-slider"
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

                    {/* PiP */}
                    {isVideo && (
                        <button className={`control-btn ${isPiP ? 'active' : ''}`} onClick={togglePiP} title="ピクチャーインピクチャー">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="6" width="20" height="14" rx="2" ry="2" />
                                <rect x="13" y="11" width="8" height="5" rx="1" ry="1" fill="currentColor" />
                            </svg>
                        </button>
                    )}

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

            {/* オーディオエンジン設定モーダル */}
            {showAudioSettings && (
                <AudioSettingsModal
                    settings={audioEngine.settings}
                    updateSettings={audioEngine.updateSettings}
                    analyser={audioEngine.analyser}
                    onClose={() => setShowAudioSettings(false)}
                />
            )}
        </div >
    )
}
