import { useState, useRef, useEffect } from 'react'

export function usePlayer() {
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)

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
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 入力フィールド等では無効化
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            switch (e.code) {
                case 'Space':
                    e.preventDefault()
                    togglePlay()
                    break
                case 'ArrowRight':
                    forward()
                    break
                case 'ArrowLeft':
                    rewind()
                    break
                case 'KeyF':
                    toggleFullscreen()
                    break
                case 'KeyM':
                    toggleMute()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [isPlaying, isMuted])

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
        togglePlay,
        seek,
        forward,
        rewind,
        changeVolume,
        toggleMute,
        changePlaybackRate,
        toggleLoop,
        toggleFullscreen,
    }
}
