🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) |
[Français](README.fr.md) | [Deutsch](README.de.md) | **Italiano** |
[العربية](README.ar.md) | [हिन्दी](README.hi.md) | [ไทย](README.th.md)

# Estensione VS Code

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

Estensione VS Code per la gestione delle risorse F5 Distributed Cloud con
IntelliSense e chat xcsh

## Funzionalita

- **Gestione delle risorse** — Sfoglia, crea, modifica ed elimina le risorse F5
  Distributed Cloud direttamente da VS Code
- **Stato del cloud** — Dashboard in tempo reale sullo stato dell'infrastruttura
  globale
- **Assistente IA via chat** — Partecipante di chat `@xcsh` per operazioni sulla
  piattaforma in linguaggio naturale
- **IntelliSense** — Completamenti basati su schema JSON per tutti i tipi di
  risorse F5 XC
- **Integrazioni multi-cloud** — Compatibile con AWS, Azure, GCP, GitHub,
  GitLab, Terraform e Salesforce

## Per iniziare

1. Installa l'estensione dal
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Installa xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. Apri il riquadro comandi (`Cmd+Shift+P`) ed esegui **xcsh: Platform
   Readiness** per verificare la tua configurazione
4. Aggiungi un contesto F5 XC tramite **xcsh: Add Context**

## Integrazioni supportate

| Integrazione   | Installazione                           | Autenticazione              |
| -------------- | --------------------------------------- | --------------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | Inclusa con l'installazione |
| AWS CLI        | `brew install awscli`                   | `aws sso login`             |
| Azure CLI      | `brew install azure-cli`                | `az login`                  |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`         |
| GitHub CLI     | `brew install gh`                       | `gh auth login`             |
| GitLab CLI     | `brew install glab`                     | `glab auth login`           |
| Terraform      | `brew install terraform`                | N/A                         |
| Salesforce CLI | `brew install sf`                       | `sf org login web`          |

Esegui **xcsh: Platform Readiness** in VS Code per verificare quali integrazioni
sono installate e autenticate.

## Documentazione

La documentazione completa e disponibile su
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## Contribuire

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) per le regole sul workflow, le
convenzioni di denominazione dei branch e i requisiti CI.

## Licenza

Consulta [LICENSE](LICENSE).
