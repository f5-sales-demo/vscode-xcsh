🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
**简体中文** | [繁體中文](README.zh-tw.md) | [Español](README.es.md) |
[Português](README.pt-br.md) | [Français](README.fr.md) |
[Deutsch](README.de.md) | [Italiano](README.it.md) | [العربية](README.ar.md) |
[हिन्दी](README.hi.md) | [ไทย](README.th.md)

# VS Code 扩展

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

通过 IntelliSense 和 xcsh 聊天管理 F5 Distributed Cloud 资源的 VS Code 扩展

## 功能

- **资源管理** — 直接从 VS Code 浏览、创建、编辑和删除 F5 Distributed Cloud 资源
- **云状态** — 实时全球基础设施健康状态仪表板
- **AI 聊天助手** — 用于自然语言平台操作的 `@xcsh` 聊天参与者
- **IntelliSense** — 所有 F5 XC 资源类型的 JSON 架构补全
- **多云集成**
  — 与 AWS、Azure、GCP、GitHub、GitLab、Terraform 和 Salesforce 协同工作

## 快速开始

1. 从
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   安装扩展
2. 安装 xcsh：`brew install f5xc-salesdemos/tap/xcsh`
3. 打开命令面板（`Cmd+Shift+P`）并运行 **xcsh: Platform Readiness** 检查设置
4. 通过 **xcsh: Add Context** 添加 F5 XC 上下文

## 支持的集成

| 集成           | 安装                                    | 认证                |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | 安装时包含          |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install terraform`                | N/A                 |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

在 VS Code 中运行 **xcsh: Platform Readiness** 可查看已安装和已认证的集成。

## 文档

完整文档请访问
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**。

## 贡献

有关工作流规则、分支命名和 CI 要求，请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

请参阅 [LICENSE](LICENSE)。
