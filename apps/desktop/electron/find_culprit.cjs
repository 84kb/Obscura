
const { spawn } = require('child_process');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');
const fs = require('fs');

const rootDir = "e:\\Library\\音MAD.library";

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith(".mp4")) {
                const fullPath = path.join(dirPath, "/", file);
                const stats = fs.statSync(fullPath);
                arrayOfFiles.push({ path: fullPath, mtime: stats.mtime });
            }
        }
    });

    return arrayOfFiles;
}

console.log("Scanning files...");
const files = getAllFiles(rootDir);
console.log(`Found ${files.length} mp4 files. Sorting by date...`);

// Sort desc
files.sort((a, b) => b.mtime - a.mtime);

async function checkFile(fileObj) {
    return new Promise((resolve) => {
        const ffprobePath = ffprobeStatic.path;
        const args = [
            '-v', 'error',
            '-show_format', '-show_streams',
            '-of', 'json',
            fileObj.path
        ];

        const ffprobe = spawn(ffprobePath, args);
        let outputData = '';

        ffprobe.stdout.on('data', (data) => {
            outputData += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (outputData.includes("Part_ID") || outputData.includes("part_id") || outputData.includes("StreamOrder")) {
                console.log("FOUND MATCH IN FILE:", fileObj.path);
                const idx = outputData.indexOf("Part_ID");
                if (idx != -1) {
                    console.log("--- PART_ID CONTEXT ---");
                    console.log(outputData.substring(idx - 100, idx + 100));
                } else {
                    console.log("--- FOUND StreamOrder/Key but no Part_ID? ---");
                    const idx2 = outputData.indexOf("StreamOrder");
                    console.log(outputData.substring(idx2 - 100, idx2 + 100));
                }
                resolve(true);
            } else {
                resolve(false);
            }
        });

        ffprobe.on('error', () => resolve(false));
    });
}

async function run() {
    // Check top 50 newest
    console.log("Checking top 50 newest files...");
    let count = 0;
    for (const f of files) {
        if (count >= 50) break;
        const found = await checkFile(f);
        if (found) {
            console.log("Stopping search.");
            process.exit(0);
        }
        count++;
    }
    console.log("No match found in checked files.");
}

run();
