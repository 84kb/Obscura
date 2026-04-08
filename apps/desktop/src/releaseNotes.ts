export type ReleaseNotesLanguage = 'ja' | 'en'
export type BundledReleaseNotesHistoryEntry = {
    version: string
    releaseNotes: string
}

type ReleaseNotesEntry = {
    ja: string
    en: string
}

const RELEASE_NOTES: Record<string, ReleaseNotesEntry> = {
    '0.8.17': {
        ja: [
            '[修正] WASAPI モードで音量ボタンのミュートが反映されない問題を修正しました。',
            '[変更] インスペクタのURL入力欄のフォントを游ゴシック系に揃えました。',
            '[修正] Discord の表示がライブラリ画面へ戻る際に一度リセットされて不自然になる問題を改善しました。',
            '[修正] ライブラリ画面でも Discord の表示が Paused のまま残ることがある問題を改善しました。',
            '[修正] Discord リッチプレゼンスの接続が不安定になることがある問題を改善しました。',
            '[修正] 稀に既存ファイルの追加日が起動後に当日へ変わってしまう問題を改善しました。',
            '[修正] 再起動直後に大規模ライブラリの読み込みが30%付近で止まりやすい問題を改善しました。',
            '[修正] 起動後のライブラリ復元を改善しました。',
            '[修正] ライブラリ読込時に重い走査経路へ落ちて失敗しやすい問題を改善しました。',
            '[修正] Tauri 開発環境でデバイス再起動後に 5% で止まりやすい問題を改善しました。',
            '[変更] 未完了の Android 関連項目は GitHub の公開リリース対象外であることを明確にしました。',
            '[変更] Android のローカルビルド成果物と同梱 JDK ファイル向けの ignore ルールを更新しました。',
            '[新規] ローカル用の tasks メモと AGENTS 指示ファイルを ignore 対象に追加しました。',
            '[新規] 設定画面のアプリアップデート確認ボタンの横に、変更履歴を確認できるボタンを追加しました。',
            '[変更] 更新後に表示していた UI を流用し、変更履歴を任意のタイミングでも確認できるようにしました。',
            '[新規] D&D インポートを移動扱いにできる設定を追加しました。',
            '[修正] D&D で追加したファイルの追加日ソートを修正しました。',
            '[変更] サムネイルの読み込みをより段階的に行うよう改善しました。',
            '[変更] タグ管理 UI と件数表示を調整しました。',
            '[新規] サブフォルダー表示で子孫フォルダーまで含められるようにしました。',
            '[修正] アップデーターのインストーラー起動挙動を改善しました。',
            '[変更] タブごと・フォルダーごとにスクロール位置を保持するようにしました。',
        ].join('\n'),
        en: [
            '[Fix] Fixed an issue where the mute button volume toggle did not apply in WASAPI mode.',
            '[Change] Updated the inspector URL input to use the Yu Gothic font stack.',
            '[Fix] Improved an issue where Discord activity could reset briefly when returning to the library screen.',
            '[Fix] Improved an issue where Discord could remain on Paused while browsing the library.',
            '[Fix] Improved a Discord Rich Presence issue that could leave the RPC connection in an unstable state.',
            '[Fix] Fixed an issue where some existing files could occasionally show today as their added date after startup.',
            '[Fix] Improved a startup issue where very large libraries could appear to stall around 30% after a device restart.',
            '[Fix] Improved library restoration after launch.',
            '[Fix] Reduced a heavy library scan path that could make some libraries fail to load.',
            '[Fix] Prevented Tauri dev startup from stalling at 5% after a device restart.',
            '[Change] Clarified that unfinished Android-related items are not part of the public GitHub release scope.',
            '[Change] Updated ignore rules for Android local build artifacts and bundled JDK files.',
            '[New] Added local task notes and AGENTS instructions to the ignore list.',
            '[New] Added a subtle release notes button next to the application update check button in Settings.',
            '[Change] Reused the post-update UI so bundled update history can also be viewed on demand.',
            '[New] Added an option to treat drag-and-drop imports as move operations.',
            '[Fix] Fixed import-date sorting for files added via drag and drop.',
            '[Change] Improved thumbnail loading to happen progressively.',
            '[Change] Refined the tag manager UI and count display.',
            '[New] Subfolder content display can now include nested descendants.',
            '[Fix] Improved installer launch behavior in the updater.',
            '[Change] Scroll position is now preserved per tab and per folder.',
        ].join('\n'),
    },
}

const normalizeVersion = (input: string): string => {
    const raw = String(input || '').trim()
    const match = raw.match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : raw
}

const compareVersionsDesc = (left: string, right: string): number => {
    const leftParts = normalizeVersion(left).split('.').map((part) => Number(part) || 0)
    const rightParts = normalizeVersion(right).split('.').map((part) => Number(part) || 0)

    for (let i = 0; i < 3; i += 1) {
        const delta = (rightParts[i] || 0) - (leftParts[i] || 0)
        if (delta !== 0) return delta
    }

    return 0
}

export const getBundledReleaseNotes = (version: string, language: ReleaseNotesLanguage): string => {
    const normalizedVersion = normalizeVersion(version)
    const entry = RELEASE_NOTES[normalizedVersion]
    if (!entry) return ''
    return language === 'en' ? entry.en : entry.ja
}

export const getBundledReleaseNotesHistory = (
    language: ReleaseNotesLanguage,
): BundledReleaseNotesHistoryEntry[] => {
    return Object.keys(RELEASE_NOTES)
        .sort(compareVersionsDesc)
        .map((version) => ({
            version,
            releaseNotes: getBundledReleaseNotes(version, language).trim(),
        }))
        .filter((entry) => entry.releaseNotes.length > 0)
}
