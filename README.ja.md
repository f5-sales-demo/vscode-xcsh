🌐 [English](https://f5-sales-demo.github.io/vscode-xcsh/) | **日本語**
| [한국어](https://f5-sales-demo.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5-sales-demo.github.io/vscode-xcsh/es/) |
[Português](https://f5-sales-demo.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5-sales-demo.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5-sales-demo.github.io/vscode-xcsh/de/) |
[Italiano](https://f5-sales-demo.github.io/vscode-xcsh/it/) |
[العربية](https://f5-sales-demo.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5-sales-demo.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5-sales-demo.github.io/vscode-xcsh/th/)

# VS Code Extension

F5 Distributed Cloud リソース管理のための VS Code 拡張機能 —
IntelliSense と xcsh チャットに対応

## 機能

- **リソース管理** — VS Code から直接 F5 Distributed
  Cloud リソースの閲覧、作成、編集、削除が可能
- **クラウドステータス**
  —グローバルインフラストラクチャの健全性をリアルタイムで確認できるダッシュボード
- **AI チャットアシスタント** — `@xcsh`
  チャットパーティシパントで自然言語によるプラットフォーム操作が可能
- **IntelliSense** — すべての F5 XC リソースタイプに対応した JSON スキーマ補完
- **マルチクラウド連携** —
  AWS、Azure、GCP、GitHub、GitLab、Terraform、Salesforceと連携

## はじめに

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   から拡張機能をインストール
2. xcsh をインストール: `brew install f5-sales-demo/tap/xcsh`
3. コマンドパレット（`Cmd+Shift+P`）を開き、**xcsh: Platform Readiness**
   を実行してセットアップを確認
4. **xcsh: Add Context** で F5 XC コンテキストを追加

## 対応インテグレーション

| インテグレーション | インストール                            | 認証                   |
| ------------------ | --------------------------------------- | ---------------------- |
| xcsh               | `brew install f5-sales-demo/tap/xcsh` | インストールに含まれる |
| AWS CLI            | `brew install awscli`                   | `aws sso login`        |
| Azure CLI          | `brew install azure-cli`                | `az login`             |
| Google Cloud       | `brew install google-cloud-sdk`         | `gcloud auth login`    |
| GitHub CLI         | `brew install gh`                       | `gh auth login`        |
| GitLab CLI         | `brew install glab`                     | `glab auth login`      |
| Terraform          | `brew install hashicorp/tap/terraform`  | N/A                    |
| Salesforce CLI     | `brew install sf`                       | `sf org login web`     |

VS Code で **xcsh: Platform Readiness**
を実行すると、インストール済みおよび認証済みのインテグレーションを確認できます。

## ドキュメント

完全なドキュメントは
**[https://f5-sales-demo.github.io/vscode-xcsh/](https://f5-sales-demo.github.io/vscode-xcsh/)**
でご覧いただけます。

## コントリビューション

ワークフロールール、ブランチ命名規則、CI要件については
[CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

## ライセンス

[LICENSE](LICENSE) をご覧ください。
