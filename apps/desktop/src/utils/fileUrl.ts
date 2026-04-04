import { convertFileSrc } from '@tauri-apps/api/core'

function isTauriRuntime(): boolean {
    if (typeof window === 'undefined') return false
    const w = window as any
    return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__)
}

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
