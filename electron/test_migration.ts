
import { MediaLibrary } from './database';
import * as fs from 'fs-extra';
import * as path from 'path';

const testLibPath = "e:\\test_migration_lib.library";

async function test() {
    console.log("Setting up test library at", testLibPath);
    if (fs.existsSync(testLibPath)) fs.removeSync(testLibPath);
    fs.mkdirSync(testLibPath);

    // Create legacy database.json
    const legacyDb = {
        mediaFiles: [
            { id: 1, file_name: "test.mp4", uniqueId: "aabbcc", tags: [], genres: [], comments: [] }
        ],
        tags: [{ id: 1, name: "TestTag" }],
        genres: [],
        tagFolders: [],
        mediaTags: [{ mediaId: 1, tagId: 1 }],
        mediaGenres: [],
        comments: [],
        nextMediaId: 2,
        nextTagId: 2
    };

    fs.writeJsonSync(path.join(testLibPath, "database.json"), legacyDb);
    console.log("Created legacy DB.");

    // Initialize MediaLibrary - should trigger migration
    const lib = new MediaLibrary(testLibPath);
    console.log("Library initialized:", lib.path);

    // Check results
    if (fs.existsSync(path.join(testLibPath, "database.json.migrated"))) {
        console.log("SUCCESS: database.json.migrated exists.");
    } else {
        console.error("FAILURE: database.json was not renamed.");
    }

    if (fs.existsSync(path.join(testLibPath, "tags.json"))) {
        console.log("SUCCESS: tags.json exists.");
    } else {
        console.error("FAILURE: tags.json missing.");
    }

    const metaPath = path.join(testLibPath, "images/aabbcc/metadata.json");
    if (fs.existsSync(metaPath)) {
        console.log("SUCCESS: metadata.json exists for media.");
        const meta = fs.readJsonSync(metaPath);
        if (meta.tags && meta.tags.length === 1 && meta.tags[0].name === "TestTag") {
            console.log("SUCCESS: Tags migrated correctly.");
        } else {
            console.error("FAILURE: Tags not migrated.", meta.tags);
        }
    } else {
        console.error("FAILURE: metadata.json missing.");
    }
}

test();
