# Hearth

轻量的桌面角色扮演对话工具，兼容 SillyTavern（酒馆）的角色卡、世界书和预设。

![版本](https://img.shields.io/badge/version-0.8.0-c2410c) ![平台](https://img.shields.io/badge/platform-Windows-0078d4) ![许可证](https://img.shields.io/badge/license-AGPL--3.0-blue)

## 主要功能

- **直接使用酒馆的素材**：导入角色卡、世界书和预设，提示词按酒馆的规则组装。
- **看得见的提示词**：每次发给模型的完整内容都能查看，每一段都标明来源。
- **前端卡和变量**：角色卡的状态栏、开局面板、小手机等界面可以正常显示和操作，MVU 变量跟随回复的版本切换。
- **AI 改卡**：在对话里告诉 AI 想怎么改角色卡或世界书，每一处改动都能对照和撤销。
- **剧场、聊天和跑团**：在剧场里写故事，切到聊天和 AI 讨论剧情；跑团给行动加上掷骰检定，别人对主角的态度随事件变化。
- **安装即用**：Windows 安装包，自带运行环境，有新版本时自动更新。

## 下载安装

1. 从 [Releases](https://github.com/xinc2333/Hearth/releases/latest) 下载 `Hearth-Setup-X.Y.Z.exe` 并运行。不需要管理员权限，可以选择安装位置。
2. 如果 Windows 提示「Windows 已保护你的电脑」，点「更多信息」，再点「仍要运行」。Hearth 暂时没有数字签名，只有第一次安装会出现这个提示。

需要 64 位的 Windows 10 或 11。

### 从旧版迁移

0.4.0 及更早的版本需要解压后双击 `Start.bat` 运行。换成安装版的步骤：

1. 关闭旧版的命令行窗口，安装新版。
2. 第一次打开新版时选「导入旧版数据…」，再选旧版所在的文件夹。

对话、角色卡、预设、设置和 API 密钥都会复制过来，旧文件保持不变。

## 开始使用

1. **连接模型**：第一次打开会进入「设置 → 模型连接」。填写接口地址和 API 密钥，再从列表里选择模型。支持所有 OpenAI 兼容接口。
2. **导入角色卡**：把角色卡（PNG 或 JSON）拖进窗口。世界书也可以这样导入，预设在「设置 → 预设」里导入。
3. **开始对话**：在左侧选择角色。

关闭窗口时，Hearth 会留在屏幕右下角的通知区域继续运行。要退出，右键点那里的图标，选「退出 Hearth」。

预设、快捷键、AI 改卡、跑团、插件和网络代理的用法，见[使用说明](docs/guide.md)。

## 兼容情况

以下内容与酒馆兼容：

- 角色卡（V1～V3）、世界书和 Chat Completion 预设
- 宏和正则脚本
- 常见的社区格式：角色卡界面和酒馆助手的常用接口、MVU 变量、EJS 提示词模板、SPreset 类预设

暂不支持：预设里的酒馆助手脚本、STscript 斜杠命令、酒馆第三方扩展、Text Completion 和群聊。完整列表见[使用说明](docs/guide.md#兼容情况)。

## 数据与隐私

- 所有数据保存在本机的 `%APPDATA%\Hearth\data`，更新和卸载都不会删除。备份时复制这个文件夹即可。
- API 密钥只保存在本机，只会发送到你填写的接口地址。
- 角色卡和预设里的代码在隔离环境中运行，访问不到你的文件和 Hearth 的数据。角色卡界面可以加载网上的资源；预设引用的远程代码不会被下载或执行。
- 角色卡向模型发的请求走你的模型连接，内容在面板的「提示词」页能看到。

## 更新

Hearth 会自动检查新版本，并在后台下载，通常只下载有变化的部分。下载完成后，Hearth 会在你没有使用的时候自动重启，完成更新。正在生成回复或者有没保存的修改时，会等到之后再重启。

更新文件放在 GitHub 上。在中国大陆使用时，建议在代理工具里开启「系统代理」。

每个版本的变化见[更新日志](CHANGELOG.md)。

## 参与开发

从源码运行、目录结构、提交和发布流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，设计说明见 [docs/architecture.md](docs/architecture.md)。

## 许可证与致谢

Hearth 以 [GNU AGPL-3.0](LICENSE) 或更新版本发布。

- 提示词组装、世界书、宏和正则的行为参照 [SillyTavern](https://github.com/SillyTavern/SillyTavern)（AGPL-3.0）实现。
- 兼容以下社区项目的格式和约定：[MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)、[ST-Prompt-Template](https://github.com/zonde306/ST-Prompt-Template)、[JS-Slash-Runner（酒馆助手）](https://github.com/N0VI028/JS-Slash-Runner)，以及 SPreset / Meowssiah 预设。
- 使用的开源库包括 Electron、React、marked、DOMPurify、yaml、quickjs-emscripten、jQuery、lodash、Vue、vue-router、pinia、klona 和 zod，各自遵循其许可证。
