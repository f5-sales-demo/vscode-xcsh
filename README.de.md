🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) |
[Français](README.fr.md) | **Deutsch** | [Italiano](README.it.md) |
[العربية](README.ar.md) | [हिन्दी](README.hi.md) | [ไทย](README.th.md)

# VS Code-Erweiterung

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

VS Code-Erweiterung zur Verwaltung von F5 Distributed Cloud-Ressourcen mit
IntelliSense und xcsh-Chat

## Funktionen

- **Ressourcenverwaltung** — F5 Distributed Cloud-Ressourcen direkt in VS Code
  durchsuchen, erstellen, bearbeiten und loeschen
- **Cloud-Status** — Echtzeit-Dashboard zur globalen Infrastrukturgesundheit
- **KI-Chat-Assistent** — `@xcsh`-Chat-Teilnehmer fuer Plattformoperationen in
  natuerlicher Sprache
- **IntelliSense** — JSON-Schema-Vervollstaendigungen fuer alle F5
  XC-Ressourcentypen
- **Multi-Cloud-Integrationen** — Funktioniert mit AWS, Azure, GCP, GitHub,
  GitLab, Terraform und Salesforce

## Erste Schritte

1. Installieren Sie die Erweiterung aus dem
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Installieren Sie xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. Oeffnen Sie die Befehlspalette (`Cmd+Shift+P`) und fuehren Sie **xcsh:
   Platform Readiness** aus, um Ihre Einrichtung zu ueberpruefen
4. Fuegen Sie einen F5 XC-Kontext ueber **xcsh: Add Context** hinzu

## Unterstuetzte Integrationen

| Integration    | Installation                            | Authentifizierung                |
| -------------- | --------------------------------------- | -------------------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | Im Installationsumfang enthalten |
| AWS CLI        | `brew install awscli`                   | `aws sso login`                  |
| Azure CLI      | `brew install azure-cli`                | `az login`                       |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`              |
| GitHub CLI     | `brew install gh`                       | `gh auth login`                  |
| GitLab CLI     | `brew install glab`                     | `glab auth login`                |
| Terraform      | `brew install terraform`                | N/A                              |
| Salesforce CLI | `brew install sf`                       | `sf org login web`               |

Fuehren Sie **xcsh: Platform Readiness** in VS Code aus, um zu sehen, welche
Integrationen installiert und authentifiziert sind.

## Dokumentation

Die vollstaendige Dokumentation ist verfuegbar unter
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## Mitwirken

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) fuer Workflow-Regeln,
Branch-Namenskonventionen und CI-Anforderungen.

## Lizenz

Siehe [LICENSE](LICENSE).
