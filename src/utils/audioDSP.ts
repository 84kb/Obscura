export function makeDistortionCurve(amount: number) {
    const k = typeof amount === 'number' ? amount : 50
    const n_samples = 44100
    const curve = new Float32Array(n_samples)
    const deg = Math.PI / 180
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x))
    }
    return curve
}

// 6N1J Tube Simulator Approximation
// Adds even harmonics for warmth
export function makeTubeCurve(amount: number) {
    const n_samples = 44100
    const curve = new Float32Array(n_samples)
    for (let i = 0; i < n_samples; ++i) {
        let x = i * 2 / n_samples - 1
        // Asymmetric transfer function for even harmonics
        if (x < -0.5) {
            curve[i] = x + 0.2 * Math.sin(x * Math.PI) // Soft bottom clipping
        } else if (x > 0.5) {
            curve[i] = x - 0.1 * Math.pow(x, 2) // Slight compression at top
        } else {
            curve[i] = x + 0.1 * x * x // Add 2nd harmonic
        }
    }
    return curve
}

// AnalogX Class A/AB Simulator
export function makeAnalogXCurve(mode: 'Class A' | 'Class AB' | 'Class B', drive: number) {
    const n_samples = 44100
    const curve = new Float32Array(n_samples)
    const blend = drive / 100

    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1

        if (mode === 'Class A') {
            // Asymmetric saturation
            if (x > 0) {
                curve[i] = x - (blend * 0.2 * x * x)
            } else {
                curve[i] = x + (blend * 0.3 * Math.sin(x))
            }
        } else if (mode === 'Class AB') {
            // Crossover distortion simulation (slight step at 0)
            const sign = x > 0 ? 1 : -1
            if (Math.abs(x) < 0.1) {
                curve[i] = x * (1 - blend * 0.5)
            } else {
                curve[i] = x
            }
        } else {
            // Class B (More crossover distortion)
            if (Math.abs(x) < 0.2 * blend) {
                curve[i] = 0
            } else {
                curve[i] = x
            }
        }
    }
    return curve
}

// Spectrum Extension (Exciter)
// Focus on higher order harmonics for brightness
export function makeExciterCurve(amount: number) {
    const n_samples = 44100
    const curve = new Float32Array(n_samples)
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1
        curve[i] = x + (amount / 100) * (x * x * x) // 3rd harmonic
    }
    return curve
}

// Simple algorithmic reverb Impulse Response generator
export function createReverbImpulse(audioCtx: AudioContext, duration: number, decay: number, reverse: boolean) {
    const sampleRate = audioCtx.sampleRate
    const length = sampleRate * duration
    const impulse = audioCtx.createBuffer(2, length, sampleRate)
    const impulseL = impulse.getChannelData(0)
    const impulseR = impulse.getChannelData(1)

    for (let i = 0; i < length; i++) {
        const n = reverse ? length - i : i
        let val = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay)
        impulseL[i] = val
        impulseR[i] = val
    }
    return impulse
}
