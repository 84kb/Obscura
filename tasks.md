# Obscura Tauri移行 タスク引き継ぎメモ（完全版）

最終更新: 2026-03-02
作業場所: `E:\Projects\Obscura`

## 1. 目的
- Electron依存を段階的に削減し、最終的にTauriベースで同等機能を提供する。
- 既存UI/既存APIシグネチャを壊さずに `window.electronAPI` 互換を維持したまま移行する。
- 現フェーズでは「機能パリティ達成」を最優先とし、設計改善は後段で実施する。

## 2. 現在地（2026-03-02時点）
### 完了
- Tauri側ブリッジの不足APIを追加（主にリモート操作系）。
- Sidecar（`scripts/tauri-sidecar.cjs`）にリモート向けRPCメソッドを追加。
- 型チェックと構文チェックに成功。
  - `npx tsc -p tsconfig.json`
  - `node --check scripts/tauri-sidecar.cjs`

### 追加済みAPI（主なもの）
- リモート媒体操作:
  - `renameRemoteMedia`
  - `deleteRemoteMedia`
  - `updateRemoteMedia`
- リモートタグ操作:
  - `createRemoteTag`
  - `deleteRemoteTag`
  - `addRemoteTagToMedia`
  - `addRemoteTagsToMedia`
  - `removeRemoteTagFromMedia`
- リモート親子関係:
  - `addRemoteMediaParent`
  - `removeRemoteMediaParent`
- リモート補助:
  - `updateRemoteProfile`
  - `uploadRemoteMedia`
  - `downloadRemoteMedia`
- UI互換補助:
  - `selectDownloadDirectory`
  - `showMessageBox`
  - `updateMedia`（plugin経由更新の互換）

## 3. 作業対象ファイル
- `apps/desktop/src/utils/tauriElectronBridge.ts`
- `scripts/tauri-sidecar.cjs`
- 必要に応じて `src-tauri` 配下（Rust command/event）

## 4. 未完了タスク（優先度順）

### P0: ローカル機能APIのParity達成
1. `copyMediaToLibrary`
2. `exportMedia`
3. `backfillMetadata`
4. `addMediaParent`
5. `removeMediaParent`

実装方針:
- 既存Electronと同名・同引数・同戻り値の契約を維持。
- UI側呼び出しの変更を不要化する。
- Sidecar失敗時のエラー型を既存想定に揃える。

完了条件:
- 上記5 APIが `window.electronAPI` から呼び出し可能。
- 主要フローで実行エラーが出ない。
- 既存データ破壊を伴う回帰がない。

### P1: イベント系API（`on*`）の本実装
1. `onUpdateStatus`
2. `onRefreshProgress`
3. `onTriggerFrameCapture`
4. `onFFmpegUpdateProgress`

実装方針:
- 暫定no-opを廃止し、Tauri event（`emit`/`listen`）へ置換。
- unsubscribe関数の返却契約を明示し、リークを防止。
- イベント名は定数化し、ブリッジと送信側の不一致を防ぐ。

完了条件:
- UI購読ハンドラが想定タイミングで起動。
- 二重購読/解除漏れが発生しない。
- 進捗イベント（FFmpeg含む）が視認できる。

### P2: 暫定実装の本実装化
1. Updater
   - `check_for_updates`
   - `download_update`
   - `quit_and_install`
2. FFmpeg
   - `ffmpeg_check_update`
   - `ffmpeg_update`
3. Audio（Windows依存含む）
   - `getAudioDevices`
   - `setAudioDevice`
   - `setExclusiveMode`

実装方針:
- Updaterは `plugin-updater` か配布基盤依存実装のどちらかを確定して統一。
- FFmpeg更新判定は「公式配布」または「社内配布」の基準を先に確定。
- AudioはRust側command追加を含む設計で、Electron相当のデバイス制御要件を満たす。

完了条件:
- 暫定応答がなくなり、実処理で更新/切替が可能。
- エラーハンドリングとUI通知が一貫。

## 5. 実行計画（次回セッション手順）
1. 作業前確認
   - `cd E:\Projects\Obscura`
   - `git status --short`
2. 差分把握
   - `rg -n "electronAPI|tauriElectronBridge|sidecar_request|onUpdateStatus|onRefreshProgress|onTriggerFrameCapture|onFFmpegUpdateProgress" apps/desktop/src scripts src-tauri`
3. P0実装
   - API追加 → 型整合 → 例外整備
4. P1実装
   - event配線 → listen/unlisten確認
5. P0/P1検証
   - `npx tsc -p tsconfig.json`
   - `node --check scripts/tauri-sidecar.cjs`
   - 必要に応じてアプリ実行でイベント動作確認
6. P2着手判断
   - 要件未確定なら設計メモを残して次回へ繰越

## 6. 検証チェックリスト
- 型チェックが通る（`tsc` 成功）。
- Sidecarの構文エラーがない（`node --check` 成功）。
- `window.electronAPI` の既存呼び出し箇所を改修せず実行できる。
- Promiseのreject内容が既存UI想定と乖離しない。
- イベント購読解除後にコールバックが発火しない。

## 7. リスクと対策
- リスク: APIシグネチャの微差でUIが静かに壊れる。
  - 対策: 戻り値/例外をElectron互換で固定し、差分レビュー時に契約を確認。
- リスク: イベントの解除漏れでメモリリーク/重複発火。
  - 対策: `on*` APIは必ずunsubscribeを返し、画面破棄時解除を徹底。
- リスク: Updater/FFmpeg配布仕様未確定で実装が手戻り。
  - 対策: P2開始前に仕様合意を必須ゲート化。

## 8. 受け入れ条件（この計画が「完了」と言える状態）
- P0とP1が完了し、主要機能でTauri版がElectron版と同等操作できる。
- 既存UIコードの `window.electronAPI` 呼び出しに破壊的変更が不要。
- 既知の暫定実装（P2）が一覧化され、各項目に次アクションが定義済み。

## 9. 次回着手優先順（短縮版）
1. P0 API 5件をsidecar経由で実装完了。
2. P1 event API 4件をTauri eventへ置換。
3. チェックコマンド2件を通し、動作確認ログを残す。
4. P2は仕様確定後に本実装着手。

## 10. Electron完全撤去ロードマップ（2026-03-02追記）
目的:
- `window.electronAPI` 互換レイヤーを残しつつ、実体の Electron 依存コードを段階的にゼロ化し、最終的に Electron ビルド/実行経路を削除する。

### Phase A: Renderer依存の集約（着手済み）
タスク:
1. [x] `apps/desktop/src` の直接 `window.electronAPI` 参照を「adapter / mock / bridge」以外から排除する。
2. [x] plugin-system を `api` 抽象経由に統一する。
3. [x] API不足メソッドは `IMediaLibraryAPI` に追加して adapter に実装する。

完了条件:
- `rg -n "window\\.electronAPI" apps/desktop/src` で、実装層（adapter/mock/bridge）以外が 0 件。
- `npx tsc -p tsconfig.json` 成功。

### Phase B: Electronランタイムコードの停止（着手済み）
タスク:
1. [x] npm scripts の既定起動を Tauri のみに固定（Electron dev/build を非推奨化）。
2. [x] Electron専用エントリ（`apps/desktop/electron/main.ts`, `preload.cjs`）を既定ビルド経路から外す。
3. CI/CD の成果物を Tauri に一本化する。

完了条件:
- Electron向け起動/配布ジョブがデフォルトで実行されない。
- Tauri dev/build のみでアプリ運用可能。

### Phase C: 型とAPI名称の脱Electron化
タスク:
1. [x] `window.electronAPI` の公開名を段階的に `window.obscuraAPI` へ移行（互換 alias を一定期間維持）。
2. [x] `ElectronAdapter` 命名を `DesktopAdapter` へ置換。
3. `packages/core` の公開型から Electron 前提語彙を削除。

完了条件:
- 新規コードで `electron` 命名を使用しない。
- 互換 alias 解除後も既存機能が回帰しない。

### Phase D: Electronコード削除
タスク:
1. [x] `apps/desktop/electron/` 一式を削除。
2. [x] Electron依存 package を `package.json` から削除（Tauri運用で不要な主要依存）。
3. ドキュメント/運用手順を Tauri 前提に更新。

完了条件:
- リポジトリ内に Electron 実行コードが存在しない。
- `npm ls` で Electron関連主要依存が解消されている。

## 11. 進捗ログ（完全移行トラック）
- 2026-03-02:
  - Phase A を開始。
  - `plugin-system.ts` の `window.electronAPI` 直接参照を `api` 抽象経由へ移行。
  - `IMediaLibraryAPI` に plugin/runtime 用メソッドを追加:
    - `showNotification`, `showMessageBox`, `updateMedia`, `getSelectedMedia`
    - `pluginFetch`, `savePluginMediaData`, `loadPluginMediaData`
    - `saveAssociatedData`, `loadAssociatedData`
  - `electron-adapter.ts` / `android-adapter.ts` に実装追加。
  - `package.json` の既定スクリプトを Tauri 優先へ変更:
    - `dev -> tauri:dev`
    - `build -> tauri:build`
    - 既存 Web 起動は `dev:web` に分離
  - `vite.config.ts` から `vite-plugin-electron` を除去し、Webビルドを通常Vite構成へ変更。
  - `electron:dev` / `electron:build` は非推奨エラースクリプトに変更（誤使用防止）。
  - `package.json` のアプリメタを Tauri 前提へ更新:
    - `main: dist-tauri/index.html`
    - keywords の `electron` を `tauri` へ置換
  - `tsconfig.json` の `include` から `apps/*/electron` を外し、通常型チェックを Tauri/renderer 対象に限定。
  - `window.obscuraAPI` エイリアスを導入し、bridge/mock/api判定を対応:
    - `tauriElectronBridge.ts` で `obscuraAPI` と `electronAPI` を同時注入
    - `mockElectronAPI.ts` で同様に同時注入
    - `api/index.ts` は `obscuraAPI` 優先でデスクトップ判定
    - `electron-adapter.ts` は `obscuraAPI` を優先参照
    - `packages/core` 型定義に `obscuraAPI` を追加
  - Adapter 命名更新:
    - `ElectronAdapter` -> `DesktopAdapter`（`api/index.ts` の使用箇所更新）
  - 主要 Electron 依存を削除:
    - `electron`, `electron-builder`, `vite-plugin-electron`, `vite-plugin-electron-renderer`
    - `electron-log`, `electron-updater`
  - `package-lock.json` を依存削除後の状態へ更新。
  - `apps/desktop/electron/` ディレクトリを削除。
  - ドキュメント/補助スクリプト更新:
    - `README.md`, `CONTRIBUTING.md` の起動手順を `tauri:dev` 基準へ変更
    - `scripts/update_imports.cjs` から Electron 走査を削除
    - `typescript-errors.txt`（Electron前提の古い記録）を削除
  - `package.json` から Electron専用 scripts / electron-builder 設定を削除。

## 12. 完了宣言（2026-03-03）
- Electron -> Tauri 移行を完了。
- 実行/ビルド経路での Electron 依存はゼロ。
  - `apps/desktop/electron/` は削除済み
  - npm scripts は Tauri 運用のみ
  - `electron` 系 npm 依存は削除済み
  - renderer 側の `window.electronAPI` 互換参照は撤去し `window.obscuraAPI` に統一
  - 型定義 `ElectronAPI` は `DesktopAPI` へ統一

最終確認コマンド:
- `npx tsc -p tsconfig.json`
- `npm run build:tauri:web`
- `node --check scripts/tauri-sidecar.cjs`
- `cargo check --no-default-features`
  - 検証成功:
    - `npx tsc -p tsconfig.json`
    - `node --check scripts/tauri-sidecar.cjs`
    - `cargo check --no-default-features`

## 13. 軽量化・安定化トラック（2026-03-03追記）
目的:
- 起動速度よりも、再生中・ライブラリ操作中の体感負荷を下げる。
- ページング不具合を再発させず、既存UI互換を維持したまま段階導入する。

### 実装済み
1. `tauriDesktopBridge.getMediaFiles` のページ引数を正しくsidecarへ転送。
   - 以前の「実質全件取得」経路を解消し、100件単位ロードを維持。
2. sidecar にローカル走査キャッシュを追加。
   - `refresh_library` 時に `media_cache.json` へ保存。
   - 同一ライブラリでの再走査を抑制し、`get_media_files` のI/O負荷を低減。
3. サムネイル生成の重複リクエスト抑制。
   - `generateThumbnail` の同一キー同時呼び出しをPromise共有で一本化。
4. オーディオデバイス一覧の正規化を強化。
   - 重複候補のdedupeキー改善。
   - 文字化けノイズの除去を追加。

### 次の段階（不具合回避優先）
1. `backfill_metadata` を完全バックグラウンドキュー化（進捗イベント付き）。
2. サムネイル先読みを「可視範囲+近傍」限定にし、再生中のCPU使用を抑制。
3. sidecarの重い同期処理（ffprobe/ffmpeg）を逐次キュー化して同時実行数を制御。

### 検証コマンド
- `npx tsc -p tsconfig.json`
- `npm run build:tauri:web`
- `node --check scripts/tauri-sidecar.cjs`
- `cargo check --no-default-features`

## 14. Round 1 レビュー補完（2026-03-05追記）
- Review会議の未解決チェックリスト（デザイン委任 1-4）の実行正本を以下に固定する。
  - `docs/ROUND1_REVIEW_SUPPLEMENT_DESIGN_QA_OPS_2026-03-05.md`
- デザイン成果物（`dominant_color` / `.library` / アプリ内モーダル仕様）は以下を正本とする。
  - `docs/ROUND_DESIGN_SUPPLEMENT_PLAN_2026-03-05.md`
  - `docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md`
  - `docs/templates/library_color_name_validation_20samples.csv`
- 受入判定は QA/運営の実測証跡（E2E + 回帰 + ゲート値）再提出後に最終化する。
