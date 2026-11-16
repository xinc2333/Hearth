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

插件是 `plugins/<名字>/index.mjs`，导出 `{ id, setup(api) }`。内置功能也用同一套接口：

| 接口 | 用途 | 内置的例子 |
| --- | --- | --- |
| `registerMacro(name, fn)` | 新的宏 | — |
| `onBeforeAssemble(ctx)` | 往提示词里加内容（`ctx.injections`，对应酒馆的扩展提示词） | 以后的记忆图 |
| `onAfterAssemble(result, ctx)` | 调整最终消息 | EJS 模板、Meowssiah 适配 |
| `onAfterReceive(ctx)` | 处理回复，返回新文本和对资源的修改 | MVU 变量更新 |
| `onChatCreate(ctx)` | 新对话创建时初始化 | MVU 初始变量 |
| `complete(req)` | 用当前模型连接发一次请求 | MVU 漏写时补全 |
| `store.get / list / apply` | 读写资源（走修改通道） | — |

```js
// plugins/hello/index.mjs
export default {
    id: 'hello',
    setup(api) {
        api.registerMacro('hello', () => '你好');
        api.onBeforeAssemble(ctx => {
            ctx.injections.push({ key: 'hello', value: '记得打招呼。', position: 'in_chat', depth: 1, role: 'system', scan: false });
        });
    },
};
```

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
