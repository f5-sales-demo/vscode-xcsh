🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) |
[Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) |
[العربية](README.ar.md) | [हिन्दी](README.hi.md) | **ไทย**

# ส่วนขยาย VS Code

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

ส่วนขยาย VS Code สำหรับจัดการทรัพยากร F5 Distributed Cloud พร้อม IntelliSense
และแชท xcsh

## คุณสมบัติ

- **การจัดการทรัพยากร** — เรียกดู สร้าง แก้ไข และลบทรัพยากร F5 Distributed Cloud
  โดยตรงจาก VS Code
- **สถานะคลาวด์** — แดชบอร์ดสุขภาพโครงสร้างพื้นฐานทั่วโลกแบบเรียลไทม์
- **ผู้ช่วยแชท AI** — ผู้เข้าร่วมแชท `@xcsh`
  สำหรับการดำเนินงานแพลตฟอร์มด้วยภาษาธรรมชาติ
- **IntelliSense** — การเติมคำอัตโนมัติจาก JSON schema สำหรับทรัพยากร F5 XC
  ทุกประเภท
- **การผสานรวมมัลติคลาวด์** — ทำงานร่วมกับ AWS, Azure, GCP, GitHub, GitLab,
  Terraform และ Salesforce

## เริ่มต้นใช้งาน

1. ติดตั้งส่วนขยายจาก
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. ติดตั้ง xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. เปิด Command Palette (`Cmd+Shift+P`) แล้วเรียกใช้ **xcsh: Platform
   Readiness** เพื่อตรวจสอบการตั้งค่าของคุณ
4. เพิ่ม F5 XC context ผ่าน **xcsh: Add Context**

## การผสานรวมที่รองรับ

| การผสานรวม     | การติดตั้ง                              | การยืนยันตัวตน      |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | รวมมากับการติดตั้ง  |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install terraform`                | ไม่มี               |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

เรียกใช้ **xcsh: Platform Readiness** ใน VS Code
เพื่อดูว่าการผสานรวมใดที่ติดตั้งและยืนยันตัวตนแล้ว

## เอกสาร

เอกสารฉบับเต็มมีให้ที่
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**

## การมีส่วนร่วม

ดู [CONTRIBUTING.md](CONTRIBUTING.md) สำหรับกฎเวิร์กโฟลว์ การตั้งชื่อ branch
และข้อกำหนด CI

## สัญญาอนุญาต

ดู [LICENSE](LICENSE)
