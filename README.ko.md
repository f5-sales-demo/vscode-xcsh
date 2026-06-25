🌐 [English](https://f5xc-salesdemos.github.io/vscode-xcsh/) |
[日本語](https://f5xc-salesdemos.github.io/vscode-xcsh/ja/) | **한국어** |
[简体中文](https://f5xc-salesdemos.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5xc-salesdemos.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5xc-salesdemos.github.io/vscode-xcsh/es/) |
[Português](https://f5xc-salesdemos.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5xc-salesdemos.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5xc-salesdemos.github.io/vscode-xcsh/de/) |
[Italiano](https://f5xc-salesdemos.github.io/vscode-xcsh/it/) |
[العربية](https://f5xc-salesdemos.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5xc-salesdemos.github.io/vscode-xcsh/hi/) |
[ไทย](https://f5xc-salesdemos.github.io/vscode-xcsh/th/)

# VS Code Extension

IntelliSense 및 xcsh 채팅을 갖춘 F5 Distributed Cloud 리소스 관리를 위한 VS Code
확장

## 주요 기능

- **리소스 관리** — VS Code에서 직접 F5 Distributed Cloud 리소스를 탐색, 생성,
  편집 및 삭제할 수 있습니다
- **클라우드 상태** — 실시간 글로벌 인프라 상태 대시보드
- **AI 채팅 어시스턴트** — 자연어 플랫폼 운영을 위한 `@xcsh` 채팅 참여자
- **IntelliSense** — 모든 F5 XC 리소스 유형에 대한 JSON 스키마 자동 완성
- **멀티 클라우드 통합** — AWS, Azure, GCP, GitHub, GitLab, Terraform,
  Salesforce와 연동

## 시작하기

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)에서
   확장을 설치하세요
2. xcsh 설치: `brew install f5xc-salesdemos/tap/xcsh`
3. 명령 팔레트(`Cmd+Shift+P`)를 열고 **xcsh: Platform Readiness**를 실행하여
   설정을 확인하세요
4. **xcsh: Add Context**를 통해 F5 XC 컨텍스트를 추가하세요

## 지원되는 통합

| 통합           | 설치                                    | 인증                |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | 설치 시 포함        |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                 |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

VS Code에서 **xcsh: Platform Readiness**를 실행하면 어떤 통합이 설치 및
인증되었는지 확인할 수 있습니다.

## 문서

전체 문서는
**[https://f5xc-salesdemos.github.io/vscode-xcsh/](https://f5xc-salesdemos.github.io/vscode-xcsh/)**에서
확인할 수 있습니다.

## 기여

워크플로 규칙, 브랜치 네이밍 및 CI 요구 사항은
[CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스

[LICENSE](LICENSE)를 참고하세요.
