🌐 English | [日本語](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/ja/) |
[한국어](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/ko/) |
[简体中文](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/zh-cn/) |
[繁體中文](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/zh-tw/) |
[Español](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/es/) |
[Português](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/pt-br/) |
[Français](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/fr/) |
[Deutsch](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/de/) |
[Italiano](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/it/) |
[العربية](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/ar/) |
[हिन्दी](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/hi/) |
[ไทย](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/th/)

# VS Code Extension

VS Code extension for managing F5 Distributed Cloud resources with IntelliSense
and xcsh chat

## Features

- **Resource Management** — Browse, create, edit, and delete F5 Distributed
  Cloud resources directly from VS Code
- **Cloud Status** — Real-time global infrastructure health dashboard
- **AI Chat Assistant** — `@xcsh` chat participant for natural language platform
  operations
- **IntelliSense** — JSON schema completions for all F5 XC resource types
- **Multi-Cloud Integrations** — Works with AWS, Azure, GCP, GitHub, GitLab,
  Terraform, and Salesforce

## Getting Started

1. Install the extension from the
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Install xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. Open the Command Palette (`Cmd+Shift+P`) and run **xcsh: Platform Readiness**
   to check your setup
4. Add an F5 XC context via **xcsh: Add Context**

## Supported Integrations

| Integration    | Install                                 | Authenticate          |
| -------------- | --------------------------------------- | --------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | Included with install |
| AWS CLI        | `brew install awscli`                   | `aws sso login`       |
| Azure CLI      | `brew install azure-cli`                | `az login`            |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`   |
| GitHub CLI     | `brew install gh`                       | `gh auth login`       |
| GitLab CLI     | `brew install glab`                     | `glab auth login`     |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                   |
| Salesforce CLI | `brew install sf`                       | `sf org login web`    |

Run **xcsh: Platform Readiness** in VS Code to see which integrations are
installed and authenticated.

## Documentation

Full documentation is available at
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow rules, branch naming, and CI
requirements.

## License

See [LICENSE](LICENSE).
