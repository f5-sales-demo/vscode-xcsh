🌐 [English](https://f5-sales-demo.github.io/vscode-xcsh/) |
[日本語](https://f5-sales-demo.github.io/vscode-xcsh/ja/) |
[한국어](https://f5-sales-demo.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5-sales-demo.github.io/vscode-xcsh/es/) |
[Português](https://f5-sales-demo.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5-sales-demo.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5-sales-demo.github.io/vscode-xcsh/de/) |
**Italiano** |
[العربية](https://f5-sales-demo.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5-sales-demo.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5-sales-demo.github.io/vscode-xcsh/th/)

# Estensione VS Code

Estensione VS Code per la gestione delle risorse F5 Distributed Cloud con
IntelliSense e chat xcsh

## Funzionalita

- **Gestione risorse** — Esplora, crea, modifica ed elimina le risorse F5
  Distributed Cloud direttamente da VS Code
- **Stato del cloud** — Dashboard in tempo reale sullo stato dell'infrastruttura
  globale
- **Assistente IA via chat** — Il partecipante alla chat `@xcsh` permette
  operazioni sulla piattaforma in linguaggio naturale
- **IntelliSense** — Completamento degli schemi JSON per tutti i tipi di risorse
  F5 XC
- **Integrazioni multi-cloud** — Compatibile con AWS, Azure, GCP, GitHub,
  GitLab, Terraform e Salesforce

## Per iniziare

1. Installa l'estensione dal
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Installa xcsh: `brew install f5-sales-demo/tap/xcsh`
3. Apri il riquadro comandi (`Cmd+Shift+P`) ed esegui **xcsh: Platform
   Readiness** per verificare la configurazione
4. Aggiungi un contesto F5 XC tramite **xcsh: Add Context**

## Integrazioni supportate

| Integrazione   | Installazione                           | Autenticazione              |
| -------------- | --------------------------------------- | --------------------------- |
| xcsh           | `brew install f5-sales-demo/tap/xcsh` | Inclusa con l'installazione |
| AWS CLI        | `brew install awscli`                   | `aws sso login`             |
| Azure CLI      | `brew install azure-cli`                | `az login`                  |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`         |
| GitHub CLI     | `brew install gh`                       | `gh auth login`             |
| GitLab CLI     | `brew install glab`                     | `glab auth login`           |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                         |
| Salesforce CLI | `brew install sf`                       | `sf org login web`          |

Esegui **xcsh: Platform Readiness** in VS Code per verificare quali integrazioni
sono installate e autenticate.

## Documentazione

La documentazione completa e disponibile su
**[https://f5-sales-demo.github.io/vscode-xcsh/](https://f5-sales-demo.github.io/vscode-xcsh/)**.

## Contribuire

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) per le regole del flusso di lavoro,
la nomenclatura dei branch e i requisiti CI.

## Licenza

Consulta [LICENSE](LICENSE).
