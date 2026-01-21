import { useState, useRef, useEffect } from 'react'
import { MediaFile } from '../types'
import { toMediaUrl } from '../utils/fileUrl'
import { useShortcut } from '../contexts/ShortcutContext'

interface UsePlayerProps {
    media?: MediaFile
    onNext?: () => void
    onPrev?: () => void
    pipControlMode?: 'navigation' | 'skip'
}

export function usePlayer({ media, onNext, onPrev, pipControlMode = 'navigation' }: UsePlayerProps = {}) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(media?.duration || 0)

    // 設定をlocalStorageから読み込む
    const [volume, setVolume] = useState(() => {
        try {
            const saved = localStorage.getItem('player_settings')
            if (saved) return JSON.parse(saved).volume ?? 1
        } catch (e) { }
        return 1
    })
    const [isMuted, setIsMuted] = useState(() => {
        try {
            const saved = localStorage.getItem('player_settings')
            if (saved) return JSON.parse(saved).isMuted ?? false
        } catch (e) { }
        return false
    })
    const [playbackRate, setPlaybackRate] = useState(1)
    const [isLooping, setIsLooping] = useState(() => {
        try {
            const saved = localStorage.getItem('player_settings')
            if (saved) return JSON.parse(saved).isLooping ?? false
        } catch (e) { }
        return false
    })

    // 設定保存
    useEffect(() => {
        localStorage.setItem('player_settings', JSON.stringify({ volume, isMuted, isLooping }))
    }, [volume, isMuted, isLooping])

    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const playPromiseRef = useRef<Promise<void> | null>(null)

    // 再生/一時停止（メディア要素の実際の状態を基準に）
    const togglePlay = async () => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        try {
            if (media.paused) {
                // 既存のplay()呼び出しが完了するのを待つ
                if (playPromiseRef.current) {
                    await playPromiseRef.current
                }
                playPromiseRef.current = media.play()
                await playPromiseRef.current
                playPromiseRef.current = null
                setIsPlaying(true)
            } else {
                // 再生中の場合は一時停止
                if (playPromiseRef.current) {
                    await playPromiseRef.current
                    playPromiseRef.current = null
                }
                media.pause()
                setIsPlaying(false)
            }
        } catch (err) {
            console.error('Toggle play failed:', err)
            playPromiseRef.current = null
        }
    }

    // シーク（時間のみを設定、再生状態は変更しない）
    const seek = async (time: number) => {
        console.log('[usePlayer] seek called with time:', time)
        const media = videoRef.current || audioRef.current
        if (!media) {
            console.log('[usePlayer] No media element in seek')
            return
        }

        console.log('[usePlayer] Media element details:', {
            tagName: media.tagName,
            src: media.src,
            readyState: media.readyState,
            duration: media.duration,
            currentTime: media.currentTime,
            paused: media.paused,
            seekable: media.seekable ? {
                length: media.seekable.length,
                start: media.seekable.length > 0 ? media.seekable.start(0) : 'N/A',
                end: media.seekable.length > 0 ? media.seekable.end(0) : 'N/A'
            } : 'null'
        })

        // seekable情報を明示的に表示
        if (media.seekable) {
            console.log('[usePlayer] SEEKABLE INFO - length:', media.seekable.length)
            if (media.seekable.length > 0) {
                console.log('[usePlayer] SEEKABLE INFO - start(0):', media.seekable.start(0), 'end(0):', media.seekable.end(0))
            }
        } else {
            console.log('[usePlayer] SEEKABLE INFO - seekable is null/undefined')
        }

        try {
            // 進行中のplay()を待つ
            if (playPromiseRef.current) {
                console.log('[usePlayer] Waiting for pending play() promise')
                await playPromiseRef.current
                playPromiseRef.current = null
            }
            console.log('[usePlayer] Before set - media.currentTime:', media.currentTime, 'readyState:', media.readyState, 'duration:', media.duration)

            try {
                media.currentTime = time
                console.log('[usePlayer] After set - media.currentTime:', media.currentTime, 'requested:', time)
            } catch (setError) {
                console.error('[usePlayer] Error setting currentTime:', setError)
            }

            setCurrentTime(time)
            console.log('[usePlayer] Seek completed')
        } catch (err) {
            console.error('Seek failed:', err)
        }
    }

    // 早送り・巻き戻し
    const forward = (seconds: number = 10) => {
        const media = videoRef.current || audioRef.current
        if (!media) return
        media.currentTime = Math.min(media.duration, media.currentTime + seconds)
    }

    const rewind = (seconds: number = 10) => {
        const media = videoRef.current || audioRef.current
        if (!media) return
        media.currentTime = Math.max(0, media.currentTime - seconds)
    }

    const increaseVolume = () => {
        changeVolume(Math.min(1, volume + 0.1))
    }

    const decreaseVolume = () => {
        changeVolume(Math.max(0, volume - 0.1))
    }

    // 音量変更
    const changeVolume = (newVolume: number) => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        media.volume = newVolume
        setVolume(newVolume)
        if (newVolume > 0 && isMuted) {
            setIsMuted(false)
            media.muted = false
        }
    }

    // ミュート切り替え
    const toggleMute = () => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        media.muted = !isMuted
        setIsMuted(!isMuted)
    }

    // 再生速度変更
    const changePlaybackRate = (rate: number) => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        media.playbackRate = rate
        setPlaybackRate(rate)
    }

    // ループ切り替え
    const toggleLoop = () => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        media.loop = !isLooping
        setIsLooping(!isLooping)
    }

    // フルスクリーン切り替え
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`)
            })
        } else {
            document.exitFullscreen()
        }
    }

    // キーボードショートカット
    useShortcut('PLAYER_TOGGLE_PLAY', togglePlay, { scope: 'player' })
    useShortcut('PLAYER_FORWARD', () => forward(), { scope: 'player' })
    useShortcut('PLAYER_REWIND', () => rewind(), { scope: 'player' })
    useShortcut('PLAYER_STEP_FORWARD', () => {
        const mediaElement = videoRef.current || audioRef.current
        if (mediaElement && mediaElement.paused) {
            const fps = media?.framerate || 30
            mediaElement.currentTime = Math.min(mediaElement.duration, mediaElement.currentTime + (1 / fps))
        }
    }, { scope: 'player' })
    useShortcut('PLAYER_STEP_BACKWARD', () => {
        const mediaElement = videoRef.current || audioRef.current
        if (mediaElement && mediaElement.paused) {
            const fps = media?.framerate || 30
            mediaElement.currentTime = Math.max(0, mediaElement.currentTime - (1 / fps))
        }
    }, { scope: 'player' })
    useShortcut('PLAYER_TOGGLE_FULLSCREEN', toggleFullscreen, { scope: 'player' })
    useShortcut('PLAYER_TOGGLE_MUTE', toggleMute, { scope: 'player' })
    useShortcut('PLAYER_VOLUME_UP', increaseVolume, { scope: 'player' })
    useShortcut('PLAYER_VOLUME_DOWN', decreaseVolume, { scope: 'player' })

    // メディア要素のイベントリスナー設定
    useEffect(() => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        // 保存された設定を即座に適用
        media.volume = volume
        media.muted = isMuted
        media.loop = isLooping
        media.playbackRate = playbackRate

        const handleTimeUpdate = () => setCurrentTime(media.currentTime)
        const handleDurationChange = () => setDuration(media.duration)
        const handleEnded = () => {
            if (!isLooping) setIsPlaying(false)
        }
        const handleRateChange = () => {
            if (media.playbackRate !== playbackRate) {
                setPlaybackRate(media.playbackRate)
            }
        }

        // requestAnimationFrameで滑らかなアニメーションを実現
        let animationFrameId: number | null = null
        const updateCurrentTime = () => {
            if (media && !media.paused) {
                setCurrentTime(media.currentTime)
                animationFrameId = requestAnimationFrame(updateCurrentTime)
            }
        }

        const handlePlay = () => {
            setIsPlaying(true)
            animationFrameId = requestAnimationFrame(updateCurrentTime)
        }

        const handlePause = () => {
            setIsPlaying(false)
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
        }

        media.addEventListener('timeupdate', handleTimeUpdate)
        media.addEventListener('durationchange', handleDurationChange)
        media.addEventListener('ended', handleEnded)
        media.addEventListener('ratechange', handleRateChange)
        media.addEventListener('play', handlePlay)
        media.addEventListener('pause', handlePause)

        // 既に再生中の場合は即座に開始
        if (!media.paused) {
            animationFrameId = requestAnimationFrame(updateCurrentTime)
        }

        return () => {
            media.removeEventListener('timeupdate', handleTimeUpdate)
            media.removeEventListener('durationchange', handleDurationChange)
            media.removeEventListener('ended', handleEnded)
            media.removeEventListener('ratechange', handleRateChange)
            media.removeEventListener('play', handlePlay)
            media.removeEventListener('pause', handlePause)
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId)
            }
        }
    }, [videoRef.current, audioRef.current, isLooping]) // メディア要素が切り替わった時に再実行

    // コンポーネントアンマウント時にメディアを確実に停止
    useEffect(() => {
        return () => {
            const video = videoRef.current
            const audio = audioRef.current
            // pause()のみ実行（srcクリアは副作用を起こす可能性があるため削除）
            if (video) {
                video.pause()
            }
            if (audio) {
                audio.pause()
            }
        }
    }, []) // 空の依存配列でアンマウント時のみ実行

    // PiP (Picture-in-Picture)
    const [isPiP, setIsPiP] = useState(false)

    const togglePiP = async () => {
        const media = videoRef.current
        if (!media) return

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture()
            } else if (media.requestPictureInPicture) {
                if (media.readyState < 1) {
                    console.log('Waiting for metadata before PiP...')
                    return
                }
                await media.requestPictureInPicture()
            }
        } catch (err) {
            console.error('Failed to toggle PiP:', err)
        }
    }

    // PiPイベントリスナー
    useEffect(() => {
        const media = videoRef.current
        if (!media) return

        const handleEnterPiP = () => setIsPiP(true)
        const handleLeavePiP = () => {
            setIsPiP(false)
            // PiP終了時にウィンドウへフォーカス＆最前面化
            // 型定義の反映ラグ回避のため any キャスト
            const api = window.electronAPI as any
            if (api && api.focusWindow) {
                api.focusWindow().catch((err: any) => console.error('Failed to focus window:', err))
            }
        }

        media.addEventListener('enterpictureinpicture', handleEnterPiP)
        media.addEventListener('leavepictureinpicture', handleLeavePiP)

        return () => {
            media.removeEventListener('enterpictureinpicture', handleEnterPiP)
            media.removeEventListener('leavepictureinpicture', handleLeavePiP)
        }
    }, [videoRef.current])

    // Media Session API Integration
    useEffect(() => {
        const mediaElement = videoRef.current || audioRef.current
        if (!media || !navigator.mediaSession || !mediaElement) return

        const hasNext = !!onNext
        const hasPrev = !!onPrev
        let objectUrl: string | null = null
        let isMounted = true

        const updateMetadata = async () => {
            const artworks = []
            if (media.thumbnail_path) {
                // ローカルパスをブラウザが扱えるURLに変換
                // window.electronAPIが存在する場合のみ有効（レンダラープロセス）
                const artUrl = window.electronAPI ? toMediaUrl(media.thumbnail_path) : media.thumbnail_path

                // media:// 等のカスタムスキームは MediaSession で警告が出る可能性があるため Blob URL に変換
                if (artUrl.startsWith('media://') && window.electronAPI) {
                    try {
                        const res = await fetch(artUrl)
                        const blob = await res.blob()
                        if (!isMounted) return
                        objectUrl = URL.createObjectURL(blob)
                        artworks.push({ src: objectUrl, sizes: '512x512', type: 'image/jpeg' })
                    } catch (e) {
                        console.warn('Failed to convert artwork to blob:', e)
                        // フォールバック
                        artworks.push({ src: artUrl, sizes: '512x512', type: 'image/jpeg' })
                    }
                } else {
                    artworks.push({ src: artUrl, sizes: '512x512', type: 'image/jpeg' })
                }
            }

            if (!isMounted) return

            navigator.mediaSession.metadata = new MediaMetadata({
                title: media.file_name,
                artist: (media.artists || [media.artist]).filter(Boolean).join(', ') || 'Unknown Artist',
                artwork: artworks
            })
        }

        updateMetadata()

        // Action Handlers
        const handlePlayPause = () => togglePlay()

        const handlePrevAction = () => {
            if (hasPrev && onPrev) onPrev()
        }
        const handleNextAction = () => {
            if (hasNext && onNext) onNext()
        }

        const handleSeekTo = (details: MediaSessionActionDetails) => {
            if (details.seekTime !== undefined) {
                seek(details.seekTime)
            }
        }

        try {
            // Reset all handlers first
            navigator.mediaSession.setActionHandler('play', handlePlayPause)
            navigator.mediaSession.setActionHandler('pause', handlePlayPause)
            navigator.mediaSession.setActionHandler('seekto', handleSeekTo)

            navigator.mediaSession.setActionHandler('seekbackward', null)
            navigator.mediaSession.setActionHandler('seekforward', null)
            navigator.mediaSession.setActionHandler('previoustrack', null)
            navigator.mediaSession.setActionHandler('nexttrack', null)

            // Determine controls based on availability (Skip mode removed)
            if (onPrev) {
                navigator.mediaSession.setActionHandler('previoustrack', handlePrevAction)
            }
            if (onNext) {
                navigator.mediaSession.setActionHandler('nexttrack', handleNextAction)
            }

        } catch (e) {
            console.error('[usePlayer] Failed to set media session handlers:', e)
        }

        // Cleanup
        return () => {
            isMounted = false
            if (objectUrl) {
                // 即座に破棄するとブラウザの読み込みと競合して404になることがあるため、遅延させる
                const urlToRevoke = objectUrl
                setTimeout(() => URL.revokeObjectURL(urlToRevoke), 10000)
            }
            if (navigator.mediaSession) {
                navigator.mediaSession.setActionHandler('play', null)
                navigator.mediaSession.setActionHandler('pause', null)
                navigator.mediaSession.setActionHandler('seekbackward', null)
                navigator.mediaSession.setActionHandler('seekforward', null)
                navigator.mediaSession.setActionHandler('previoustrack', null)
                navigator.mediaSession.setActionHandler('nexttrack', null)
                navigator.mediaSession.setActionHandler('seekto', null)
            }
        }
    }, [media, onNext, onPrev, pipControlMode, videoRef.current, audioRef.current])

    return {
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
        isPiP,
        togglePlay,
        seek,
        forward,
        rewind,
        changeVolume,
        toggleMute,
        changePlaybackRate,
        toggleLoop,
        toggleFullscreen,
        togglePiP,
    }
}
