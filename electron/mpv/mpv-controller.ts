import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import { MPV_PATH, checkMpvInstalled, installMpv } from './downloader'
import { EventEmitter } from 'events'

interface MpvRequest {
    command: any[]
    request_id?: number
}

interface MpvResponse {
    error?: string
    data?: any
    event?: string
    request_id?: number
}

export class MpvController extends EventEmitter {
    private process: ChildProcess | null = null
    private socket: net.Socket | null = null
    private socketPath: string
    private requestId = 1
    private pendingRequests = new Map<number, { resolve: (val: any) => void, reject: (reason: any) => void }>()
    private isExclusive = false

    constructor() {
        super()
        // Unique socket path per instance
        const pipeName = `mpv-ipc-${Date.now()}`
        this.socketPath = process.platform === 'win32'
            ? `\\\\.\\pipe\\${pipeName}`
            : `/tmp/${pipeName}`
    }

    async init(onInstallProgress?: (msg: string) => void) {
        if (!(await checkMpvInstalled())) {
            await installMpv(onInstallProgress)
        }
        await this.spawnMpv()
    }

    private async spawnMpv() {
        if (this.process) return

        const args = [
            '--idle=yes',
            `--input-ipc-server=${this.socketPath}`,
            '--keep-open=yes', // Keep file open at end
            '--no-video', // Audio only focus, but can support video if we change this
            '--force-window=no',
            '--volume-max=100'
        ]

        if (this.isExclusive) {
            args.push('--audio-exclusive=yes')
            args.push('--audio-dsd-data=yes') // Enable DoP
            args.push('--audio-samplerate=0') // Disable automatic resampling
        }

        console.log('[MPV] Spawning:', MPV_PATH, args.join(' '))

        this.process = spawn(MPV_PATH, args)

        this.process.on('error', (err) => {
            console.error('[MPV] Process error:', err)
            this.emit('error', err)
        })

        this.process.on('exit', (code) => {
            console.log('[MPV] Process exited with code:', code)
            this.process = null
            this.socket = null
            this.emit('stop')
        })

        // Wait for socket to be ready
        await this.connectToSocket()
    }

    private async connectToSocket() {
        // Retry logic for socket connection
        let retries = 0
        while (retries < 10) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const socket = net.connect(this.socketPath)

                    socket.on('connect', () => {
                        this.socket = socket
                        resolve()
                    })

                    socket.on('error', (err) => {
                        reject(err)
                    })

                    socket.on('data', (data) => this.handleData(data))
                })
                console.log('[MPV] Connected to IPC socket')
                // Start observing properties
                await this.send(['observe_property', 1, 'time-pos'])
                await this.send(['observe_property', 2, 'duration'])
                await this.send(['observe_property', 3, 'pause'])
                await this.send(['observe_property', 4, 'core-idle'])
                await this.send(['observe_property', 5, 'eof-reached'])
                return
            } catch (e) {
                retries++
                await new Promise(r => setTimeout(r, 500))
            }
        }
        throw new Error('Failed to connect to MPV IPC socket')
    }

    private handleData(data: Buffer) {
        // Data might contain multiple JSON objects separated by newline
        const lines = data.toString().split('\n')
        for (const line of lines) {
            if (!line.trim()) continue
            try {
                const msg = JSON.parse(line) as MpvResponse
                this.handleMessage(msg)
            } catch (e) {
                console.warn('[MPV] Failed to parse IPC message:', line)
            }
        }
    }

    private handleMessage(msg: MpvResponse) {
        if (msg.request_id && this.pendingRequests.has(msg.request_id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.request_id) as any
            this.pendingRequests.delete(msg.request_id)

            if (msg.error && msg.error !== 'success') {
                reject(new Error(msg.error))
            } else {
                resolve(msg.data)
            }
        } else if (msg.event) {
            this.emit(msg.event, msg)
        }
    }

    async send(command: any[]): Promise<any> {
        if (!this.socket) throw new Error('MPV not connected')

        const id = this.requestId++
        const req: MpvRequest = { command, request_id: id }

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject })
            this.socket!.write(JSON.stringify(req) + '\n')
        })
    }

    async getAudioDevices() {
        // output format of --audio-device-help is not JSON via IPC property
        // We must use property 'audio-device-list'
        return await this.getProperty('audio-device-list')
    }

    async getProperty(name: string) {
        return this.send(['get_property', name])
    }

    async setProperty(name: string, value: any) {
        return this.send(['set_property', name, value])
    }

    async loadFile(filePath: string) {
        return this.send(['loadfile', filePath])
    }

    async play() {
        return this.setProperty('pause', false)
    }

    async pause() {
        return this.setProperty('pause', true)
    }

    async stop() {
        return this.send(['stop'])
    }

    async seek(seconds: number) {
        return this.send(['seek', seconds, 'absolute'])
    }

    async setVolume(vol: number) {
        return this.setProperty('volume', vol)
    }

    async setAudioDevice(deviceName: string) {
        return this.setProperty('audio-device', deviceName)
    }

    async setExclusiveMode(enabled: boolean) {
        if (this.isExclusive === enabled) return

        this.isExclusive = enabled
        if (this.process) {
            // Must restart for this to take effect usually? 
            // MPV documentation says --audio-exclusive is a startup option mostly.
            // But we can try to re-init.
            await this.quit()
            await this.spawnMpv()
        }
    }

    async quit() {
        if (this.process) {
            try {
                await this.send(['quit'])
            } catch (e) { /* ignore */ }
            this.process = null
            this.socket = null
        }
    }
}

export const mpv = new MpvController()
