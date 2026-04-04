import React, { useState, useEffect, useRef, useContext } from 'react'
import { createPortal } from 'react-dom'
import { MediaFile, RemoteLibrary, AppSettings } from '@obscura/core'
import { usePlayer } from '../hooks/usePlayer'
import { api } from '../api'
import './Player.css'
import './ContextMenu.css'
import { toMediaUrl } from '../utils/fileUrl'
import { ShortcutContext } from '../contexts/ShortcutContext'
import { AudioSettingsModal } from './AudioSettingsModal'
import { getAuthHeaders } from '../utils/auth'
import { usePlugins as useCommentProviders } from '../hooks/usePlugins'

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
    videoScaling?: 'smooth' | 'pixelated'
    imageScaling?: 'smooth' | 'pixelated'
    settings?: AppSettings
    pipWindowMode?: boolean
    pipInitialState?: {
        currentTime?: number
        isPlaying?: boolean
        playbackRate?: number
        volume?: number
        muted?: boolean
    } | null
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
    onCommentAdded,
    videoScaling = 'smooth',
    imageScaling = 'smooth',
    settings,
    pipWindowMode = false,
    pipInitialState = null
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
        usesNativeAudio,
        configLoaded,
        buffered
    } = usePlayer({
        media,
        onNext,
        onPrev,
        onPlayFirst,
        hasNext,
        autoPlayEnabled,
        pipControlMode
    })
    const isVideo = media.file_type === 'video'
    const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
    const [videoVisualReady, setVideoVisualReady] = useState(false)

    // 繧ｪ繝ｼ繝舌・繝ｬ繧､Canvas縺ｮ謠冗判邂｡逅・
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null)

    // 繧ｪ繝ｼ繝舌・繝ｬ繧､逕ｨ繧ｳ繝ｳ繝・く繧ｹ繝医・蜷梧悄

    const overlayStateRef = useRef({ currentTime, isPlaying, enabled: true })
    useEffect(() => {
        overlayStateRef.current = { currentTime, isPlaying, enabled: true }
    }, [currentTime, isPlaying])

    // 繧ｷ繝ｧ繝ｼ繝医き繝・ヨ繧ｹ繧ｳ繝ｼ繝励・邂｡逅・
    const context = useContext(ShortcutContext)
    useEffect(() => {
        if (context) {
            context.pushScope('player')
            return () => {
                context.popScope('player')
            }
        }
    }, [])

    const commentProviders = useCommentProviders()
    const playerExtensionButtons = React.useMemo(() => {
        if (!media) return []
        try {
            // 險ｭ螳壹〒譛牙柑縺ｫ縺ｪ縺｣縺ｦ縺・ｋ繝励Λ繧ｰ繧､繝ｳ縺ｮ縺ｿ繝懊ち繝ｳ繧定｡ｨ遉ｺ

            return commentProviders
                .filter(p => settings?.extensions?.[p.id]?.enabled !== false)
                .flatMap(p =>
                    p.uiHooks?.playerTopBar ? p.uiHooks.playerTopBar(media).map(btn => ({
                        ...btn,
                        key: `${p.id}-${btn.id}`
                    })) : []
                )
        } catch (e) {
            console.error('[PluginSystem] Failed to get player top bar hooks', e)
            return []
        }
    }, [media, commentProviders, settings?.extensions])

    // 謌ｻ繧九・繧ｿ繝ｳ謚ｼ荳区凾縺ｫ繝｡繝・ぅ繧｢繧呈・遉ｺ逧・↓蛛懈ｭ｢縺励※縺九ｉ謌ｻ繧・
    const handleBack = () => {
        const mediaElement = videoRef.current || audioRef.current
        if (mediaElement) {
            mediaElement.pause()
            // 繝ｭ繝ｼ繝我ｸｭ縺ｮ蜍慕判繧貞ｮ悟・縺ｫ蛛懈ｭ｢縺吶ｋ縺溘ａ縺ｫsrc繧偵け繝ｪ繧｢縺励※load()繧貞他縺ｶ
            mediaElement.src = ''
            if ('load' in mediaElement) mediaElement.load()
        }
        onBack()
    }

    const handleReturnToMainWindow = async () => {
        try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
            const main = await WebviewWindow.getByLabel('main')
            if (main) {
                await main.show()
                await main.setFocus()
            }
        } catch {
            // no-op
        } finally {
            handleBack()
        }
    }

    // ESC繧ｭ繝ｼ縺ｧ謌ｻ繧・    // 繧ｭ繝ｼ繝懊・繝峨す繝ｧ繝ｼ繝医き繝・ヨ (ESC, Ctrl+C, Ctrl+Shift+C)

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // ESC: 謌ｻ繧・
            if (e.key === 'Escape') {
                e.preventDefault()
                handleBack()
                return
            }

            // Ctrl+C / Ctrl+Shift+C

            if (e.ctrlKey && (e.code === 'KeyC')) {
                // 繝・く繧ｹ繝磯∈謚樔ｸｭ縲√∪縺溘・蜈･蜉帙ヵ繧ｩ繝ｼ繧ｫ繧ｹ荳ｭ縺ｪ繧臥┌隕悶＠縺ｦ繝悶Λ繧ｦ繧ｶ縺ｮ繝・ヵ繧ｩ繝ｫ繝医さ繝斐・繧貞━蜈・
                const selection = window.getSelection()?.toString()
                const activeElement = document.activeElement
                const isInputField = activeElement instanceof HTMLInputElement ||
                    activeElement instanceof HTMLTextAreaElement ||
                    (activeElement as HTMLElement)?.isContentEditable

                if ((selection && selection.length > 0) || isInputField) {
                    return
                }

                e.preventDefault()

                // Shift縺ゅｊ: 繝輔ぃ繧､繝ｫ繧ｳ繝斐・

                if (e.shiftKey) {
                    if (media.file_path) {
                        try {
                            const success = await api.copyFileToClipboard(media.file_path)
                            console.log(success ? '[Player] File copied to clipboard' : '[Player] Failed to copy file')
                        } catch (err) {
                            console.error('[Player] Failed to copy file:', err)
                        }
                    }
                }
                // Shift縺ｪ縺・ 繝輔Ξ繝ｼ繝繧ｳ繝斐・
                else {
                    const dataUrl = await captureCurrentFrame()
                    if (dataUrl) {
                        try {
                            const copied = await api.copyFrameToClipboard(dataUrl)
                            if (copied) {
                                console.log('[Player] Frame copied to clipboard')
                            } else {
                                console.error('[Player] Failed to copy frame: clipboard write returned false')
                            }
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
    const [playerContextMenu, setPlayerContextMenu] = useState<{ x: number; y: number } | null>(null)
    const playerContextMenuRef = useRef<HTMLDivElement>(null)
    const frameCaptureVideoRef = useRef<HTMLVideoElement | null>(null)
    const frameCaptureCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const syncChannelRef = useRef<BroadcastChannel | null>(null)
    const syncSourceRef = useRef(`player-${Math.random().toString(36).slice(2)}`)
    const applyingRemoteStateRef = useRef(false)

    const getMediaElement = () => (videoRef.current || audioRef.current) as (HTMLVideoElement | HTMLAudioElement | null)

    useEffect(() => {
        if (!playerContextMenu) return
        const handleOutside = (e: MouseEvent) => {
            if (playerContextMenuRef.current && !playerContextMenuRef.current.contains(e.target as Node)) {
                setPlayerContextMenu(null)
            }
        }
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPlayerContextMenu(null)
        }
        document.addEventListener('mousedown', handleOutside)
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('mousedown', handleOutside)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [playerContextMenu])

    // GPU蜉騾溘・繝ｬ繝薙Η繝ｼ逕ｨ縺ｮ繧ｹ繝ｭ繝・ヨ繝ｪ繝ｳ繧ｰ

    const lastPreviewTimeRef = useRef<number>(-1)
    const lastRequestTimestampRef = useRef<number>(0) // 10ms繧ｹ繝ｭ繝・ヨ繝ｫ逕ｨ
    const previewVideoRef = useRef<HTMLVideoElement | null>(null)
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const previewRequestSeqRef = useRef<number>(0)

    // 陦ｨ遉ｺ繝｢繝ｼ繝会ｼ医え繧｣繝ｳ繝峨え縺ｫ蜷医ｏ縺帙ｋ / 繧ｪ繝ｪ繧ｸ繝翫Ν繧ｵ繧､繧ｺ・峨ｒlocalStorage縺九ｉ蠕ｩ蜈・
    const [resizeMode, setResizeModeState] = useState<'contain' | 'scale-down'>(() => {
        try {
            const saved = localStorage.getItem('player_resize_mode')
            if (saved === 'contain' || saved === 'scale-down') return saved
        } catch (e) { /* ignore */ }
        return 'contain'
    })

    // 陦ｨ遉ｺ繝｢繝ｼ繝牙､画峩譎ゅ↓localStorage縺ｫ菫晏ｭ・
    const setResizeMode = (mode: 'contain' | 'scale-down') => {
        setResizeModeState(mode)
        localStorage.setItem('player_resize_mode', mode)
    }

    // showControls髢｢騾｣縺ｮ繝ｭ繧ｸ繝・け繧貞炎髯､・亥ｸｸ譎り｡ｨ遉ｺ縺ｮ縺溘ａ・・    // GPU蜉騾溘・繝ｬ繝薙Η繝ｼ繧剃ｽｿ逕ｨ縺吶ｋ縺溘ａ縲√ヵ繧｡繧､繝ｫ繝吶・繧ｹ縺ｮ繝励Ξ繝薙Η繝ｼ隱ｭ縺ｿ霎ｼ縺ｿ縺ｯ荳崎ｦ・
    // 繝励Ξ繝薙Η繝ｼ逕ｨ繝薙ョ繧ｪ隕∫ｴ繧剃ｺ句燕縺ｫ蛻晄悄蛹厄ｼ医・繝舌・譎ゅ・蛻晏屓驕・ｻｶ繧帝亟縺撰ｼ・
    useEffect(() => {
        if (!media || media.file_type !== 'video') {
            // 繧ｯ繝ｪ繝ｼ繝ｳ繧｢繝・・

            if (previewVideoRef.current) {
                previewVideoRef.current.src = ''
                previewVideoRef.current = null
            }
            return
        }

        // 髫縺励ン繝・が隕∫ｴ繧剃ｺ句燕縺ｫ菴懈・繝ｻ隱ｭ縺ｿ霎ｼ縺ｿ髢句ｧ・
        const video = document.createElement('video')
        video.muted = true
        video.crossOrigin = 'anonymous'
        video.playsInline = true
        // Delay source assignment until first hover so startup playback does not compete for I/O.
        video.preload = 'metadata'
        video.style.display = 'none'
        previewVideoRef.current = video

        return () => {
            if (previewVideoRef.current) {
                previewVideoRef.current.src = ''
                previewVideoRef.current = null
            }
            previewRequestSeqRef.current += 1
        }
    }, [media?.id])

    // 蜍慕判隱ｭ縺ｿ霎ｼ縺ｿ蠕後↓閾ｪ蜍募・逕溘ｒ髢句ｧ具ｼ・edia縺悟､画峩縺輔ｌ縺滓凾縺ｮ縺ｿ・・
    useEffect(() => {
        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) return

        // 譌｢縺ｫ繝｡繧ｿ繝・・繧ｿ縺後Ο繝ｼ繝峨＆繧後※縺・ｋ蝣ｴ蜷医・蜊ｳ蠎ｧ縺ｫ蜀咲函

        if (mediaElement.readyState >= 1) {
            mediaElement.play().catch(() => { })
        } else {
            // 繝｡繧ｿ繝・・繧ｿ繝ｭ繝ｼ繝牙ｾ後↓蜀咲函・・nce縺ｧ閾ｪ蜍慕噪縺ｫ繝ｪ繧ｹ繝翫・隗｣髯､・・
            mediaElement.addEventListener('loadedmetadata', () => {
                mediaElement.play().catch(() => { })
            }, { once: true })
        }
    }, [media?.id]) // media.id縺ｮ縺ｿ縺ｫ萓晏ｭ假ｼ医が繝悶ず繧ｧ繧ｯ繝亥盾辣ｧ螟画峩縺ｫ繧医ｋ蜀阪ヨ繝ｪ繧ｬ繝ｼ繧帝亟豁｢・・

    useEffect(() => {
        setVideoVisualReady(!isVideo)
    }, [media?.id, isVideo])
    // Buffered Time State is now managed in usePlayer

    const bufferedTime = buffered

    // 繝ｫ繝ｼ繝励→閾ｪ蜍募・逕溘・騾｣謳ｺ

    useEffect(() => {
        const mediaElement = videoRef.current || audioRef.current
        if (!mediaElement) return

        if (autoPlayEnabled && isLooping) {
            mediaElement.loop = false
        } else {
            mediaElement.loop = isLooping
        }
    }, [autoPlayEnabled, isLooping, media?.id])

    useEffect(() => {
        if (!pipWindowMode || !pipInitialState) return
        const mediaElement = getMediaElement()
        if (!mediaElement) return

        const applyInitialState = async () => {
            applyingRemoteStateRef.current = true
            try {
                if (Number.isFinite(pipInitialState.currentTime)) {
                    mediaElement.currentTime = Math.max(0, Number(pipInitialState.currentTime))
                }
                if (Number.isFinite(pipInitialState.playbackRate) && Number(pipInitialState.playbackRate) > 0) {
                    mediaElement.playbackRate = Number(pipInitialState.playbackRate)
                }
                if (Number.isFinite(pipInitialState.volume)) {
                    mediaElement.volume = Math.max(0, Math.min(1, Number(pipInitialState.volume)))
                }
                if (typeof pipInitialState.muted === 'boolean') {
                    mediaElement.muted = pipInitialState.muted
                }
                if (pipInitialState.isPlaying) {
                    await mediaElement.play().catch(() => { })
                } else {
                    mediaElement.pause()
                }
            } finally {
                applyingRemoteStateRef.current = false
            }
        }

        if (mediaElement.readyState >= 1) {
            void applyInitialState()
            return
        }

        const onLoaded = () => {
            void applyInitialState()
        }
        mediaElement.addEventListener('loadedmetadata', onLoaded, { once: true })
        return () => mediaElement.removeEventListener('loadedmetadata', onLoaded)
    }, [pipWindowMode, pipInitialState, media?.id])

    useEffect(() => {
        if (!pipWindowMode) return
        if (typeof BroadcastChannel === 'undefined') return
        if (!media) return
        const channel = new BroadcastChannel('obscura-pip-sync')
        syncChannelRef.current = channel

        const publishState = () => {
            const mediaElement = getMediaElement()
            if (!mediaElement || applyingRemoteStateRef.current) return
            if (!pipWindowMode && isPiP) return
            channel.postMessage({
                type: 'state',
                mediaId: media.id,
                source: syncSourceRef.current,
                currentTime: mediaElement.currentTime,
                isPaused: mediaElement.paused,
                playbackRate: mediaElement.playbackRate,
                volume: mediaElement.volume,
                muted: mediaElement.muted,
                at: Date.now(),
            })
        }

        const onMessage = (event: MessageEvent) => {
            const payload = event.data || {}
            if (payload.source === syncSourceRef.current) return
            if (payload.mediaId !== media.id) return

            const mediaElement = getMediaElement()
            if (!mediaElement) return

            if (payload.type === 'request' && !pipWindowMode && !isPiP) {
                publishState()
                return
            }
            if (payload.type !== 'state') return

            applyingRemoteStateRef.current = true
            try {
                const remoteTime = Number(payload.currentTime)
                if (Number.isFinite(remoteTime) && Math.abs(mediaElement.currentTime - remoteTime) > 0.35) {
                    mediaElement.currentTime = Math.max(0, remoteTime)
                }

                const remoteRate = Number(payload.playbackRate)
                if (Number.isFinite(remoteRate) && remoteRate > 0 && Math.abs(mediaElement.playbackRate - remoteRate) > 0.01) {
                    mediaElement.playbackRate = remoteRate
                }

                const remoteVol = Number(payload.volume)
                if (Number.isFinite(remoteVol) && Math.abs(mediaElement.volume - remoteVol) > 0.01) {
                    mediaElement.volume = Math.max(0, Math.min(1, remoteVol))
                }
                if (typeof payload.muted === 'boolean' && mediaElement.muted !== payload.muted) {
                    mediaElement.muted = payload.muted
                }

                // Main window stays passive while PiP exists.
                if (!pipWindowMode && isPiP) {
                    if (!mediaElement.paused) mediaElement.pause()
                    return
                }

                if (payload.isPaused === true && !mediaElement.paused) {
                    mediaElement.pause()
                } else if (payload.isPaused === false && mediaElement.paused) {
                    void mediaElement.play().catch(() => { })
                }
            } finally {
                applyingRemoteStateRef.current = false
            }
        }

        channel.addEventListener('message', onMessage)

        const mediaElement = getMediaElement()
        const onEvent = () => publishState()
        mediaElement?.addEventListener('play', onEvent)
        mediaElement?.addEventListener('pause', onEvent)
        mediaElement?.addEventListener('seeked', onEvent)
        mediaElement?.addEventListener('ratechange', onEvent)
        mediaElement?.addEventListener('volumechange', onEvent)
        mediaElement?.addEventListener('loadedmetadata', onEvent)

        const timer = window.setInterval(publishState, 350)
        if (pipWindowMode) {
            channel.postMessage({ type: 'request', mediaId: media.id, source: syncSourceRef.current })
        }

        return () => {
            window.clearInterval(timer)
            mediaElement?.removeEventListener('play', onEvent)
            mediaElement?.removeEventListener('pause', onEvent)
            mediaElement?.removeEventListener('seeked', onEvent)
            mediaElement?.removeEventListener('ratechange', onEvent)
            mediaElement?.removeEventListener('volumechange', onEvent)
            mediaElement?.removeEventListener('loadedmetadata', onEvent)
            channel.removeEventListener('message', onMessage)
            channel.close()
            syncChannelRef.current = null
        }
    }, [media?.id, pipWindowMode, isPiP, videoRef.current, audioRef.current])


    // Discord RPC Integration

    useEffect(() => {
        if (!media) return

        const updateDiscord = () => {
            const el = videoRef.current || audioRef.current
            // 螳滄圀縺ｮ隕∫ｴ縺ｮ迥ｶ諷九ｒ蜆ｪ蜈亥叙蠕・
            const curTime = el ? el.currentTime : currentTime
            const dur = el ? el.duration : duration
            const rate = el ? el.playbackRate : playbackRate

            // 迥ｶ諷九↓蠢懊§縺溘い繧ｯ繝・ぅ繝薙ユ繧｣譖ｴ譁ｰ

            if (isPlaying) {
                const now = Date.now()
                // 谿九ｊ譎る俣繧定ｨ育ｮ・
                const remainingSec = (dur - curTime) / (rate || 1)
                const endTimestamp = Math.floor(now + remainingSec * 1000)

                api.updateDiscordActivity({
                    details: media.file_name,
                    state: 'Playing',
                    endTimestamp: (dur && isFinite(endTimestamp)) ? endTimestamp : undefined,
                    largeImageKey: 'app_icon',
                    largeImageText: 'Obscura',
                    smallImageKey: 'play_icon',
                    smallImageText: 'Playing'
                })
            } else {
                api.updateDiscordActivity({
                    details: media.file_name,
                    state: 'Paused',
                    largeImageKey: 'app_icon',
                    largeImageText: 'Obscura',
                    smallImageKey: 'pause_icon',
                    smallImageText: 'Paused'
                })
            }
        }

        // 蛻晄悄螳溯｡・
        updateDiscord()

        // Seek繧､繝吶Φ繝医・逶｣隕・(繧ｷ繝ｼ繧ｯ譎ゅ↓譎る俣繧呈峩譁ｰ縺吶ｋ縺溘ａ)

        const el = videoRef.current || audioRef.current
        if (el) {
            const handleSeeked = () => {
                // 繧ｷ繝ｼ繧ｯ逶ｴ蠕後・繧ｹ繝・・繝医′螳牙ｮ壹＠縺ｪ縺・ｴ蜷医′縺ゅｋ縺溘ａ蟆代＠蠕・▽縺九・
                // 蜊倥↓蜀榊ｮ溯｡後☆繧九・
                updateDiscord()
            }
            el.addEventListener('seeked', handleSeeked)
            return () => {
                el.removeEventListener('seeked', handleSeeked)
            }
        }
    }, [media, isPlaying, playbackRate]) // currentTime繧貞性繧√↑縺・％縺ｨ縺ｧ驕主臆縺ｪ譖ｴ譁ｰ繧帝亟縺・




    // 繧ｷ繝ｼ繧ｯ繝舌・縺ｮ繝槭え繧ｹ遘ｻ蜍輔ワ繝ｳ繝峨Λ・医ヶ繝ｩ繧ｦ繧ｶGPU蜉騾溘・繝ｬ繝薙Η繝ｼ・・
    const requestPreviewImageFallback = async (requestSeq: number, timeSeconds: number) => {
        if (!media?.file_path) return
        try {
            const dataUrl = await api.captureFrameDataUrl(media.file_path, timeSeconds)
            if (requestSeq !== previewRequestSeqRef.current) return
            if (typeof dataUrl === 'string' && dataUrl) {
                setPreviewImage(dataUrl)
            } else {
                setPreviewImage(null)
            }
        } catch {
            if (requestSeq !== previewRequestSeqRef.current) return
            setPreviewImage(null)
        }
    }

    const handleSeekMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!media || !duration || media.file_type !== 'video') return

        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const width = rect.width
        // 0莉･荳嚇uration莉･荳九↓繧ｯ繝ｩ繝ｳ繝・
        const hoverTime = Math.max(0, Math.min(duration, (x / width) * duration))

        // 譎る俣縺ｯ蟶ｸ縺ｫ陦ｨ遉ｺ
        setPreviewTime(hoverTime)
        setPreviewX(x)

        // 10ms繧ｹ繝ｭ繝・ヨ繝ｫ: 蜑榊屓縺ｮ繝ｪ繧ｯ繧ｨ繧ｹ繝医°繧・0ms莉･蜀・↑繧峨せ繧ｭ繝・・

        const now = Date.now()
        if (now - lastRequestTimestampRef.current < 10) return
        lastRequestTimestampRef.current = now

        // 繧ｭ繝｣繝ｳ繝舌せ繧貞・譛溷喧・亥・蝗槭・縺ｿ・・
        if (!previewCanvasRef.current) {
            previewCanvasRef.current = document.createElement('canvas')
            previewCanvasRef.current.width = 160 // 繝励Ξ繝薙Η繝ｼ繧ｵ繧､繧ｺ
            previewCanvasRef.current.height = 90
        }

        // 繝励Ξ繝薙Η繝ｼ逕ｨ繝薙ョ繧ｪ隕∫ｴ縺後∪縺縺ｪ縺代ｌ縺ｰ繧ｹ繧ｭ繝・・・・seEffect縺ｧ蛻晄悄蛹紋ｸｭ・・
        if (!previewVideoRef.current) {
            previewRequestSeqRef.current += 1
            void requestPreviewImageFallback(previewRequestSeqRef.current, hoverTime)
            return
        }

        const video = previewVideoRef.current
        if (!video.src && media?.file_path) {
            video.src = toMediaUrl(media.file_path)
            if (typeof video.load === 'function') video.load()
            previewRequestSeqRef.current += 1
            void requestPreviewImageFallback(previewRequestSeqRef.current, hoverTime)
            return
        }
        const canvas = previewCanvasRef.current

        // 蜷後§譎る俣・育ｧ貞腰菴搾ｼ峨↑繧峨せ繧ｭ繝・・・医ヱ繝輔か繝ｼ繝槭Φ繧ｹ譛驕ｩ蛹厄ｼ・
        const roundedTime = Math.floor(hoverTime)
        if (roundedTime === lastPreviewTimeRef.current) return
        lastPreviewTimeRef.current = roundedTime
        previewRequestSeqRef.current += 1
        const requestSeq = previewRequestSeqRef.current

        // メタデータ読み込み前は sidecar へ落とさず待つ（不要な高コスト呼び出しを防ぐ）
        if (!Number.isFinite(video.duration)) {
            setPreviewImage(null)
            return
        }
        if (hoverTime > video.duration) {
            void requestPreviewImageFallback(requestSeq, hoverTime)
            return
        }
        video.currentTime = hoverTime

        // seeked 繧､繝吶Φ繝医〒繝輔Ξ繝ｼ繝繧ｭ繝｣繝励メ繝｣

        const handleSeeked = () => {
            if (requestSeq !== previewRequestSeqRef.current) return
            const ctx = canvas.getContext('2d')
            if (ctx && video.videoWidth > 0) {
                try {
                    // 繧｢繧ｹ繝壹け繝域ｯ斐ｒ邯ｭ謖√＠縺ｦ繧ｭ繝｣繝ｳ繝舌せ繧ｵ繧､繧ｺ繧定ｪｿ謨ｴ

                    const aspectRatio = video.videoWidth / video.videoHeight
                    canvas.width = 160
                    canvas.height = Math.round(160 / aspectRatio)
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                    setPreviewImage(canvas.toDataURL('image/jpeg', 0.7))
                } catch (err) {
                    // Cross-origin / tainted canvas fallback
                    void requestPreviewImageFallback(requestSeq, hoverTime)
                }
                return
            }
            void requestPreviewImageFallback(requestSeq, hoverTime)
        }
        video.addEventListener('seeked', handleSeeked, { once: true })
    }

    const handleSeekMouseLeave = () => {
        previewRequestSeqRef.current += 1
        setPreviewTime(null)
        setPreviewImage(null)
        lastPreviewTimeRef.current = -1
    }

    // 繧ｳ繝｡繝ｳ繝磯∽ｿ｡

    const handleSendComment = async () => {
        if (!media || !commentText.trim()) return
        try {
            if (activeRemoteLibrary) {
                // 繝ｪ繝｢繝ｼ繝・
                const response = await fetch(`${activeRemoteLibrary.url} /api/media / ${media.id}/comments`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders(activeRemoteLibrary.token, myUserToken || '')
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
                // 繝ｭ繝ｼ繧ｫ繝ｫ
                await api.addComment(media.id, commentText, currentTime)
            }

            setCommentText('')
            setShowCommentInput(false)
            console.log('Comment added')
            // 繧ｳ繝｡繝ｳ繝郁ｿｽ蜉蠕後↓騾夂衍・・nspector譖ｴ譁ｰ逕ｨ・・
            if (onCommentAdded) {
                onCommentAdded()
            }
        } catch (error) {
            console.error('Failed to add comment:', error)
        }
    }

    // 繧ｭ繝｣繝励メ繝｣讖溯・

    const captureCurrentFrameSync = (): string | null => {
        const video = videoRef.current
        if (!video) return null

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            return canvas.toDataURL('image/jpeg', 0.9) // JPEG蜩∬ｳｪ90%
        } catch (error) {
            console.error('[Player] captureCurrentFrame failed (tainted canvas):', error)
            return null
        }
    }

    const waitForMediaEvent = (target: HTMLMediaElement, eventName: string, timeoutMs = 5000) => new Promise<void>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        const cleanup = () => {
            target.removeEventListener(eventName, onEvent)
            target.removeEventListener('error', onError)
            if (timeoutId) clearTimeout(timeoutId)
        }
        const onEvent = () => {
            cleanup()
            resolve()
        }
        const onError = () => {
            cleanup()
            reject(new Error(`media event failed: ${eventName}`))
        }
        target.addEventListener(eventName, onEvent, { once: true })
        target.addEventListener('error', onError, { once: true })
        timeoutId = setTimeout(() => {
            cleanup()
            reject(new Error(`media event timeout: ${eventName}`))
        }, timeoutMs)
    })

    const captureCurrentFrame = async (): Promise<string | null> => {
        const direct = captureCurrentFrameSync()
        if (direct) return direct
        if (!isVideo || !media?.file_path) return null

        const captureViaSidecar = async (): Promise<string | null> => {
            try {
                const mediaElement = getMediaElement()
                const timeSeconds = Number.isFinite(Number(mediaElement?.currentTime))
                    ? Number(mediaElement?.currentTime)
                    : Number(currentTime || 0)
                const dataUrl = await api.captureFrameDataUrl(media.file_path, timeSeconds)
                return typeof dataUrl === 'string' && dataUrl ? dataUrl : null
            } catch (error) {
                console.error('[Player] captureCurrentFrame sidecar fallback failed:', error)
                return null
            }
        }

        try {
            let captureVideo = frameCaptureVideoRef.current
            if (!captureVideo) {
                captureVideo = document.createElement('video')
                captureVideo.preload = 'auto'
                captureVideo.muted = true
                captureVideo.crossOrigin = 'anonymous'
                frameCaptureVideoRef.current = captureVideo
            }

            const src = toMediaUrl(media.file_path)
            if (captureVideo.src !== src) {
                captureVideo.src = src
            }

            if (captureVideo.readyState < 1) {
                await waitForMediaEvent(captureVideo, 'loadedmetadata')
            }

            const mediaElement = getMediaElement()
            const currentTimeValue = mediaElement ? Number(mediaElement.currentTime || 0) : 0
            const boundedTime = Number.isFinite(currentTimeValue)
                ? Math.max(0, currentTimeValue)
                : 0
            const targetTime = Number.isFinite(captureVideo.duration)
                ? Math.min(boundedTime, Math.max(0, captureVideo.duration - 0.05))
                : boundedTime

            if (Math.abs(captureVideo.currentTime - targetTime) > 0.001) {
                captureVideo.currentTime = targetTime
                await waitForMediaEvent(captureVideo, 'seeked')
            }

            if (captureVideo.readyState < 2) {
                await waitForMediaEvent(captureVideo, 'canplay')
            }

            let canvas = frameCaptureCanvasRef.current
            if (!canvas) {
                canvas = document.createElement('canvas')
                frameCaptureCanvasRef.current = canvas
            }

            const width = Math.max(1, captureVideo.videoWidth || 0)
            const height = Math.max(1, captureVideo.videoHeight || 0)
            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext('2d')
            if (!ctx) return await captureViaSidecar()

            ctx.drawImage(captureVideo, 0, 0, width, height)
            return canvas.toDataURL('image/jpeg', 0.9)
        } catch (error) {
            console.error('[Player] captureCurrentFrame fallback failed:', error)
            return await captureViaSidecar()
        }
    }

    useEffect(() => {
        return () => {
            if (frameCaptureVideoRef.current) {
                frameCaptureVideoRef.current.src = ''
                frameCaptureVideoRef.current = null
            }
            frameCaptureCanvasRef.current = null
        }
    }, [])

    const handlePlayerContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setPlayerContextMenu({ x: e.clientX, y: e.clientY })
    }

    const closePlayerContextMenu = () => {
        setPlayerContextMenu(null)
    }

    const handleCopyCurrentFrame = async () => {
        const dataUrl = await captureCurrentFrame()
        if (!dataUrl) return
        try {
            const copied = await api.copyFrameToClipboard(dataUrl)
            if (!copied) {
                console.error('[Player] Failed to copy frame from context menu: clipboard write returned false')
            }
        } catch (error) {
            console.error('[Player] Failed to copy frame from context menu:', error)
        } finally {
            closePlayerContextMenu()
        }
    }

    const handleSaveCurrentFrame = async () => {
        const dataUrl = await captureCurrentFrame()
        if (!dataUrl) return
        try {
            await api.saveCapturedFrame(dataUrl)
        } catch (error) {
            console.error('[Player] Failed to save frame from context menu:', error)
        } finally {
            closePlayerContextMenu()
        }
    }

    const handleSetCurrentFrameAsThumbnail = async () => {
        const dataUrl = await captureCurrentFrame()
        if (!dataUrl) return
        try {
            await api.setCapturedThumbnail(media.id, dataUrl)
        } catch (error) {
            console.error('[Player] Failed to set thumbnail from context menu:', error)
        } finally {
            closePlayerContextMenu()
        }
    }

    const handleCopyFileToClipboard = async () => {
        if (!media.file_path) return
        try {
            await api.copyFileToClipboard(media.file_path)
        } catch (error) {
            console.error('[Player] Failed to copy file from context menu:', error)
        } finally {
            closePlayerContextMenu()
        }
    }

    const handleCopyFilePath = async () => {
        if (!media.file_path) return
        try {
            await api.copyToClipboard(media.file_path)
        } catch (error) {
            console.error('[Player] Failed to copy file path from context menu:', error)
        } finally {
            closePlayerContextMenu()
        }
    }

    // 繧ｳ繝ｳ繝・く繧ｹ繝医Γ繝九Η繝ｼ縺九ｉ縺ｮ繧ｭ繝｣繝励メ繝｣隕∵ｱゅｒ繝ｪ繝・せ繝ｳ

    useEffect(() => {
        if (!media) return

        const cleanup = api.onTriggerFrameCapture(async (action: string) => {
            console.log('[Player] Frame capture trigger:', action)
            const dataUrl = await captureCurrentFrame()
            if (!dataUrl) {
                console.error('[Player] Failed to capture frame')
                return
            }

            try {
                if (action === 'copy-frame') {
                    // Electron IPC繧剃ｽｿ逕ｨ縺励※繧ｯ繝ｪ繝・・繝懊・繝峨↓繧ｳ繝斐・・医ヵ繧ｩ繝ｼ繧ｫ繧ｹ蝠城｡後ｒ蝗樣∩・・
                    const copied = await api.copyFrameToClipboard(dataUrl)
                    if (copied) {
                        console.log('[Player] Frame copied to clipboard via Electron')
                    } else {
                        console.error('[Player] Failed to copy frame via Electron trigger: clipboard write returned false')
                    }
                } else if (action === 'save-frame') {
                    // 繝輔ぃ繧､繝ｫ縺ｫ菫晏ｭ・                    await api.saveCapturedFrame(dataUrl)
                } else if (action === 'set-thumbnail') {
                    // 繧ｵ繝繝阪う繝ｫ縺ｫ險ｭ螳・                    await api.setCapturedThumbnail(media.id, dataUrl)
                    console.log('[Player] Thumbnail updated')
                }
            } catch (error) {
                console.error('[Player] Capture action failed:', error)
            }
        })

        return cleanup
    }, [media])

    const formatTime = (seconds: number) => {
        if (!isFinite(seconds)) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    // media:// 繝励Ο繝医さ繝ｫ繧剃ｽｿ逕ｨ (http縺ｮ蝣ｴ蜷医・縺昴・縺ｾ縺ｾ)

    const fileUrl = toMediaUrl(media.file_path)

    // 繧ｪ繝ｼ繝舌・繝ｬ繧､謠冗判繝ｫ繝ｼ繝励→Canvas縺ｮ迚ｩ逅・ｧ｣蜒丞ｺｦ隱ｿ謨ｴ・・PI蟇ｾ蠢懶ｼ・
    useEffect(() => {
        const canvas = overlayCanvasRef.current
        if (!canvas || !media || !isVideo) return

        // 繝｡繝・ぅ繧｢蛻・ｊ譖ｿ縺域凾縺ｫCanvas繧剃ｸ蠎ｦ縺縺醍｢ｺ螳溘↓繧ｯ繝ｪ繧｢縺吶ｋ

        const initialCtx = canvas.getContext('2d')
        if (initialCtx) {
            initialCtx.setTransform(1, 0, 0, 1, 0, 0)
            initialCtx.clearRect(0, 0, canvas.width, canvas.height)
            console.log('[Player] Canvas initial clear for media change')
        }

        let animationFrameId: number
        const render = () => {
            const overlays = (window as any).__obscura_player_overlays as Map<string, any>
            if (overlays) {
                const canvas = overlayCanvasRef.current
                if (canvas) {
                    const ctx = canvas.getContext('2d')
                    if (ctx) {
                        overlays.forEach((callback) => {
                            try {
                                callback(canvas, media, overlayStateRef.current)
                            } catch (e) {
                                console.error('[Player] Overlay render error:', e)
                            }
                        })
                    }
                }
            }
            animationFrameId = requestAnimationFrame(render)
        }

        // 繝薙ョ繧ｪ縺ｮ螳滄圀縺ｮ陦ｨ遉ｺ鬆伜沺縺ｫCanvas繧呈ｭ｣遒ｺ縺ｫ荳閾ｴ縺輔○繧九Μ繧ｵ繧､繧ｺ蜃ｦ逅・        // video.getBoundingClientRect()縺ｯobject-fit縺ｮ蠖ｱ髻ｿ繧貞渚譏縺励↑縺・◆繧√・        // 繧ｳ繝ｳ繝・リ繧ｵ繧､繧ｺ縺ｨ繧｢繧ｹ繝壹け繝域ｯ斐°繧画丐蜒上・陦ｨ遉ｺ鬆伜沺繧定・蜑阪〒險育ｮ励☆繧・
        const handleResize = () => {
            const parent = canvas.parentElement
            if (!parent || videoSize.width === 0) return

            const rect = parent.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1

            const videoRatio = videoSize.width / videoSize.height
            const containerRatio = rect.width / rect.height

            let displayWidth = 0
            let displayHeight = 0

            if (resizeMode === 'scale-down') {
                // 繧ｪ繝ｪ繧ｸ繝翫Ν繧ｵ繧､繧ｺ: 繝阪う繝・ぅ繝冶ｧ｣蜒丞ｺｦ繧定ｶ・∴縺ｪ縺・ｯ・峇縺ｧ繧ｳ繝ｳ繝・リ縺ｫ蜿弱ａ繧・                displayWidth = Math.min(videoSize.width, rect.width)
                displayHeight = displayWidth / videoRatio
                if (displayHeight > rect.height) {
                    displayHeight = rect.height
                    displayWidth = displayHeight * videoRatio
                }
            } else {
                // 繧ｦ繧｣繝ｳ繝峨え縺ｫ蜷医ｏ縺帙ｋ: 繧ｳ繝ｳ繝・リ蜀・〒繧｢繧ｹ繝壹け繝域ｯ斐ｒ邯ｭ謖√＠縺ｦ譛螟ｧ蛹・
                if (containerRatio > videoRatio) {
                    displayHeight = rect.height
                    displayWidth = displayHeight * videoRatio
                } else {
                    displayWidth = rect.width
                    displayHeight = displayWidth / videoRatio
                }
            }

            const newWidth = Math.floor(displayWidth * dpr)
            const newHeight = Math.floor(displayHeight * dpr)

            if (canvas.width !== newWidth || canvas.height !== newHeight ||
                canvas.style.width !== `${displayWidth}px` || canvas.style.height !== `${displayHeight}px`) {
                canvas.width = newWidth
                canvas.height = newHeight
                canvas.style.width = `${displayWidth}px`
                canvas.style.height = `${displayHeight}px`
                console.log(`[Player] Canvas resized to ${newWidth}x${newHeight} (DPR: ${dpr}, CSS: ${displayWidth}x${displayHeight})`)
            }
        }

        const resizeObserver = new ResizeObserver(handleResize)
        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement)
        }
        handleResize()

        render()

        return () => {
            cancelAnimationFrame(animationFrameId)
            resizeObserver.disconnect()
        }
    }, [media, isVideo, videoSize, resizeMode])

    return (
        <div
            className={`player-container ${pipWindowMode ? 'pip-window-mode' : ''}`}
            ref={containerRef}
        /* 蟶ｸ譎り｡ｨ遉ｺ縺ｮ縺溘ａ繝槭え繧ｹ蛻ｶ蠕｡縺ｯ蜑企勁 */
        >
            {pipWindowMode && (
                <div className="pip-drag-bar">
                    <button className="pip-return-btn" onClick={handleReturnToMainWindow} title="元のウィンドウへ戻る">
                        戻る
                    </button>
                    <button className="pip-close-btn" onClick={handleBack} title="閉じる">
                        ×
                    </button>
                </div>
            )}
            {/* 繧ｳ繝｡繝ｳ繝郁｡ｨ遉ｺ (繧ｪ繝ｼ繝舌・繝ｬ繧､) */}
            <div className="player-comment-overlay">
                {(media.comments || []).filter(c => Math.abs(c.time - currentTime) < 3).map(c => (
                    <div key={c.id} className="comment-bubble">
                        {c.nickname && <span className="comment-nickname">{c.nickname}: </span>}
                        <span className="comment-text">{c.text}</span>
                    </div>
                ))}
            </div>

            {/* 繝倥ャ繝繝ｼ繝舌・ (荳企Κ蝗ｺ螳・ */}
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
                    {/* 繝励Λ繧ｰ繧､繝ｳ繝懊ち繝ｳ鄒､・医Μ繧ｵ繧､繧ｺ繝懊ち繝ｳ縺ｮ蟾ｦ縺ｫ驟咲ｽｮ・・*/}
                    {playerExtensionButtons.length > 0 && (
                        <div className="nav-buttons" style={{ marginRight: '8px' }}>
                            {playerExtensionButtons.map(btn => {
                                const isActive = btn.isActive
                                return (
                                    <button
                                        key={btn.key}
                                        className={`nav-btn ${isActive ? 'active' : ''}`}
                                        disabled={btn.disabled}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            btn.onClick({ media })
                                        }}
                                        title={btn.label}
                                        style={isActive ? { color: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
                                    >
                                        {btn.icon ? (
                                            <span dangerouslySetInnerHTML={{ __html: btn.icon }} style={{ width: 20, height: 20, display: 'flex' }} />
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="16" />
                                                <line x1="8" y1="12" x2="16" y2="12" />
                                            </svg>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {/* 繝ｪ繧ｵ繧､繧ｺ繝｢繝ｼ繝牙・繧頑崛縺医・繧ｿ繝ｳ */}
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
                            title="オリジナルサイズ（拡大しない）"
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

            <div className="player-content" onContextMenu={handlePlayerContextMenu}>
                {!configLoaded ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                        Loading configuration...
                    </div>
                ) : isVideo && !isMpv ? (
                    <>
                        <div className="player-video-stack" style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            display: 'grid',
                            gridTemplateColumns: '100%',
                            gridTemplateRows: '100%',
                            placeItems: 'center',
                            overflow: 'hidden'
                        }}>
                            <video
                                ref={videoRef}
                                src={fileUrl}
                                crossOrigin="anonymous"
                                className="player-video"
                                autoPlay
                                preload="auto"
                                style={{
                                    gridArea: '1 / 1 / 2 / 2',
                                    width: resizeMode === 'scale-down' ? 'auto' : '100%',
                                    height: resizeMode === 'scale-down' ? 'auto' : '100%',
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: resizeMode === 'scale-down' ? 'scale-down' : 'contain',
                                    opacity: videoVisualReady ? 1 : 0,
                                    transition: 'opacity 120ms ease',
                                    imageRendering: videoScaling === 'pixelated' ? 'pixelated' : 'auto',
                                    zIndex: 1
                                }}
                                onLoadedMetadata={(e) => {
                                    const v = e.currentTarget;
                                    setVideoSize({ width: v.videoWidth, height: v.videoHeight });
                                }}
                                onLoadedData={() => setVideoVisualReady(true)}
                                onClick={togglePlay}
                                onEnded={() => {
                                    if (usesNativeAudio) return
                                    if (autoPlayEnabled) {
                                        if (onNext && hasNext) {
                                            onNext()
                                        } else if (isLooping && onPlayFirst && !hasNext) {
                                            onPlayFirst()
                                        }
                                    }
                                }}
                            />

                            {/* 蜈ｱ騾壹が繝ｼ繝舌・繝ｬ繧､繝ｬ繧､繝､繝ｼ (Grid縺ｧ繝薙ョ繧ｪ縺ｨ螳悟・縺ｫ驥阪・繧・ */}
                            <div className="player-canvas-layer" style={{
                                gridArea: '1 / 1 / 2 / 2',
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                zIndex: 2,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <canvas
                                    ref={overlayCanvasRef}
                                    style={{
                                        pointerEvents: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </>
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
                                background: 'color-mix(in srgb, var(--primary), transparent 85%)',
                                border: '1px solid color-mix(in srgb, var(--primary), transparent 70%)',
                                borderRadius: '4px',
                                color: 'var(--primary)',
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
                                    if (usesNativeAudio) return
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

            {playerContextMenu && createPortal(
                <div
                    ref={playerContextMenuRef}
                    className="context-menu"
                    style={{ position: 'fixed', top: playerContextMenu.y, left: playerContextMenu.x, zIndex: 100001 }}
                >
                    <div className={`context-menu-item ${isVideo ? '' : 'disabled'}`} onClick={isVideo ? handleCopyCurrentFrame : undefined}>
                        フレームをコピー
                    </div>
                    <div className={`context-menu-item ${isVideo ? '' : 'disabled'}`} onClick={isVideo ? handleSaveCurrentFrame : undefined}>
                        フレームを保存
                    </div>
                    <div className={`context-menu-item ${isVideo ? '' : 'disabled'}`} onClick={isVideo ? handleSetCurrentFrameAsThumbnail : undefined}>
                        このフレームをサムネイルに設定
                    </div>
                    <div className="context-menu-separator" />
                    <div className="context-menu-item" onClick={handleCopyFileToClipboard}>
                        ファイルをコピー
                    </div>
                    <div className="context-menu-item" onClick={handleCopyFilePath}>
                        パスをコピー
                    </div>
                </div>,
                document.body
            )}

            {/* 繧ｳ繝ｳ繝医Ο繝ｼ繝ｫ繝舌・ (荳矩Κ蝗ｺ螳・ */}
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

                    <div
                        className="volume-control-group"
                        onWheel={(e) => {
                            const delta = e.deltaY < 0 ? 0.05 : -0.05
                            const newVolume = Math.min(1, Math.max(0, volume + delta))
                            changeVolume(newVolume)
                        }}
                    >
                        <button className="control-btn" onClick={toggleMute}>
                            {isMuted || volume === 0 ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                            ) : volume < 0.33 ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /></svg>
                            ) : volume < 0.66 ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                            )}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume ?? 1}
                            onChange={(e) => changeVolume(parseFloat(e.target.value))}
                            className="volume-slider"
                            style={{ backgroundSize: `${volume * 100}% 100%` }}
                        />
                    </div>

                    <div className="time-display">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                </div>

                {/* 繧ｷ繝ｼ繧ｯ繝舌・ (荳ｭ螟ｮ) */}
                <div
                    className="player-seek-container"
                    onMouseMove={handleSeekMouseMove}
                    onMouseLeave={handleSeekMouseLeave}
                >
                    {/* 繝励Ξ繝薙Η繝ｼ繝・・繝ｫ繝√ャ繝・*/}
                    {previewTime !== null && (
                        <div
                            className="seek-preview-tooltip"
                            style={{ left: previewX }}
                        >
                            {previewImage && (
                                <div className="preview-image-box">
                                    <img
                                        src={previewImage}
                                        alt="preview"
                                        style={{ imageRendering: imageScaling === 'pixelated' ? 'pixelated' : 'auto' }}
                                    />
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
                        value={currentTime ?? 0}
                        onChange={(e) => seek(parseFloat(e.target.value))}
                        className="player-seek-slider"
                    />
                </div>

                <div className="controls-right">
                    {/* 蜀咲函騾溷ｺｦ */}
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

                    {/* 閾ｪ蜍募・逕・*/}
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

                    {/* 繝ｪ繝斐・繝・*/}
                    <button className={`control-btn ${isLooping ? 'active' : ''}`} onClick={toggleLoop} title="ループ">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="17 1 21 5 17 9" />
                            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                            <polyline points="7 23 3 19 7 15" />
                            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                    </button>

                    {/* PiP */}
                    {isVideo && !pipWindowMode && (
                        <button className={`control-btn pip-toggle-btn ${isPiP ? 'active' : ''}`} onClick={togglePiP} title="ピクチャーインピクチャー">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="6" width="20" height="14" rx="2" ry="2" />
                                <rect x="13" y="11" width="8" height="5" rx="1" ry="1" fill="currentColor" />
                            </svg>
                        </button>
                    )}

                    {/* 繧ｳ繝｡繝ｳ繝・*/}
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

                    {/* 繝輔Ν繧ｹ繧ｯ繝ｪ繝ｼ繝ｳ */}
                    <button className="control-btn" onClick={toggleFullscreen}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* 莉･蜑阪・back-button-overlay縺ｯ蜑企勁貂医∩ */}

            {/* 繧ｪ繝ｼ繝・ぅ繧ｪ繧ｨ繝ｳ繧ｸ繝ｳ險ｭ螳壹Δ繝ｼ繝繝ｫ */}
            {
                showAudioSettings && (
                    <AudioSettingsModal
                        settings={audioEngine.settings}
                        updateSettings={audioEngine.updateSettings}
                        analyser={audioEngine.analyser}
                        onClose={() => setShowAudioSettings(false)}
                    />
                )
            }
        </div >
    )
}



