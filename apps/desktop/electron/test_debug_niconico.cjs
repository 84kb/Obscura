
const { spawn } = require('child_process');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');

const filePath = "E:\\Library\\音MAD.library\\images\\99a26f043aa9\\べったんファイヤー☆_sm44827338.mp4";

async function debugFFprobe() {
    console.log("Checking file:", filePath);
    const ffprobePath = ffprobeStatic.path;
    const args = [
        '-v', 'error',
        '-show_entries', 'stream=width,height,duration,tags:format=duration:format_tags',
        '-of', 'json',
        filePath
    ];

    const ffprobe = spawn(ffprobePath, args);
    let outputData = '';

    ffprobe.stdout.on('data', (data) => {
        outputData += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
        console.error('stderr:', data.toString());
    });

    ffprobe.on('close', (code) => {
        console.log("Exit code:", code);
        const hasPartID = outputData.includes("Part_ID") || outputData.includes("part_id");
        console.log("Has Part_ID in output:", hasPartID);

        // Check user snippet
        if (outputData.includes("StreamOrder")) {
            console.log("Has StreamOrder in output: YES");
        }

        console.log("--- START OUTPUT ---");
        console.log(outputData);
        console.log("--- END OUTPUT ---");
    });
}

debugFFprobe();
