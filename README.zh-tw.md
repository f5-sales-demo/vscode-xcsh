🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | **繁體中文** | [Español](README.es.md) |
[Português](README.pt-br.md) | [Français](README.fr.md) |
[Deutsch](README.de.md) | [Italiano](README.it.md) | [العربية](README.ar.md) |
[हिन्दी](README.hi.md) | [ไทย](README.th.md)

# VS Code 擴充功能

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

用於管理 F5 Distributed Cloud 資源的 VS
Code 擴充功能，具備 IntelliSense 和 xcsh 聊天功能

## 功能特色

- **資源管理** — 直接從 VS Code 瀏覽、建立、編輯和刪除 F5 Distributed Cloud 資源
- **雲端狀態** — 即時全球基礎設施健康狀態儀表板
- **AI 聊天助理** — `@xcsh` 聊天參與者，支援自然語言平台操作
- **IntelliSense** — 所有 F5 XC 資源類型的 JSON 結構描述自動補全
- **多雲端整合** — 支援 AWS、Azure、GCP、GitHub、GitLab、Terraform 和 Salesforce

## 開始使用

1. 從
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   安裝擴充功能
2. 安裝 xcsh：`brew install f5xc-salesdemos/tap/xcsh`
3. 開啟命令面板（`Cmd+Shift+P`）並執行 **xcsh: Platform Readiness** 檢查您的設定
4. 透過 **xcsh: Add Context** 新增 F5 XC 環境

## 支援的整合

| 整合工具       | 安裝                                    | 驗證                |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | 安裝時包含          |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install terraform`                | 不適用              |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

在 VS Code 中執行 **xcsh: Platform Readiness**
以查看哪些整合工具已安裝並完成驗證。

## 文件

完整文件請參閱
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**。

## 貢獻

請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)
了解工作流程規則、分支命名規範和 CI 要求。

## 授權條款

請參閱 [LICENSE](LICENSE)。
