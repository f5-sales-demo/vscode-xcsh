🌐 [English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) |
[简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) |
[Español](README.es.md) | [Português](README.pt-br.md) |
[Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) |
[العربية](README.ar.md) | **हिन्दी** | [ไทย](README.th.md)

# VS Code एक्सटेंशन

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/enforce-repo-settings.yml)
[![CI](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/ci.yml)
[![Release](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml/badge.svg)](https://github.com/f5xc-salesdemos/vscode-f5xc-tools/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/vscode-f5xc-tools)](LICENSE)

F5 Distributed Cloud संसाधनों को IntelliSense और xcsh चैट के साथ प्रबंधित करने
के लिए VS Code एक्सटेंशन

## विशेषताएं

- **संसाधन प्रबंधन** — VS Code से सीधे F5 Distributed Cloud संसाधनों को ब्राउज़,
  बनाएं, संपादित और हटाएं
- **क्लाउड स्थिति** — रियल-टाइम वैश्विक बुनियादी ढांचा स्वास्थ्य डैशबोर्ड
- **AI चैट सहायक** — प्राकृतिक भाषा प्लेटफ़ॉर्म संचालन के लिए `@xcsh` चैट
  प्रतिभागी
- **IntelliSense** — सभी F5 XC संसाधन प्रकारों के लिए JSON स्कीमा पूर्णता
- **मल्टी-क्लाउड एकीकरण** — AWS, Azure, GCP, GitHub, GitLab, Terraform, और
  Salesforce के साथ काम करता है

## शुरू करें

1. [VS Code मार्केटप्लेस](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   से एक्सटेंशन इंस्टॉल करें
2. xcsh इंस्टॉल करें: `brew install f5xc-salesdemos/tap/xcsh`
3. कमांड पैलेट खोलें (`Cmd+Shift+P`) और अपना सेटअप जांचने के लिए **xcsh:
   Platform Readiness** चलाएं
4. **xcsh: Add Context** के माध्यम से F5 XC कॉन्टेक्स्ट जोड़ें

## समर्थित एकीकरण

| एकीकरण         | इंस्टॉल                                 | प्रमाणीकरण           |
| -------------- | --------------------------------------- | -------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | इंस्टॉल के साथ शामिल |
| AWS CLI        | `brew install awscli`                   | `aws sso login`      |
| Azure CLI      | `brew install azure-cli`                | `az login`           |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login`  |
| GitHub CLI     | `brew install gh`                       | `gh auth login`      |
| GitLab CLI     | `brew install glab`                     | `glab auth login`    |
| Terraform      | `brew install terraform`                | लागू नहीं            |
| Salesforce CLI | `brew install sf`                       | `sf org login web`   |

यह देखने के लिए कि कौन से एकीकरण इंस्टॉल और प्रमाणित हैं, VS Code में **xcsh:
Platform Readiness** चलाएं।

## दस्तावेज़ीकरण

पूर्ण दस्तावेज़ीकरण
**[https://f5xc-salesdemos.github.io/vscode-f5xc-tools/](https://f5xc-salesdemos.github.io/vscode-f5xc-tools/)**
पर उपलब्ध है।

## योगदान

वर्कफ़्लो नियमों, ब्रांच नामकरण, और CI आवश्यकताओं के लिए
[CONTRIBUTING.md](CONTRIBUTING.md) देखें।

## लाइसेंस

[LICENSE](LICENSE) देखें।
