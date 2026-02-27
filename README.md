# Obscura

Eagleライクなライブラリ型メディアプレイヤーWindowsアプリケーション

![License](https://img.shields.io/badge/License-MIT-green.svg)
![Electron](https://img.shields.io/badge/Electron-30.0-blue)
![React](https://img.shields.io/badge/React-18.2-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)

## 概要

**⚠️ 本アプリは現在開発中のアルファバージョンです。予期せぬ不具合や未実装の機能が含まれている可能性があります。**

Obscura（オブスキュラ）は、自分のPC内に散らばった動画・音声ファイルを美しく、直感的に管理・再生できるデスクトップアプリケーションです。
アプリ名は「キュレーション（Curation：情報を収集・整理し、新しい価値を付与すること）」に着想を得ており、ユーザー自身の最高のライブラリを構築するためのツールを目指しています。

画像管理ソフトのようなサムネイル中心のグリッドレイアウトを採用しており、大量のメディアファイルを視覚的に閲覧できます。また、強力なタグ付け機能と各種フィルタリング、さらにはネットワーク越しに別PCのライブラリに連携するリモートライブラリ機能など、本格的なメディアエンスージアスト向けの機能を備えています。

## 主な機能

- 📁 **複数のライブラリ管理**: フォルダを指定してライブラリを作成・切り替えが可能
- 🎨 **モダンなUI構成**: ダークテーマを基調とした洗練されたデザイン。テーマテンプレートを用いたフルカスタムも可能
- 🎬 **多彩なメディア再生**: mp4, mkv, avi, mov等の動画フォーマットに加え、主要な音声フォーマットに対応
- 🔍 **強力な整理・検索**: フォルダ階層、タグ、レーティング（星）、アーティスト名、ファイルタイプを用いた柔軟なフィルタリング
- 🤝 **リモートライブラリ (LAN共有)**: 同じネットワーク上の別のPCにあるライブラリを閲覧・ストリーミング再生
- 📋 **メタデータと関連作品管理**: 動画の詳細情報（メモ、URL）や、他の動画との親子・シリーズ関係（関連作品）を視覚的にリンク
- 📦 **プラグインシステム**: メタデータの自動取得（yt-dlp等）やニコニコ風コメント描画など、JSを用いたサードパーティプラグインに対応
- 🪟 **ピクチャー・イン・ピクチャー (PiP)**: 他の作業をしながらでも動画を再生可能
- 💾 **データ自動永続化 & 重複検索**: ライブラリ情報をローカルのSQLiteで管理し、同一ファイルの重複検出と解決機能も搭載

## スクリーンショット

[アプリケーション画面](./docs/screenshot.png)

## 必要な環境

- Windows 10/11
- Node.js 18以上
- npm 9以上

## インストール

```bash
# リポジトリをクローン
git clone https://github.com/84kb/Obscura.git
cd Obscura

# パッケージ（モノレポ）の依存関係をすべてインストール
npm install
```

## 使い方

詳細なすべての操作説明と機能一覧は [USER_GUIDE.md](./USER_GUIDE.md) にまとめています。

### 開発モードで起動

```bash
# クライアント(React)とホスト(Electron)を同時に起動
npm run electron:dev
```

### アプリケーションをビルド

```bash
# Windows向けのインストーラーをビルド
npm run build
```

ビルドされたアプリケーションセットアップファイルは `release` フォルダに出力されます。

## 対応フォーマット

### 動画
- `.mp4` - MPEG-4
- `.mkv` - Matroska
- `.avi` - Audio Video Interleave
- `.mov` - QuickTime
- `.webm` - WebM
- `.flv` - Flash Video
- `.wmv` - Windows Media Video

### 音声
- `.mp3` - MPEG Audio Layer 3
- `.wav` - Waveform Audio
- `.flac` - Free Lossless Audio Codec
- `.m4a` - MPEG-4 Audio
- `.ogg` - Ogg Vorbis
- `.aac` - Advanced Audio Coding
- `.wma` - Windows Media Audio

## プロジェクト構造

Obscuraはnpm workspacesを利用したモノレポ構成を採用しています。

```
Obscura/
├── apps/
│   └── desktop/           # メインのデスクトップアプリケーション
│       ├── electron/      # Electronメインプロセス (DB, APIルーター等)
│       └── src/           # Reactフロントエンド
├── packages/
│   ├── core/              # アプリ全体で共有される型定義(types)と設定
│   └── plugins/           # 拡張プラグインの実装
├── docs/                  # APIドキュメントや画像リソース
├── package.json
└── tsconfig.json
```

## 技術スタック

- **Electron**: デスクトップアプリケーションフレームワーク
- **React**: UIライブラリ
- **TypeScript**: 型安全性
- **Vite**: 高速なビルドツール
- **SQLite (sqlite3)**: ローカルデータベースによる永続化

## ライセンス

[MIT License](./LICENSE)

## 作者

84kb
(Built with the help of Google Antigravity)

## 貢献

バグ報告や機能追加のプルリクエストを歓迎します。
現在はアルファバージョンであり予期せぬ不具合が多発する可能性がありますので、些細なことでもIssueでのご報告に協力いただけますと幸いです。
貢献頂ける場合は、まず **[CONTRIBUTING.md](./CONTRIBUTING.md)** をご一読ください。
