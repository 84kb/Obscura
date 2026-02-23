import { registerPlugin } from '@capacitor/core'

export interface ObscuraNativePlugin {
    /**
     * Launch system folder picker to grant permission (SAF)
     * Returns valid content:// URI if successful
     */
    selectFolder(): Promise<{ uri: string }>

    /**
     * List files in a given SAF folder URI
     */
    listFiles(options: { uri: string }): Promise<{ files: Array<{ name: string, uri: string, isDirectory: boolean, mimeType: string }> }>

    /**
     * Get metadata for a media file (duration, etc.)
     */
    getMediaMetadata(options: { uri: string }): Promise<{ duration: number, width: number, height: number }>

    /**
     * Generate thumbnail for a video and return local file path
     */
    generateThumbnail(options: { uri: string }): Promise<{ path: string }>
}

const ObscuraNative = registerPlugin<ObscuraNativePlugin>('ObscuraNative')

export default ObscuraNative
