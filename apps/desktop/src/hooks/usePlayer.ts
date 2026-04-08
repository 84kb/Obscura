import { useState, useRef, useEffect } from 'react'
import { MediaFile } from '@obscura/core'
import { toMediaUrl } from '../utils/fileUrl'
import { useShortcut } from '../contexts/ShortcutContext'
import { useAudioEngine } from './useAudioEngine'
import { api } from '../api'

type PlayerClientConfig = {
    exclusiveMode?: boolean
    useMpvAudio?: boolean
    enableMpvForVideo?: boolean
}

function normalizePlayerClientConfig(config: any): PlayerClientConfig {
    return {
        exclusiveMode: !!config?.exclusiveMode,
        useMpvAudio: !!config?.useMpvAudio,
        enableMpvForVideo: !!config?.enableMpvForVideo,
    }
}

let cachedPlayerClientConfig: PlayerClientConfig | null = null
let pendingPlayerClientConfigPromise: Promise<PlayerClientConfig> | null = null

async function getPlayerClientConfigFast(): Promise<PlayerClientConfig> {
    if (cachedPlayerClientConfig) return cachedPlayerClientConfig
    if (pendingPlayerClientConfigPromise) return pendingPlayerClientConfigPromise

    pendingPlayerClientConfigPromise = api.getClientConfig()
        .then((c: any) => {
            const next = normalizePlayerClientConfig(c)
            cachedPlayerClientConfig = next
            return next
        })
        .catch(() => {
            const fallback: PlayerClientConfig = {
                exclusiveMode: false,
                useMpvAudio: false,
                enableMpvForVideo: false,
            }
            cachedPlayerClientConfig = fallback
            return fallback
        })
        .finally(() => {
            pendingPlayerClientConfigPromise = null
        })

    return pendingPlayerClientConfigPromise
}

interface UsePlayerProps {
    mode?: string | null
    playlist?: any | null
    media?: MediaFile
    onNext?: () => void
    onPrev?: () => void
    onPlayFirst?: () => void
    hasNext?: boolean
    autoPlayEnabled?: boolean
    pipControlMode?: 'navigation' | 'skip'
    hasPrev?: boolean
    onPlayPause?: () => void
    volume?: number
    setVolume?: (volume: number) => void
    isMuted?: boolean
    toggleMute?: () => void
    controlMode?: 'navigation' | 'skip'
}

export const usePlayer = ({ mode: _mode = null, playlist: _playlist = null, hasPrev: _hasPrev = false, hasNext: _hasNext = false, onPlayPause: _onPlayPause = () => { }, onNext = () => { }, onPrev = () => { }, volume: _externalVolume = 1, setVolume: _externalSetVolume = () => { }, isMuted: _externalIsMuted = false, toggleMute: _externalToggleMute = () => { }, controlMode: _controlMode = 'navigation', media, onPlayFirst, autoPlayEnabled, pipControlMode = 'navigation' }: UsePlayerProps = {}) => {
    const audioEngine = useAudioEngine()
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

    const [_exclusiveMode, setExclusiveMode] = useState(false)
    const [useMpvAudio, setUseMpvAudio] = useState(false)
    const [enableMpvForVideo, setEnableMpvForVideo] = useState(false)
    const configLoaded = true

    const isMpv = useMpvAudio && (
        media?.file_type === 'audio' ||
        (media?.file_type === 'video' && enableMpvForVideo)
    )
    const useNativeVideoAudio = useMpvAudio && media?.file_type === 'video' && !enableMpvForVideo
    const usesNativeAudio = isMpv || useNativeVideoAudio

    useEffect(() => {
        const applyConfig = (c: PlayerClientConfig) => {
            setExclusiveMode(!!c.exclusiveMode)
            setUseMpvAudio(!!c.useMpvAudio)
            setEnableMpvForVideo(!!c.enableMpvForVideo)
        }

        getPlayerClientConfigFast().then((c) => {
            applyConfig(c)
        })

        const unsubscribe = api.on('client-config-updated', (_event: any, config: any) => {
            const next = normalizePlayerClientConfig(config)
            cachedPlayerClientConfig = next
            applyConfig(next)
        })

        return () => {
            if (unsubscribe) unsubscribe()
        }
    }, [])


    // 設定保存
    useEffect(() => {
        localStorage.setItem('player_settings', JSON.stringify({ volume, isMuted, isLooping }))
    }, [volume, isMuted, isLooping])

    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const blockFullscreenUntilRef = useRef(0)
    const playPromiseRef = useRef<Promise<void> | null>(null)

    const isPlayInterruptedError = (err: unknown): boolean => {
        const anyErr = err as any
        const name = String(anyErr?.name || '')
        const message = String(anyErr?.message || '')
        return name === 'AbortError' || message.includes('play() request was interrupted')
    }

    const waitCurrentPlayPromiseSafely = async (): Promise<void> => {
        const pending = playPromiseRef.current
        if (!pending) return
        try {
            await pending
        } catch (err) {
            if (!isPlayInterruptedError(err)) {
                throw err
            }
        } finally {
            if (playPromiseRef.current === pending) {
                playPromiseRef.current = null
            }
        }
    }

    // Refs for callback access inside MPV events
    const onNextRef = useRef(onNext)

    const onPlayFirstRef = useRef(onPlayFirst)
    const autoPlayEnabledRef = useRef(autoPlayEnabled)
    const hasNextRef = useRef(!!onNext)
    const isLoopingRef = useRef(isLooping)
    // Wait, onPlayFirst is NOT in props. It seems it was used in Player.tsx but not passed to usePlayer?
    // Let's check where onPlayFirst comes from in Player.tsx. It's likely passed to Player, not usePlayer.
    // Actually, usePlayer returns state, Player handles onEnded.
    // BUT for MPV, usePlayer handles the event.
    // So Player needs to pass onPlayFirst to usePlayer if we want to support loop playlist.
    // Or we handle "loop single" here and let Player handle playlist loop?
    // No, MPV is handled inside usePlayer entirely for events.

    // Let's check UsePlayerProps again.
    // onPlayFirst is NOT in UsePlayerProps.
    // We need to add onPlayFirst to UsePlayerProps.


    // 再生/一時停止（メディア要素の実際の状態を基準に）
    const togglePlay = async () => {
        if (usesNativeAudio) {
            if (isPlaying) {
                await api.pauseAudio()
                if (useNativeVideoAudio && videoRef.current) {
                    videoRef.current.pause()
                }
                setIsPlaying(false)
            } else {
                if (currentTime === 0 && !isPlaying) {
                    // 初回再生
                    await api.playAudio(media?.file_path)
                } else {
                    await api.resumeAudio()
                }
                if (useNativeVideoAudio && videoRef.current) {
                    try {
                        videoRef.current.currentTime = currentTime
                        await videoRef.current.play()
                    } catch {
                        // Keep native audio active even if visual playback cannot start immediately.
                    }
                }
                setIsPlaying(true)
            }
            return
        }

        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) return

        try {
            if (mediaElement.paused) {
                // 既存のplay()呼び出しが完了するのを待つ
                await waitCurrentPlayPromiseSafely()
                const nextPlayPromise = mediaElement.play()
                playPromiseRef.current = nextPlayPromise
                await nextPlayPromise
                setIsPlaying(true)
            } else {
                // 再生中の場合は一時停止
                if (playPromiseRef.current) {
                    void playPromiseRef.current.catch(() => { })
                    playPromiseRef.current = null
                }
                mediaElement.pause()
                setIsPlaying(false)
            }
        } catch (err) {
            if (!isPlayInterruptedError(err)) {
                console.error('Toggle play failed:', err)
            }
        } finally {
            if (mediaElement.paused) {
                playPromiseRef.current = null
            }
        }
    }

    // シーク（時間のみを設定、再生状態は変更しない）
    const seek = async (time: number) => {
        if (usesNativeAudio) {
            await api.seekAudio(time)
            if (useNativeVideoAudio && videoRef.current) {
                videoRef.current.currentTime = time
            }
            setCurrentTime(time)
            return
        }

        console.log('[usePlayer] seek called with time:', time)
        const media = videoRef.current || audioRef.current
        if (!media) {
            console.log('[usePlayer] No media element in seek')
            return
        }

        // ... (logging removed for brevity)

        try {
            // 進行中のplay()を待つ
            await waitCurrentPlayPromiseSafely()
            media.currentTime = time
            setCurrentTime(time)
        } catch (err) {
            if (!isPlayInterruptedError(err)) {
                console.error('Seek failed:', err)
            }
        }
    }

    const forward = (seconds: number = 10) => {
        seek(Math.min(duration, currentTime + seconds))
    }

    const rewind = (seconds: number = 10) => {
        seek(Math.max(0, currentTime - seconds))
    }

    const increaseVolume = () => {
        changeVolume(Math.min(1, volume + 0.1))
    }

    const decreaseVolume = () => {
        changeVolume(Math.max(0, volume - 0.1))
    }

    const getNativeAudioVolume = (nextVolume: number, muted: boolean) => {
        if (muted) return 0
        return nextVolume * nextVolume * 100
    }

    // 音量変更
    const changeVolume = (newVolume: number) => {
        setVolume(newVolume)
        const nextMuted = newVolume > 0 ? false : isMuted
        if (newVolume > 0 && isMuted) {
            setIsMuted(false)
        }

        // 人間の聴感特性に合わせて2乗のスケーリングを適用
        const scaledVolume = newVolume * newVolume

        if (usesNativeAudio) {
            api.setAudioVolume(getNativeAudioVolume(newVolume, nextMuted))
        } else {
            const media = videoRef.current || audioRef.current
            if (media) {
                media.volume = scaledVolume
                if (newVolume > 0 && isMuted) media.muted = false
            }
        }
    }

    // ミュート切り替え
    const toggleMute = () => {
        if (usesNativeAudio) {
            const nextMuted = !isMuted
            setIsMuted(nextMuted)
            api.setAudioVolume(getNativeAudioVolume(volume, nextMuted))
            return
        }

        const media = videoRef.current || audioRef.current
        if (!media) return

        media.muted = !isMuted
        setIsMuted(!isMuted)
    }

    // 再生速度変更
    const changePlaybackRate = (rate: number) => {
        if (usesNativeAudio) {
            setPlaybackRate(rate)
            // Playback speed bridge can be added later if needed.
            if (useNativeVideoAudio && videoRef.current) {
                videoRef.current.playbackRate = rate
            }
            return
        }

        const media = videoRef.current || audioRef.current
        if (!media) return

        media.playbackRate = rate
        setPlaybackRate(rate)
    }

    // ループ切り替え
    const toggleLoop = () => {
        if (usesNativeAudio) {
            setIsLooping(!isLooping)
            if (useNativeVideoAudio && videoRef.current) {
                videoRef.current.loop = !isLooping
            }
            return
        }

        const media = videoRef.current || audioRef.current
        if (!media) return

        media.loop = !isLooping
        setIsLooping(!isLooping)
    }

    // フルスクリーン切り替え
    const toggleFullscreen = () => {
        if (Date.now() < blockFullscreenUntilRef.current) return
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
            const targetTime = Math.min(mediaElement.duration, mediaElement.currentTime + (1 / fps))
            if (usesNativeAudio) {
                void seek(targetTime)
            } else {
                mediaElement.currentTime = targetTime
            }
        }
    }, { scope: 'player' })
    useShortcut('PLAYER_STEP_BACKWARD', () => {
        const mediaElement = videoRef.current || audioRef.current
        if (mediaElement && mediaElement.paused) {
            const fps = media?.framerate || 30
            const targetTime = Math.max(0, mediaElement.currentTime - (1 / fps))
            if (usesNativeAudio) {
                void seek(targetTime)
            } else {
                mediaElement.currentTime = targetTime
            }
        }
    }, { scope: 'player' })
    useShortcut('PLAYER_TOGGLE_FULLSCREEN', toggleFullscreen, { scope: 'player' })
    useShortcut('PLAYER_TOGGLE_MUTE', toggleMute, { scope: 'player' })
    useShortcut('PLAYER_VOLUME_UP', increaseVolume, { scope: 'player' })
    useShortcut('PLAYER_VOLUME_DOWN', decreaseVolume, { scope: 'player' })

    // オーディオエンジンの接続設定 (要素が切り替わった時のみ実行)
    useEffect(() => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        audioEngine.connectMediaElement(media)
    }, [videoRef.current, audioRef.current])

    // マウスボタンでの前後移動 (MB4: 戻る, MB5: 進む)
    useEffect(() => {
        const handleMouseUp = (e: MouseEvent) => {
            if (e.button === 3 && onPrev) onPrev()
            if (e.button === 4 && onNext) onNext()
        }
        window.addEventListener('mouseup', handleMouseUp)
        return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [onNext, onPrev])

    // メディア要素の属性同期とイベントリスナー設定
    useEffect(() => {
        const media = videoRef.current || audioRef.current
        if (!media) return

        // 保存された設定を適用
        media.volume = volume * volume // 聴感補正を適用
        media.muted = useNativeVideoAudio ? true : isMuted
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
            }
        }
    }, [videoRef.current, audioRef.current, volume, isMuted, isLooping, playbackRate, isMpv, useNativeVideoAudio])

    // Keep refs updated
    useEffect(() => {
        onNextRef.current = onNext
        onPlayFirstRef.current = onPlayFirst
        autoPlayEnabledRef.current = autoPlayEnabled
        hasNextRef.current = !!onNext
        isLoopingRef.current = isLooping
    }, [onNext, onPlayFirst, autoPlayEnabled, isLooping])

    // Native audio event listeners
    useEffect(() => {
        if (!usesNativeAudio) return

        // イベント購読
        const cleanupTime = api.on('audio:time-update', (_: any, time: number) => {
            setCurrentTime(time)
            if (useNativeVideoAudio && videoRef.current && Math.abs(videoRef.current.currentTime - time) > 0.25) {
                videoRef.current.currentTime = time
            }
        })
        const cleanupDuration = api.on('audio:duration-update', (_: any, dur: number) => {
            setDuration(dur)
        })
        const cleanupPause = api.on('audio:pause-update', (_: any, paused: boolean) => {
            setIsPlaying(!paused)
            if (useNativeVideoAudio && videoRef.current) {
                if (paused) {
                    videoRef.current.pause()
                } else {
                    void videoRef.current.play().catch(() => { })
                }
            }
        })
        const cleanupEnded = api.on('audio:ended', () => {
            // Auto-play logic
            // Note: autoPlayEnabled and hasNext logic is usually conditional in Player.tsx
            // But here we are the player controller.
            // We can use the props passed to usePlayer.

            // Since we added autoPlayEnabled and hasNext to props, we need refs for them too?
            // Or can we trust that if we use them in this effect deps, it re-subscribes?
            // Re-subscribing on every prop change is probably fine for these events.
            // But using refs is cleaner to avoid re-binding IPC listeners.

            const _autoPlay = autoPlayEnabledRef.current
            const _hasNext = hasNextRef.current
            const _isLooping = isLoopingRef.current
            const _onNext = onNextRef.current
            const _onPlayFirst = onPlayFirstRef.current

            if (_autoPlay) {
                if (_onNext && _hasNext) {
                    _onNext()
                } else if (_isLooping && _onPlayFirst && !_hasNext) {
                    _onPlayFirst()
                } else if (_isLooping && !_hasNext) {
                    // Single loop fallback if onPlayFirst not provided or simple loop
                    api.seekAudio(0)
                    api.playAudio()
                } else {
                    setIsPlaying(false)
                }
            } else {
                setIsPlaying(false)
            }
        })

        // 自動再生
        api.playAudio(media?.file_path)
        if (useNativeVideoAudio && videoRef.current) {
            videoRef.current.currentTime = 0
            void videoRef.current.play().catch(() => { })
        }

        return () => {
            if (cleanupTime) cleanupTime()
            if (cleanupDuration) cleanupDuration()
            if (cleanupPause) cleanupPause()
            if (cleanupEnded) cleanupEnded()
            // Cleanup: stop audio
            api.stopAudio()
            if (useNativeVideoAudio && videoRef.current) {
                videoRef.current.pause()
            }
        }
    }, [usesNativeAudio, useNativeVideoAudio, media?.id])

    useEffect(() => {
        if (!usesNativeAudio) return
        api.setAudioVolume(getNativeAudioVolume(volume, isMuted))
    }, [usesNativeAudio, volume, isMuted])

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
                return
            }
            if (media.readyState < 1) return
            if (media.requestPictureInPicture) {
                await media.requestPictureInPicture()
            }
        } catch (err) {
            console.error('Failed to toggle PiP:', err)
        }
    }

    // PiP event listeners
    useEffect(() => {
        const media = videoRef.current
        if (!media) return

        const handleEnterPiP = () => setIsPiP(true)
        const handleLeavePiP = () => {
            setIsPiP(false)
            const appApi = api as any
            if (appApi?.focusWindow) {
                appApi.focusWindow().catch((err: any) => console.error('Failed to focus window:', err))
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
                // ローカルパスをブラウザが扱えるURLに変換
                // Valid only when running in the desktop renderer context.
                const artUrl = toMediaUrl(media.thumbnail_path)

                // media:// 等のカスタムスキームは MediaSession で警告が出る可能性があるため Blob URL に変換
                if (artUrl.startsWith('media://')) {
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
        const skipBy = (deltaSeconds: number) => {
            const mediaElement = videoRef.current || audioRef.current
            if (!mediaElement) return
            const durationSafe = Number.isFinite(mediaElement.duration) ? mediaElement.duration : Number.MAX_SAFE_INTEGER
            const target = Math.max(0, Math.min(durationSafe, mediaElement.currentTime + deltaSeconds))
            mediaElement.currentTime = target
            setCurrentTime(target)
        }
        const handleSeekBackwardAction = (details: MediaSessionActionDetails) => {
            const offset = Number(details?.seekOffset)
            const seconds = Number.isFinite(offset) && offset > 0 ? offset : 10
            skipBy(-seconds)
        }
        const handleSeekForwardAction = (details: MediaSessionActionDetails) => {
            const offset = Number(details?.seekOffset)
            const seconds = Number.isFinite(offset) && offset > 0 ? offset : 10
            skipBy(seconds)
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

            if (pipControlMode === 'skip') {
                navigator.mediaSession.setActionHandler('seekbackward', handleSeekBackwardAction)
                navigator.mediaSession.setActionHandler('seekforward', handleSeekForwardAction)
                navigator.mediaSession.setActionHandler('previoustrack', null)
                navigator.mediaSession.setActionHandler('nexttrack', null)
            } else {
                navigator.mediaSession.setActionHandler('seekbackward', null)
                navigator.mediaSession.setActionHandler('seekforward', null)
                navigator.mediaSession.setActionHandler('previoustrack', handlePrevAction)
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

    // バッファリング状態
    const [buffered, setBuffered] = useState(0)

    useEffect(() => {
        const media = useNativeVideoAudio
            ? videoRef.current
            : (videoRef.current || audioRef.current)
        if (!media || isMpv) {
            setBuffered(0)
            return
        }

        const updateBuffered = () => {
            if (media.buffered.length > 0) {
                // 現在の再生位置を含むバッファ範囲を探す
                const current = media.currentTime
                let maxBuffered = 0

                for (let i = 0; i < media.buffered.length; i++) {
                    const start = media.buffered.start(i)
                    const end = media.buffered.end(i)

                    // 現在位置を含む範囲が見つかればそれを採用
                    if (start <= current && current <= end) {
                        maxBuffered = end
                        break
                    }

                    // まだ再生前なら最初のバッファを採用
                    if (current === 0 && start === 0) {
                        maxBuffered = end
                    }
                }

                // フォールバック: 現在位置を含む範囲が見つからない場合（シーク直後など）、
                // 現在位置より後ろにある最も近いバッファの終端を表示、または0
                if (maxBuffered === 0 && media.buffered.length > 0) {
                    // 簡易的に末尾を採用する既存ロジックを踏襲せず、0とする（非連続なバッファ表示はUI対応が必要なため）
                    // ただし、ロード開始直後は currentTime=0 で buffered も 0-X なので上の if で拾えるはず
                }

                setBuffered(maxBuffered)
            } else {
                setBuffered(0)
            }
        }

        updateBuffered()
        media.addEventListener('progress', updateBuffered)
        media.addEventListener('timeupdate', updateBuffered) // スムーズな更新のため

        return () => {
            media.removeEventListener('progress', updateBuffered)
            media.removeEventListener('timeupdate', updateBuffered)
        }
    }, [videoRef.current, audioRef.current, isMpv, useNativeVideoAudio, media?.id])

    useEffect(() => {
        // Guard against accidental fullscreen trigger while switching from library to player.
        blockFullscreenUntilRef.current = Date.now() + 350
    }, [media?.id])

    return {
        containerRef,
        videoRef,
        audioRef,
        isPlaying,
        currentTime,
        duration,
        buffered, // Added
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

        audioEngine,
        isMpv,
        usesNativeAudio,
        useNativeVideoAudio,
        configLoaded
    }
}
