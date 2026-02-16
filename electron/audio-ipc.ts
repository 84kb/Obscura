import { ipcMain, WebContents } from 'electron'
import { mpv } from './mpv/mpv-controller'

export function registerAudioHandlers() {
    ipcMain.handle('audio:play', async (_, filePath: string) => {
        // Ensure MPV is initialized
        await mpv.init()
        if (!filePath) {
            await mpv.play()
        } else {
            // Windows path normalization might be needed, but mpv-controller might handle it.
            // Let's pass it through.
            await mpv.loadFile(filePath)
            await mpv.play()
        }
    })

    ipcMain.handle('audio:pause', async () => {
        await mpv.pause()
    })

    ipcMain.handle('audio:resume', async () => {
        await mpv.play()
    })

    ipcMain.handle('audio:stop', async () => {
        await mpv.stop()
    })

    ipcMain.handle('audio:seek', async (_, time: number) => {
        await mpv.seek(time)
    })

    ipcMain.handle('audio:set-volume', async (_, volume: number) => {
        await mpv.init()
        await mpv.setVolume(volume)
    })

    ipcMain.handle('audio:get-devices', async () => {
        await mpv.init()
        return await mpv.getAudioDevices()
    })

    ipcMain.handle('audio:set-device', async (_, deviceName: string) => {
        await mpv.init()
        await mpv.setAudioDevice(deviceName)
    })

    ipcMain.handle('audio:set-exclusive', async (_, enabled: boolean) => {
        await mpv.setExclusiveMode(enabled)
    })
}

export function setupAudioEvents(webContents: WebContents) {
    mpv.on('property-change', (msg: any) => {
        if (!msg || !msg.name) return

        if (msg.name === 'time-pos') {
            if (!webContents.isDestroyed()) {
                webContents.send('audio:time-update', msg.data)
            }
        } else if (msg.name === 'duration') {
            if (!webContents.isDestroyed()) {
                webContents.send('audio:duration-update', msg.data)
            }
        } else if (msg.name === 'pause') {
            if (!webContents.isDestroyed()) {
                webContents.send('audio:pause-update', msg.data)
            }
        } else if (msg.name === 'eof-reached') {
            // Trigger ended event when EOF is reached (because keep-open=yes)
            if (msg.data === true && !webContents.isDestroyed()) {
                webContents.send('audio:ended')
            }
        }
    })

    // mpv.on('end-file', () => {
    //     if (!webContents.isDestroyed()) {
    //         webContents.send('audio:ended')
    //     }
    // })

    // Forward start/stop events if needed, but renderer mostly cares about playback state
}
