/**
 * A manual WAV and PCM parser to avoid native decodeAudioData crashes
 * for small ViPER4Android IRS/VDC assets.
 */

export interface ParsedAudio {
    buffer: AudioBuffer;
}

export function parseWavManual(arrayBuffer: ArrayBuffer, ctx: AudioContext): AudioBuffer {
    const view = new DataView(arrayBuffer);
    const header = String.fromCharCode(...new Uint8Array(arrayBuffer.slice(0, 4)));

    if (header !== 'RIFF') {
        // Raw PCM Fallback (Assume 32-bit Float LE)
        return parseRawPCM(arrayBuffer, ctx);
    }

    // Basic WAV Parser
    let offset = 12; // Skip RIFF header
    let numChannels = 1;
    let sampleRate = 44100;
    let bitsPerSample = 16;
    let dataOffset = 0;
    let dataLen = 0;

    while (offset < arrayBuffer.byteLength) {
        const chunkId = String.fromCharCode(...new Uint8Array(arrayBuffer.slice(offset, offset + 4)));
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === 'fmt ') {
            numChannels = view.getUint16(offset + 10, true);
            sampleRate = view.getUint32(offset + 12, true);
            bitsPerSample = view.getUint16(offset + 22, true);
        } else if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataLen = chunkSize;
        }

        offset += 8 + chunkSize;
        if (chunkSize % 2 !== 0) offset++; // Padding
    }

    if (dataOffset === 0 || dataLen === 0) {
        throw new Error("Invalid WAV: No data chunk found");
    }

    const sampleCount = Math.floor(dataLen / (numChannels * (bitsPerSample / 8)));
    const audioBuffer = ctx.createBuffer(numChannels, sampleCount, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        const bytesPerSample = bitsPerSample / 8;

        for (let i = 0; i < sampleCount; i++) {
            const byteIdx = dataOffset + (i * numChannels + ch) * bytesPerSample;
            if (byteIdx + bytesPerSample > arrayBuffer.byteLength) break;

            if (bitsPerSample === 16) {
                channelData[i] = view.getInt16(byteIdx, true) / 32768.0;
            } else if (bitsPerSample === 24) {
                // 3 bytes to 24-bit int
                const b0 = view.getUint8(byteIdx);
                const b1 = view.getUint8(byteIdx + 1);
                const b2 = view.getUint8(byteIdx + 2);
                let val = (b0 << 0) | (b1 << 8) | (b2 << 16);
                if (val & 0x800000) val |= 0xFF000000; // Sign extend
                channelData[i] = val / 8388608.0;
            } else if (bitsPerSample === 32) {
                // Assume float if 32bit in many IRS contexts, but check fmt if possible
                // For simplicity, we try float first as it's common for high-end IRS
                channelData[i] = view.getFloat32(byteIdx, true);
            }
        }
    }

    return audioBuffer;
}

function parseRawPCM(buffer: ArrayBuffer, ctx: AudioContext): AudioBuffer {
    // Attempt 32-bit float first as it's the V4A standard for raw
    const floatCount = Math.floor(buffer.byteLength / 4);
    const view = new DataView(buffer);
    const audioBuffer = ctx.createBuffer(1, floatCount, ctx.sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < floatCount; i++) {
        channelData[i] = view.getFloat32(i * 4, true);
    }

    return audioBuffer;
}
