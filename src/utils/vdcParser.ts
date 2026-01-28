/**
 * ViPER DDC (.vdc) files are binary files containing FIR coefficients for headphone correction.
 */

export interface VDCParsedData {
    channels: number;
    numCoefficients: number;
    coefficients: Float32Array;
}

export async function parseVDCFromUrl(url: string): Promise<VDCParsedData> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return parseVDCBuffer(arrayBuffer);
}

export function parseVDCBuffer(buffer: ArrayBuffer): VDCParsedData {
    if (buffer.byteLength < 12) {
        throw new Error("File too small to be a valid DDC or raw audio file");
    }

    const view = new DataView(buffer);

    // Check Header "VDC " (0x56 0x44 0x43 0x20)
    const magic = view.getUint32(0, false);
    if (magic !== 0x56444320) {
        // Text/XML check (Simple heuristic)
        if (new Uint8Array(buffer.slice(0, 1))[0] === 60) { // 60 is '<'
            throw new Error("This appears to be a ViPER4Android XML profile, not a VDC/IRS kernel file.");
        }
        console.info("[vdcParser] No VDC header found. Assuming raw floating-point data.");

        // Fallback: raw coefficients
        // Ensure byteLength is a multiple of 4 for Float32
        const bytesToRead = buffer.byteLength - (buffer.byteLength % 4);
        if (bytesToRead === 0) throw new Error("File contains no float data");

        const rawCoeffs = new Float32Array(buffer.slice(0, bytesToRead));

        // Safety check: don't allow crazy large buffers
        if (rawCoeffs.length > 524288) { // 512k coeffs max (~2s @ 256khz or ~10s @ 48khz)
            throw new Error("Raw file too large for DDC compensation (max 512k coefficients)");
        }

        return {
            channels: 1,
            numCoefficients: rawCoeffs.length,
            coefficients: rawCoeffs
        };
    }

    const channels = view.getInt32(4, true); // 0 or 1 usually
    const numCoefficients = view.getInt32(8, true);

    if (numCoefficients <= 0 || numCoefficients > 1048576) {
        throw new Error(`Invalid coefficient count in VDC: ${numCoefficients}`);
    }

    const dataOffset = 12;
    const requiredBytes = numCoefficients * 4;

    if (buffer.byteLength < dataOffset + requiredBytes) {
        throw new Error("VDC file truncated: data smaller than header indicates");
    }

    const coeffs = new Float32Array(buffer.slice(dataOffset, dataOffset + requiredBytes));

    return {
        channels: channels + 1, // VDC uses 0 for 1ch, 1 for 2ch
        numCoefficients,
        coefficients: coeffs
    };
}
