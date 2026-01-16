import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs-extra'
import { spawn } from 'child_process'
import { getFFmpegPath } from './ffmpeg-path'

// GitHub API for BtbN/FFmpeg-Builds
const REPO = 'BtbN/FFmpeg-Builds'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`

export async function getCurrentFFmpegVersion(): Promise<string> {
    const ffmpegPath = getFFmpegPath()
    return new Promise((resolve) => {
        try {
            const process = spawn(ffmpegPath, ['-version'])
            let output = ''
            process.stdout.on('data', (data) => {
                output += data.toString()
            })
            process.on('close', () => {
                const match = output.match(/ffmpeg version ([^\s]+)/)
                if (match && match[1]) {
                    resolve(match[1])
                } else {
                    resolve('Unknown')
                }
            })
            process.on('error', () => {
                resolve('Not Found')
            })
        } catch (e) {
            resolve('Error')
        }
    })
}

interface UpdateCheckResult {
    available: boolean
    version?: string
    url?: string
}

export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
    try {
        console.log('Checking for FFmpeg updates...')
        const response = await fetch(LATEST_RELEASE_URL)
        if (!response.ok) {
            throw new Error(`GitHub API Error: ${response.statusText}`)
        }
        const data: any = await response.json()

        // Tag name usually looks like "latest" or "autobuild-2023-..."
        // But the assets have specific names.
        // We look for an asset ending in "win64-gpl.zip"
        const asset = data.assets.find((a: any) => a.name.endsWith('win64-gpl.zip'))

        if (!asset) {
            console.warn('No compatible asset found in latest release')
            return { available: false }
        }

        const remoteVersion = data.tag_name
        const currentVersion = await getCurrentFFmpegVersion()

        // Simple string comparison or assume 'latest' is always newer?
        // Since BtbN builds use timestamps or git hashes, exact semver comparison is hard.
        // We will just return available if the remote tag differs from current (if store tag)
        // OR just return available if it exists, and let user decide based on displayed version.
        // For now, checks if asset exists.

        console.log(`Current: ${currentVersion}, Remote: ${remoteVersion}`)
        return {
            available: true,
            version: remoteVersion,
            url: asset.browser_download_url
        }

    } catch (e) {
        console.error('Failed to check for updates:', e)
        return { available: false }
    }
}

export async function updateFFmpeg(url: string, onProgress: (progress: number) => void): Promise<boolean> {
    try {
        const userDataPath = app.getPath('userData')
        const binDir = path.join(userDataPath, 'bin')
        const tempZipPath = path.join(userDataPath, 'ffmpeg-update.zip')
        const tempExtractDir = path.join(userDataPath, 'ffmpeg-temp')

        await fs.ensureDir(binDir)
        await fs.ensureDir(tempExtractDir)

        console.log(`Downloading from ${url} to ${tempZipPath}`)

        // 1. Download
        const response = await fetch(url)
        if (!response.ok || !response.body) {
            throw new Error(`Download failed: ${response.statusText}`)
        }

        const totalLength = Number(response.headers.get('content-length')) || 0
        const fileStream = fs.createWriteStream(tempZipPath)
        const reader = response.body.getReader()
        let receivedLength = 0

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            receivedLength += value.length
            fileStream.write(value)

            if (totalLength > 0) {
                onProgress(Math.round((receivedLength / totalLength) * 100))
            }
        }

        fileStream.end()
        await new Promise<void>((resolve, reject) => {
            fileStream.on('finish', () => resolve())
            fileStream.on('error', reject)
        })

        console.log('Download complete. Extracting...')

        // 2. Extract using PowerShell (Windows native)
        // clean temp dir first
        await fs.emptyDir(tempExtractDir)

        const unzipCommand = `powershell -command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${tempExtractDir}' -Force"`
        await new Promise<void>((resolve, reject) => {
            const child = spawn(unzipCommand, { shell: true })
            child.on('close', (code) => {
                if (code === 0) resolve()
                else reject(new Error(`Extraction failed with code ${code}`))
            })
        })

        console.log('Extraction complete. Moving binaries...')

        // 3. Find and Move Binaries
        // Structure is usually: ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe
        const findAndMove = async (filename: string) => {
            // Find file recursively in tempExtractDir
            const findFile = async (dir: string): Promise<string | null> => {
                const files = await fs.readdir(dir)
                for (const file of files) {
                    const fullPath = path.join(dir, file)
                    const stat = await fs.stat(fullPath)
                    if (stat.isDirectory()) {
                        const found = await findFile(fullPath)
                        if (found) return found
                    } else if (file === filename) {
                        return fullPath
                    }
                }
                return null
            }

            const srcPath = await findFile(tempExtractDir)
            if (!srcPath) throw new Error(`${filename} not found in extracted archive`)

            const destPath = path.join(binDir, filename)
            await fs.move(srcPath, destPath, { overwrite: true })
        }

        await findAndMove('ffmpeg.exe')
        await findAndMove('ffprobe.exe')

        // 4. Cleanup
        await fs.remove(tempZipPath)
        await fs.remove(tempExtractDir)

        console.log('Update successful!')
        return true

    } catch (e: any) {
        console.error('Update failed:', e)
        throw e
    }
}
