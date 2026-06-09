🌐 [English](README.md) | **日本語** | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) |
[Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) |
[العربية](README.ar.md) | [हिन्दी](README.hi.md) | [ไทย](README.th.md)

# VS Code 拡張機能

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

IntelliSense と xcsh チャットで F5 Distributed Cloud リソースを管理する VS
Code 拡張機能

## 機能

- **リソース管理** — VS Code から直接 F5 Distributed
  Cloud リソースの閲覧、作成、編集、削除が可能
- **クラウドステータス**
  — リアルタイムのグローバルインフラストラクチャ健全性ダッシュボード
- **AI チャットアシスタント** — 自然言語によるプラットフォーム操作のための
  `@xcsh` チャットパーティシパント
- **IntelliSense** — すべての F5 XC リソースタイプに対応した JSON スキーマ補完
- **マルチクラウド統合** —
  AWS、Azure、GCP、GitHub、GitLab、Terraform、Salesforce と連携

## はじめに

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   から拡張機能をインストール
2. xcsh をインストール: `brew install f5xc-salesdemos/tap/xcsh`
3. コマンドパレット（`Cmd+Shift+P`）を開き、**xcsh: Platform Readiness**
   を実行してセットアップを確認
4. **xcsh: Add Context** で F5 XC コンテキストを追加

## サポートされている統合

| 統合           | インストール                            | 認証                     |
| -------------- | --------------------------------------- | ------------------------ |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | インストールに含まれます |
| AWS CLI        | `brew install awscli`                   | `aws sso login`          |
| Azure CLI      | `brew install azure-cli`                | `az login`               |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`      |
| GitHub CLI     | `brew install gh`                       | `gh auth login`          |
| GitLab CLI     | `brew install glab`                     | `glab auth login`        |
| Terraform      | `brew install terraform`                | N/A                      |
| Salesforce CLI | `brew install sf`                       | `sf org login web`       |

VS Code で **xcsh: Platform Readiness**
を実行すると、インストール済みおよび認証済みの統合を確認できます。

## ドキュメント

完全なドキュメントは
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**
でご覧いただけます。

## コントリビューション

ワークフロールール、ブランチ命名規則、CI 要件については
[CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

## ライセンス

[LICENSE](LICENSE) をご覧ください。
