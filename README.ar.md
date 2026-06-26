🌐 [English](https://f5-sales-demo.github.io/vscode-xcsh/) |
[日本語](https://f5-sales-demo.github.io/vscode-xcsh/ja/) |
[한국어](https://f5-sales-demo.github.io/vscode-xcsh/ko/) |
[简体中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-cn/) |
[繁體中文](https://f5-sales-demo.github.io/vscode-xcsh/zh-tw/) |
[Español](https://f5-sales-demo.github.io/vscode-xcsh/es/) |
[Português](https://f5-sales-demo.github.io/vscode-xcsh/pt-br/) |
[Français](https://f5-sales-demo.github.io/vscode-xcsh/fr/) |
[Deutsch](https://f5-sales-demo.github.io/vscode-xcsh/de/) |
[Italiano](https://f5-sales-demo.github.io/vscode-xcsh/it/) |
**العربية** | [हिन्दी](https://f5-sales-demo.github.io/vscode-xcsh/hi/)
| [ไทย](https://f5-sales-demo.github.io/vscode-xcsh/th/)

# إضافة VS Code

إضافة VS Code لإدارة موارد F5 Distributed Cloud مع IntelliSense ومحادثة xcsh

## الميزات

- **إدارة الموارد** — تصفح وإنشاء وتحرير وحذف موارد F5 Distributed Cloud مباشرة
  من VS Code
- **حالة السحابة** — لوحة معلومات حالة البنية التحتية العالمية في الوقت الفعلي
- **مساعد الدردشة بالذكاء الاصطناعي** — مشارك المحادثة `@xcsh` لعمليات المنصة
  باللغة الطبيعية
- **IntelliSense** — إكمال مخططات JSON لجميع أنواع موارد F5 XC
- **تكامل متعدد السحابات** — يعمل مع AWS وAzure وGCP وGitHub وGitLab وTerraform
  وSalesforce

## البدء

1. ثبّت الإضافة من
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
2. ثبّت xcsh: `brew install f5-sales-demo/tap/xcsh`
3. افتح لوحة الأوامر (`Cmd+Shift+P`) وشغّل **xcsh: Platform Readiness** للتحقق
   من الإعداد
4. أضف سياق F5 XC عبر **xcsh: Add Context**

## التكاملات المدعومة

| التكامل        | التثبيت                                 | المصادقة            |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5-sales-demo/tap/xcsh` | مضمّن مع التثبيت    |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install hashicorp/tap/terraform`  | غير مطلوب           |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

شغّل **xcsh: Platform Readiness** في VS Code لمعرفة التكاملات المثبّتة والمصادق
عليها.

## التوثيق

التوثيق الكامل متاح على
**[https://f5-sales-demo.github.io/vscode-xcsh/](https://f5-sales-demo.github.io/vscode-xcsh/)**.

## المساهمة

راجع [CONTRIBUTING.md](CONTRIBUTING.md) لمعرفة قواعد سير العمل وتسمية الفروع
ومتطلبات CI.

## الرخصة

راجع [LICENSE](LICENSE).
