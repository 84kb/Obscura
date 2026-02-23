export class PlatformUtils {
    static generateUUID(): string {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    static generateRandomHex(length: number): string {
        // Simple hex generator
        const arr = new Uint8Array(length);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(arr);
        } else {
            for (let i = 0; i < length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
        }
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
