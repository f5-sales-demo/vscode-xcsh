# VS Code Extension

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

VS Code extension for managing F5 Distributed Cloud resources with IntelliSense and xcsh chat

## Features

- **Resource Management** — Browse, create, edit, and delete F5 Distributed Cloud resources directly from VS Code
- **Cloud Status** — Real-time global infrastructure health dashboard
- **AI Chat Assistant** — `@xcsh` chat participant for natural language platform operations
- **IntelliSense** — JSON schema completions for all F5 XC resource types
- **Multi-Cloud Integrations** — Works with AWS, Azure, GCP, GitHub, GitLab, Terraform, and Salesforce

## Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Install xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. Open the Command Palette (`Cmd+Shift+P`) and run **xcsh: Platform Readiness** to check your setup
4. Add an F5 XC context via **xcsh: Add Context**

## Supported Integrations

| Integration | Install | Authenticate |
|---|---|---|
| xcsh | `brew install f5xc-salesdemos/tap/xcsh` | Included with install |
| AWS CLI | `brew install awscli` | `aws sso login` |
| Azure CLI | `brew install azure-cli` | `az login` |
| Google Cloud | `brew install google-cloud-sdk` | `gcloud auth login` |
| GitHub CLI | `brew install gh` | `gh auth login` |
| GitLab CLI | `brew install glab` | `glab auth login` |
| Terraform | `brew install terraform` | N/A |
| Salesforce CLI | `brew install sf` | `sf org login web` |

Run **xcsh: Platform Readiness** in VS Code to see which integrations are installed and authenticated.

## Documentation

Full documentation is available at **[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## Getting Started

```bash
git clone https://github.com/f5xc-salesdemos/vscode-f5xc-tools.git
```

See the [documentation](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/) for detailed setup
and usage guides.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow rules,
branch naming, and CI requirements.

## License

See [LICENSE](LICENSE).
