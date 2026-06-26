🌐 [English](https://f5-sales-demo.github.io/vscode-xcsh/) |
[日本語](https://f5-sales-demo.github.io/vscode-xcsh/ja/) |
[한국어](https://f5-sales-demo.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5-sales-demo.github.io/vscode-xcsh/es/) |
[Português](https://f5-sales-demo.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5-sales-demo.github.io/vscode-xcsh/fr/) |
**Deutsch** |
[Italiano](https://f5-sales-demo.github.io/vscode-xcsh/it/) |
[العربية](https://f5-sales-demo.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5-sales-demo.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5-sales-demo.github.io/vscode-xcsh/th/)

# VS Code Extension

VS Code-Erweiterung zur Verwaltung von F5 Distributed Cloud-Ressourcen mit
IntelliSense und xcsh Chat

## Funktionen

- **Ressourcenverwaltung** — F5 Distributed Cloud-Ressourcen direkt in VS Code
  durchsuchen, erstellen, bearbeiten und loeschen
- **Cloud-Status** — Echtzeit-Dashboard zum Zustand der globalen Infrastruktur
- **KI-Chat-Assistent** — `@xcsh` Chat-Teilnehmer fuer Plattformoperationen in
  natuerlicher Sprache
- **IntelliSense** — JSON-Schema-Vervollstaendigung fuer alle F5
  XC-Ressourcentypen
- **Multi-Cloud-Integrationen** — funktioniert mit AWS, Azure, GCP, GitHub,
  GitLab, Terraform und Salesforce

## Erste Schritte

1. Installieren Sie die Erweiterung vom
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Installieren Sie xcsh: `brew install f5-sales-demo/tap/xcsh`
3. Oeffnen Sie die Befehlspalette (`Cmd+Shift+P`) und fuehren Sie **xcsh:
   Platform Readiness** aus, um Ihre Einrichtung zu pruefen
4. Fuegen Sie einen F5 XC-Kontext ueber **xcsh: Add Context** hinzu

## Unterstuetzte Integrationen

| Integration    | Installation                            | Authentifizierung         |
| -------------- | --------------------------------------- | ------------------------- |
| xcsh           | `brew install f5-sales-demo/tap/xcsh` | In Installation enthalten |
| AWS CLI        | `brew install awscli`                   | `aws sso login`           |
| Azure CLI      | `brew install azure-cli`                | `az login`                |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`       |
| GitHub CLI     | `brew install gh`                       | `gh auth login`           |
| GitLab CLI     | `brew install glab`                     | `glab auth login`         |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                       |
| Salesforce CLI | `brew install sf`                       | `sf org login web`        |

Fuehren Sie **xcsh: Platform Readiness** in VS Code aus, um zu sehen, welche
Integrationen installiert und authentifiziert sind.

## Dokumentation

Die vollstaendige Dokumentation ist verfuegbar unter
**[https://f5-sales-demo.github.io/vscode-xcsh/](https://f5-sales-demo.github.io/vscode-xcsh/)**.

## Mitwirken

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) fuer Workflow-Regeln, Branch-Benennung
und CI-Anforderungen.

## Lizenz

Siehe [LICENSE](LICENSE).
