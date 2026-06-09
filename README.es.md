🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | **Español** |
[Português](README.pt-br.md) | [Français](README.fr.md) |
[Deutsch](README.de.md) | [Italiano](README.it.md) | [العربية](README.ar.md) |
[हिन्दी](README.hi.md) | [ไทย](README.th.md)

# Extensión de VS Code

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

Extensión de VS Code para gestionar recursos de F5 Distributed Cloud con
IntelliSense y chat xcsh

## Funcionalidades

- **Gestión de recursos** — Explorar, crear, editar y eliminar recursos de F5
  Distributed Cloud directamente desde VS Code
- **Estado de la nube** — Panel de estado en tiempo real de la infraestructura
  global
- **Asistente de chat con IA** — Participante de chat `@xcsh` para operaciones
  de plataforma en lenguaje natural
- **IntelliSense** — Autocompletado de esquemas JSON para todos los tipos de
  recursos de F5 XC
- **Integraciones multinube** — Compatible con AWS, Azure, GCP, GitHub, GitLab,
  Terraform y Salesforce

## Primeros pasos

1. Instale la extensión desde el
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Instale xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. Abra la Paleta de Comandos (`Cmd+Shift+P`) y ejecute **xcsh: Platform
   Readiness** para verificar su configuración
4. Agregue un contexto de F5 XC mediante **xcsh: Add Context**

## Integraciones compatibles

| Integración    | Instalación                             | Autenticación               |
| -------------- | --------------------------------------- | --------------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | Incluida con la instalación |
| AWS CLI        | `brew install awscli`                   | `aws sso login`             |
| Azure CLI      | `brew install azure-cli`                | `az login`                  |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`         |
| GitHub CLI     | `brew install gh`                       | `gh auth login`             |
| GitLab CLI     | `brew install glab`                     | `glab auth login`           |
| Terraform      | `brew install terraform`                | N/A                         |
| Salesforce CLI | `brew install sf`                       | `sf org login web`          |

Ejecute **xcsh: Platform Readiness** en VS Code para ver qué integraciones están
instaladas y autenticadas.

## Documentación

La documentación completa está disponible en
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## Contribuciones

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para las reglas de flujo de trabajo,
convenciones de nomenclatura de ramas y requisitos de CI.

## Licencia

Consulte [LICENSE](LICENSE).
