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
[العربية](https://f5xc-salesdemos.github.io/vscode-xcsh/ar/) | **हिन्दी**
| [ไทย](https://f5xc-salesdemos.github.io/vscode-xcsh/th/)

# VS Code Extension

IntelliSense और xcsh चैट के साथ F5 Distributed Cloud संसाधनों के प्रबंधन के लिए
VS Code एक्सटेंशन

## विशेषताएँ

- **संसाधन प्रबंधन** — VS Code से सीधे F5 Distributed Cloud संसाधनों को ब्राउज़
  करें, बनाएँ, संपादित करें और हटाएँ
- **क्लाउड स्टेटस** — रियल-टाइम वैश्विक इन्फ्रास्ट्रक्चर हेल्थ डैशबोर्ड
- **AI चैट सहायक** — प्राकृतिक भाषा में प्लेटफ़ॉर्म संचालन के लिए `@xcsh` चैट
  प्रतिभागी
- **IntelliSense** — सभी F5 XC रिसोर्स टाइप के लिए JSON स्कीमा कम्पलीशन
- **मल्टी-क्लाउड एकीकरण** — AWS, Azure, GCP, GitHub, GitLab, Terraform और
  Salesforce के साथ संगत

## शुरू करें

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RobinMordasiewicz.xcsh)
   से एक्सटेंशन इंस्टॉल करें
2. xcsh इंस्टॉल करें: `brew install f5xc-salesdemos/tap/xcsh`
3. कमांड पैलेट (`Cmd+Shift+P`) खोलें और अपना सेटअप जाँचने के लिए **xcsh:
   Platform Readiness** चलाएँ
4. **xcsh: Add Context** द्वारा F5 XC कॉन्टेक्स्ट जोड़ें

## समर्थित एकीकरण

| एकीकरण         | इंस्टॉल                                 | प्रमाणीकरण          |
| -------------- | --------------------------------------- | ------------------- |
| xcsh           | `brew install f5xc-salesdemos/tap/xcsh` | इंस्टॉल में शामिल   |
| AWS CLI        | `brew install awscli`                   | `aws sso login`     |
| Azure CLI      | `brew install azure-cli`                | `az login`          |
| Google Cloud   | `brew install google-cloud-sdk`         | `gcloud auth login` |
| GitHub CLI     | `brew install gh`                       | `gh auth login`     |
| GitLab CLI     | `brew install glab`                     | `glab auth login`   |
| Terraform      | `brew install hashicorp/tap/terraform`  | N/A                 |
| Salesforce CLI | `brew install sf`                       | `sf org login web`  |

कौन से एकीकरण इंस्टॉल और प्रमाणित हैं यह देखने के लिए VS Code में **xcsh:
Platform Readiness** चलाएँ।

## प्रलेखन

संपूर्ण प्रलेखन
**[https://f5xc-salesdemos.github.io/vscode-xcsh/](https://f5xc-salesdemos.github.io/vscode-xcsh/)**
पर उपलब्ध है।

## योगदान

वर्कफ़्लो नियम, ब्रांच नामकरण और CI आवश्यकताओं के लिए
[CONTRIBUTING.md](CONTRIBUTING.md) देखें।

## लाइसेंस

[LICENSE](LICENSE) देखें।
