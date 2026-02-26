/**
 * Obscura API Reference Data
 * Extracted from SettingsModal.tsx
 */

const JS_API_REFERENCE = [
    {
        name: 'window.ObscuraAPI.registerPlugin',
        description: '外部リソースからのデータ取得や、インスペクタ・プレイヤーへのUI拡張（ボタン等）を統合するプラグインを登録します。',
        example: `window.ObscuraAPI.registerPlugin({
  id: 'my-plugin',
  name: 'My Plugin',
  // リソース（URL等）をこのプラグインで扱えるか判定
  canHandle: (resource) => resource.includes('example.com'),
  // データの動的取得ロジック（コメントやメタデータなど）
  fetchData: async (mediaId, resource) => {
    const data = await ObscuraAPI.system.fetch('...');
    return data;
  },
  // UIの拡張フック
  uiHooks: {
    // インスペクタ（詳細パネル）にボタンを追加
    inspectorActions: (media) => [
      { id: 'btn1', label: 'カスタムアクション', onClick: () => console.log('Clicked!') }
    ],
    // プレイヤー上部バーにボタンを追加
    playerTopBar: (media) => [
      { id: 'btn2', label: 'Playerボタン', icon: '<svg>...</svg>', onClick: () => alert('Player!') }
    ]
  }
});`
    },
    {
        name: 'window.ObscuraAPI.unregisterPlugin',
        description: '登録済みのプラグインを解除します。',
        example: `window.ObscuraAPI.unregisterPlugin('my-plugin');`
    },
    {
        name: 'window.ObscuraAPI.getPlugins',
        description: '現在登録されているすべてのプラグインのリストを取得します。',
        example: `const plugins = window.ObscuraAPI.getPlugins();`
    },
    {
        name: 'window.ObscuraAPI.registerPlayerOverlay',
        description: 'プレイヤー上にCanvas描画を行うオーバーレイを登録します。毎フレーム実行されます。',
        example: `window.ObscuraAPI.registerPlayerOverlay('my-overlay', (canvas, media, context) => {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'red';
  ctx.fillRect(10, 10, 100, 100);
});`
    },
    {
        name: 'window.ObscuraAPI.unregisterPlayerOverlay',
        description: '登録済みのプレイヤーオーバーレイを解除します。',
        example: `window.ObscuraAPI.unregisterPlayerOverlay('my-overlay');`
    },
    {
        name: 'ObscuraAPI.media',
        description: 'メディアアイテムの取得、選択状態、更新、タグ操作、インポートなどを行います。',
        example: `// 特定のメディア取得
const media = await ObscuraAPI.media.get(123);

// 選択中のアイテム取得
const selected = await ObscuraAPI.media.getSelected();
const selection = await ObscuraAPI.media.getSelection(); // 複数選択されているすべてのアイテムを配列で取得

// メタデータ更新
await ObscuraAPI.media.update(media.id, {
  title: 'New Title',
  description: 'New Description',
  rating: 5,
  artist: 'New Artist'
});

// タグ操作
await ObscuraAPI.media.addTag(media.id, tagId);
await ObscuraAPI.media.removeTag(media.id, tagId);

// ファイルのインポート
await ObscuraAPI.media.import(['C:/path/to/file.mp4']);`
    },
    {
        name: 'ObscuraAPI.ui',
        description: '通知、メッセージボックスの表示、クリップボード操作などを行います。',
        example: `// 通知を表示
ObscuraAPI.ui.showNotification({ title: '完了', message: '処理が終わりました' });

// メッセージボックスを表示
const result = await ObscuraAPI.ui.showMessageBox({
  title: '確認',
  message: '実行しますか？',
  buttons: ['はい', 'いいえ'],
  type: 'question'
});

// クリップボードにコピー
await ObscuraAPI.ui.copyToClipboard('text to copy');`
    },
    {
        name: 'ObscuraAPI.system',
        description: '外部データの取得 (CORS回避用) や、プラグイン固有データの保存/読み込み、ファイル操作を行います。',
        example: `// 外部データの取得
const data = await window.ObscuraAPI.system.fetch('https://api.example.com/data');

// プラグイン固有データの保存/読み込み (拡張情報フォルダ)
await window.ObscuraAPI.system.saveMediaData(mediaId, 'my-plugin', { key: 'value' });
const saved = await window.ObscuraAPI.system.loadMediaData(mediaId, 'my-plugin');

// 関連データファイルの直接保存/読み込み (動画ファイルと同じ場所に .comments.json などを保持する)
await window.ObscuraAPI.system.saveAssociatedData(media.file_path, { ... });
const data = await window.ObscuraAPI.system.loadAssociatedData(media.file_path);

// プラグイン設定などの永続化ストレージ
await ObscuraAPI.system.storage.set('my_setting', true);
const mySetting = await ObscuraAPI.system.storage.get('my_setting');

// ファイル/URL を開く
await ObscuraAPI.system.openPath('C:/path/to/folder');
await ObscuraAPI.system.openExternal('https://example.com');`
    },
    {
        name: 'ObscuraAPI.on',
        description: 'アプリ内で発生するイベント（ライブラリ更新など）を購読します。',
        example: `// ライブラリ更新イベントを購読
ObscuraAPI.on('library-updated', () => {
  console.log('Library was updated!');
});`
    }
];

const API_ENDPOINTS = [
    {
        method: 'GET',
        path: '/api/health',
        label: 'ヘルスチェック',
        description: 'サーバーの稼働状況を確認します。認証不要です。',
        permission: 'none',
        params: []
    },
    {
        method: 'GET',
        path: '/api/media',
        label: 'メディア一覧',
        description: 'ライブラリ内のメディアアイテムを検索・取得します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'page', type: 'number', desc: 'ページ番号 (デフォルト: 1)', required: false },
            { name: 'limit', type: 'number', desc: '1ページあたりのアイテム数 (デフォルト: 50)', required: false },
            { name: 'search', type: 'string', desc: 'キーワード検索', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/media/:id',
        label: 'メディア詳細',
        description: '特定のメディアアイテムの詳細情報を取得します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
        ]
    },
    {
        method: 'GET',
        path: '/api/media/:id/duplicates',
        label: '重複検出',
        description: '指定したメディアの重複候補を取得します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true }
        ]
    },
    {
        method: 'POST',
        path: '/api/media/:id/comments',
        label: 'コメント追加',
        description: 'メディアにコメントを追加します。',
        permission: 'READ_ONLY',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'text', type: 'string', desc: 'コメント本文', required: true },
            { name: 'time', type: 'number', desc: 'タイムスタンプ（動画の再生位置）', required: false },
        ]
    },
    {
        method: 'POST',
        path: '/api/media/:id/folders',
        label: 'フォルダー追加',
        description: 'メディアにフォルダーを追加します。',
        permission: 'EDIT',
        params: [
            { name: 'folderId', type: 'number', desc: '追加するフォルダーのID' }
        ]
    },
    {
        method: 'PUT',
        path: '/api/media/:id',
        label: 'メディア情報更新',
        description: 'メディアのメタデータ（評価、アーティスト、説明、ファイル名）を更新します。',
        permission: 'EDIT',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'rating', type: 'number', desc: '評価 (0-5)', required: false },
            { name: 'artist', type: 'string', desc: 'アーティスト名', required: false },
            { name: 'description', type: 'string', desc: '説明文', required: false },
            { name: 'fileName', type: 'string', desc: 'ファイル名', required: false },
        ]
    },
    {
        method: 'DELETE',
        path: '/api/media/:id',
        label: 'メディア削除',
        description: 'メディアをゴミ箱に移動します。permanent=trueで完全削除（FULL権限が必要）。',
        permission: 'EDIT',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'permanent', type: 'boolean', desc: '完全削除フラグ (FULL権限必要)', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/tags',
        label: 'タグ一覧',
        description: '登録されているすべてのタグのリストを取得します。',
        permission: 'READ_ONLY',
        params: []
    },
    {
        method: 'GET',
        path: '/api/tag-groups',
        label: 'タググループ一覧',
        description: '登録されているすべてのタググループのリストを取得します。',
        permission: 'READ_ONLY',
        params: []
    },
    {
        method: 'GET',
        path: '/api/folders',
        label: 'フォルダー一覧',
        description: '登録されているすべてのフォルダーのリストを取得します。',
        permission: 'READ_ONLY',
        params: []
    },
    {
        method: 'POST',
        path: '/api/tags',
        label: 'タグ作成',
        description: '新しいタグを作成します。',
        permission: 'EDIT',
        params: [
            { name: 'name', type: 'string', desc: 'タグ名', required: true }
        ]
    },
    {
        method: 'DELETE',
        path: '/api/tags/:id',
        label: 'タグ削除',
        description: 'タグを削除します。',
        permission: 'EDIT',
        params: [
            { name: 'id', type: 'number', desc: 'タグID', required: true }
        ]
    },
    {
        method: 'POST',
        path: '/api/tags/media',
        label: 'メディアにタグ追加',
        description: 'メディアにタグを追加します。単体または一括追加が可能です。',
        permission: 'EDIT',
        params: [
            { name: 'mediaId', type: 'number', desc: 'メディアID（単体）', required: false },
            { name: 'tagId', type: 'number', desc: 'タグID（単体）', required: false },
            { name: 'mediaIds', type: 'number[]', desc: 'メディアIDの配列（一括）', required: false },
            { name: 'tagIds', type: 'number[]', desc: 'タグIDの配列（一括）', required: false },
        ]
    },
    {
        method: 'DELETE',
        path: '/api/tags/media',
        label: 'メディアからタグ削除',
        description: 'メディアからタグを削除します。クエリパラメータまたはボディで指定可能です。',
        permission: 'EDIT',
        params: [
            { name: 'mediaId', type: 'number', desc: 'メディアID', required: true },
            { name: 'tagId', type: 'number', desc: 'タグID', required: true },
        ]
    },
    {
        method: 'GET',
        path: '/api/thumbnails/:id',
        label: 'サムネイル',
        description: '特定のメディアアイテムのサムネイル画像を取得します。',
        permission: 'any',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'width', type: 'number', desc: '幅（ピクセル）', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/stream/:id',
        label: 'ストリーミング',
        description: '特定のメディアアイテムをストリーミングします。Range requestsをサポートします。',
        permission: 'any',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
            { name: 'accessToken', type: 'string', desc: 'アクセストークン (クエリ認証)', required: false },
            { name: 'userToken', type: 'string', desc: 'ユーザートークン (クエリ認証)', required: false },
        ]
    },
    {
        method: 'GET',
        path: '/api/download/:id',
        label: 'ダウンロード',
        description: 'メディアファイルをダウンロードします。',
        permission: 'DOWNLOAD',
        params: [
            { name: 'id', type: 'number', desc: 'メディアID', required: true },
        ]
    },
    {
        method: 'POST',
        path: '/api/upload',
        label: 'アップロード',
        description: 'メディアファイルをアップロードします。Multi-part form dataを使用してください。',
        permission: 'UPLOAD',
        params: [
            { name: 'files', type: 'file[]', desc: 'アップロードするファイル（複数可）', required: true }
        ]
    },
    {
        method: 'GET',
        path: '/api/profile',
        label: 'プロフィール取得',
        description: '現在のユーザーのプロフィール情報を取得します。',
        permission: 'any',
        params: []
    },
    {
        method: 'PUT',
        path: '/api/profile',
        label: 'プロフィール更新',
        description: 'ユーザーのニックネームやアイコンを更新します。',
        permission: 'any',
        params: [
            { name: 'nickname', type: 'string', desc: 'ニックネーム', required: false },
            { name: 'iconUrl', type: 'string', desc: 'アイコンURL', required: false },
        ]
    },
];

window.OBSCURA_API_DATA = {
    jsApi: JS_API_REFERENCE,
    restApi: API_ENDPOINTS
};
