
const fs = require('fs');
const path = require('path');

const libraryPath = "e:\\Library\\音MAD.library\\database.json";

try {
    const data = fs.readFileSync(libraryPath, 'utf-8');
    const json = JSON.parse(data);
    const media = json.mediaFiles || [];

    // Find ID 7257
    const m = media.find(x => x.id === 7257);
    if (m) {
        console.log(`ID: ${m.id}`);
        console.log(`File Path: ${m.file_path}`);
        console.log(`URL: ${m.url}`);
    } else {
        console.log("ID 7257 not found");
    }
} catch (e) {
    console.error(e);
}
