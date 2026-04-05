type QueueEntry = {
    id: number
    onStart: () => void
    cancelled: boolean
}

let nextQueueId = 1
let activeQueueId: number | null = null
const pendingQueue: QueueEntry[] = []

function pumpThumbnailQueue(): void {
    if (activeQueueId !== null) return

    while (pendingQueue.length > 0) {
        const entry = pendingQueue.shift()
        if (!entry || entry.cancelled) continue
        activeQueueId = entry.id
        entry.onStart()
        return
    }
}

export function enqueueThumbnailLoad(onStart: () => void): { release: () => void, cancel: () => void } {
    const entry: QueueEntry = {
        id: nextQueueId++,
        onStart,
        cancelled: false,
    }

    pendingQueue.push(entry)
    pumpThumbnailQueue()

    return {
        release: () => {
            if (activeQueueId === entry.id) {
                activeQueueId = null
            }
            pumpThumbnailQueue()
        },
        cancel: () => {
            entry.cancelled = true
            if (activeQueueId === entry.id) {
                activeQueueId = null
                pumpThumbnailQueue()
            }
        },
    }
}
