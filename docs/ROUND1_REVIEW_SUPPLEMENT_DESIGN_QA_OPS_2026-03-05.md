# Obscura Round1 レビュー補完統合（Design/QA/Ops）
更新日: 2026-03-05
担当: デザインチーム Pixel（委任レビュー補完 1-4 一括処理）

## 0. 目的
Review会議で未完了だったチェックリスト 1-4 を、順序固定（1→2→3→4）で再定義し、再レビュー提出に必要な証跡パッケージを確定する。

## 0.1 参照済み先行成果物（Read-Only）
- 企画: `E:\Projects\Obscura\.climpire-worktrees\70956924\docs\ROUND1_REMEDIATION_ASSIGNMENT_2026-03-05.md`
- 開発: `E:\Projects\Obscura\.climpire-worktrees\259ad40f\apps\desktop\src\main.tsx`
- 開発: `E:\Projects\Obscura\.climpire-worktrees\259ad40f\apps\desktop\src\utils\tauriDesktopBridge.ts`
- 開発: `E:\Projects\Obscura\.climpire-worktrees\259ad40f\scripts\tauri-sidecar.cjs`
- デザイン: `E:\Projects\Obscura\.climpire-worktrees\82b6241d\docs\ROUND_DESIGN_SUPPLEMENT_PLAN_2026-03-05.md`
- デザイン: `E:\Projects\Obscura\.climpire-worktrees\82b6241d\docs\ROUND_DESIGN_DELIVERABLE_2026-03-05.md`
- QA: `E:\Projects\Obscura\.climpire-worktrees\de95c6a8\docs\ROUND_QA_SUPPLEMENT_PLAN_2026-03-05.md`
- QA: `E:\Projects\Obscura\.climpire-worktrees\de95c6a8\docs\ROUND_QA_DELIVERABLE_2026-03-05.md`
- 運営: `E:\Projects\Obscura\.climpire-worktrees\ce9b9586\docs\ROUND_OPS_SUPPLEMENT_PLAN_2026-03-05.md`
- 運営: `E:\Projects\Obscura\.climpire-worktrees\ce9b9586\docs\ROUND_OPS_DELIVERABLE_2026-03-05.md`
- 追加開発レビュー補完: `E:\Projects\Obscura\.climpire-worktrees\cbf1a5ab\apps\desktop\src\utils\tauriDesktopBridge.ts`

## 1. Checklist 1（Speaky要件）
対象: 品質管理チーム（Speaky）

要求:
- 5項目（右クリック無効化、dominant_color反映、`.library`非表示、孤立UUID除外、OSネイティブウィンドウ廃止）の受入証跡を E2E + 回帰結果付きで再提出する。
- 再発なしを確認できた時点で最終承認する。

証跡パッケージ定義:
| 区分 | 必須証跡 | 参照 |
|---|---|---|
| E2E | Windows/macOS 正常10件以上 + 異常10件以上 | `E:\Projects\Obscura\.climpire-worktrees\de95c6a8\docs\ROUND_QA_SUPPLEMENT_PLAN_2026-03-05.md` |
| 色一致 | `dominant_color` 20サンプル一致率100% | [docs/templates/library_color_name_validation_20samples.csv](docs/templates/library_color_name_validation_20samples.csv) |
| 画面回帰 | `.library` 非表示（一覧/詳細/検索） | [docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md](docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md) |
| 自己修復 | 孤立UUID自動除外ログ + 起動ログ | `E:\Projects\Obscura\.climpire-worktrees\de95c6a8\docs\templates\qa_startup_log_template.md` |

判定状態:
- 条件付き承認（E2E実行証跡待ち）

## 2. Checklist 2（Pixel条件付き承認補完）
対象: デザインチーム（Pixel）

要求:
- ライブラリカードの `dominant_color` 優先表示（欠損時のみグレー）
- 表示名末尾 `.library` 除去
- 反映差分と受入証跡の提出

反映成果物:
- [docs/ROUND_DESIGN_SUPPLEMENT_PLAN_2026-03-05.md](docs/ROUND_DESIGN_SUPPLEMENT_PLAN_2026-03-05.md)
- [docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md](docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md)
- [docs/templates/library_color_name_validation_20samples.csv](docs/templates/library_color_name_validation_20samples.csv)

判定状態:
- 条件付き承認（QAの実測証跡添付後に最終承認）

## 3. Checklist 3（Atlas未承認補完）
対象: 運営チーム（Atlas）

必須固定事項:
| 項目 | 固定内容 |
|---|---|
| 担当固定 | 開発=右クリック無効化・孤立UUID除外・OSネイティブ廃止、デザイン=`dominant_color`反映・`.library`除去 |
| 移行手順 | 孤立UUID自動検出/除外、バックアップ、復旧を文書化 |
| リリース運用ゲート | 5受入条件 + 回帰観点 + 監視項目を日次運用に組み込み |

運用ゲートメトリクス（再レビュー時の提出値）:
- `right_click_native_context_menu_log_count = 0`
- `os_native_dialog_call_count = 0`
- `invalid_library_loaded_after_startup_count = 0`
- `dominant_color_match_rate_20samples = 100`
- `library_suffix_visible_count = 0`

参照:
- `E:\Projects\Obscura\.climpire-worktrees\ce9b9586\docs\ROUND_OPS_SUPPLEMENT_PLAN_2026-03-05.md`
- `E:\Projects\Obscura\.climpire-worktrees\ce9b9586\docs\ROUND_OPS_DELIVERABLE_2026-03-05.md`

判定状態:
- 未承認（移行手順書と実測ゲート値の提出待ち）

## 4. Checklist 4（Pixel未承認補完）
対象: デザインチーム（Pixel）

Round1 最終承認の必須2項目:
1. ライブラリカードは `metadata.json` の `dominant_color` を優先反映し、欠損時のみグレーにフォールバックする。
2. ライブラリ名表示は末尾 `.library` を必ず除去したユーザー向けラベルに統一する（内部ID/実フォルダ名は非表示維持）。

対応仕様:
- `dominant_color` 適用ルール、視認性ガイド、受入基準は [docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md](docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md) に確定。
- `.library` 非表示対象画面マトリクスは [docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md](docs/ROUND_DESIGN_DELIVERABLE_2026-03-05.md) に確定。

判定状態:
- 条件付き承認（受入証跡の再提出後に最終承認）

## 5. 実行完了記録
- [done] Checklist 1: Speaky要求を証跡パッケージ定義へ反映。
- [done] Checklist 2: Pixel要求をデザイン成果物3点へ反映。
- [done] Checklist 3: Atlas要求を担当固定・移行・ゲートの運用条件として反映。
- [done] Checklist 4: Pixel未承認条件2項目を必須仕様として反映。
