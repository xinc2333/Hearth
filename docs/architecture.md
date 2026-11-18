# 架构说明

本文面向开发者，说明 Hearth 的数据模型、提示词组装、回复模式、插件接口、安全边界、AI 改卡和桌面版，对应 0.6.x 版本。

## 一轮对话是什么

```
assemble(角色卡, 用户角色, 预设, 世界书, 聊天记录, 状态) → 消息列表
        → 模型 → 回复文本
        → 整理（正则、插件）→ 写入聊天记录和状态
```

其余部分都是界面和数据的传递。Hearth 把这条链路拆成三部分：**资源**、**修改**和**组装**。

## 1. 资源

所有用户数据都是资源：一份带 `id` 和 `kind` 的 JSON。每个资源存成 `data/<类型>/<id>.json`。（`data/` 指数据目录：安装版是 `%APPDATA%\Hearth\data`，从源码运行时是仓库里的 `data/`。）

| 类型 | 内容 |
| --- | --- |
| `character` | 角色字段、绑定的世界书、正则、卡片脚本 |
| `lorebook` | 世界书条目 |
| `preset` | 采样参数、提示词条目和顺序、格式字符串、正则、脚本 |
| `persona` | 用户角色 |
| `chat` | 消息（每条消息有多个版本 swipe）、对话变量、作者注释 |

字段名经过整理：例如世界书位置写成 `at_depth`，不再是数字 `4`；逻辑写成 `and_any`，不再是 `0`。认不出的原始字段原样保存在 `extra` 里，以后导出回酒馆格式时不会丢。

**状态属于时间线。** 每个 swipe 可以带一个 `state`（MVU 的 `stat_data` 就存在这里）。切换版本、回到某一楼时，状态自动跟着变，不需要额外的回滚逻辑。读当前状态就是从最后一条消息往回找第一个有状态的版本。

## 2. 修改

资源只通过一种方式改变：**ChangeSet**（一组操作）。

```ts
{ op: 'set',    path: ['fields', 'description'], value: '…' }
{ op: 'edit',   path: ['entries', '@12', 'content'], find: '旧句子', replace: '新句子' }
{ op: 'insert', path: ['entries'], value: { … } }
{ op: 'unset',  path: ['entries', '@12'] }
{ op: 'move',   path: ['order', '@main'], index: 0 }
```

- `@12` 表示「id 为 12 的那一项」，所以列表重新排序后，修改依然有效。
- `edit` 表示「找到这段文字并替换」，适合 AI 修改长文本：只改一句，不用重写整个字段。
- 每次修改都会记录作者（`user` / `ai` / `script` / `plugin:…`）和原因，同时自动生成撤销操作，写进 `data/journal.jsonl`。

界面上的编辑、AI 改卡、MVU 改变量、插件写数据，走的都是这一个通道，所以它们共用同一套修改历史和撤销。

## 3. 组装

`src/core/assemble.ts` 是一个纯函数：输入一份快照，输出要发送的消息列表，外加每一段的来源。它按酒馆 `Generate() → prepareOpenAIMessages()` 的步骤逐一对应实现，注释里标了每段对应的酒馆函数，方便对照。

追踪信息直接来自组装过程，不需要额外的抓包扩展。

## 回复模式和开关

剧场、聊天、编辑三种模式，以及深度思考和纸条，是 Hearth 自己的功能，不属于任何预设（`src/core/reply.ts`）。

- **状态**：存在对话的 `reply` 字段里：`{ mode: 'theater' | 'chat', deepThink, note }`。编辑模式是另一回事：它是消息的频道（`chat.mode` 和 `message.mode`），编辑消息不进入剧情的提示词。
- **预设怎么配合**：条目开头的 `<<<|hearth|when:…>>>` 标记决定这一条在什么条件下发送，`{{hearth_note}}` 等宏取开关的值。写法见[预设适配](presets.md)。
- **开关什么时候出现**：当前预设的条目声明了（`presetFeatures`），或者某个插件替它声明了（`registerFeatures`，例如酒馆助手替带控制台的 SPreset 预设声明）。都没有时，输入框旁只有「剧场」和「编辑」。
- **回复之后**：剧情回复成功后，送达的纸条清空；聊天模式的回复之后回到剧场。深度思考保持不变。
- 输入框旁的开关由 `/api/chats/:id/context` 的 `controls` 给出：先是这三个，再是插件的开关。改动走 `/api/chats/:id/controls`，不进修改历史。

## 4. 插件

内核只负责两件事：按酒馆的规则组装提示词，以及显示模型的输出。其余功能都是插件，内置插件和第三方插件用同一套接口，可以在「设置 → 插件」里开关、安装、删除和自动更新。

| 插件 | 对应的酒馆扩展 | 做什么 |
| --- | --- | --- |
| 提示词模板 | ST-Prompt-Template | 运行提示词里的 EJS 模板 |
| 酒馆助手 | JS-Slash-Runner | 消息里的前端界面、MVU 变量、SPreset 类预设（运行预设的请求脚本，把回复模式、深度思考和纸条交给它） |
| 跑团 | — | 掷骰检定、属性、别人对主角的态度和角色之间的关系（见 [tabletop.md](tabletop.md)） |

关闭插件时，卡片和预设里对应的内容原样保存，只是不再处理。比如关掉酒馆助手，状态栏的 HTML 会显示成代码，预设的控制标记会原样发给模型。

### 插件的组成

插件是一个文件夹，包含 `manifest.json` 和入口模块（默认 `server.mjs`）：

```json
{
  "id": "hello",
  "name": "打招呼",
  "description": "在提示词里加一句打招呼的提醒。",
  "version": "1.0.0",
  "hearth": ">=0.3.0",
  "main": "server.mjs",
  "files": ["server.mjs"],
  "order": 50,
  "compat": { "name": "对应的酒馆扩展", "url": "https://github.com/…" },
  "repository": "https://github.com/作者/仓库/tree/main/hello"
}
```

- `hearth`：兼容的 Hearth 版本。不满足时插件不会加载。
- `files`：插件的全部文件。更新时会按这个列表下载。
- `order`：多个插件处理同一环节时，数值小的先运行。
- `repository`：更新来源，填插件文件夹在 GitHub 上的链接。

```js
// server.mjs
export default {
    setup(api) {
        api.registerMacro('hello', () => '你好');
        api.onBeforeAssemble(ctx => {
            ctx.injections.push({ key: 'hello', value: '记得打招呼。', position: 'in_chat', depth: 1, role: 'system', scan: false });
        });
    },
};
```

### 接口

| 接口 | 用途 | 内置插件的例子 |
| --- | --- | --- |
| `registerMacro(name, fn)` | 新的宏 | — |
| `onBeforeAssemble(ctx)` | 往提示词里加内容（`ctx.injections`，对应酒馆的扩展提示词） | — |
| `onAfterAssemble(result, ctx)` | 调整最终消息，或附加请求字段（`result.request`） | EJS 模板；SPreset 的控制标记和回复工具 |
| `onAfterReceive(ctx)` | 处理回复，返回新文本和对资源的修改。还可以返回 `background`：回复保存并显示之后在后台运行的工作，结束时它的修改写进对话；这个对话的下一次回复会先等它完成 | SPreset 的工具回复格式化、MVU 变量更新；跑团的结算 |
| `onChatCreate(ctx)` | 新对话创建时初始化 | MVU 初始变量 |
| `onRequest(body, ctx)` | 请求发出前，查看或替换最终的请求体（对应酒馆的 `CHAT_COMPLETION_SETTINGS_READY`）。改写后的内容会出现在提示词追踪的「实际发送」里 | 运行预设自己的 Stage 1 |
| `registerControls({ list, change })` | 在输入框旁边放插件自己的开关（`toggle`），排在 Hearth 的回复开关后面 | 检定绝对通过 |
| `registerFeatures(preset => …)` | 声明插件替这个预设处理哪些回复开关（`chat`、`deepThink`、`note`），开关就会出现 | 带控制台的 SPreset 预设 |
| `registerAction(id, fn)` | 窗口里的按钮调用的操作（`/api/chats/:id/actions/<插件>/<id>`），返回对对话的修改 | 跑团的「重新结算」 |
| `onRequest` 的 `ctx.send / progress / trace` | 在正文请求之前用当前连接另发请求（不流式，工具调用按原样返回）；向界面推送进度；把这次请求记进提示词追踪。`ctx.type`、`messageId`、`swipeId` 说明正在写哪条回复 | 跑团的裁定 |
| `registerEditTask({ … })` | 编辑模式的任务：输入框下的按钮、追加到编辑提示词的说明，以及修改块里属于它的地址（如【改写】跑团角色表），由任务自己执行 | 数据化适配 |
| `complete(req)` | 用当前模型连接发一次请求 | MVU 漏写时补全 |
| `send(body, signal)` | 用当前模型连接发一个准备好的请求体（不流式，工具调用按原样返回），可以在生成之外使用 | 跑团的结算 |
| `macros.evaluate / context` | 展开宏（包括其他插件注册的宏） | EJS 里的 `getwi` |
| `sandbox.run(code, host)` | 在 QuickJS 沙箱里运行卡片或预设的代码 | EJS 模板 |
| `config()` | 插件自己的设置 | — |
| `store.get / list / apply` | 读写资源（走修改通道，可以撤销） | — |

插件只能通过 `api` 使用内核，不能直接引用内核的代码。这样插件可以单独更新，不需要和 Hearth 一起发版。

### 存放位置和更新

- **内置插件**随 Hearth 一起发布，放在安装目录的 `plugins/`。源码在 `src/plugins/<id>`，由 `npm run build:plugins` 构建到 `plugins/<id>`。构建结果会提交到仓库，所以仓库里的这个文件夹本身就是更新来源。
- **安装的插件和下载的更新**放在 `data/plugins/<id>`，更新 Hearth 时不会被覆盖。同一个插件同时有内置版和下载版时，用版本更新、并且和当前 Hearth 兼容的那一份。
- **自动更新**：启动 20 秒后检查一次，之后每 6 小时检查一次（每个插件都可以关掉）。发现新版本就下载，等当前回复生成完再替换，不用重启。被替换的版本保留在 `data/plugins/.previous/<id>`。新版本加载失败时，会自动退回原来的版本。
- **删除**只针对下载的插件。删除内置插件的下载版，会恢复为内置版；内置插件本身不能删除，只能关闭。

## 5. 卡片代码的安全边界

角色卡和预设里的代码来自网上，Hearth 把它们放进沙箱：

- **EJS 模板**在 QuickJS（WebAssembly）里执行：访问不到文件、网络和系统，并且有时间和内存上限。
- **消息里的 HTML 界面**（状态栏、前端卡）在 `sandbox` iframe 里运行：拿不到主界面和本地接口，只能通过消息通道读变量、发 `/send` 之类的指令。
- **预设自带的请求脚本**（SPreset 的 Stage 1，`FinalRequestProcessing`）在 QuickJS 沙箱里运行。它拿到的是一个按酒馆形状搭出来的小环境：上下文、对话元数据、酒馆助手变量接口、localStorage。这些数据都来自当前对话，脚本访问不到网络和页面；它对这些数据的修改会写回对话。脚本运行失败时，这一次改用 Hearth 的内置适配，并在提示词追踪里说明。
- 预设脚本引用的**远程代码不会下载或执行**。例如 SPreset 本身的运行时会从外部网址加载，它的「日志上传」还会把调试会话发到第三方服务器；Hearth 不加载这个运行时，也不实现日志上传。

## 6. AI 改卡

输入框左下角切换到「编辑」，就是在和 AI 讨论、修改当前角色卡和它的世界书。AI 还是正常回复一轮，只是在回复最后附上一个修改块，由 Hearth 按块里的地址填进卡片。这和 MVU 的 `<UpdateVariable>` 是同一个思路。

```
<card_edit>
【改写】世界书#3 › 角色档案 › 基本信息 › 年龄
年龄: 二十八岁
【替换】角色卡 › 开场白
<<<<<<< 原文
秋深矣
=======
秋意正浓
>>>>>>> 新文
【新增】世界书「书名」
标题：青石巷书摊｜关键词：书摊、青石巷｜触发：关键词
（条目内容）
【删除】世界书#12
【设置】世界书#4
关键词：白玫、旧物店
</card_edit>
```

### 结构层：不改变存储格式

角色卡和世界书仍然按酒馆的格式保存，导入时不改写任何内容。`src/core/doc.ts` 只是在文字上识别出大纲，识别结果不写回文本：

- 能识别的结构：外层的 `<标签>…</标签>`、按缩进分层的「键: 值」（类 YAML，不要求是合法的 YAML）、`#` 标题、`【标题】` 行。
- 原样跳过的部分：代码块、EJS 的 `<% %>`、`键: |` 后面的多行文字。

所以「世界书#3 › 角色档案 › 基本信息 › 年龄」用的就是内容自己的标题，模型照着它看到的原文写地址就行。改写一段时，只替换这一段的几行，其余文字逐字不变，导出给酒馆也不受影响。测试里用真实的角色卡验证过：每一段原样改写一遍，结果和原文完全相同。

### 一轮编辑发出的内容

| 部分 | 内容 |
| --- | --- |
| 编辑说明 | Hearth 内置的说明和修改块格式（`src/server/card-edit.ts` 的 `EDIT_INSTRUCTION`） |
| 卡片目录 | 所有字段和条目：地址、标题、触发方式、位置、长度，以及哪些是只读、为什么 |
| 全文 | 在预算内放入可以修改的部分；卡片太大时，优先放用户提到的条目和上一轮改过的条目 |
| 最近的剧情 | 最近几条剧情消息，方便「根据刚才的剧情补一个条目」 |
| 编辑对话 | 之前几轮的编辑请求和回复（修改块换成执行结果） |

编辑消息不会进入剧情的提示词；剧情模式下的提示词追踪也看不到它们。

### 执行规则

- 同一个回复里的修改，每张卡、每本世界书各合成一次修改记录。消息下面的「撤销」会一次撤销这些修改，「修改历史」里也能看到。
- **只读**：
  - 变量初始化（`[initvar]`）、变量规则（`[mvu_update]`）、带 EJS 模板或变量宏的条目，默认只读。需要时，在世界书条目里打开「允许 AI 修改」。
  - 和其他角色共用的世界书、全局世界书，只读。
- **只改看过的**：只能改写这一轮给出了全文的部分。新增条目和【设置】不受这个限制。
- **冲突**：如果发出请求之后，用户手动改过同一处，这一处不会被覆盖。
- **不完整的修改块不执行**：回复被截断、中止或出错时，修改块不执行。截断时可以点「继续写」，写完后再执行。
- 执行不了的条目逐条说明原因，不影响其他修改。

## 7. 桌面版

安装版是一个 Electron 程序（`src/desktop/`），构建成 `dist/desktop.mjs`，由 electron-builder 打包成 NSIS 安装包。

- **同一个服务**：`src/server/app.ts` 的 `createHearth()` 建好存储、插件、运行时和 HTTP 服务。命令行版（`src/server/main.ts`，`Start.bat` 用它）和桌面版都从这里启动；桌面版把服务跑在 Electron 主进程里，再让窗口打开 `http://127.0.0.1:<端口>`。所以界面代码不区分两种运行方式。
- **端口**：默认 8730，被别的程序占用时换一个空闲端口，并记在 `%APPDATA%\Hearth\window.json` 里（和窗口大小、位置放在一起）。端口不变，界面存在浏览器里的设置（主题、上次打开的对话）也就不变。
- **网络**：主进程里的 `fetch` 换成 Electron 的 `net.fetch`，走 Chromium 的网络栈，所以系统代理和 PAC 脚本都生效，和浏览器一样。发给 Hearth 自己的请求仍用 Node 的 `fetch`。设置了 `HTTPS_PROXY` / `HTTP_PROXY` 时，用它代替系统代理。
- **数据目录**：`%APPDATA%\Hearth\data`。第一次启动时（数据目录还不存在），用系统对话框询问是否从解压版导入：找到旧数据后整个复制过来（`src/desktop/migrate.ts`），旧文件不动。
- **托盘**：点窗口的 × 只是隐藏窗口，Hearth 留在通知区域继续运行（第一次会弹通知说明）。单击托盘图标打开窗口，右键菜单里「退出 Hearth」才真正退出；Windows 关机、注销时也会正常退出。
- **退出**：从托盘退出时如果还有回复在生成，先询问。退出前写完所有待保存的修改。
- **只开一个**：再次启动时，已经打开的 Hearth 切到前台，新进程直接退出。另一个 Hearth（例如 `Start.bat`）请求 `/api/shutdown` 接管端口时，桌面版会拒绝。
- **运行记录**：没有命令行窗口，`console` 的输出写进 `%APPDATA%\Hearth\logs\hearth.log`，超过 2MB 时换新文件。

### 自动更新

用 electron-updater，更新来源是 GitHub Releases（`electron-builder.yml` 里的 `publish`，打包时写进安装目录的 `resources/app-update.yml`）。

1. 启动 15 秒后检查一次，之后每 6 小时一次：读取最新 Release 的 `latest.yml`，版本更高就在后台下载安装包。有上一版的 `.blockmap` 时只下载有变化的部分。
2. 下载好后，`/api/version` 的 `update` 变成 `ready`，界面顶部出现提示条。
3. 点「现在重启更新」（`POST /api/app-update/install`）：Hearth 退出，安装包静默安装，然后启动新版本。不点的话，下次退出 Hearth 时静默安装，下次打开就是新版本。窗口隐藏在通知区域时，下载好会弹一条通知，托盘菜单里也会多出「重启并更新到 X.Y.Z」。

安装包没有签名，所以不校验更新包的签名，只校验 `latest.yml` 里的 SHA-512。

测试时可以设置环境变量 `HEARTH_UPDATE_URL`，指向一个放着 `latest.yml` 和安装包的网址，代替 GitHub。从源码运行时只有设置了它才会检查更新。

### 安装包

- 页面顺序：欢迎 → 安装位置 → 安装 → 完成。欢迎页和完成页左侧的图是 `resources/installerSidebar.bmp`（由 `installer-sidebar.svg` 渲染，164×314）。
- 完成页有「运行 Hearth」和「创建桌面快捷方式」两个复选框（`resources/installer.nsh` 的 `customFinishPage`）。快捷方式在安装时就建好，不勾选就删掉；更新时保留用户当时的选择，卸载时删除。
- 只为当前用户安装（`resources/installer.nsh` 跳过「为所有用户安装」那一页），默认装到 `%LOCALAPPDATA%\Programs\Hearth`，可以换位置。不需要管理员权限，自动更新时也不会弹出权限请求。
- 应用文件不打成 asar 包，因为内置插件要用 `import()` 从各自的文件夹加载。
- 卸载时保留数据目录。
