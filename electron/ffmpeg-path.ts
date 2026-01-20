import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs-extra'

const isDev = app ? !app.isPackaged : true
const platform = process.platform

const getExecutableName = (name: string) => {
    return platform === 'win32' ? `${name}.exe` : name
}

export function getFFmpegPath(): string {
    // 1. バンドルされたパス (本番環境)
    // electron-builder の extraResources で resources/bin に配置される
    if (!isDev) {
        const bundledPath = path.join(process.resourcesPath, 'bin', getExecutableName('ffmpeg'))
        if (fs.existsSync(bundledPath)) {
            // console.log(`[FFmpeg] Using bundled path: ${bundledPath}`)
            return bundledPath
        }
    }

    // 2. 開発環境 (node_modules)
    try {
        const ffmpegStatic = require('ffmpeg-static')
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
            // console.log(`[FFmpeg] Using dev path: ${ffmpegStatic}`)
            return ffmpegStatic
        }
    } catch (e) {
        // console.warn('[FFmpeg] Failed to load ffmpeg-static', e)
    }

    // 3. システムパス (フォールバック)
    return 'ffmpeg'
}

export function getFFprobePath(): string {
    // 1. バンドルされたパス
    if (!isDev) {
        const bundledPath = path.join(process.resourcesPath, 'bin', getExecutableName('ffprobe'))
        if (fs.existsSync(bundledPath)) {
            // console.log(`[FFprobe] Using bundled path: ${bundledPath}`)
            return bundledPath
        }
    }

    // 2. 開発環境
    try {
        const ffprobeStatic = require('ffprobe-static')
        if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
            // console.log(`[FFprobe] Using dev path: ${ffprobeStatic.path}`)
            return ffprobeStatic.path
        }
    } catch (e) {
        // console.warn('[FFprobe] Failed to load ffprobe-static', e)
    }

    // 3. システムパス
    return 'ffprobe'
}
