🌐 [English](https://f5xc-salesdemos.github.io/vscode-xcsh/) |
[日本語](https://f5xc-salesdemos.github.io/vscode-xcsh/ja/) |
[한국어](https://f5xc-salesdemos.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5xc-salesdemos.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5xc-salesdemos.github.io/vscode-xcsh/zh-tw/) |
**Español** |
[Português](https://f5xc-salesdemos.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5xc-salesdemos.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5xc-salesdemos.github.io/vscode-xcsh/de/) |
[Italiano](https://f5xc-salesdemos.github.io/vscode-xcsh/it/) |
[العربية](https://f5xc-salesdemos.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5xc-salesdemos.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5xc-salesdemos.github.io/vscode-xcsh/th/)

# Extensión de VS Code

Extensión de VS Code para gestionar recursos de F5 Distributed Cloud con
IntelliSense y chat xcsh

## Funcionalidades

- **Gestión de recursos** — Explore, cree, edite y elimine recursos de F5
  Distributed Cloud directamente desde VS Code
- **Estado de la nube** — Panel de estado de la infraestructura global en tiempo
  real
- **Asistente de chat con IA** — Participante de chat `@xcsh` para operaciones
  de la plataforma en lenguaje natural
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
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                         |
| Salesforce CLI | `brew install sf`                       | `sf org login web`          |

Ejecute **xcsh: Platform Readiness** en VS Code para ver qué integraciones están
instaladas y autenticadas.

## Documentación

La documentación completa está disponible en
**[https://f5xc-salesdemos.github.io/vscode-xcsh/](https://f5xc-salesdemos.github.io/vscode-xcsh/)**.

## Contribuir

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para conocer las reglas del flujo de
trabajo, la nomenclatura de ramas y los requisitos de CI.

## Licencia

Consulte [LICENSE](LICENSE).
