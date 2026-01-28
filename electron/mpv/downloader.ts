import fs from 'fs-extra'
import path from 'path'
import { app } from 'electron'
import { downloadFile } from '../downloader'
import { path7za } from '7zip-bin'
import child_process from 'child_process'
import util from 'util'

const execFile = util.promisify(child_process.execFile)

// Determine paths
// In prod: process.resourcesPath/bin/mpv.exe
// In dev: <project>/electron/bin/mpv.exe
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const BIN_DIR = isDev
    ? path.join(__dirname, '../../electron/bin')
    : path.join(process.resourcesPath, 'bin')

export const MPV_PATH = path.join(BIN_DIR, 'mpv.exe')

export async function checkMpvInstalled(): Promise<boolean> {
    return fs.existsSync(MPV_PATH)
}

export async function installMpv(onProgress?: (msg: string) => void): Promise<void> {
    try {
        if (await checkMpvInstalled()) {
            onProgress?.('MPV is already installed.')
            return
        }

        await fs.ensureDir(BIN_DIR)

        onProgress?.('Fetching latest MPV release info...')

        // Fetch latest release from GitHub API
        const response = await fetch('https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest')
        if (!response.ok) throw new Error('Failed to fetch MPV release info')

        const data = await response.json()
        const assets = data.assets as any[]

        // Find 64-bit 7z asset
        // Name pattern: mpv-x86_64-202X...git...7z (exclude -v3 if possible to be safe, or include it if CPU supports)
        // Let's pick generic x86_64
        const asset = assets.find(a => a.name.includes('mpv-x86_64') && a.name.endsWith('.7z') && !a.name.includes('-v3-'))
            || assets.find(a => a.name.includes('mpv-x86_64') && a.name.endsWith('.7z'))

        if (!asset) throw new Error('No suitable MPV binary found in release')

        const downloadUrl = asset.browser_download_url
        const downloadPath = path.join(BIN_DIR, asset.name)

        onProgress?.(`Downloading ${asset.name}...`)

        await downloadFile(downloadUrl, BIN_DIR, asset.name, (received, total) => {
            if (total > 0) {
                const percentage = Math.round((received / total) * 100)
                onProgress?.(`Downloading MPV: ${percentage}%`)
            }
        })

        onProgress?.('Extracting MPV...')

        // Extract 7z
        await execFile(path7za, ['x', downloadPath, `-o${BIN_DIR}`, '-y'])

        // Cleanup 7z file
        await fs.remove(downloadPath)

        // Verify
        if (!fs.existsSync(MPV_PATH)) {
            // Some archives have a subfolder. Move files up if needed.
            // But shinchiro builds usually extract 'mpv.exe' directly or in a folder. 
            // We should check subfolders if mpv.exe is missing.
            const files = await fs.readdir(BIN_DIR)
            const mpvDir = files.find(f => fs.statSync(path.join(BIN_DIR, f)).isDirectory() && f.includes('mpv'))
            if (mpvDir) {
                const subPath = path.join(BIN_DIR, mpvDir, 'mpv.exe')
                if (fs.existsSync(subPath)) {
                    await fs.move(path.join(BIN_DIR, mpvDir), BIN_DIR, { overwrite: true })
                }
            }
        }

        if (!fs.existsSync(MPV_PATH)) {
            throw new Error('Extraction finished but mpv.exe not found.')
        }

        onProgress?.('MPV installed successfully.')

    } catch (error) {
        console.error('Failed to install MPV:', error)
        throw error
    }
}
