# Hearth 的数据逻辑

## 一轮对话是什么

```
assemble(角色卡, 用户角色, 预设, 世界书, 聊天记录, 状态) → 消息列表
        → 模型 → 回复文本
        → 整理（正则、插件）→ 写入聊天记录和状态
```

除此之外都是界面和管道。酒馆变得沉重，是因为这条链路散落在全局变量、页面元素和事件里，每加一个功能都要往里插钩子。Hearth 把它拆成三样东西：**资源**、**修改**、**组装**。

## 1. 资源

所有用户数据都是资源：一份带 `id` 和 `kind` 的 JSON。每个资源存成 `data/<类型>/<id>.json`。

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

- `@12` 表示"id 为 12 的那一项"，所以列表重新排序后，提议依然有效。
- `edit` 是"找到这段文字并替换"，适合 AI 修改长文本：只改一句，不用重写整个字段。
- 每次修改都会记录作者（`user` / `ai` / `script` / `plugin:…`）和原因，同时自动生成撤销操作，写进 `data/journal.jsonl`。

界面上的编辑、AI 改卡、MVU 改变量、插件写数据，走的都是这一个通道。所以它们天然共享同一套审批、历史和撤销。

## 3. 组装

`src/core/assemble.ts` 是一个纯函数：输入一份快照，输出要发送的消息列表，外加每一段的来源。它按酒馆 `Generate() → prepareOpenAIMessages()` 的步骤逐一对应实现，注释里标了每段对应的酒馆函数，方便对照。

追踪信息直接来自组装过程，不需要额外的抓包扩展。

## 4. 插件

内核只做两件事：按酒馆的规则拼好提示词，把模型的输出好好地显示出来。其余功能都是插件，内置插件和第三方插件用同一套接口，可以在「设置 → 插件」里开关、安装、删除和自动更新。

| 插件 | 对应的酒馆扩展 | 做什么 |
| --- | --- | --- |
| 提示词模板 | ST-Prompt-Template | 运行提示词里的 EJS 模板 |
| 酒馆助手 | JS-Slash-Runner | 消息里的前端界面、MVU 变量、SPreset 类预设（回复工具和控制标记） |

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
| `onAfterReceive(ctx)` | 处理回复，返回新文本和对资源的修改 | SPreset 的工具回复格式化、MVU 变量更新 |
| `onChatCreate(ctx)` | 新对话创建时初始化 | MVU 初始变量 |
| `complete(req)` | 用当前模型连接发一次请求 | MVU 漏写时补全 |
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
- 预设脚本引用的**远程代码不会下载或执行**。例如 SPreset 会从外部网址加载代码，还会把调试会话上传到第三方服务器；Hearth 没有实现这两项，只按它的配置在本地复刻格式处理。

## 6. AI 改卡（下一步，需要讨论）

基础已经具备：AI 通过工具调用读资源（`read`）、提交修改提议（一个 `status: 'proposed'` 的 ChangeSet）。界面把每个操作显示成差异，你逐条批准；批准后写入，随时可以撤销。

需要你定的规则：

1. **对话中模型想改世界书时**（例如"记住这个新出场的人物"），是直接写入（事后可撤销），还是先放进待审批队列？要不要按资源类型分别设定？
2. **AI 改卡用哪个模型？** 用当前对话的模型，还是单独设一个"编辑用"的连接？
3. **AI 能改动的范围**：只限当前角色和它的世界书，还是也包括预设？
