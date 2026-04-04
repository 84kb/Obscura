# Obscura

Obscura は、ローカルメディア管理と再生に特化した Tauri + React ベースの Windows デスクトップアプリです。

![License](https://img.shields.io/badge/License-MIT-green.svg)
![Tauri](https://img.shields.io/badge/Tauri-2.x-blue)
![React](https://img.shields.io/badge/React-18.3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## 主な機能

- ローカルライブラリの作成・切り替え
- メディア一覧の高速表示（大規模ライブラリ向け最適化）
- タグ / フォルダ / 評価 / 説明などのメタデータ管理
- 重複検出・ライブラリ更新
- リモートライブラリ接続（ネットワーク同期）
- プラグイン拡張

## 動作環境

- Windows 10 / 11
- Node.js 18 以上
- npm 9 以上

## セットアップ

```bash
git clone https://github.com/84kb/Obscura.git
cd Obscura
npm install
```

## 開発

```bash
# Tauri + Web フロント同時開発
npm run tauri:dev
```

## ビルド

```bash
# バージョン更新 + node 同梱準備 + Tauri ビルド + latest.yml 生成
npm run tauri:build
```

## 主要ディレクトリ

```text
Obscura/
  apps/
    desktop/            # デスクトップアプリ（UI）
  packages/
    core/               # 共通型・共通ロジック
  scripts/              # ビルド / 配布 / メンテナンススクリプト
  src-tauri/            # Tauri (Rust) ホスト
  docs/                 # ドキュメント
```

## ドキュメント

- ユーザー向けガイド: [USER_GUIDE.md](./USER_GUIDE.md)
- そのほか設計資料は `docs/` を参照

## 開発体制

- 本プロジェクトのソースコードは全てcodexにより作成されました

## ライセンス

- 本リポジトリのソースコードは [MIT License](./LICENSE) の下で提供されます
- 依存ライブラリ・ランタイム・外部ツールには、それぞれ個別のライセンスが適用されます
- 配布物を再利用・再配布する場合は、本リポジトリの `LICENSE` と依存先のライセンス条件をあわせて確認してください

## Repository

- GitHub: [84kb/Obscura](https://github.com/84kb/Obscura)
