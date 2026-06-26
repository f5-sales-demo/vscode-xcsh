🌐 [English](https://f5-sales-demo.github.io/vscode-xcsh/) |
[日本語](https://f5-sales-demo.github.io/vscode-xcsh/ja/) |
[한국어](https://f5-sales-demo.github.io/vscode-xcsh/ko/) | **简体中文**
| [繁體中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5-sales-demo.github.io/vscode-xcsh/es/) |
[Português](https://f5-sales-demo.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5-sales-demo.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5-sales-demo.github.io/vscode-xcsh/de/) |
[Italiano](https://f5-sales-demo.github.io/vscode-xcsh/it/) |
[العربية](https://f5-sales-demo.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5-sales-demo.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5-sales-demo.github.io/vscode-xcsh/th/)

# VS Code Extension

用于管理 F5 Distributed Cloud 资源的 VS
Code 扩展，支持 IntelliSense 和 xcsh 聊天

## 功能

- **资源管理** — 直接在 VS Code 中浏览、创建、编辑和删除 F5 Distributed
  Cloud 资源
- **云状态** — 实时全球基础设施健康状态仪表板
- **AI 聊天助手** — `@xcsh` 聊天参与者，支持自然语言平台操作
- **IntelliSense** — 所有 F5 XC 资源类型的 JSON Schema 自动补全
- **多云集成** — 支持 AWS、Azure、GCP、GitHub、GitLab、Terraform 和 Salesforce

## 快速开始

1. 从
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   安装扩展
2. 安装 xcsh：`brew install f5-sales-demo/tap/xcsh`
3. 打开命令面板（`Cmd+Shift+P`）并运行 **xcsh: Platform Readiness**
   以检查您的环境配置
4. 通过 **xcsh: Add Context** 添加 F5 XC 上下文

## 支持的集成

| 集成工具       | 安装                                    | 认证                |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5-sales-demo/tap/xcsh` | 安装时已包含        |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install hashicorp/tap/terraform`  | 不适用              |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

在 VS Code 中运行 **xcsh: Platform Readiness** 可查看已安装和已认证的集成工具。

## 文档

完整文档请访问
**[https://f5-sales-demo.github.io/vscode-xcsh/](https://f5-sales-demo.github.io/vscode-xcsh/)**。

## 贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解工作流规则、分支命名和 CI 要求。

## 许可证

请参阅 [LICENSE](LICENSE)。
