
const fs = require('fs');
const path = require('path');

const libraryPath = "e:\\Library\\音MAD.library\\database.json";

try {
    if (!fs.existsSync(libraryPath)) {
        console.error("File not found:", libraryPath);
        process.exit(1);
    }
    const data = fs.readFileSync(libraryPath, 'utf-8');
    const json = JSON.parse(data);

    // Use correct key 'mediaFiles'
    const media = json.mediaFiles || [];
    console.log(`Total media items: ${media.length}`);

    // Check last 5 items
    // Sort by id desc (assuming higher id = newer)
    media.sort((a, b) => b.id - a.id);

    console.log("--- Last 5 Imported Items ---");
    for (let i = 0; i < Math.min(media.length, 5); i++) {
        const m = media[i];
        console.log(`ID: ${m.id}`);
        console.log(`File: ${m.file_name}`);
        console.log(`URL: ${m.url}`);
        // console.log(`Part_ID (if custom field exists): ${m.custom_url}`);
        console.log("---------------------------");
    }
} catch (e) {
    console.error("Failed to read database.json", e);
}
