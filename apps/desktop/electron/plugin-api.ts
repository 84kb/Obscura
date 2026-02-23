import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import fs from 'fs-extra';
import path from 'path';

/**
 * プラグインシステム用バックエンドAPI
 * レンダラープロセスから安全にネットワークアクセスやファイルシステム操作を行えるようにする
 */
export function registerPluginSystem(userDataPath: string) {
    // 開発時はプロジェクトルートの plugins フォルダを参照する
    const pluginsDir = app.isPackaged
        ? path.join(userDataPath, 'plugins')
        : path.join(__dirname, '../../plugins'); // dist-electron/ 内から見たパス。うまくいかない場合は手動でフォールバックを追加
    const extensionsDataDir = path.join(userDataPath, 'extensions_data');

    // ディレクトリの確保
    fs.ensureDirSync(pluginsDir);
    fs.ensureDirSync(extensionsDataDir);

    // 1. 汎用 Fetch API (CORS 回避)
    ipcMain.handle('plugin:fetch', async (_event, url: string, options?: any) => {
        try {
            console.log(`[Plugin] Fetching: ${url}`);
            const response = await fetch(url, options);

            // Text or JSON
            const contentType = response.headers.get('content-type') || '';
            let data;
            if (contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                data: data
            };
        } catch (error: any) {
            console.error(`[Plugin] Fetch Error (${url}):`, error);
            return { ok: false, status: 0, statusText: error.message, error: true };
        }
    });

    // 2. 汎用 データ保存 API
    ipcMain.handle('plugin:saveMediaData', async (_event, mediaId: number, pluginId: string, data: any) => {
        try {
            const safePluginId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');
            const targetPath = path.join(extensionsDataDir, `${mediaId}_${safePluginId}.json`);
            await fs.writeJson(targetPath, data);
            return true;
        } catch (error) {
            console.error(`[Plugin] Save Data Error (MediaID: ${mediaId}, PluginID: ${pluginId}):`, error);
            return false;
        }
    });

    // 3. 汎用 データ読み込み API
    ipcMain.handle('plugin:loadMediaData', async (_event, mediaId: number, pluginId: string) => {
        try {
            const safePluginId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');
            const targetPath = path.join(extensionsDataDir, `${mediaId}_${safePluginId}.json`);
            if (await fs.pathExists(targetPath)) {
                return await fs.readJson(targetPath);
            }
            return null;
        } catch (error) {
            console.error(`[Plugin] Load Data Error (MediaID: ${mediaId}, PluginID: ${pluginId}):`, error);
            return null;
        }
    });

    // コメントファイルI/O — 動画ファイルと同階層に .comments.json を保存
    ipcMain.handle('plugin:saveCommentFile', async (_event, mediaFilePath: string, data: any) => {
        try {
            if (!mediaFilePath) return false;
            const parsed = path.parse(mediaFilePath);
            const commentPath = path.join(parsed.dir, `${parsed.name}.comments.json`);
            await fs.writeJson(commentPath, data, { spaces: 2 });
            console.log(`[Plugin] Saved comment file: ${commentPath}`);
            return true;
        } catch (error) {
            console.error(`[Plugin] Save Comment File Error:`, error);
            return false;
        }
    });

    ipcMain.handle('plugin:loadCommentFile', async (_event, mediaFilePath: string) => {
        try {
            if (!mediaFilePath) return null;
            const parsed = path.parse(mediaFilePath);
            const commentPath = path.join(parsed.dir, `${parsed.name}.comments.json`);
            if (await fs.pathExists(commentPath)) {
                return await fs.readJson(commentPath);
            }
            return null;
        } catch (error) {
            console.error(`[Plugin] Load Comment File Error:`, error);
            return null;
        }
    });

    // 4. プラグイン スクリプト一覧の取得
    ipcMain.handle('plugin:getScripts', async () => {
        try {
            const files = await fs.readdir(pluginsDir);
            const jsFiles = files.filter(f => f.endsWith('.js'));

            // スクリプトの中身を読み込んで返す
            const scripts = await Promise.all(jsFiles.map(async file => {
                const content = await fs.readFile(path.join(pluginsDir, file), 'utf-8');

                // --- メタデータの抽出処理 ---
                const metadata: any = {
                    name: file, // デフォルト名としてファイル名
                    description: '',
                    version: '1.0.0',
                    author: ''
                };

                // "// @key value" 形式のコメントを解析
                const lines = content.split('\n');
                for (let i = 0; i < Math.min(lines.length, 50); i++) { // 先頭50行だけ解析
                    const line = lines[i].trim();
                    if (!line.startsWith('//')) break; // コメントヘッダー領域を抜けたら終了（UserScript風）

                    const match = line.match(/^\/\/\s*@([a-zA-Z0-9]+)\s+(.+)$/);
                    if (match) {
                        const key = match[1];
                        const value = match[2];
                        if (key === 'name') metadata.name = value;
                        if (key === 'description' || key === 'desc') metadata.description = value;
                        if (key === 'version') metadata.version = value;
                        if (key === 'author') metadata.author = value;
                    }
                }

                return {
                    id: file.replace('.js', ''),
                    fileName: file,
                    name: metadata.name, // レガシー互換として保持しつつUI表示名としても利用可能
                    code: content,
                    metadata: metadata
                };
            }));

            return scripts;
        } catch (error) {
            console.error('[Plugin] Failed to read plugin scripts:', error);
            return [];
        }
    });

    // 5. エクスプローラーからプラグインスクリプトを選択してインストール
    ipcMain.handle('plugin:install', async () => {
        try {
            const win = BrowserWindow.getFocusedWindow();
            const dialogOptions: Electron.OpenDialogOptions = {
                title: 'プラグインスクリプトを選択',
                filters: [
                    { name: 'JavaScript', extensions: ['js'] }
                ],
                properties: ['openFile', 'multiSelections']
            };

            const result = win
                ? await dialog.showOpenDialog(win, dialogOptions)
                : await dialog.showOpenDialog(dialogOptions);

            if (result.canceled || result.filePaths.length === 0) {
                return { installed: [], skipped: [] };
            }

            const installed: string[] = [];
            const skipped: string[] = [];

            for (const filePath of result.filePaths) {
                const fileName = path.basename(filePath);
                const destPath = path.join(pluginsDir, fileName);

                // 同名ファイルが既に存在する場合はスキップする（意図しない上書きを防止）
                if (await fs.pathExists(destPath)) {
                    console.warn(`[Plugin] Skipped (already exists): ${fileName}`);
                    skipped.push(fileName);
                    continue;
                }

                await fs.copy(filePath, destPath);
                console.log(`[Plugin] Installed: ${fileName}`);
                installed.push(fileName);
            }

            return { installed, skipped };
        } catch (error: any) {
            console.error('[Plugin] Install Error:', error);
            return { installed: [], skipped: [], error: error.message };
        }
    });

    // 6. プラグインスクリプトのアンインストール（削除）
    ipcMain.handle('plugin:uninstall', async (_event, pluginId: string) => {
        try {
            // ディレクトリトラバーサル防止：英数字・ハイフン・アンダースコアのみ許可
            const safeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeId) {
                return { success: false, error: 'Invalid plugin ID' };
            }

            const targetPath = path.join(pluginsDir, `${safeId}.js`);

            if (!await fs.pathExists(targetPath)) {
                return { success: false, error: `Plugin file not found: ${safeId}.js` };
            }

            await fs.remove(targetPath);
            console.log(`[Plugin] Uninstalled: ${safeId}.js`);
            return { success: true };
        } catch (error: any) {
            console.error('[Plugin] Uninstall Error:', error);
            return { success: false, error: error.message };
        }
    });
}
