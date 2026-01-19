export const formatDuration = (seconds: number | null) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}
