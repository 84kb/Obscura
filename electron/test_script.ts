
import { getMediaMetadata } from './ffmpeg';
import * as path from 'path';

async function main() {
    const file = "e:\\Library\\音MAD.library\\images\\747f06b0501c\\合作単品④_②③_⑬ [N409D1kTQMA].mp4";
    console.log(`Testing file: ${file}`);
    try {
        const result = await getMediaMetadata(file);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
