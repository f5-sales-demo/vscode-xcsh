🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) | **Français** |
[Deutsch](README.de.md) | [Italiano](README.it.md) | [العربية](README.ar.md) |
[हिन्दी](README.hi.md) | [ไทย](README.th.md)

# Extension VS Code

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

Extension VS Code pour la gestion des ressources F5 Distributed Cloud avec
IntelliSense et le chat xcsh

## Fonctionnalites

- **Gestion des ressources** — Parcourir, creer, modifier et supprimer les
  ressources F5 Distributed Cloud directement depuis VS Code
- **Etat du cloud** — Tableau de bord en temps reel de la sante de
  l'infrastructure mondiale
- **Assistant IA par chat** — Participant de chat `@xcsh` pour les operations de
  plateforme en langage naturel
- **IntelliSense** — Completions de schemas JSON pour tous les types de
  ressources F5 XC
- **Integrations multi-cloud** — Compatible avec AWS, Azure, GCP, GitHub,
  GitLab, Terraform et Salesforce

## Pour commencer

1. Installez l'extension depuis le
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Installez xcsh : `brew install f5xc-salesdemos/tap/xcsh`
3. Ouvrez la palette de commandes (`Cmd+Shift+P`) et executez **xcsh: Platform
   Readiness** pour verifier votre configuration
4. Ajoutez un contexte F5 XC via **xcsh: Add Context**

## Integrations prises en charge

| Integration    | Installation                            | Authentification           |
| -------------- | --------------------------------------- | -------------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | Inclus avec l'installation |
| AWS CLI        | `brew install awscli`                   | `aws sso login`            |
| Azure CLI      | `brew install azure-cli`                | `az login`                 |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`        |
| GitHub CLI     | `brew install gh`                       | `gh auth login`            |
| GitLab CLI     | `brew install glab`                     | `glab auth login`          |
| Terraform      | `brew install terraform`                | N/A                        |
| Salesforce CLI | `brew install sf`                       | `sf org login web`         |

Executez **xcsh: Platform Readiness** dans VS Code pour voir quelles
integrations sont installees et authentifiees.

## Documentation

La documentation complete est disponible sur
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## Contribution

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour les regles de workflow, les
conventions de nommage des branches et les exigences CI.

## Licence

Consultez [LICENSE](LICENSE).
