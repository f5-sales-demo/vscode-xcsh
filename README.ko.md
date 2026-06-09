🌐 [English](README.md) | [日本語](README.ja.md) | **한국어** |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) |
[Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) |
[العربية](README.ar.md) | [हिन्दी](README.hi.md) | [ไทย](README.th.md)

# VS Code 확장 프로그램

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

IntelliSense와 xcsh 채팅으로 F5 Distributed Cloud 리소스를 관리하는 VS Code 확장
프로그램

## 기능

- **리소스 관리** — VS Code에서 직접 F5 Distributed Cloud 리소스 탐색, 생성,
  편집, 삭제
- **클라우드 상태** — 실시간 글로벌 인프라 상태 대시보드
- **AI 채팅 어시스턴트** — 자연어 플랫폼 운영을 위한 `@xcsh` 채팅 참여자
- **IntelliSense** — 모든 F5 XC 리소스 유형에 대한 JSON 스키마 자동 완성
- **멀티클라우드 통합** — AWS, Azure, GCP, GitHub, GitLab, Terraform,
  Salesforce와 연동

## 시작하기

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)에서
   확장 프로그램 설치
2. xcsh 설치: `brew install f5xc-salesdemos/tap/xcsh`
3. 명령 팔레트(`Cmd+Shift+P`)를 열고 **xcsh: Platform Readiness**를 실행하여
   설정 확인
4. **xcsh: Add Context**로 F5 XC 컨텍스트 추가

## 지원되는 통합

| 통합           | 설치                                    | 인증                |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | 설치 시 포함        |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install terraform`                | N/A                 |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

VS Code에서 **xcsh: Platform Readiness**를 실행하면 설치 및 인증된 통합을 확인할
수 있습니다.

## 문서

전체 문서는
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**에서
확인할 수 있습니다.

## 기여

워크플로 규칙, 브랜치 이름 규칙, CI 요구 사항은
[CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

## 라이선스

[LICENSE](LICENSE)를 참조하세요.
