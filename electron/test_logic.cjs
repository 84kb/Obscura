
const { spawn } = require('child_process');
const ffprobeStatic = require('ffprobe-static');

async function getMediaMetadataTest(filePath) {
    return new Promise((resolve) => {
        const ffprobePath = ffprobeStatic.path;
        console.log('Using ffprobe at:', ffprobePath);

        const args = [
            '-v', 'error',
            '-show_entries', 'stream=width,height,duration:format=duration:format_tags',
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
            if (code === 0) {
                try {
                    console.log('Output data length:', outputData.length);
                    // console.log('Raw output:', outputData); 
                    const json = JSON.parse(outputData);
                    console.log('JSON parsed successfully');

                    let url;

                    if (json.format && json.format.tags) {
                        const tags = json.format.tags;
                        console.log('Tags found:', JSON.stringify(tags, null, 2));

                        const comment = tags.comment || tags.COMMENT || tags.Comment;
                        let partId = tags.Part_ID || tags.part_id;

                        // nested extra tag check (case-insensitive key search)
                        if (!partId) {
                            const extraKey = Object.keys(tags).find(k => k.toLowerCase() === 'extra');
                            if (extraKey && tags[extraKey]) {
                                const extraStr = tags[extraKey];
                                console.log('Extra tag found:', extraStr);
                                try {
                                    const extra = JSON.parse(extraStr);
                                    if (extra && (extra.Part_ID || extra.part_id)) {
                                        partId = extra.Part_ID || extra.part_id;
                                        console.log('Part_ID found in JSON:', partId);
                                    }
                                } catch (e) {
                                    console.log('JSON parse failed for extra, trying regex');
                                    const match = extraStr.match(/"Part_ID"\s*:\s*"([^"]+)"/i);
                                    if (match && match[1]) {
                                        partId = match[1];
                                        console.log('Part_ID found via regex:', partId);
                                    }
                                }
                            }
                        }

                        if (comment && comment.trim().startsWith('https://')) {
                            url = comment;
                            console.log('URL set from comment:', url);
                        } else if (partId) {
                            url = `https://www.nicovideo.jp/watch/${partId}`;
                            console.log('URL set from Part_ID:', url);
                        } else if (comment && (comment.startsWith('http://') || comment.startsWith('www.'))) {
                            url = comment;
                            console.log('URL set from http/www comment:', url);
                        }
                    } else {
                        console.log('No tags found');
                    }

                    resolve({ url });
                } catch (e) {
                    console.error('Failed to parse ffprobe output', e);
                    resolve({});
                }
            } else {
                console.error('ffprobe exited with code', code);
                resolve({});
            }
        });
    });
}

const file = "e:\\Library\\音MAD.library\\images\\747f06b0501c\\合作単品④_②③_⑬ [N409D1kTQMA].mp4";
getMediaMetadataTest(file).then(res => console.log('Final Result:', res));
