🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) |
[Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) |
**العربية** | [हिन्दी](README.hi.md) | [ไทย](README.th.md)

# إضافة VS Code

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

إضافة VS Code لإدارة موارد F5 Distributed Cloud مع IntelliSense ودردشة xcsh

## الميزات

- **إدارة الموارد** — تصفح وإنشاء وتعديل وحذف موارد F5 Distributed Cloud مباشرة
  من VS Code
- **حالة السحابة** — لوحة معلومات صحة البنية التحتية العالمية في الوقت الفعلي
- **مساعد الدردشة بالذكاء الاصطناعي** — مشارك الدردشة `@xcsh` لعمليات المنصة
  باللغة الطبيعية
- **IntelliSense** — إكمالات مخطط JSON لجميع أنواع موارد F5 XC
- **تكاملات السحابة المتعددة** — يعمل مع AWS و Azure و GCP و GitHub و GitLab و
  Terraform و Salesforce

## البدء

1. قم بتثبيت الإضافة من
   [سوق VS Code](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. قم بتثبيت xcsh: `brew install f5xc-salesdemos/tap/xcsh`
3. افتح لوحة الأوامر (`Cmd+Shift+P`) وقم بتشغيل **xcsh: Platform Readiness**
   للتحقق من إعدادك
4. أضف سياق F5 XC عبر **xcsh: Add Context**

## التكاملات المدعومة

| التكامل        | التثبيت                                 | المصادقة            |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | مضمن مع التثبيت     |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install terraform`                | غير متاح            |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

قم بتشغيل **xcsh: Platform Readiness** في VS Code لمعرفة التكاملات المثبتة
والمصادق عليها.

## التوثيق

التوثيق الكامل متاح على
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**.

## المساهمة

راجع [CONTRIBUTING.md](CONTRIBUTING.md) لقواعد سير العمل وتسمية الفروع ومتطلبات
CI.

## الرخصة

راجع [LICENSE](LICENSE).
