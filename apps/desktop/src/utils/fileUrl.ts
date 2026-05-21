import { convertFileSrc } from '@tauri-apps/api/core'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif'])

function decodeMediaProtocolPath(inputPath: string): string {
    const raw = String(inputPath || '')
    if (!raw) return raw

    if (!raw.startsWith('media://')) {
        return raw
    }

    const noScheme = raw.slice('media://'.length)
    const decoded = decodeURIComponent(noScheme)
    const driveMatch = decoded.match(/^([A-Za-z])\/(.*)$/)
    if (driveMatch) {
        return `${driveMatch[1]}:/${driveMatch[2]}`
    }
    return decoded
}

export function isTauriRuntime(): boolean {
    if (typeof window === 'undefined') return false
    const w = window as any
    return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__)
}

export function toMediaUrl(filePath: string | null): string {
    const raw = String(filePath || '')
    if (!raw) return ''

    if (/^(https?:|data:|blob:)/i.test(raw)) {
        return raw
    }

    const normalizedPath = decodeMediaProtocolPath(raw)

    if (isTauriRuntime()) {
        return convertFileSrc(normalizedPath)
    }

    const normalizedSlashes = normalizedPath.replace(/\\/g, '/')
    const parts = normalizedSlashes.split('/')
    const encodedParts = parts.map((part, index) => {
        if (index === 0 && part.endsWith(':')) {
            return part
        }
        if (part === '') {
            return part
        }
        return encodeURIComponent(part)
    })

    return `media://${encodedParts.join('/')}`
}

function hasImageExtension(input: string): boolean {
    const normalized = decodeMediaProtocolPath(String(input || '')).split(/[?#]/, 1)[0].toLowerCase()
    for (const ext of IMAGE_EXTENSIONS) {
        if (normalized.endsWith(ext)) return true
    }
    return false
}

export function toThumbnailUrl(filePath: string | null): string {
    const raw = String(filePath || '').trim()
    if (!raw) return ''

    if (/^data:image\//i.test(raw) || /^blob:/i.test(raw)) {
        return raw
    }

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw)
            const pathname = parsed.pathname.toLowerCase()
            if (pathname.includes('/api/thumbnails/') || hasImageExtension(pathname)) {
                return raw
            }
            return ''
        } catch {
            return hasImageExtension(raw) ? raw : ''
        }
    }

    return hasImageExtension(raw) ? toMediaUrl(raw) : ''
}

export function isLocalAssetUrl(url: string | null | undefined): boolean {
    const value = String(url || '').trim()
    if (!value) return false
    return /(^https?:\/\/asset\.localhost\/)|(^https?:\/\/asset\.localhost:)|(^asset:\/\/localhost\/)|(^file:\/\/\/[A-Za-z]:\/)/i.test(value)
}

export async function createObjectUrlFromLocalImagePath(filePath: string | null): Promise<string | null> {
    const url = toThumbnailUrl(filePath)
    if (!url || !isTauriRuntime() || !isLocalAssetUrl(url)) {
        return url || null
    }

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to fetch local image: ${response.status}`)
    }
    const blob = await response.blob()
    return URL.createObjectURL(blob)
}
