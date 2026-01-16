import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs-extra'

const isDev = !app.isPackaged
const platform = process.platform

const getExecutableName = (name: string) => {
    return platform === 'win32' ? `${name}.exe` : name
}

export function getFFmpegPath(): string {
    // 1. ユーザーデータフォルダ (自動アップデートで配置される場所)
    try {
        const userDataPath = app.getPath('userData')
        const customPath = path.join(userDataPath, 'bin', getExecutableName('ffmpeg'))
        if (fs.existsSync(customPath)) {
            console.log(`[FFmpeg] Using custom path: ${customPath}`)
            return customPath
        }
    } catch (e) {
        console.warn('[FFmpeg] Failed to check user data path', e)
    }

    // 2. バンドルされたパス (本番環境)
    if (!isDev) {
        // electron-builder の extraResources で resources/bin に配置される
        const bundledPath = path.join(process.resourcesPath, 'bin', getExecutableName('ffmpeg'))
        if (fs.existsSync(bundledPath)) {
            console.log(`[FFmpeg] Using bundled path: ${bundledPath}`)
            return bundledPath
        }
    }

    // 3. 開発環境 (node_modules)
    try {
        const ffmpegStatic = require('ffmpeg-static')
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
            // console.log(`[FFmpeg] Using dev path: ${ffmpegStatic}`)
            return ffmpegStatic
        }
    } catch (e) {
        console.warn('[FFmpeg] Failed to load ffmpeg-static', e)
    }

    // 4. システムパス (フォールバック)
    return 'ffmpeg'
}

export function getFFprobePath(): string {
    // 1. ユーザーデータフォルダ
    try {
        const userDataPath = app.getPath('userData')
        const customPath = path.join(userDataPath, 'bin', getExecutableName('ffprobe'))
        if (fs.existsSync(customPath)) {
            console.log(`[FFprobe] Using custom path: ${customPath}`)
            return customPath
        }
    } catch (e) {
        console.warn('[FFprobe] Failed to check user data path', e)
    }

    // 2. バンドルされたパス
    if (!isDev) {
        const bundledPath = path.join(process.resourcesPath, 'bin', getExecutableName('ffprobe'))
        if (fs.existsSync(bundledPath)) {
            console.log(`[FFprobe] Using bundled path: ${bundledPath}`)
            return bundledPath
        }
    }

    // 3. 開発環境
    try {
        const ffprobeStatic = require('ffprobe-static')
        if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
            // console.log(`[FFprobe] Using dev path: ${ffprobeStatic.path}`)
            return ffprobeStatic.path
        }
    } catch (e) {
        console.warn('[FFprobe] Failed to load ffprobe-static', e)
    }

    // 4. システムパス
    return 'ffprobe'
}
