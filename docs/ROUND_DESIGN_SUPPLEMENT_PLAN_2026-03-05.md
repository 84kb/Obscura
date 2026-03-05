# Obscura Round 補完計画（デザインチーム）
更新日: 2026-03-05  
担当: デザインチーム Pixel

## 1. 目的
本ラウンドのCEO依頼のうち、デザイン担当範囲を即着手可能な実行計画に落とし込み、開発・QA・運営へそのまま引き渡せる状態にする。

## 2. 参照済みの先行成果物（Read-Only）
- 開発チーム成果ワークツリー: `E:\Projects\Obscura\.climpire-worktrees\259ad40f`
- 開発コミット: `181191e` (`Fix library validation, dominant color mapping, and context menu behavior`)
- 参照ファイル:
  - `apps/desktop/src/main.tsx`（右クリック抑止の実装方針）
  - `apps/desktop/src/utils/tauriDesktopBridge.ts`（`dominant_color` 正規化、`.library` 表示名整形、アプリ内メッセージボックス）
  - `scripts/tauri-sidecar.cjs`（ライブラリ存在確認、表示名整形）

## 3. 補完サブタスク（本チェックリスト 1）
### D-01: ライブラリカードの `dominant_color` 適用仕様を確定
- 仕様:
  - `metadata.json` の `dominant_color` / `dominantColor` が有効色値ならカード背景へ適用。
  - 値が欠損・無効時のみグレー（フォールバック）を適用。
  - グリッドカードとリスト行アイコンで同じ判定ルールを使う。
- 成果物:
  - 画面別適用仕様（一覧/詳細/プレースホルダ）を `ROUND_DESIGN_DELIVERABLE_2026-03-05.md` に記載。
  - 20件検証テンプレートを `docs/templates/library_color_name_validation_20samples.csv` として用意。

### D-02: `.library` 非表示ルールの全画面統一
- 仕様:
  - UI表示名は末尾 `.library`（大文字小文字問わず）を除去して表示。
  - 実パス値は保持し、表示上だけ整形する。
  - 一覧、ドロップダウン、監査ログ、設定画面など「ライブラリ名表示箇所」を対象に統一。
- 成果物:
  - 対象画面マトリクスと表示ルールを `ROUND_DESIGN_DELIVERABLE_2026-03-05.md` に記載。

### D-03: OSネイティブ置換用のアプリ内モーダル/ダイアログUIガイド作成
- 仕様:
  - `alert/confirm/prompt` とネイティブダイアログ呼び出しを、段階的にアプリ内モーダルへ置換。
  - 種別（Info / Confirm / Destructive / Input Prompt）ごとのレイアウト、文言、キーボード操作を定義。
- 成果物:
  - UI部品ガイド、A11y要件、優先移行箇所を `ROUND_DESIGN_DELIVERABLE_2026-03-05.md` に記載。

## 4. 完了条件（デザインチーム）
- `metadata.json` とUI表示の色一致率が20件サンプルで 100%。
- `.library` 非表示ルールが一覧/詳細/設定の全対象画面で一貫。
- OSネイティブ置換のためのアプリ内モーダル仕様が、開発とQAがそのままチケット化できる粒度で定義済み。

## 5. 連携依頼（次工程）
- 開発チーム: UI仕様に沿ってアプリ内ダイアログ共通コンポーネント化を実装。
- 品質管理チーム: 20件サンプル検証テンプレートで色一致と表示名整形を回帰確認。
- 運営チーム: 進捗ダッシュボードに「色一致率」「`.library` 非表示達成率」「OSネイティブ呼び出し件数」を日次反映。
