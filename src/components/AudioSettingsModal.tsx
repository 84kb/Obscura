import React, { useState, useEffect, useRef } from 'react'
import { AudioEngineSettings } from '../types'
import { saveAudioAsset } from '../utils/audioStorage'
import './AudioSettingsModal.css'

interface AudioSettingsModalProps {
    settings: AudioEngineSettings
    updateSettings: (updates: Partial<AudioEngineSettings>) => void
    analyser: AnalyserNode | null
    onClose: () => void
}

const EQ_PRESETS: { [key: string]: number[] } = {
    'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Rock': [4, 3, 2, 0, -1, -1, 0, 1, 2, 3],
    'Pop': [-1, 1, 2, 3, 2, 0, -1, -1, -1, -1],
    'Dance': [5, 4, 1, 0, 0, -2, -3, -3, 0, 0],
    'Classical': [4, 3, 2, 1, 0, 0, 0, 1, 2, 3],
    'Jazz': [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
    'Bass Boost': [6, 5, 4, 1, 0, 0, 0, 0, 0, 0],
    'Crystal': [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
}

type TabType = 'EQ' | 'SPEC' | 'CONV' | 'REVERB' | 'DDC' | 'SURROUND' | 'TUBE' | 'ANALOG' | 'BASS' | 'COMP' | 'LIMIT'

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
    settings,
    updateSettings,
    analyser,
    onClose
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [activeTab, setActiveTab] = useState<TabType>('EQ')
    const [activePreset, setActivePreset] = useState<string>('Custom')

    // ビジュアライザーの描画
    useEffect(() => {
        if (!analyser || !canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        let animationId: number
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        const draw = () => {
            animationId = requestAnimationFrame(draw)
            analyser.getByteFrequencyData(dataArray)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            const barWidth = (canvas.width / bufferLength) * 2.5
            let x = 0
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height
                const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height)
                gradient.addColorStop(0, '#ff8c42')
                gradient.addColorStop(1, '#ffa726')
                ctx.fillStyle = gradient
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
                x += barWidth + 1
            }
        }
        draw()
        return () => cancelAnimationFrame(animationId)
    }, [analyser])

    const handleEqChange = (index: number, gain: number) => {
        const newBands = [...settings.eqBands]
        newBands[index] = { ...newBands[index], gain }
        updateSettings({ eqBands: newBands })
        setActivePreset('Custom')
    }

    const applyPreset = (name: string) => {
        const gains = EQ_PRESETS[name]
        if (!gains) return
        const newBands = settings.eqBands.map((band, i) => ({ ...band, gain: gains[i] }))
        updateSettings({ eqBands: newBands })
        setActivePreset(name)
    }

    const handleFileSelect = async (type: 'kernel' | 'ddc', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const idbUri = await saveAudioAsset(type, file)
            if (type === 'kernel') {
                updateSettings({ convolverIR: idbUri })
            } else {
                updateSettings({ ddcFile: idbUri })
            }
        } catch (err) {
            console.error('[AudioSettings] Failed to save asset to IndexedDB', err)
            // Fallback to temporary URL to allow immediate testing even if IDB fails
            const url = URL.createObjectURL(file)
            if (type === 'kernel') {
                updateSettings({ convolverIR: url })
            } else {
                updateSettings({ ddcFile: url })
            }
        }
    }

    const TABS: { id: TabType, label: string }[] = [
        { id: 'EQ', label: 'EQ' },
        { id: 'SPEC', label: 'Spectrum' },
        { id: 'CONV', label: 'Convolver' },
        { id: 'REVERB', label: 'Reverb' },
        { id: 'DDC', label: 'DDC' },
        { id: 'SURROUND', label: 'Surround' },
        { id: 'TUBE', label: 'Tube' },
        { id: 'ANALOG', label: 'AnalogX' },
        { id: 'BASS', label: 'Bass/Clear' },
        { id: 'COMP', label: 'Comp' },
        { id: 'LIMIT', label: 'Protect' },
    ]

    return (
        <div className="audio-settings-overlay" onClick={onClose}>
            <div className="audio-settings-modal" onClick={e => e.stopPropagation()}>
                <div className="audio-settings-header">
                    <h3>Viper Audio Engine</h3>
                    <button className="close-btn" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="audio-settings-content">
                    <div className="visualizer-container">
                        <canvas ref={canvasRef} width="400" height="60" />
                        <div className="master-toggle">
                            <label className="switch">
                                <input type="checkbox" checked={settings.enabled} onChange={e => updateSettings({ enabled: e.target.checked })} />
                                <span className="slider round"></span>
                            </label>
                            <span>Power</span>
                        </div>
                    </div>

                    <div className="audio-tabs">
                        {TABS.map(tab => (
                            <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className={`tab-content ${!settings.enabled ? 'disabled' : ''}`}>
                        {/* EQ */}
                        {activeTab === 'EQ' && (
                            <div className="eq-tab">
                                <div className="tab-header">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={settings.eqEnabled} onChange={e => updateSettings({ eqEnabled: e.target.checked })} />
                                        <span>FIROut Equalizer</span>
                                    </label>
                                    <select value={activePreset} onChange={e => applyPreset(e.target.value)} className="preset-select">
                                        <option value="Custom">Custom</option>
                                        {Object.keys(EQ_PRESETS).map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                </div>
                                <div className="eq-container">
                                    {settings.eqBands.map((band, i) => (
                                        <div key={band.frequency} className="eq-band">
                                            <input type="range" min="-12" max="12" step="0.1" value={band.gain} onChange={e => handleEqChange(i, parseFloat(e.target.value))} />
                                            <span className="freq-label">{band.frequency >= 1000 ? `${band.frequency / 1000}k` : band.frequency}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Spectrum Extension */}
                        {activeTab === 'SPEC' && (
                            <div className="simple-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.spectrumEnabled} onChange={e => updateSettings({ spectrumEnabled: e.target.checked })} />
                                    <span>Spectrum Extension</span>
                                </label>
                                <div className="settings-grid">
                                    <div className="setting-item">
                                        <span>Strength: {settings.spectrumGain}%</span>
                                        <input type="range" min="0" max="100" value={settings.spectrumGain} onChange={e => updateSettings({ spectrumGain: parseInt(e.target.value) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Convolver */}
                        {activeTab === 'CONV' && (
                            <div className="conv-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.convolverEnabled} onChange={e => updateSettings({ convolverEnabled: e.target.checked })} />
                                    <span>Convolver (Kernel / IRS)</span>
                                </label>
                                <div className="settings-grid">
                                    <div className="setting-item full">
                                        <span>Kernel File (.irs / .wav)</span>
                                        <div className="file-input-group">
                                            <input type="text" readOnly value={settings.convolverIR?.split('/').pop() || 'No file selected'} />
                                            <label className="file-label">
                                                Browse...
                                                <input type="file" accept=".irs,.wav" onChange={e => handleFileSelect('kernel', e)} style={{ display: 'none' }} />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="setting-item">
                                        <span>Crossfeed: {settings.convolverCrossfeed}%</span>
                                        <input type="range" min="0" max="100" value={settings.convolverCrossfeed} onChange={e => updateSettings({ convolverCrossfeed: parseInt(e.target.value) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Algorithmic Reverb */}
                        {activeTab === 'REVERB' && (
                            <div className="simple-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.reverbEnabled} onChange={e => updateSettings({ reverbEnabled: e.target.checked })} />
                                    <span>Reverberation</span>
                                </label>
                                <div className="settings-grid complex">
                                    <div className="setting-item">
                                        <span>Room Size: {settings.reverbSize}%</span>
                                        <input type="range" min="0" max="100" value={settings.reverbSize} onChange={e => updateSettings({ reverbSize: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="setting-item">
                                        <span>Damping: {settings.reverbDamping}%</span>
                                        <input type="range" min="0" max="100" value={settings.reverbDamping} onChange={e => updateSettings({ reverbDamping: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="setting-item">
                                        <span>Sound Field: {settings.reverbWidth}%</span>
                                        <input type="range" min="0" max="100" value={settings.reverbWidth} onChange={e => updateSettings({ reverbWidth: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="setting-item">
                                        <span>Wet Signal: {settings.reverbWet}%</span>
                                        <input type="range" min="0" max="100" value={settings.reverbWet} onChange={e => updateSettings({ reverbWet: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="setting-item">
                                        <span>Dry Signal: {settings.reverbDry}%</span>
                                        <input type="range" min="0" max="100" value={settings.reverbDry} onChange={e => updateSettings({ reverbDry: parseInt(e.target.value) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* DDC */}
                        {activeTab === 'DDC' && (
                            <div className="ddc-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.ddcEnabled} onChange={e => updateSettings({ ddcEnabled: e.target.checked })} />
                                    <span>Viper DDC (Headphone Correction)</span>
                                </label>
                                <div className="settings-grid">
                                    <div className="setting-item full">
                                        <span>DDC File (.vdc)</span>
                                        <div className="file-input-group">
                                            <input type="text" readOnly value={settings.ddcFile?.split('/').pop() || 'No file selected'} />
                                            <label className="file-label">
                                                Browse...
                                                <input type="file" accept=".vdc" onChange={e => handleFileSelect('ddc', e)} style={{ display: 'none' }} />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Surround */}
                        {activeTab === 'SURROUND' && (
                            <div className="surround-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.surroundEnabled} onChange={e => updateSettings({ surroundEnabled: e.target.checked })} />
                                    <span>Surround Effects</span>
                                </label>
                                <div className="settings-grid">
                                    <div className="setting-item">
                                        <span>Mode</span>
                                        <select value={settings.surroundMode} onChange={e => updateSettings({ surroundMode: e.target.value as any })}>
                                            <option value="Field">Field Surround</option>
                                            <option value="Differential">Differential Surround</option>
                                            <option value="Haas">Haas Effect</option>
                                        </select>
                                    </div>
                                    <div className="setting-item">
                                        <span>Strength: {settings.surroundStrength}%</span>
                                        <input type="range" min="0" max="100" value={settings.surroundStrength} onChange={e => updateSettings({ surroundStrength: parseInt(e.target.value) })} />
                                    </div>
                                    {/* Differential Delay Control */}
                                    {settings.surroundMode === 'Differential' && (
                                        <div className="setting-item">
                                            <span>Delay: {settings.surroundDelay || 20}ms</span>
                                            <input type="range" min="0" max="100" value={settings.surroundDelay || 20} onChange={e => updateSettings({ surroundDelay: parseInt(e.target.value) })} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tube */}
                        {activeTab === 'TUBE' && (
                            <div className="simple-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.tubeEnabled} onChange={e => updateSettings({ tubeEnabled: e.target.checked })} />
                                    <span>Tube Simulator (6N1J)</span>
                                </label>
                                <div className="settings-grid">
                                    <div className="setting-item">
                                        <span>Tube Order (Harmonics)</span>
                                        <input type="range" min="1" max="5" step="1" value={settings.tubeOrder || 2} onChange={e => updateSettings({ tubeOrder: parseInt(e.target.value) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* AnalogX */}
                        {activeTab === 'ANALOG' && (
                            <div className="simple-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.analogXEnabled} onChange={e => updateSettings({ analogXEnabled: e.target.checked })} />
                                    <span>AnalogX</span>
                                </label>
                                <div className="settings-grid">
                                    <div className="setting-item">
                                        <span>Mode</span>
                                        <select value={settings.analogXMode} onChange={e => updateSettings({ analogXMode: e.target.value as any })}>
                                            <option value="Class A">Class A</option>
                                            <option value="Class AB">Class AB</option>
                                            <option value="Class B">Class B</option>
                                        </select>
                                    </div>
                                    <div className="setting-item">
                                        <span>Drive: {settings.analogXDrive}%</span>
                                        <input type="range" min="0" max="100" value={settings.analogXDrive} onChange={e => updateSettings({ analogXDrive: parseInt(e.target.value) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bass & Clarity & Dynamic */}
                        {activeTab === 'BASS' && (
                            <div className="bass-tab">
                                <div className="sub-section">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={settings.bassEnabled} onChange={e => updateSettings({ bassEnabled: e.target.checked })} />
                                        <span>ViPER Bass</span>
                                    </label>
                                    <div className="settings-grid">
                                        <div className="setting-item">
                                            <span>Mode</span>
                                            <select value={settings.bassMode} onChange={e => updateSettings({ bassMode: e.target.value as any })}>
                                                <option value="Natural">Natural Bass</option>
                                                <option value="Pure">Pure Bass</option>
                                                <option value="Subwoofer">Subwoofer</option>
                                            </select>
                                        </div>
                                        <div className="setting-item">
                                            <span>Frequency: {settings.bassFrequency}Hz</span>
                                            <input type="range" min="40" max="100" step="5" value={settings.bassFrequency} onChange={e => updateSettings({ bassFrequency: parseInt(e.target.value) })} />
                                        </div>
                                        <div className="setting-item">
                                            <span>Gain: {settings.bassGain}%</span>
                                            <input type="range" min="0" max="100" value={settings.bassGain} onChange={e => updateSettings({ bassGain: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="sub-section">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={settings.clarityEnabled} onChange={e => updateSettings({ clarityEnabled: e.target.checked })} />
                                        <span>ViPER Clarity</span>
                                    </label>
                                    <div className="settings-grid">
                                        <div className="setting-item">
                                            <span>Clarity: {settings.clarityGain}%</span>
                                            <input type="range" min="0" max="100" value={settings.clarityGain} onChange={e => updateSettings({ clarityGain: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="sub-section">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={settings.dynamicEnabled} onChange={e => updateSettings({ dynamicEnabled: e.target.checked })} />
                                        <span>Dynamic System</span>
                                    </label>
                                    <div className="settings-grid">
                                        <div className="setting-item">
                                            <span>Side Gain (Bass): {settings.dynamicSideGain}%</span>
                                            <input type="range" min="0" max="100" value={settings.dynamicSideGain} onChange={e => updateSettings({ dynamicSideGain: parseInt(e.target.value) })} />
                                        </div>
                                        <div className="setting-item">
                                            <span>Bass Threshold: {settings.dynamicBassThreshold}dB</span>
                                            <input type="range" min="-60" max="0" value={settings.dynamicBassThreshold || -20} onChange={e => updateSettings({ dynamicBassThreshold: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Compressor */}
                        {activeTab === 'COMP' && (
                            <div className="comp-tab">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={settings.compressorEnabled} onChange={e => updateSettings({ compressorEnabled: e.target.checked })} />
                                    <span>FET Compressor</span>
                                </label>
                                <div className="settings-grid complex">
                                    <div className="setting-item">
                                        <span>Threshold: {settings.compressorThreshold}dB</span>
                                        <input type="range" min="-60" max="0" value={settings.compressorThreshold} onChange={e => updateSettings({ compressorThreshold: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="setting-item">
                                        <span>Ratio: {settings.compressorRatio}:1</span>
                                        <input type="range" min="1" max="20" value={settings.compressorRatio} onChange={e => updateSettings({ compressorRatio: parseInt(e.target.value) })} />
                                    </div>
                                    <div className="setting-item">
                                        <span>Attack: {settings.compressorAttack}s</span>
                                        <input type="range" min="0.001" max="0.1" step="0.001" value={settings.compressorAttack} onChange={e => updateSettings({ compressorAttack: parseFloat(e.target.value) })} />
                                    </div>
                                    <div className="setting-item">
                                        <span>Release: {settings.compressorRelease}s</span>
                                        <input type="range" min="0.01" max="1.0" step="0.01" value={settings.compressorRelease} onChange={e => updateSettings({ compressorRelease: parseFloat(e.target.value) })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Protection & Limiter */}
                        {activeTab === 'LIMIT' && (
                            <div className="simple-tab">
                                <div className="sub-section">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={settings.auditoryProtectionEnabled} onChange={e => updateSettings({ auditoryProtectionEnabled: e.target.checked })} />
                                        <span>Auditory System Protection</span>
                                    </label>
                                    <div className="settings-grid">
                                        <div className="setting-item">
                                            <span>Threshold: {settings.protectionThreshold}dB</span>
                                            <input type="range" min="-12" max="0" step="0.5" value={settings.protectionThreshold} onChange={e => updateSettings({ protectionThreshold: parseFloat(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="sub-section">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={settings.masterLimiterEnabled} onChange={e => updateSettings({ masterLimiterEnabled: e.target.checked })} />
                                        <span>Master Limiter</span>
                                    </label>
                                    <div className="settings-grid">
                                        <div className="setting-item">
                                            <span>Threshold: {settings.masterLimiterThreshold}dB</span>
                                            <input type="range" min="-6" max="0" step="0.1" value={settings.masterLimiterThreshold} onChange={e => updateSettings({ masterLimiterThreshold: parseFloat(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="footer-controls">
                        <div className="master-gain-full">
                            <span>Master Gain</span>
                            <input type="range" min="0" max="200" value={settings.masterGain} onChange={e => updateSettings({ masterGain: parseInt(e.target.value) })} />
                            <span>{settings.masterGain}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
