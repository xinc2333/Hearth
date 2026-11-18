# 参与开发

## 从源码运行

需要 [Node.js](https://nodejs.org/) 20 或更高版本。

```
git clone https://github.com/xinc2333/Hearth.git
cd Hearth
npm install
npm run build
npm run desktop
```

`npm run desktop` 用构建结果打开桌面窗口，按 `F12` 可以打开开发者工具。

也可以双击 `Start.bat` 运行命令行版，用浏览器窗口打开界面。命令行版的数据放在仓库的 `data/` 里，和安装版的数据分开。需要代理时，把 `Start.local.example.bat` 复制为 `Start.local.bat`，按里面的说明填写（需要 Node.js 24.5 或更高版本）。

## 目录结构

```
src/core/     数据模型、提示词组装、世界书、宏、正则、酒馆格式导入（不依赖界面）
src/server/   本地服务：存储、模型接口、生成流程、插件
src/web/      界面（React）
src/desktop/  桌面版（Electron）：窗口、旧数据导入、自动更新
src/plugins/  内置插件的源码
plugins/      内置插件的构建结果，也是插件的更新来源
resources/    图标和安装程序的设置
tests/        测试
docs/         使用说明和设计文档
```

设计和插件接口见 [docs/architecture.md](docs/architecture.md)。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 构建界面、服务、桌面版和内置插件 |
| `npm run desktop` | 打开桌面窗口 |
| `npm run dist` | 构建 Windows 安装包，输出到 `release/` |
| `npm test` | 运行测试 |
| `npm run typecheck` | 类型检查 |
| `npm run dev:server` / `npm run dev:web` | 开发模式 |

部分测试需要第三方文件，见 [tests/fixtures/README.md](tests/fixtures/README.md)。缺少这些文件时，对应的测试会自动跳过。

## 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)，用中文书写：

```
<类型>(<范围>): <做了什么>
```

| 类型 | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 只改文档 |
| `refactor` | 不改变行为的代码调整 |
| `test` | 测试 |
| `chore` | 构建、依赖、发布等 |

范围示例：`core`、`server`、`web`、`desktop`、`settings`、`plugins`、`tabletop`、`tavern-helper`、`prompt-template`。

- **标题**：以动词开头，不超过 50 个字，结尾不加句号。
- **正文**：需要时写，说明为什么改、有什么影响。

## 版本号

遵循[语义化版本](https://semver.org/lang/zh-CN/)：

- **修订号**：只修复问题，不改变数据格式和行为约定。
- **次版本号**：新增功能，向下兼容。
- **主版本号**：不兼容的变更，例如数据需要迁移。

1.0.0 之前，次版本号也可能包含不兼容的变更，这时必须在更新日志里写明。

## 更新日志

改动先记在 `CHANGELOG.md` 的「未发布」下，发布时移到版本号下。

- 每条写用户感受得到的变化，一句话写清楚。
- 重构、测试、构建和文档的改动不写。
- 实现细节写在设计文档里。

## 内置插件

- 源码在 `src/plugins/<id>`，`npm run build:plugins` 把它构建到 `plugins/<id>`。构建结果要一起提交，因为 `plugins/` 也是插件的更新来源。
- 插件有自己的版本号，在 `src/plugins/<id>/manifest.json` 的 `version` 里。改动插件后要提高它的版本号，否则已安装的用户收不到更新。
- 插件用到的新接口需要更新的 Hearth 时，同时提高 `manifest.json` 里 `hearth` 的最低版本。

## 发布

1. 确认 `npm test` 和 `npm run typecheck` 通过。
2. 更新版本号：
   - `CHANGELOG.md`：把「未发布」下的内容移到 `## [X.Y.Z] - 日期` 下，并更新底部的对比链接。
   - `package.json` 的 `version`。
   - `README.md` 的版本徽章。
3. 提交 `chore(release): vX.Y.Z`，打附注标签 `git tag -a vX.Y.Z -m "vX.Y.Z"`，然后推送提交和标签。
4. 运行 `npm run dist`。`release/` 里会生成三个文件：
   - `Hearth-Setup-X.Y.Z.exe`：安装包
   - `Hearth-Setup-X.Y.Z.exe.blockmap`：自动更新时用来只下载有变化的部分
   - `latest.yml`：版本号和校验值
5. 在 GitHub 上用这个标签创建 Release，正文取自更新日志，并上传这三个文件。

### 自动更新的约定

已安装的 Hearth 会读取 GitHub 上标为 Latest 的 Release 里的 `latest.yml`，所以：

- Release 不能是草稿或预发布，标签必须是 `vX.Y.Z` 的形式。
- 三个文件必须来自同一次构建。`latest.yml` 记录了安装包的校验值，校验值不一致时不会安装。
- 不要删除旧版本 Release 里的 `.blockmap`。用户从旧版本更新时，要用它和新版本比较，才能只下载有变化的部分。
- Electron 的版本在 `package.json` 里固定。升级 Electron 后，用户在那一次更新时要下载完整的安装包（约 110 MB），所以不要随意升级。

### 在 Linux 上打包

electron-builder 需要通过 wine 运行 Windows 工具，并且需要 32 位的 wine。在 Debian / Ubuntu 上：

```
sudo dpkg --add-architecture i386 && sudo apt update
sudo apt install wine wine64 wine32:i386
```

在 Windows 上打包不需要 wine。
