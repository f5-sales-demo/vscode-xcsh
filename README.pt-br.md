🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | **Português** | [Français](README.fr.md) |
[Deutsch](README.de.md) | [Italiano](README.it.md) | [العربية](README.ar.md) |
[हिन्दी](README.hi.md) | [ไทย](README.th.md)

# Extensão do VS Code

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

Extensão do VS Code para gerenciar recursos do F5 Distributed Cloud com
IntelliSense e chat xcsh

## Funcionalidades

- **Gerenciamento de recursos** — Navegue, crie, edite e exclua recursos do F5
  Distributed Cloud diretamente no VS Code
- **Status da nuvem** — Painel de saúde da infraestrutura global em tempo real
- **Assistente de chat com IA** — Participante de chat `@xcsh` para operações de
  plataforma em linguagem natural
- **IntelliSense** — Autocompletar de esquemas JSON para todos os tipos de
  recursos do F5 XC
- **Integrações multinuvem** — Compatível com AWS, Azure, GCP, GitHub, GitLab,
  Terraform e Salesforce

## Primeiros passos

1. Instale a extensão pelo
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Instale o xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. Abra a Paleta de Comandos (`Cmd+Shift+P`) e execute **xcsh: Platform
   Readiness** para verificar sua configuração
4. Adicione um contexto do F5 XC usando **xcsh: Add Context**

## Integrações compatíveis

| Integração     | Instalação                              | Autenticação           |
| -------------- | --------------------------------------- | ---------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | Incluída na instalação |
| AWS CLI        | `brew install awscli`                   | `aws sso login`        |
| Azure CLI      | `brew install azure-cli`                | `az login`             |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`    |
| GitHub CLI     | `brew install gh`                       | `gh auth login`        |
| GitLab CLI     | `brew install glab`                     | `glab auth login`      |
| Terraform      | `brew install terraform`                | N/A                    |
| Salesforce CLI | `brew install sf`                       | `sf org login web`     |

Execute **xcsh: Platform Readiness** no VS Code para ver quais integrações estão
instaladas e autenticadas.

## Documentação

A documentação completa está disponível em
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## Contribuições

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para regras de fluxo de trabalho,
convenções de nomenclatura de branches e requisitos de CI.

## Licença

Consulte [LICENSE](LICENSE).
