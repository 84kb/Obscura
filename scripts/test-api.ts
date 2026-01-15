
import axios from 'axios'
import fs from 'fs'

const tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8'));

async function testApi() {
    const url = 'http://localhost:8765/api/media';
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'X-User-Token': tokens.userToken
            }
        });
        console.log('Media List Status:', response.status);

        // ストリーミングテスト（最初のメディアIDを使用）
        if (response.data.media && response.data.media.length > 0) {
            const mediaId = response.data.media[0].id;
            await testStreamingApi(mediaId);
            await testDownloadApi(mediaId);
            await testEditApi(mediaId);
        }

        await testUploadApi();
    } catch (error: any) {
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', error.response.data);
        } else {
            console.error('Error Object:', error);
        }
    }
}

async function testStreamingApi(mediaId: number) {
    const url = `http://localhost:8765/api/stream/${mediaId}`;
    console.log(`Testing Streaming API for media ID: ${mediaId}`);

    try {
        // 通常のリクエスト
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'X-User-Token': tokens.userToken
            },
            responseType: 'stream'
        });
        console.log('Streaming (Full) Status:', response.status);
        console.log('Content-Type:', response.headers['content-type']);
        console.log('Content-Length:', response.headers['content-length']);

        // Rangeリクエスト
        const responseRange = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'X-User-Token': tokens.userToken,
                'Range': 'bytes=0-1023'
            },
            responseType: 'stream'
        });
        console.log('Streaming (Range) Status:', responseRange.status);
        console.log('Content-Range:', responseRange.headers['content-range']);
        console.log('Content-Length (Chunk):', responseRange.headers['content-length']);

    } catch (error: any) {
        if (error.response) {
            console.error('Streaming Error Status:', error.response.status);
            console.error('Streaming Error Data:', error.response.data);
        } else {
            console.error('Streaming Error Object:', error);
        }
    }
}


function logErrorData(label: string, data: any) {
    if (typeof data === 'string' && data.trim().startsWith('<!DOCTYPE html>')) {
        console.error(`${label}: [HTML Error Response]`);
    } else {
        console.error(`${label}:`, data);
    }
}

async function testDownloadApi(mediaId: number) {
    const url = `http://localhost:8765/api/download/${mediaId}`;
    console.log(`Testing Download API for media ID: ${mediaId}`);
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'X-User-Token': tokens.userToken
            },
            responseType: 'arraybuffer' // ファイル本体を取得
        });
        console.log('Download Status:', response.status);
        console.log('Content-Length:', response.headers['content-length']);
    } catch (error: any) {
        if (error.response) {
            console.log('Download Error Status:', error.response.status); // 権限エラーならここで確認
            if (error.response.status !== 403) {
                logErrorData('Download Error Data', error.response.data);
            } else {
                console.log('Download Permission Denied (Expected if user is READ_ONLY)');
            }
        } else {
            console.error('Download Error Object:', error);
        }
    }
}

async function testUploadApi() {
    const url = 'http://localhost:8765/api/upload';
    console.log('Testing Upload API...');

    // ダミーファイル作成
    const formData = new FormData();
    const dummyContent = 'Hello Lappy Upload Test';
    const blob = new Blob([dummyContent], { type: 'text/plain' });
    formData.append('files', blob, 'test_upload.txt');

    try {
        const response = await axios.post(url, formData, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'X-User-Token': tokens.userToken,
                'Content-Type': 'multipart/form-data'
            }
        });
        console.log('Upload Status:', response.status);
        console.log('Upload Result:', response.data);
    } catch (error: any) {
        if (error.response) {
            console.log('Upload Error Status:', error.response.status);
            if (error.response.status === 403) {
                console.log('Upload Permission Denied (Expected if user is READ_ONLY)');
            } else {
                logErrorData('Upload Error Data', error.response.data);
            }
        } else {
            console.error('Upload Error Object:', error);
        }
    }
}

async function testEditApi(mediaId: number) {
    const url = `http://localhost:8765/api/media/${mediaId}`;
    console.log(`Testing Edit API for media ID: ${mediaId}`);
    try {
        const response = await axios.put(url, {
            description: 'Updated description by test script'
        }, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'X-User-Token': tokens.userToken
            }
        });
        console.log('Edit Status:', response.status);
        console.log('Edit Result:', response.data);
    } catch (error: any) {
        if (error.response) {
            console.log('Edit Error Status:', error.response.status);
            if (error.response.status === 403) {
                console.log('Edit Permission Denied (Expected if user is READ_ONLY)');
            } else {
                logErrorData('Edit Error Data', error.response.data);
            }
        } else {
            console.error('Edit Error Object:', error);
        }
    }
}

testApi();
