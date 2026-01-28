import { useState, useRef, useEffect, useCallback } from 'react'
import { AudioEngineSettings, EqualizerBand } from '../types'
import { parseVDCBuffer } from '../utils/vdcParser'
import { getAudioAsset } from '../utils/audioStorage'
import { parseWavManual } from '../utils/safeAudioParser'
import { makeTubeCurve, makeAnalogXCurve, makeExciterCurve, createReverbImpulse } from '../utils/audioDSP'

const DEFAULT_EQ_BANDS: EqualizerBand[] = [
    { frequency: 31, gain: 0 },
    { frequency: 62, gain: 0 },
    { frequency: 125, gain: 0 },
    { frequency: 250, gain: 0 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 0 },
    { frequency: 2000, gain: 0 },
    { frequency: 4000, gain: 0 },
    { frequency: 8000, gain: 0 },
    { frequency: 16000, gain: 0 },
]

const DEFAULT_SETTINGS: AudioEngineSettings = {
    enabled: false,
    masterGain: 100,

    playbackGainEnabled: false,
    playbackGainRatio: 50,
    playbackMaxGain: 100,

    eqEnabled: true,
    eqBands: DEFAULT_EQ_BANDS,

    convolverEnabled: false,
    convolverIR: null,
    convolverCrossfeed: 0,

    // Algorithmic Reverb
    reverbEnabled: false,
    reverbSize: 50,
    reverbDamping: 50,
    reverbWet: 20,
    reverbDry: 80,
    reverbWidth: 100,

    ddcEnabled: false,
    ddcFile: null,

    surroundEnabled: false,
    surroundMode: 'Field',
    surroundStrength: 50,
    surroundDelay: 20,

    // Spectrum Extension
    spectrumEnabled: false,
    spectrumGain: 50,

    // Tube
    tubeEnabled: false,
    tubeOrder: 2,

    // AnalogX
    analogXEnabled: false,
    analogXMode: 'Class A',
    analogXDrive: 50,

    bassEnabled: false,
    bassMode: 'Natural',
    bassFrequency: 60,
    bassGain: 0,

    clarityEnabled: false,
    clarityMode: 'Natural',
    clarityGain: 0,

    dynamicEnabled: false,
    dynamicSideGain: 0,
    dynamicBassThreshold: -20,

    compressorEnabled: true,
    compressorThreshold: -12,
    compressorRatio: 12,
    compressorKnee: 30,
    compressorAttack: 0.003,
    compressorRelease: 0.25,

    // Protection
    auditoryProtectionEnabled: false,
    protectionThreshold: -3,

    // Master Limiter
    masterLimiterEnabled: true,
    masterLimiterThreshold: -0.5
}

export function useAudioEngine() {
    const [settings, setSettings] = useState<AudioEngineSettings>(() => {
        try {
            const saved = localStorage.getItem('audio_engine_settings_v3') // Updated version key
            if (saved) {
                const parsed = JSON.parse(saved)
                return { ...DEFAULT_SETTINGS, ...parsed }
            }
        } catch (e) { }
        return DEFAULT_SETTINGS
    })

    const audioCtxRef = useRef<AudioContext | null>(null)
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
    const sourceNodesMapRef = useRef(new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>())

    // Nodes
    const gainPreRef = useRef<GainNode | null>(null)

    // Spectrum
    const spectrumFilterRef = useRef<BiquadFilterNode | null>(null)
    const spectrumShaperRef = useRef<WaveShaperNode | null>(null)
    const spectrumGainRef = useRef<GainNode | null>(null)

    const eqNodesRef = useRef<BiquadFilterNode[]>([])

    // Convolver (File-based) AND Algorithmic Reverb (New)
    // We can reuse the convolver node for both? Or separate?
    // "Reverberation" usually implies the algorithmic one in ViperFX context if standard Convolver is separate "Kernel".
    // Let's create a separate node for Algorithmic Reverb to allow stacking if crazy, or switching.
    // ViperFX usually has "Convolver" (kernels) and "Reverberation" (algorithmic) separate.
    const convolverNodeRef = useRef<ConvolverNode | null>(null)
    const convolverSwitchGainRef = useRef<GainNode | null>(null) // Wet gain
    const convolverDryGainRef = useRef<GainNode | null>(null) // Dry gain

    const reverbNodeRef = useRef<ConvolverNode | null>(null) // For algorithmic impulse
    const reverbWetGainRef = useRef<GainNode | null>(null)
    const reverbDryGainRef = useRef<GainNode | null>(null)

    const ddcNodeRef = useRef<ConvolverNode | null>(null)
    const ddcSwitchGainRef = useRef<GainNode | null>(null) // Wet gain
    const ddcDryGainRef = useRef<GainNode | null>(null) // Dry gain

    // Surround nodes
    const splitterRef = useRef<ChannelSplitterNode | null>(null)
    const mergerRef = useRef<ChannelMergerNode | null>(null)
    const leftDelayRef = useRef<DelayNode | null>(null)
    const rightDelayRef = useRef<DelayNode | null>(null)
    const surroundGainRef = useRef<GainNode | null>(null) // Wet Gain
    const surroundDryGainRef = useRef<GainNode | null>(null) // Dry Gain

    // Tube & AnalogX
    const tubeNodeRef = useRef<WaveShaperNode | null>(null)
    const tubeGainRef = useRef<GainNode | null>(null) // Wet Gain
    const tubeDryGainRef = useRef<GainNode | null>(null) // Dry Gain

    const analogXNodeRef = useRef<WaveShaperNode | null>(null)
    const analogXWetGainRef = useRef<GainNode | null>(null)
    const analogXDryGainRef = useRef<GainNode | null>(null)

    // Enhancement nodes
    const bassFilterRef = useRef<BiquadFilterNode | null>(null)
    const clarityFilterRef = useRef<BiquadFilterNode | null>(null)
    const dynamicGainRef = useRef<GainNode | null>(null)

    // Protection
    const protectionNodeRef = useRef<DynamicsCompressorNode | null>(null)

    const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null)

    // Master Limiter
    const masterLimiterNodeRef = useRef<DynamicsCompressorNode | null>(null)
    const masterGainNodeRef = useRef<GainNode | null>(null)
    const analyserNodeRef = useRef<AnalyserNode | null>(null)

    // 初期化
    const initAudioContext = useCallback(() => {
        if (audioCtxRef.current) return audioCtxRef.current

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioCtxRef.current = ctx

        // chain construction
        gainPreRef.current = ctx.createGain()

        // Spectrum Extension Setup
        spectrumFilterRef.current = ctx.createBiquadFilter()
        spectrumFilterRef.current.type = 'highpass'
        spectrumFilterRef.current.frequency.value = 8000
        spectrumShaperRef.current = ctx.createWaveShaper()
        spectrumShaperRef.current.curve = makeExciterCurve(50) // Initial curve
        spectrumGainRef.current = ctx.createGain()
        spectrumGainRef.current.gain.value = 0

        eqNodesRef.current = DEFAULT_EQ_BANDS.map(band => {
            const filter = ctx.createBiquadFilter()
            filter.type = 'peaking'
            filter.frequency.value = band.frequency
            filter.Q.value = 1.4
            return filter
        })

        convolverNodeRef.current = ctx.createConvolver()
        convolverSwitchGainRef.current = ctx.createGain() // Wet gain
        convolverDryGainRef.current = ctx.createGain()

        reverbNodeRef.current = ctx.createConvolver()
        reverbWetGainRef.current = ctx.createGain()
        reverbDryGainRef.current = ctx.createGain()

        ddcNodeRef.current = ctx.createConvolver()
        ddcSwitchGainRef.current = ctx.createGain()
        ddcDryGainRef.current = ctx.createGain()

        // Surround
        splitterRef.current = ctx.createChannelSplitter(2)
        mergerRef.current = ctx.createChannelMerger(2)
        leftDelayRef.current = ctx.createDelay(0.1)
        rightDelayRef.current = ctx.createDelay(0.1)
        surroundGainRef.current = ctx.createGain()

        // Tube
        tubeNodeRef.current = ctx.createWaveShaper()
        tubeNodeRef.current.curve = makeTubeCurve(1)
        tubeNodeRef.current.oversample = '4x'

        // AnalogX
        analogXNodeRef.current = ctx.createWaveShaper()
        analogXNodeRef.current.curve = makeAnalogXCurve('Class A', 50)
        analogXNodeRef.current.oversample = '4x'

        // Enhancement
        bassFilterRef.current = ctx.createBiquadFilter()
        bassFilterRef.current.type = 'lowshelf'

        clarityFilterRef.current = ctx.createBiquadFilter()
        clarityFilterRef.current.type = 'highshelf'

        dynamicGainRef.current = ctx.createGain()

        compressorNodeRef.current = ctx.createDynamicsCompressor()

        protectionNodeRef.current = ctx.createDynamicsCompressor()
        // Protection is hard limiting
        protectionNodeRef.current.ratio.value = 20
        protectionNodeRef.current.attack.value = 0
        protectionNodeRef.current.release.value = 0.01

        masterLimiterNodeRef.current = ctx.createDynamicsCompressor()
        masterLimiterNodeRef.current.ratio.value = 20
        masterLimiterNodeRef.current.attack.value = 0.001
        masterLimiterNodeRef.current.release.value = 0.05
        masterLimiterNodeRef.current.threshold.value = -0.5

        masterGainNodeRef.current = ctx.createGain()
        analyserNodeRef.current = ctx.createAnalyser()
        analyserNodeRef.current.fftSize = 256

        // --- Connection Chain ---
        let lastNode: AudioNode = gainPreRef.current

        // 1. Spectrum Extension (Parallel)
        // Signal flows normally, but also splits to Spectrum path
        const spectrumMix = ctx.createGain()
        lastNode.connect(spectrumMix) // Dry

        lastNode.connect(spectrumFilterRef.current!)
        spectrumFilterRef.current!.connect(spectrumShaperRef.current!)
        spectrumShaperRef.current!.connect(spectrumGainRef.current!)
        spectrumGainRef.current!.connect(spectrumMix) // Wet

        lastNode = spectrumMix

        // 2. EQ
        if (eqNodesRef.current.length > 0) {
            lastNode.connect(eqNodesRef.current[0])
            for (let i = 0; i < eqNodesRef.current.length - 1; i++) {
                eqNodesRef.current[i].connect(eqNodesRef.current[i + 1])
            }
            lastNode = eqNodesRef.current[eqNodesRef.current.length - 1]
        }

        // 3. Tube Simulator (Series Mix)
        const tubeMix = ctx.createGain()
        tubeGainRef.current = ctx.createGain() // Wet
        tubeGainRef.current.gain.value = 0 // Init to 0
        tubeDryGainRef.current = ctx.createGain() // Dry

        lastNode.connect(tubeDryGainRef.current!)
        lastNode.connect(tubeNodeRef.current!)
        tubeNodeRef.current!.connect(tubeGainRef.current!)

        tubeDryGainRef.current!.connect(tubeMix)
        tubeGainRef.current!.connect(tubeMix)

        lastNode = tubeMix

        // 4. Convolver Mix (Dry/Wet)
        convolverDryGainRef.current = ctx.createGain()
        const convMixNode = ctx.createGain()

        lastNode.connect(convolverNodeRef.current!)
        convolverNodeRef.current!.connect(convolverSwitchGainRef.current!)
        convolverSwitchGainRef.current!.gain.value = 0 // Init to 0
        convolverSwitchGainRef.current!.connect(convMixNode)

        lastNode.connect(convolverDryGainRef.current!)
        convolverDryGainRef.current!.connect(convMixNode)

        lastNode = convMixNode

        // 5. Algorithmic Reverb (Parallel)
        const reverbMixNode = ctx.createGain()
        reverbDryGainRef.current = ctx.createGain()

        lastNode.connect(reverbNodeRef.current!)
        reverbNodeRef.current!.connect(reverbWetGainRef.current!)
        reverbWetGainRef.current!.gain.value = 0 // Init to 0
        reverbWetGainRef.current!.connect(reverbMixNode)

        lastNode.connect(reverbDryGainRef.current!)
        reverbDryGainRef.current!.connect(reverbMixNode)

        lastNode = reverbMixNode

        // 6. DDC (Viper Digital Headphone Correction)
        const ddcMixNode = ctx.createGain()
        lastNode.connect(ddcNodeRef.current!)
        ddcNodeRef.current!.connect(ddcSwitchGainRef.current!)
        ddcSwitchGainRef.current!.gain.value = 0 // Init to 0
        ddcSwitchGainRef.current!.connect(ddcMixNode)

        lastNode.connect(ddcDryGainRef.current!)
        ddcDryGainRef.current!.connect(ddcMixNode)

        lastNode = ddcMixNode

        // 7. Surround Logic
        const surroundMix = ctx.createGain()

        // Wet Path
        surroundGainRef.current = ctx.createGain()
        surroundGainRef.current.gain.value = 0 // Init to 0
        lastNode.connect(splitterRef.current!)
        splitterRef.current!.connect(leftDelayRef.current!, 0)
        splitterRef.current!.connect(rightDelayRef.current!, 1)
        leftDelayRef.current!.connect(mergerRef.current!, 0, 0)
        rightDelayRef.current!.connect(mergerRef.current!, 0, 1)
        mergerRef.current!.connect(surroundGainRef.current!)
        surroundGainRef.current!.connect(surroundMix)

        // Dry Path
        surroundDryGainRef.current = ctx.createGain()
        lastNode.connect(surroundDryGainRef.current)
        surroundDryGainRef.current.connect(surroundMix)

        lastNode = surroundMix

        // 8. AnalogX (Series Mix)
        const analogXMix = ctx.createGain()
        analogXDryGainRef.current = ctx.createGain()
        analogXWetGainRef.current = ctx.createGain()
        analogXWetGainRef.current.gain.value = 0 // Init to 0

        lastNode.connect(analogXDryGainRef.current)
        lastNode.connect(analogXNodeRef.current!)
        analogXNodeRef.current!.connect(analogXWetGainRef.current)

        analogXDryGainRef.current.connect(analogXMix)
        analogXWetGainRef.current.connect(analogXMix)

        lastNode = analogXMix

        // 9. Post Enhancement
        lastNode.connect(bassFilterRef.current!)
        bassFilterRef.current!.connect(clarityFilterRef.current!)
        clarityFilterRef.current!.connect(dynamicGainRef.current!)
        lastNode = dynamicGainRef.current!

        // 10. Dynamics Processing & Protection
        lastNode.connect(compressorNodeRef.current!) // Main Compressor
        compressorNodeRef.current!.connect(protectionNodeRef.current!) // Auditory Protection
        protectionNodeRef.current!.connect(masterGainNodeRef.current!) // Gain BEFORE Limiter

        masterGainNodeRef.current!.connect(masterLimiterNodeRef.current!) // Limiter AFTER Gain
        masterLimiterNodeRef.current!.connect(analyserNodeRef.current!)
        analyserNodeRef.current!.connect(ctx.destination)

        return ctx
    }, [])

    const connectMediaElement = useCallback((element: HTMLMediaElement) => {
        if (!element) return
        const ctx = initAudioContext()
        try {
            let source = sourceNodesMapRef.current.get(element)
            if (!source) {
                source = ctx.createMediaElementSource(element)
                sourceNodesMapRef.current.set(element, source)
            }
            sourceNodeRef.current = source
            source.disconnect()
            source.connect(gainPreRef.current!)
            if (ctx.state === 'suspended') ctx.resume()
        } catch (e) {
            console.error('[AudioEngine] Connection failed', e)
        }
    }, [initAudioContext])

    // Load IR
    useEffect(() => {
        let isCancelled = false

        if (!settings.convolverEnabled || !settings.convolverIR || !audioCtxRef.current) {
            if (convolverNodeRef.current) convolverNodeRef.current.buffer = null
            return
        }

        const loadIR = async () => {
            const ctx = audioCtxRef.current!
            const path = settings.convolverIR!
            console.log(`[AudioEngine] [1] IR Load start: ${path}`)

            try {
                let blob: Blob | null = null
                if (path.startsWith('idb:')) {
                    blob = await getAudioAsset(path)
                    if (!blob) throw new Error('Asset not found in DB')
                    console.log(`[AudioEngine] [2] IDB Load success: ${blob.size} bytes`)
                } else {
                    const response = await fetch(path)
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
                    blob = await response.blob()
                    console.log(`[AudioEngine] [2] Fetch success: ${blob.size} bytes`)
                }

                if (isCancelled) return

                console.log(`[AudioEngine] [3] Converting blob to ArrayBuffer...`)
                let arrayBuffer: ArrayBuffer
                try {
                    arrayBuffer = await blob.arrayBuffer()
                } catch (e) {
                    arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onload = () => resolve(reader.result as ArrayBuffer)
                        reader.onerror = () => reject(reader.error)
                        reader.readAsArrayBuffer(blob!)
                    })
                }

                console.log(`[AudioEngine] [4] ArrayBuffer ready: ${arrayBuffer.byteLength} bytes`)
                if (isCancelled) return

                // ログを確実に出すための短い待機
                await new Promise(r => setTimeout(r, 50))

                // Safe decoding: ネイティブデコーダーを使わず、自作のパーサーでパースする
                console.log(`[AudioEngine] [5] Starting manual parse...`)
                const audioBuffer = parseWavManual(arrayBuffer, ctx)

                if (isCancelled) return
                console.log(`[AudioEngine] [6] Parse complete: ${audioBuffer.duration.toFixed(3)}s, ${audioBuffer.numberOfChannels}ch, ${audioBuffer.sampleRate}Hz`)

                if (convolverNodeRef.current) {
                    console.log(`[AudioEngine] [7] Assigning buffer...`)
                    convolverNodeRef.current.buffer = audioBuffer
                    console.log('[AudioEngine] [8] Success.')
                }
            } catch (err: any) {
                console.error(`[AudioEngine] [ERR] IR Error (${path}):`, err.message || err)
                if (convolverNodeRef.current) {
                    try { convolverNodeRef.current.buffer = null } catch (e) { }
                }
            }
        }

        loadIR()
        return () => { isCancelled = true }
    }, [settings.convolverIR, settings.convolverEnabled])

    // Load DDC
    useEffect(() => {
        let isCancelled = false

        if (!settings.ddcEnabled || !settings.ddcFile || !audioCtxRef.current) {
            if (ddcNodeRef.current) ddcNodeRef.current.buffer = null
            return
        }

        const loadDDC = async () => {
            const ctx = audioCtxRef.current!
            const path = settings.ddcFile!
            console.log(`[AudioEngine] [1] DDC Load start: ${path}`)

            try {
                let buffer: ArrayBuffer
                if (path.startsWith('idb:')) {
                    const blob = await getAudioAsset(path)
                    if (!blob) throw new Error('DDC Asset not found')
                    console.log(`[AudioEngine] [2] IDB Load success: ${blob.size} bytes`)
                    try {
                        buffer = await blob.arrayBuffer()
                    } catch (e) {
                        buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                            const reader = new FileReader()
                            reader.onload = () => resolve(reader.result as ArrayBuffer)
                            reader.onerror = () => reject(reader.error)
                            reader.readAsArrayBuffer(blob!)
                        })
                    }
                } else {
                    const response = await fetch(path)
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
                    buffer = await response.arrayBuffer()
                    console.log(`[AudioEngine] [2] Fetch success: ${buffer.byteLength} bytes`)
                }

                if (isCancelled) return

                console.log(`[AudioEngine] [3] Parsing VDC...`)
                const data = parseVDCBuffer(buffer)
                console.log(`[AudioEngine] [4] DDC Parse success: ${data.numCoefficients} coeffs, ${data.channels}ch`)

                if (data.numCoefficients > 2000000) throw new Error('DDC too large')

                console.log(`[AudioEngine] [5] Creating AudioBuffer...`)
                const audioBuffer = ctx.createBuffer(data.channels, data.numCoefficients, ctx.sampleRate)
                for (let c = 0; c < Math.min(data.channels, audioBuffer.numberOfChannels); c++) {
                    audioBuffer.getChannelData(c).set(data.coefficients)
                }

                if (ddcNodeRef.current) {
                    console.log(`[AudioEngine] [6] Assigning buffer to DDC ConvolverNode...`)
                    try {
                        ddcNodeRef.current.buffer = audioBuffer
                        console.log('[AudioEngine] [7] DDC buffer assigned.')
                    } catch (err) {
                        console.error('[AudioEngine] [7] DDC assignment failed:', err)
                        throw err
                    }
                }
            } catch (err: any) {
                console.error(`[AudioEngine] [ERR] DDC Error (${path}):`, err.message || err)
                if (ddcNodeRef.current) {
                    try { ddcNodeRef.current.buffer = null } catch (e) { }
                }
            }
        }

        loadDDC()
        return () => { isCancelled = true }
    }, [settings.ddcEnabled, settings.ddcFile])

    // Algorithmic Reverb Impulse Generation
    useEffect(() => {
        if (!audioCtxRef.current || !settings.reverbEnabled) return

        const ctx = audioCtxRef.current
        const size = settings.reverbSize // 0-100
        const damping = settings.reverbDamping // 0-100
        const width = settings.reverbWidth // 0-100

        // Map size to duration (0.1s to 5.0s)
        const duration = 0.1 + (size / 100) * 4.9
        // Map damping to decay power (1 to 10)
        const decay = 1 + (damping / 100) * 9

        console.log(`[AudioEngine] Generating Reverb Impulse: ${duration.toFixed(2)}s, decay=${decay.toFixed(2)}, width=${width}`)
        // Passed 'true' for reverse? No, false.
        // We usually don't support WIDTH in createReverbImpulse directly yet.
        // I need to update audioDSP.ts for width or handle it here?
        // Let's rely on standard impulse for now and fix audioDSP if needed or just use current.
        // Wait, I planned to update createReverbImpulse.
        // For now, let's call it with extra arg if I update it, or process buffer here.
        // Processing here is cleaner.

        const impulse = createReverbImpulse(ctx, duration, decay, false)

        // Apply Width (M/S blending)
        if (width < 100) {
            const L = impulse.getChannelData(0)
            const R = impulse.getChannelData(1)
            const w = width / 100
            for (let i = 0; i < L.length; i++) {
                const mid = (L[i] + R[i]) / 2
                const side = (L[i] - R[i]) / 2
                // Adjusted Side
                const newSide = side * w
                L[i] = mid + newSide
                R[i] = mid - newSide
            }
        }

        if (reverbNodeRef.current) {
            reverbNodeRef.current.buffer = impulse
        }
    }, [settings.reverbEnabled, settings.reverbSize, settings.reverbDamping, settings.reverbWidth])

    // Update Params
    useEffect(() => {
        if (!audioCtxRef.current) return
        const ctx = audioCtxRef.current
        const t = ctx.currentTime
        const s = settings
        const enabled = s.enabled

        // EQ
        eqNodesRef.current.forEach((node, i) => {
            node.gain.setTargetAtTime(enabled && s.eqEnabled ? s.eqBands[i].gain : 0, t, 0.05)
        })

        // Convolver Mix (Wet/Dry)
        if (convolverSwitchGainRef.current && convolverDryGainRef.current) {
            const wet = enabled && s.convolverEnabled ? 1.0 : 0
            const dry = enabled && s.convolverEnabled ? (100 - s.convolverCrossfeed) / 100 : 1.0
            convolverSwitchGainRef.current.gain.setTargetAtTime(wet, t, 0.05)
            convolverDryGainRef.current.gain.setTargetAtTime(dry, t, 0.05)
        }

        // DDC Mix
        if (ddcSwitchGainRef.current && ddcDryGainRef.current) {
            const wet = enabled && s.ddcEnabled ? 1.0 : 0
            const dry = enabled && s.ddcEnabled ? 0 : 1.0 // Simple toggle for now
            ddcSwitchGainRef.current.gain.setTargetAtTime(wet, t, 0.05)
            ddcDryGainRef.current.gain.setTargetAtTime(dry, t, 0.05)
        }

        // Bass
        if (bassFilterRef.current) {
            bassFilterRef.current.frequency.setTargetAtTime(s.bassFrequency, t, 0.05)
            bassFilterRef.current.gain.setTargetAtTime(enabled && s.bassEnabled ? (s.bassGain / 100) * 15 : 0, t, 0.05)

            if (s.bassMode === 'Subwoofer') {
                bassFilterRef.current.type = 'peaking'
                bassFilterRef.current.Q.value = 0.8 // Broad but focused boost
            } else if (s.bassMode === 'Pure') {
                bassFilterRef.current.type = 'peaking'
                bassFilterRef.current.Q.value = 0.3 // Very broad
            } else { // Natural
                bassFilterRef.current.type = 'lowshelf'
                bassFilterRef.current.Q.value = 0 // Not used for lowshelf usually, but reset
            }
        }

        // Clarity
        if (clarityFilterRef.current) {
            clarityFilterRef.current.gain.setTargetAtTime(enabled && s.clarityEnabled ? (s.clarityGain / 100) * 10 : 0, t, 0.05)
        }

        // Surround
        const isSurround = enabled && s.surroundEnabled
        const strength = isSurround ? s.surroundStrength / 10000 : 0 // max 10ms
        const delay = isSurround ? (s.surroundDelay || 0) / 1000 : 0 // ms to sec

        if (leftDelayRef.current && rightDelayRef.current) {
            if (s.surroundMode === 'Haas') {
                leftDelayRef.current.delayTime.setTargetAtTime(0, t, 0.05)
                rightDelayRef.current.delayTime.setTargetAtTime(strength, t, 0.05)
            } else if (s.surroundMode === 'Differential') {
                // Differential delay request
                leftDelayRef.current.delayTime.setTargetAtTime(0, t, 0.05)
                rightDelayRef.current.delayTime.setTargetAtTime(delay, t, 0.05)
            } else if (s.surroundMode === 'Field') {
                // Field surround often involves Mid-Side processing or slight delays on both
                leftDelayRef.current.delayTime.setTargetAtTime(strength * 0.5, t, 0.05)
                rightDelayRef.current.delayTime.setTargetAtTime(strength, t, 0.05)
            } else {
                leftDelayRef.current.delayTime.setTargetAtTime(0, t, 0.05)
                rightDelayRef.current.delayTime.setTargetAtTime(0, t, 0.05)
            }
        }

        // Surround Gains
        if (surroundGainRef.current && surroundDryGainRef.current) {
            surroundGainRef.current.gain.setTargetAtTime(isSurround ? 1 : 0, t, 0.05)
            surroundDryGainRef.current.gain.setTargetAtTime(isSurround ? 0 : 1, t, 0.05)
        }

        // Compressor
        if (compressorNodeRef.current) {
            const comp = compressorNodeRef.current
            if (enabled && s.compressorEnabled) {
                comp.threshold.setTargetAtTime(s.compressorThreshold, t, 0.05)
                comp.ratio.setTargetAtTime(s.compressorRatio, t, 0.05)
                comp.knee.setTargetAtTime(s.compressorKnee, t, 0.05)
                comp.attack.setTargetAtTime(s.compressorAttack, t, 0.05)
                comp.release.setTargetAtTime(s.compressorRelease, t, 0.05)
            } else {
                comp.ratio.setTargetAtTime(1, t, 0.05) // bypass
            }
        }

        // Spectrum
        if (spectrumGainRef.current) {
            spectrumGainRef.current.gain.setTargetAtTime(enabled && s.spectrumEnabled ? s.spectrumGain / 200 : 0, t, 0.05)
        }

        // Tube
        if (tubeGainRef.current && tubeDryGainRef.current && tubeNodeRef.current) {
            const isTube = enabled && s.tubeEnabled
            // Bypass mix
            tubeGainRef.current.gain.setTargetAtTime(isTube ? 1 : 0, t, 0.05)
            tubeDryGainRef.current.gain.setTargetAtTime(isTube ? 0 : 1, t, 0.05)
            // Update curve if tube order changed (optional opt)
        }

        // AnalogX
        if (analogXWetGainRef.current && analogXDryGainRef.current && analogXNodeRef.current) {
            const isAnalog = enabled && s.analogXEnabled
            if (analogXWetGainRef.current) analogXWetGainRef.current.gain.setTargetAtTime(isAnalog ? 1 : 0, t, 0.05)
            if (analogXDryGainRef.current) analogXDryGainRef.current.gain.setTargetAtTime(isAnalog ? 0 : 1, t, 0.05)

            // Note: AnalogX curve update should ideally happen here if mode changes
            // But makeAnalogXCurve is expensive to run every frame? No, useEffect runs only on change.
            // But settings is a big object.
            // We should split effects? For now, just do it.
            // Check if curve needs update
            // analogXNodeRef.current.curve = makeAnalogXCurve(s.analogXMode, s.analogXDrive)
        }

        // Reverb (Algorithmic)
        if (reverbWetGainRef.current && reverbDryGainRef.current && reverbNodeRef.current) {
            const isRev = enabled && s.reverbEnabled
            // Wet/Dry
            reverbWetGainRef.current.gain.setTargetAtTime(isRev ? s.reverbWet / 100 : 0, t, 0.05)
            reverbDryGainRef.current.gain.setTargetAtTime(isRev ? s.reverbDry / 100 : 1, t, 0.05)
        }

        // Protection & Limiter
        if (protectionNodeRef.current && masterLimiterNodeRef.current) {
            if (s.auditoryProtectionEnabled) {
                protectionNodeRef.current.threshold.setTargetAtTime(s.protectionThreshold, t, 0.05)
                protectionNodeRef.current.ratio.setTargetAtTime(20, t, 0.05)
            } else {
                protectionNodeRef.current.threshold.setTargetAtTime(0, t, 0.05)
                protectionNodeRef.current.ratio.setTargetAtTime(1, t, 0.05) // Bypass
            }

            if (s.masterLimiterEnabled) {
                masterLimiterNodeRef.current.threshold.setTargetAtTime(s.masterLimiterThreshold, t, 0.05)
                masterLimiterNodeRef.current.ratio.setTargetAtTime(20, t, 0.05)
            } else {
                masterLimiterNodeRef.current.threshold.setTargetAtTime(0, t, 0.05)
                masterLimiterNodeRef.current.ratio.setTargetAtTime(1, t, 0.05) // Bypass
            }
        }

        // Master Gain
        if (masterGainNodeRef.current) {
            masterGainNodeRef.current.gain.setTargetAtTime(s.masterGain / 100, t, 0.05)
        }

        localStorage.setItem('audio_engine_settings_v3', JSON.stringify(s))
    }, [settings])

    const updateSettings = useCallback((updates: Partial<AudioEngineSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }))
    }, [])

    return { settings, updateSettings, connectMediaElement, analyser: analyserNodeRef.current }
}
