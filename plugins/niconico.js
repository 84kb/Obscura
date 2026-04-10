// @id niconico
// @name ニコニコ動画コメント統合
// @description 対象動画でニコニコ動画のコメントを取得し、画面に流す機能を提供します。
// @version 1.0.5
// @author Obscura
/**
 * NicoNico Comment Provider Plugin for Obscura
 * 
 * This script is dynamically loaded by Obscura and registers a CommentProvider
 * to fetch and format comments from NicoNico Douga.
 */

(function () {
    // ObscuraAPI が存在しない場合はロードしない
    if (!window.ObscuraAPI) {
        console.error('[NicoNicoPlugin] ObscuraAPI is not available.');
        return;
    }

    const NICO_PROVIDER_ID = 'niconico';
    const NICO_PROVIDER_NAME = 'ニコニコ動画';

    console.log(`[NicoNicoPlugin] Initializing ${NICO_PROVIDER_NAME} plugin...`);

    // ニコニコ動画のURLかどうかを判定
    const isNicoUrl = (urlStr) => {
        return urlStr.includes('nicovideo.jp/watch/') || /^[sn]m\d+$/.test(urlStr);
    };

    // ニコニコ動画のVideoIDを抽出
    const extractVideoId = (url) => {
        if (!url) return null;
        if (url.includes('nicovideo.jp/watch/')) {
            const parts = url.split('watch/');
            if (parts.length > 1) {
                return parts[1].split('?')[0]; // クエリパラメータを除去
            }
        } else if (/^[sn]m\d+$/.test(url)) {
            return url;
        }
        return null;
    };

    const normalizeV1Threads = (input) => {
        if (typeof input === 'string') {
            try {
                return normalizeV1Threads(JSON.parse(input));
            } catch (e) {
                return [];
            }
        }

        const threads = Array.isArray(input)
            ? input
            : Array.isArray(input?.threads)
                ? input.threads
                : Array.isArray(input?.data?.threads)
                    ? input.data.threads
                    : Array.isArray(input?.data?.data?.threads)
                        ? input.data.data.threads
                        : [];

        return threads.filter((thread) => thread && Array.isArray(thread.comments));
    };

    const countV1Comments = (threads) => {
        return threads.reduce((sum, thread) => sum + (thread.comments?.length || 0), 0);
    };

    /**
     * 動画ページHTMLから埋め込み視聴データを抽出する
     * 
     * 2024年8月のサイバー攻撃後、nvapi/v3_guest 等の従来APIが廃止されたため、
     * 動画視聴ページのHTMLに埋め込まれたJSONデータから threadKey/threadId を取得する方式に移行。
     * 参考: https://github.com/tanbatu/comment-zouryou, https://github.com/Saccubus/Saccubus1
     */
    const extractWatchDataFromHtml = (html) => {
        /**
         * HTMLエンティティをデコードするヘルパー
         * metaタグのcontent属性はHTMLエンティティでエスケープされているため必須
         */
        const decodeHtmlEntities = (str) => {
            return str
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'");
        };

        // パターン1（現行）: <meta name="server-response" content="...">
        // 2024年以降のニコニコ動画はこの形式で視聴データを埋め込んでいる
        const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/);
        if (serverResponseMatch) {
            try {
                const decoded = decodeHtmlEntities(serverResponseMatch[1]);
                const parsed = JSON.parse(decoded);
                // data.response の中に comment.nvComment が存在する
                if (parsed?.data?.response) return parsed.data.response;
                return parsed;
            } catch (e) {
                console.warn('[NicoNicoPlugin] server-response のパースに失敗:', e);
            }
        }

        // パターン2（旧形式）: <div id="js-initial-watch-data" data-api-data="...">
        const dataApiMatch = html.match(/id="js-initial-watch-data"[^>]*data-api-data="([^"]+)"/);
        if (dataApiMatch) {
            try {
                return JSON.parse(decodeHtmlEntities(dataApiMatch[1]));
            } catch (e) {
                console.warn('[NicoNicoPlugin] data-api-data のパースに失敗:', e);
            }
        }

        // パターン3: content属性内の順序が逆の場合（content="..." name="server-response"）
        const serverResponseAlt = html.match(/content="([^"]+)"\s+name="server-response"/);
        if (serverResponseAlt) {
            try {
                const decoded = decodeHtmlEntities(serverResponseAlt[1]);
                const parsed = JSON.parse(decoded);
                if (parsed?.data?.response) return parsed.data.response;
                return parsed;
            } catch (e) {
                console.warn('[NicoNicoPlugin] server-response (alt) のパースに失敗:', e);
            }
        }

        return null;
    };

    /**
     * 視聴データからコメントスレッド情報を掘り出す
     * APIレスポンス形式が変わっても柔軟に対応するための再帰探索
     */
    const findCommentData = (obj) => {
        if (!obj || typeof obj !== 'object') return null;

        // nvComment 形式（server, threadKey, params.targets を含む構造）
        if (obj.nvComment && obj.nvComment.threadKey && obj.nvComment.server) {
            return obj.nvComment;
        }

        // comment.nvComment として埋まっているケース
        if (obj.comment && obj.comment.nvComment) {
            return obj.comment.nvComment;
        }

        // 再帰的に探索（深さ制限付き）
        const searchDepth = (target, depth) => {
            if (depth > 5 || !target || typeof target !== 'object') return null;
            for (const key of Object.keys(target)) {
                if (key === 'nvComment' && target[key]?.threadKey) return target[key];
                const found = searchDepth(target[key], depth + 1);
                if (found) return found;
            }
            return null;
        };

        return searchDepth(obj, 0);
    };

    /**
     * ニコニコ動画のコメントを取得する（現行API方式）
     * 
     * 手順:
     * 1. 動画視聴ページのHTMLを取得
     * 2. HTML内の埋め込みJSONから threadKey, threadId, nvComment server を抽出
     * 3. public.nvcomment.nicovideo.jp/v1/threads にPOSTしてコメントを取得
     */
    const fetchComments = async (mediaId, url) => {
        const videoId = extractVideoId(url);
        if (!videoId) {
            throw new Error('無効なニコニコ動画のURLです: ' + url);
        }

        console.log(`[NicoNicoPlugin] Fetching comments for ${videoId} (media: ${mediaId})`);

        try {
            // Step 1: 動画視聴ページのHTMLを取得
            const watchPageUrl = `https://www.nicovideo.jp/watch/${videoId}`;
            const pageRes = await window.ObscuraAPI.system.fetch(watchPageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'ja-JP,ja;q=0.9'
                }
            });

            // pluginFetchの戻り値は { ok, status, statusText, data } で data は既にパース済み
            if (!pageRes.ok) {
                throw new Error(`動画ページの取得に失敗 (HTTP ${pageRes.status})`);
            }

            const html = pageRes.data;
            if (typeof html !== 'string') {
                throw new Error('動画ページのレスポンスがHTML文字列ではありません');
            }

            // Step 2: HTMLから視聴データを抽出
            const watchData = extractWatchDataFromHtml(html);
            if (!watchData) {
                throw new Error('動画ページから視聴データを抽出できませんでした');
            }

            // Step 3: コメントスレッド情報を探す
            const nvComment = findCommentData(watchData);
            if (!nvComment) {
                throw new Error('コメントスレッド情報が見つかりませんでした');
            }

            console.log(`[NicoNicoPlugin] Found nvComment data. Server: ${nvComment.server}`);

            // Step 4: nvComment APIでコメントを取得
            return await fetchNvComments(nvComment);

        } catch (error) {
            console.error('[NicoNicoPlugin] Fetch error:', error);
            throw error;
        }
    };

    /**
     * NV Comment API (public.nvcomment.nicovideo.jp) からコメントを取得
     * niconicomments ライブラリ互換の v1Thread 形式でレスポンスをそのまま返す
     */
    const fetchNvComments = async (nvCommentData) => {
        const server = nvCommentData.server || 'https://public.nvcomment.nicovideo.jp';
        const payload = {
            params: nvCommentData.params,
            threadKey: nvCommentData.threadKey,
            additionals: {}
        };

        console.log(`[NicoNicoPlugin] Requesting comments from ${server}/v1/threads`);

        const res = await window.ObscuraAPI.system.fetch(server + '/v1/threads', {
            method: 'POST',
            headers: {
                'X-Frontend-Id': '6',
                'X-Frontend-Version': '0',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // pluginFetchの戻り値: { ok, status, statusText, data }
        if (!res.ok) {
            throw new Error(`NV Comment API エラー (HTTP ${res.status}): ${res.statusText}`);
        }

        const data = res.data;

        const threads = normalizeV1Threads(data);
        if (threads.length === 0) {
            throw new Error('NV Comment API: スレッドデータが含まれていません');
        }

        const totalComments = countV1Comments(threads);
        if (totalComments === 0) {
            throw new Error('ニコニコ動画のコメントを取得できませんでした');
        }
        console.log(`[NicoNicoPlugin] Fetched ${totalComments} comments from ${threads.length} threads`);

        // v1Thread 形式: threads 配列をそのまま返す
        return threads;
    };

    // --- オーバーレイ描画ロジック ---
    let currentNiconiComments = null;
    let currentMediaId = null;
    let currentCommentData = null;
    let isLoading = false;
    let lastInitializedWidth = 0;
    let lastInitializedHeight = 0;
    let lastLoadAttemptAt = 0;
    const LOAD_RETRY_INTERVAL_MS = 500;
    const COMMENT_STAGE_WIDTH = 1920;
    const COMMENT_STAGE_HEIGHT = 1080;

    const createNiconiComments = (canvas, data) => {
        return new window.NiconiComments(canvas, data, {
            format: 'v1',
            config: {
                canvasWidth: COMMENT_STAGE_WIDTH,
                canvasHeight: COMMENT_STAGE_HEIGHT
            }
        });
    };

    // 表示状態の管理をプラグイン内部に持たせる
    let isOverlayVisible = (() => {
        try {
            const saved = localStorage.getItem('player_show_danmaku');
            return saved !== 'false';
        } catch (e) { return true; }
    })();

    /**
     * プレイヤーオーバーレイ描画コールバック
     * 本体側のCanvasと再生状態を受け取り、コメントを描画する
     */
    const renderOverlay = async (canvas, media, context) => {
        if (!media) return;

        const ctx = canvas.getContext('2d');
        const hasRenderableSize = canvas.width > 0 && canvas.height > 0;
        const sizeChanged = canvas.width !== lastInitializedWidth || canvas.height !== lastInitializedHeight;

        // メディアが変更された場合、または設定が無効になった場合に確実に状態をリセット・クリアする
        if (currentMediaId !== media.id || !context.enabled) {
            const mediaChanged = currentMediaId !== media.id;

            if (mediaChanged || !context.enabled) {
                // キャンバスを即座にクリア（残像防止）
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (mediaChanged) {
                    console.log(`[NicoNicoPlugin] Media changed: ${currentMediaId} -> ${media.id}. Resetting state.`);
                    currentMediaId = media.id;
                    currentNiconiComments = null;
                    currentCommentData = null;
                    lastInitializedWidth = 0;
                    lastInitializedHeight = 0;
                    lastLoadAttemptAt = 0;
                }
            }

            // 無効時はこれ以上何もしない
            if (!context.enabled) return;
        }

        // 表示オフの場合はクリアして描画をスキップ（バックグラウンド処理は継続）
        if (!isOverlayVisible) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // niconicommentsの内部ステート更新が必要な場合はここでdrawCanvasを呼び出さずに時間を進める等の工夫が必要だが、
            // ライブラリの仕様上、drawCanvasを呼ばないことで「停止」しているように見えるだけなので、
            // 再表示時に現在のvposでdrawCanvasを呼べば目的は達成される。
            return;
        }

        // Canvas の初期レイアウト完了前でも、コメントデータの読み込みだけは先に進める
        if (!currentCommentData && !isLoading && context.enabled) {
            const now = Date.now();
            if (now - lastLoadAttemptAt < LOAD_RETRY_INTERVAL_MS) {
                return;
            }
            lastLoadAttemptAt = now;
            isLoading = true;
            // 読み込み開始時に念のためCanvasをクリア（残像防止）
            if (hasRenderableSize) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            (async () => {
                try {
                    console.log(`[NicoNicoPlugin] loading comments for ${media.id} (Canvas: ${canvas.width}x${canvas.height})`);
                    const data = await window.ObscuraAPI.system.loadCommentFile(media.file_path);
                    const threads = normalizeV1Threads(data);
                    const totalComments = countV1Comments(threads);
                    if (threads.length > 0 && totalComments > 0 && currentMediaId === media.id) {
                        currentCommentData = threads;
                        if (canvas.width > 0 && canvas.height > 0) {
                            currentNiconiComments = createNiconiComments(canvas, threads);
                            lastInitializedWidth = canvas.width;
                            lastInitializedHeight = canvas.height;
                        }
                        console.log(`[NicoNicoPlugin] Loaded ${totalComments} comments for overlay.`);
                    } else if (currentMediaId === media.id) {
                        currentCommentData = null;
                    }
                } catch (e) {
                    console.error('[NicoNicoPlugin] Overlay load error:', e);
                } finally {
                    isLoading = false;
                }
            })();
            return;
        }

        if (!hasRenderableSize) {
            return;
        }

        // サイズ変更のみの場合は再初期化（メディアは同じ）
        if (sizeChanged && currentCommentData) {
            console.log(`[NicoNicoPlugin] Resize detected (${canvas.width}x${canvas.height}). Re-initializing.`);
            currentNiconiComments = createNiconiComments(canvas, currentCommentData);
            lastInitializedWidth = canvas.width;
            lastInitializedHeight = canvas.height;
            return;
        }

        // コメントが準備できていない場合はクリアして待機
        if (!currentNiconiComments || isLoading) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // 描画実行
        if (currentNiconiComments) {
            // キャンバスサイズが変わっている可能性があるため、ライブラリの状態と同期
            // (niconicommentsは描画時にcanvasのサイズを参照するため、基本はそのままで良い)
            const vpos = Math.floor(context.currentTime * 100);
            currentNiconiComments.drawCanvas(vpos);
        }
    };

    // オーバーレイAPIに登録
    window.ObscuraAPI.registerPlayerOverlay(NICO_PROVIDER_ID, renderOverlay);

    // プラグインの登録
    window.ObscuraAPI.registerCommentProvider({
        id: NICO_PROVIDER_ID,
        name: NICO_PROVIDER_NAME,
        canHandle: isNicoUrl,
        fetchComments: fetchComments,
        uiHooks: {
            // 上部バーにコメント表示トグルボタンを配置
            playerTopBar: (_media) => [{
                id: 'toggle-danmaku',
                label: isOverlayVisible ? 'コメントオーバーレイを非表示' : 'コメントオーバーレイを表示',
                isActive: isOverlayVisible,
                icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>',
                onClick: () => {
                    isOverlayVisible = !isOverlayVisible;
                    try {
                        localStorage.setItem('player_show_danmaku', String(isOverlayVisible));
                    } catch (e) { }
                    // React側に再描画を促す
                    window.dispatchEvent(new Event('plugin-registered'));
                }
            }]
        }
    });

})();
