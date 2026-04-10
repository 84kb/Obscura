export type ReleaseNotesLanguage = "ja" | "en";
export type BundledReleaseNotesHistoryEntry = {
    version: string;
    releaseNotes: string;
};

type ReleaseNotesEntry = {
    ja: string;
    en: string;
};

const RELEASE_NOTES: Record<string, ReleaseNotesEntry> = {
    "0.8.19": {
        ja: [
            "[修正] tauri:dev で保存したフィルタープリセットをビルド版でも読み込めるようにし、プリセット保存先を共通設定へ統一しました。",
            "[修正] インポート時に `dominant_color` が空白で保存される不具合を修正しました。",
            "[修正] メタデータ更新時に既存の `dominant_color` が空白で上書きされる不具合を修正しました。",
            "[新規] プラグイン向けにサイドバー項目・サイドバーセクション・ヘッダーボタン・インスペクター拡張セクションの正式 API を追加しました。",
            "[新規] プラグイン向けにインポート前後フックと media・tags・folders・libraries・client config へアクセスできる API を追加しました。",
            "[新規] 新しい拡張 API の動作確認用として Extensibility Demo プラグインを追加しました。",
            "[新規] プラグインがメイン画面として独自ビューを開ける main view API を追加しました。",
            "[修正] sidecar 応答待ちでアクティブライブラリ解決が止まると起動時のデータ読み込みが 0% のまま進まなくなる不具合を修正しました。",
            "[変更] 起動時にアクティブライブラリ取得や設定読み込みが一定時間でタイムアウトした場合は保存済み設定から復元して起動を継続するように変更しました。",
            "[変更] 起動時の読み込みが長時間進まない場合はデータ読み込みオーバーレイを自動解除してアプリ操作を継続できるフェイルセーフを追加しました。",
            "[変更] ビルド版でもプラグイン一覧を安定して見つけられるように、同梱プラグインをランタイム用ディレクトリへ同期するよう改善しました。",
            "[変更] 起動直後のフリーズを避けるため、プラグインスクリプトの自動実行をアプリ起動時には行わない構成へ見直しました。",
            "[変更] 起動時に自動読み込みされるプラグインも、設定画面の拡張機能タブにあるオンオフで制御されるようにしました。",
            "[変更] 起動時に有効なプラグインをすべて最初から読み込むように変更しました。",
            "[修正] サイドバー上のプラグイン項目だけがブラウザ既定の button 見た目になっていたため、通常のサイドバー項目と同じ描画へ揃えて文字サイズや余白や色がずれる不具合を修正しました。",
            "[修正] プラグインのメイン画面を開いている間も標準サイドバー項目がアクティブ表示のまま残る不具合を修正しました。",
            "[変更] 同梱プラグインのバージョンが更新された場合はランタイム用プラグインへ同期するように変更しました。",
        ].join("\n"),
        en: [
            "[Fix] Filter presets saved in tauri:dev now persist through the shared client config so build releases can load them as well.",
            "[Fix] Fixed an issue where `dominant_color` could be saved as blank during import.",
            "[Fix] Fixed an issue where metadata refresh could overwrite an existing `dominant_color` with a blank value.",
            "[New] Added first-class plugin APIs for sidebar items, sidebar sections, header buttons, and inspector extension sections.",
            "[New] Added plugin import hooks plus API access for media, tags, folders, libraries, and client config.",
            "[New] Added an Extensibility Demo plugin that exercises the new extension APIs.",
            "[New] Added a main view API so plugins can open their own full-page screens inside the app.",
            "[Fix] Fixed an issue where startup could remain stuck at 0% if active library resolution waited indefinitely for the sidecar.",
            "[Change] Changed startup to fall back to the saved client config when active library lookup or config loading times out.",
            "[Change] Added a fail-safe that automatically dismisses the startup loading overlay if startup does not progress for an extended period.",
            "[Change] Improved plugin discovery in packaged builds by syncing bundled plugins into the runtime plugin directory.",
            "[Change] Stopped auto-running plugin scripts during app startup to avoid freezes shortly after launch.",
            "[Change] Startup-loaded plugins are now controlled by the enable toggles in the Extensions settings tab.",
            "[Change] Startup now loads all enabled plugins from the beginning.",
            "[Fix] Changed sidebar plugin items to render with the same base styling as native sidebar items, fixing mismatched font size, spacing, and colors.",
            "[Fix] Fixed an issue where native sidebar tabs could remain highlighted while a plugin main view was open.",
            "[Change] Bundled plugins are now synced into the runtime plugin directory when their bundled version changes.",
        ].join("\n"),
    },
    "0.8.18": {
        ja: [
            "[修正] WASAPI モードで音量ボタンのミュート切り替えが正しく反映されない不具合を修正しました。",
            "[変更] インスペクターのURL入力フォントを游ゴシック系に見直しました。",
            "[修正] Discord の表示がライブラリ画面へ戻る際に一瞬リセットされてしまう不具合を改善しました。",
            "[修正] ライブラリ画面での Discord 表示が Paused のまま残ることがある不具合を改善しました。",
            "[修正] Discord リッチプレゼンスの接続が不安定になることがある不具合を改善しました。",
            "[修正] 既存ファイルの追加日が起動後に本日扱いになることがある不具合を修正しました。",
            "[修正] 再起動直後に大規模ライブラリの読み込みが 30% 付近で止まりやすい問題を改善しました。",
            "[修正] 起動後のライブラリ復元を改善しました。",
            "[修正] 一部ライブラリで重い走査経路に入り読み込みに失敗しやすい不具合を改善しました。",
            "[修正] Tauri 開発環境で再起動後に 5% 付近で止まりやすい不具合を改善しました。",
            "[変更] 未完成の Android 関連項目は GitHub の公開リリース対象外であることを明確にしました。",
            "[変更] Android のローカルビルド成果物と同梱 JDK ファイル向けの ignore ルールを更新しました。",
            "[新規] ローカル用の tasks メモと AGENTS 指示ファイルを ignore 対象に追加しました。",
            "[新規] 設定画面のアプリ更新確認ボタンの横にリリースノート表示ボタンを追加しました。",
            "[変更] 更新後UIを再利用して、更新履歴をいつでも確認できるようにしました。",
            "[新規] D&D インポートを移動扱いにできる設定を追加しました。",
            "[修正] D&D で追加したファイルの追加日ソートを修正しました。",
            "[変更] サムネイルの読み込みをより段階的に行うよう改善しました。",
            "[変更] タグ管理UIと件数表示を調整しました。",
            "[新規] サブフォルダー表示で子孫フォルダーまで含められるようにしました。",
            "[修正] アップデーターのインストーラー起動動作を改善しました。",
            "[変更] タブごと・フォルダーごとにスクロール位置を保持するようにしました。",
        ].join("\n"),
        en: [
            "[Fix] Fixed an issue where the mute button volume toggle did not apply in WASAPI mode.",
            "[Change] Updated the inspector URL input to use the Yu Gothic font stack.",
            "[Fix] Improved an issue where Discord activity could reset briefly when returning to the library screen.",
            "[Fix] Improved an issue where Discord could remain on Paused while browsing the library.",
            "[Fix] Improved a Discord Rich Presence issue that could leave the RPC connection in an unstable state.",
            "[Fix] Fixed an issue where some existing files could occasionally show today as their added date after startup.",
            "[Fix] Improved a startup issue where very large libraries could appear to stall around 30% after a device restart.",
            "[Fix] Improved library restoration after launch.",
            "[Fix] Reduced a heavy library scan path that could make some libraries fail to load.",
            "[Fix] Prevented Tauri dev startup from stalling at 5% after a device restart.",
            "[Change] Clarified that unfinished Android-related items are not part of the public GitHub release scope.",
            "[Change] Updated ignore rules for Android local build artifacts and bundled JDK files.",
            "[New] Added local task notes and AGENTS instructions to the ignore list.",
            "[New] Added a subtle release notes button next to the application update check button in Settings.",
            "[Change] Reused the post-update UI so bundled update history can also be viewed on demand.",
            "[New] Added an option to treat drag-and-drop imports as move operations.",
            "[Fix] Fixed import-date sorting for files added via drag and drop.",
            "[Change] Improved thumbnail loading to happen progressively.",
            "[Change] Refined the tag manager UI and count display.",
            "[New] Subfolder content display can now include nested descendants.",
            "[Fix] Improved installer launch behavior in the updater.",
            "[Change] Scroll position is now preserved per tab and per folder.",
        ].join("\n"),
    },
};

const normalizeVersion = (input: string): string => {
    const raw = String(input || "").trim();
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : raw;
};

const compareVersionsDesc = (left: string, right: string): number => {
    const leftParts = normalizeVersion(left)
        .split(".")
        .map((part) => Number(part) || 0);
    const rightParts = normalizeVersion(right)
        .split(".")
        .map((part) => Number(part) || 0);

    for (let i = 0; i < 3; i += 1) {
        const delta = (rightParts[i] || 0) - (leftParts[i] || 0);
        if (delta !== 0) return delta;
    }

    return 0;
};

export const getBundledReleaseNotes = (
    version: string,
    language: ReleaseNotesLanguage,
): string => {
    const normalizedVersion = normalizeVersion(version);
    const entry = RELEASE_NOTES[normalizedVersion];
    if (!entry) return "";
    return language === "en" ? entry.en : entry.ja;
};

export const getBundledReleaseNotesHistory = (
    language: ReleaseNotesLanguage,
): BundledReleaseNotesHistoryEntry[] => {
    return Object.keys(RELEASE_NOTES)
        .sort(compareVersionsDesc)
        .map((version) => ({
            version,
            releaseNotes: getBundledReleaseNotes(version, language).trim(),
        }))
        .filter((entry) => entry.releaseNotes.length > 0);
};
