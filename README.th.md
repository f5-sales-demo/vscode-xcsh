🌐 [English](https://f5xc-salesdemos.github.io/vscode-xcsh/) |
[日本語](https://f5xc-salesdemos.github.io/vscode-xcsh/ja/) |
[한국어](https://f5xc-salesdemos.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5xc-salesdemos.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5xc-salesdemos.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5xc-salesdemos.github.io/vscode-xcsh/es/) |
[Português](https://f5xc-salesdemos.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5xc-salesdemos.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5xc-salesdemos.github.io/vscode-xcsh/de/) |
[Italiano](https://f5xc-salesdemos.github.io/vscode-xcsh/it/) |
[العربية](https://f5xc-salesdemos.github.io/vscode-xcsh/ar/) |
[हिन्दी](https://f5xc-salesdemos.github.io/vscode-xcsh/hi/) | **ไทย**

# VS Code Extension

ส่วนขยาย VS Code สำหรับจัดการทรัพยากร F5 Distributed Cloud พร้อม IntelliSense
และ xcsh chat

## คุณสมบัติ

- **การจัดการทรัพยากร** — เรียกดู สร้าง แก้ไข และลบทรัพยากร F5 Distributed Cloud
  โดยตรงจาก VS Code
- **สถานะคลาวด์** — แดชบอร์ดสถานะโครงสร้างพื้นฐานระดับโลกแบบเรียลไทม์
- **ผู้ช่วยแชท AI** — ผู้เข้าร่วมแชท `@xcsh`
  สำหรับการดำเนินงานแพลตฟอร์มด้วยภาษาธรรมชาติ
- **IntelliSense** — การเติมข้อมูล JSON schema สำหรับทรัพยากร F5 XC ทุกประเภท
- **การผสานรวมมัลติคลาวด์** — ทำงานร่วมกับ AWS, Azure, GCP, GitHub, GitLab,
  Terraform และ Salesforce

## เริ่มต้นใช้งาน

1. ติดตั้งส่วนขยายจาก
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. ติดตั้ง xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. เปิด Command Palette (`Cmd+Shift+P`) แล้วเรียกใช้ **xcsh: Platform
   Readiness** เพื่อตรวจสอบการตั้งค่าของคุณ
4. เพิ่มคอนเท็กซ์ F5 XC ผ่าน **xcsh: Add Context**

## การผสานรวมที่รองรับ

| การผสานรวม     | ติดตั้ง                                 | ยืนยันตัวตน         |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | รวมอยู่ในการติดตั้ง |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                 |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

เรียกใช้ **xcsh: Platform Readiness** ใน VS Code
เพื่อดูว่าการผสานรวมใดติดตั้งและยืนยันตัวตนแล้ว

## เอกสารประกอบ

เอกสารฉบับเต็มมีให้ที่
**[https://f5xc-salesdemos.github.io/vscode-xcsh/](https://f5xc-salesdemos.github.io/vscode-xcsh/)**

## การมีส่วนร่วม

ดู [CONTRIBUTING.md](CONTRIBUTING.md) สำหรับกฎการทำงาน การตั้งชื่อ branch
และข้อกำหนด CI

## สัญญาอนุญาต

ดู [LICENSE](LICENSE)
