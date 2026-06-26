🌐 [English](https://f5-sales-demo.github.io/vscode-xcsh/) |
[日本語](https://f5-sales-demo.github.io/vscode-xcsh/ja/) |
[한국어](https://f5-sales-demo.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5-sales-demo.github.io/vscode-xcsh/es/) |
[Português](https://f5-sales-demo.github.io/vscode-xcsh/pt-br/) |
**Français** |
[Deutsch](https://f5-sales-demo.github.io/vscode-xcsh/de/) |
[Italiano](https://f5-sales-demo.github.io/vscode-xcsh/it/) |
[العربية](https://f5-sales-demo.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5-sales-demo.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5-sales-demo.github.io/vscode-xcsh/th/)

# Extension VS Code

Extension VS Code pour la gestion des ressources F5 Distributed Cloud avec
IntelliSense et le chat xcsh

## Fonctionnalites

- **Gestion des ressources** — Parcourez, creez, modifiez et supprimez des
  ressources F5 Distributed Cloud directement depuis VS Code
- **Etat du cloud** — Tableau de bord en temps reel de la sante de
  l'infrastructure mondiale
- **Assistant IA par chat** — Le participant de chat `@xcsh` permet des
  operations sur la plateforme en langage naturel
- **IntelliSense** — Completions de schemas JSON pour tous les types de
  ressources F5 XC
- **Integrations multi-cloud** — Compatible avec AWS, Azure, GCP, GitHub,
  GitLab, Terraform et Salesforce

## Pour commencer

1. Installez l'extension depuis le
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Installez xcsh : `brew install f5-sales-demo/tap/xcsh`
3. Ouvrez la palette de commandes (`Cmd+Shift+P`) et executez **xcsh: Platform
   Readiness** pour verifier votre configuration
4. Ajoutez un contexte F5 XC via **xcsh: Add Context**

## Integrations prises en charge

| Integration    | Installation                            | Authentification           |
| -------------- | --------------------------------------- | -------------------------- |
| xcsh           | `brew install f5-sales-demo/tap/xcsh` | Inclus avec l'installation |
| AWS CLI        | `brew install awscli`                   | `aws sso login`            |
| Azure CLI      | `brew install azure-cli`                | `az login`                 |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`        |
| GitHub CLI     | `brew install gh`                       | `gh auth login`            |
| GitLab CLI     | `brew install glab`                     | `glab auth login`          |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                        |
| Salesforce CLI | `brew install sf`                       | `sf org login web`         |

Executez **xcsh: Platform Readiness** dans VS Code pour voir quelles
integrations sont installees et authentifiees.

## Documentation

La documentation complete est disponible sur
**[https://f5-sales-demo.github.io/vscode-xcsh/](https://f5-sales-demo.github.io/vscode-xcsh/)**.

## Contribuer

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour les regles de workflow, la
convention de nommage des branches et les exigences CI.

## Licence

Consultez [LICENSE](LICENSE).
