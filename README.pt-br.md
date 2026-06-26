🌐 [English](https://f5-sales-demo.github.io/vscode-xcsh/) |
[日本語](https://f5-sales-demo.github.io/vscode-xcsh/ja/) |
[한국어](https://f5-sales-demo.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5-sales-demo.github.io/vscode-xcsh/es/) |
**Português** |
[Français](https://f5-sales-demo.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5-sales-demo.github.io/vscode-xcsh/de/) |
[Italiano](https://f5-sales-demo.github.io/vscode-xcsh/it/) |
[العربية](https://f5-sales-demo.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5-sales-demo.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5-sales-demo.github.io/vscode-xcsh/th/)

# Extensão para VS Code

Extensão para VS Code para gerenciar recursos do F5 Distributed Cloud com
IntelliSense e chat xcsh

## Funcionalidades

- **Gerenciamento de Recursos** — Navegue, crie, edite e exclua recursos do F5
  Distributed Cloud diretamente no VS Code
- **Status da Nuvem** — Painel de saúde da infraestrutura global em tempo real
- **Assistente de Chat com IA** — Participante de chat `@xcsh` para operações de
  plataforma em linguagem natural
- **IntelliSense** — Autocompletar de esquemas JSON para todos os tipos de
  recursos do F5 XC
- **Integrações Multi-Cloud** — Funciona com AWS, Azure, GCP, GitHub, GitLab,
  Terraform e Salesforce

## Primeiros Passos

1. Instale a extensão pelo
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. Instale o xcsh: `brew install f5-sales-demo/tap/xcsh`
3. Abra a Paleta de Comandos (`Cmd+Shift+P`) e execute **xcsh: Platform
   Readiness** para verificar sua configuração
4. Adicione um contexto do F5 XC via **xcsh: Add Context**

## Integrações Suportadas

| Integração     | Instalação                              | Autenticação           |
| -------------- | --------------------------------------- | ---------------------- |
| xcsh           | `brew install f5-sales-demo/tap/xcsh` | Incluída na instalação |
| AWS CLI        | `brew install awscli`                   | `aws sso login`        |
| Azure CLI      | `brew install azure-cli`                | `az login`             |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`    |
| GitHub CLI     | `brew install gh`                       | `gh auth login`        |
| GitLab CLI     | `brew install glab`                     | `glab auth login`      |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                    |
| Salesforce CLI | `brew install sf`                       | `sf org login web`     |

Execute **xcsh: Platform Readiness** no VS Code para ver quais integrações estão
instaladas e autenticadas.

## Documentação

A documentação completa está disponível em
**[https://f5-sales-demo.github.io/vscode-xcsh/](https://f5-sales-demo.github.io/vscode-xcsh/)**.

## Contribuição

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para regras de fluxo de trabalho,
nomenclatura de branches e requisitos de CI.

## Licença

Consulte [LICENSE](LICENSE).
