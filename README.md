# Hearth

轻量的桌面角色扮演对话工具，兼容 SillyTavern（酒馆）的角色卡、世界书和预设。

![版本](https://img.shields.io/badge/version-0.1.0-c2410c) ![平台](https://img.shields.io/badge/platform-Windows-0078d4) ![许可证](https://img.shields.io/badge/license-AGPL--3.0-blue)

- [功能](#功能)
- [快速开始](#快速开始)
- [使用说明](#使用说明)
- [兼容情况](#兼容情况)
- [数据与安全](#数据与安全)
- [开发](#开发)
- [版本与更新](#版本与更新)
- [许可证与致谢](#许可证与致谢)

## 功能

- **直接使用酒馆的素材**：导入角色卡（PNG / JSON）、世界书和 Chat Completion 预设，提示词的组装规则与酒馆一致。
- **提示词追踪**：每次发给模型的完整内容都看得到，每一段都标明来源，以及触发了哪些世界书条目、为什么触发。
- **前端卡与 MVU**：消息里的状态栏等界面能正常渲染；MVU 变量按楼层和版本分别保存，切换版本时状态跟着切换。
- **EJS 模板**：兼容 ST-Prompt-Template 的常用写法，例如按剧情阶段载入不同章节。
- **可撤销的编辑**：角色卡、世界书、预设的每次修改都有记录，随时可以撤销。
- **轻量**：一个本地服务加一个窗口；运行只需要 Node.js，不需要安装依赖。

## 快速开始

### 下载发布包（推荐）

1. 安装 [Node.js](https://nodejs.org/) 20 或更高版本。
2. 从 [Releases](https://github.com/xinc2333/Hearth/releases) 下载最新的 `Hearth-vX.Y.Z-windows.zip`，解压到任意文件夹。
3. 双击 `Start.bat`。会出现一个黑色的命令行窗口（这是后台服务，关掉它 Hearth 就会退出），同时用 Edge 打开 Hearth 的窗口。

如果窗口没有自动打开，手动访问 <http://127.0.0.1:8730>。

### 从源码运行

```
git clone https://github.com/xinc2333/Hearth.git
cd Hearth
npm install
npm run build
```

然后双击 `Start.bat`，或运行 `npm start`。

## 使用说明

### 连接模型

第一次打开会进入「设置 → 模型连接」：

- **接口地址**：OpenAI 兼容接口，通常以 `/v1` 结尾，例如 `https://api.deepseek.com/v1` 或各类中转地址。
- **API 密钥**：只保存在本机的 `data/secrets.json`。
- **模型**：点「获取模型列表」后选择。

### 网络代理（可选）

如果访问接口需要走本机代理（例如 V2Ray），把 `Start.local.example.bat` 复制一份，改名为 `Start.local.bat`，再按里面的示例填写代理地址。这个文件只在你的电脑上生效，更新 Hearth 时也会保留。使用代理需要 Node.js 24.5 或更高版本。

### 导入

把文件拖进窗口，或点左上角的「导入」：

| 文件 | 导入为 |
| --- | --- |
| 角色卡 PNG / JSON（V1 – V3） | 角色；卡里自带的世界书会一起导入并自动绑定 |
| 酒馆世界书 JSON | 世界书，在角色的「世界书」面板里绑定 |
| 酒馆 Chat Completion 预设 JSON | 预设，导入后自动设为当前预设 |

导入的原始文件会备份在 `data/imports/`。

### 预设

预设是全局的：所有角色和对话共用同一个当前预设。在「设置 → 预设」里管理；点聊天顶部的「预设：…」也能直接打开。

- **导入预设**：选择酒馆导出的 `.json` 文件。
- **切换**：从下拉框选择预设，点「设为当前预设」。
- **开关条目**：和酒馆一样，立即生效；点开条目可以查看和编辑内容。
- **分组和单选**：Meowssiah 这类带菜单标记的预设，`----角色控制----` 这样的分隔条目会显示成分组标题；标了「单选」的同组条目只能开一个。

### 界面

- **左侧**：角色和对话列表。悬停在对话上可以删除；按 `Ctrl+B` 或点右上角的按钮可以收起侧栏。
- **中间**：对话区。悬停在消息上可以复制、编辑、删除；最后一条回复可以切换版本、重新生成或继续写。
- **面板**：点右上角的「面板」（或按 `Ctrl+I`）打开，拖动左边缘可以调整宽度：

| 标签 | 内容 |
| --- | --- |
| 提示词 | 上一次（或下一次）请求的完整内容 |
| 变量 | MVU 状态、对话变量和最近一轮的变化 |
| 角色卡 / 世界书 | 直接编辑；把鼠标移到长文本框上，点右上角的按钮可以放大编辑 |
| 预设 | 当前预设的条目开关 |
| 历史 | 所有修改，可以逐条撤销 |

### 阅读

点聊天窗口右上角的「Aa」可以调整正文的字体、字号、行距、栏宽，以及段首缩进、两端对齐和对话着色。「自定义」字体可以填电脑上已安装的任何字体名（例如霞鹜文楷）。

回复生成时，画面默认停在回复的开头，方便从第一行读起；想一直跟着最新文字，可以在阅读设置里打开「生成时自动滚到最新文字」。

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `Ctrl+K` | 快速查找角色、对话和功能 |
| `Ctrl+B` | 显示或收起侧栏 |
| `Ctrl+I` | 打开或关闭面板 |
| `←` `→` | 切换最后一条回复的版本（输入框为空时）；在最后一个版本按 `→` 会生成新版本 |
| `Esc` | 停止生成；关闭弹窗 |
| `Enter` / `Shift+Enter` | 发送 / 换行 |
| `Ctrl+Enter` | 保存正在编辑的消息 |

## 兼容情况

| 内容 | 状态 |
| --- | --- |
| 角色卡字段、备选开场白、角色备注（深度提示） | 支持 |
| 预设条目顺序、开关、注入深度和角色，主提示词 / 后置指令覆盖 | 支持，与酒馆的组装规则一致 |
| 世界书：关键词逻辑、扫描深度、递归、分组、概率、预算、sticky / cooldown / delay、八种插入位置 | 支持 |
| 宏：`{{char}}`、`{{user}}`、嵌套宏、变量宏、`{{random}}`、`{{roll}}`、时间、注释等 | 支持常用宏 |
| 正则脚本：作用位置、仅提示词 / 仅显示、深度限制 | 支持 |
| 前端卡（消息里的 HTML 界面、状态栏） | 在沙箱中渲染，提供酒馆助手常用接口和 jQuery、lodash |
| MVU（MagVarUpdate） | 支持初始化、JSONPatch 和 `_.set` 更新，模型漏写时自动补全 |
| EJS 提示词模板（ST-Prompt-Template） | 支持 `getvar`、`setvar`、`getwi`、`print` 等常用接口 |
| Meowssiah / SPreset 类预设 | 内置适配：剥离控制标记，按预设配置附带回复工具 |
| 酒馆助手脚本、STscript 斜杠命令、酒馆第三方扩展 | 尚未支持（数据会保留） |
| Text Completion / instruct 模板、群聊、`.charx` | 尚未支持 |

## 数据与安全

- 所有数据都在 `data/` 目录里，每个角色、世界书、预设、对话各是一个 JSON 文件。备份时复制整个目录即可。
- 服务只监听本机（`127.0.0.1`），并拒绝来自其他网站的请求。
- 角色卡和预设里的代码在沙箱中运行：EJS 模板运行在 QuickJS（WebAssembly）里，访问不到文件和网络；消息里的 HTML 界面运行在隔离的 iframe 里。
- 预设脚本引用的远程代码不会下载或执行。

## 开发

### 目录结构

```
src/core/     数据模型、提示词组装、世界书、宏、正则、MVU、酒馆格式导入（不依赖界面，可单独测试）
src/server/   本地服务：存储、模型接口、生成流程、插件、内置适配
src/web/      界面（React）
tests/        测试
docs/         设计说明
plugins/      第三方插件目录
```

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 构建界面和服务，输出到 `dist/` |
| `npm test` | 运行测试 |
| `npm run typecheck` | 类型检查 |
| `npm run dev:server` / `npm run dev:web` | 开发模式 |

设计说明和插件接口见 [docs/architecture.md](docs/architecture.md)，提交与发布规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 版本与更新

版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)，每个版本的变化记录在 [CHANGELOG.md](CHANGELOG.md)。当前版本号可以在「设置 → 阅读与外观」里看到。

更新方法：

1. 下载新版本的压缩包，解压后覆盖到原来的文件夹。压缩包里不含 `data/`，你的数据不会被覆盖。
2. 双击 `Start.bat`。如果旧版本还在后台运行，新版本会自动替换它。

## 许可证与致谢

本项目以 [GNU AGPL-3.0](LICENSE) 或更新版本发布。

- 提示词组装、世界书、宏、正则的行为对照 [SillyTavern](https://github.com/SillyTavern/SillyTavern)（AGPL-3.0）实现。
- 兼容以下社区项目的数据格式和约定：[MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)、[ST-Prompt-Template](https://github.com/zonde306/ST-Prompt-Template)、[JS-Slash-Runner（酒馆助手）](https://github.com/N0VI028/JS-Slash-Runner)、SPreset / Meowssiah 预设。
- 使用的开源库：React、marked、DOMPurify、yaml、quickjs-emscripten、jQuery、lodash，各自遵循其许可证。
