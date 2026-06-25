🌐 [English](https://f5xc-salesdemos.github.io/vscode-xcsh/) |
[日本語](https://f5xc-salesdemos.github.io/vscode-xcsh/ja/) |
[한국어](https://f5xc-salesdemos.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5xc-salesdemos.github.io/vscode-xcsh/zh-cn/) |
**繁體中文** |
[Español](https://f5xc-salesdemos.github.io/vscode-xcsh/es/) |
[Português](https://f5xc-salesdemos.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5xc-salesdemos.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5xc-salesdemos.github.io/vscode-xcsh/de/) |
[Italiano](https://f5xc-salesdemos.github.io/vscode-xcsh/it/) |
[العربية](https://f5xc-salesdemos.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5xc-salesdemos.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5xc-salesdemos.github.io/vscode-xcsh/th/)

# VS Code 擴充功能

支援 IntelliSense 和 xcsh 聊天功能的 F5 Distributed Cloud 資源管理 VS
Code 擴充功能

## 功能

- **資源管理** — 直接在 VS Code 中瀏覽、建立、編輯和刪除 F5 Distributed
  Cloud 資源
- **雲端狀態** — 即時全球基礎設施健康狀態儀表板
- **AI 聊天助理** — `@xcsh` 聊天參與者，以自然語言操作平台
- **IntelliSense** — 所有 F5 XC 資源類型的 JSON Schema 自動補全
- **多雲端整合** — 支援 AWS、Azure、GCP、GitHub、GitLab、Terraform 和 Salesforce

## 快速開始

1. 從
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   安裝擴充功能
2. 安裝 xcsh：`brew install f5xc-salesdemos/tap/xcsh`
3. 開啟命令面板（`Cmd+Shift+P`）並執行 **xcsh: Platform Readiness** 檢查您的設定
4. 透過 **xcsh: Add Context** 新增 F5 XC 上下文

## 支援的整合

| 整合項目       | 安裝                                    | 認證                |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | 安裝時內建          |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install hashicorp/tap/terraform`  | 不適用              |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

在 VS Code 中執行 **xcsh: Platform Readiness**
即可查看已安裝和已認證的整合項目。

## 文件

完整文件請參閱
**[https://f5xc-salesdemos.github.io/vscode-xcsh/](https://f5xc-salesdemos.github.io/vscode-xcsh/)**。

## 貢獻

請參閱 [CONTRIBUTING.md](CONTRIBUTING.md) 了解工作流程規範、分支命名和 CI 要求。

## 授權條款

請參閱 [LICENSE](LICENSE)。
