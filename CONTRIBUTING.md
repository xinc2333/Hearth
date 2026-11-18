# 开发与发布规范

## 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```
<类型>(<范围，可选>): <简短说明>
```

| 类型 | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 只改文档 |
| `refactor` | 不改变行为的代码调整 |
| `test` | 测试 |
| `chore` | 构建、依赖、发布等杂项 |

范围示例：`core`、`lore`、`preset`、`plugins`、`prompt-template`、`tavern-helper`、`web`、`server`。

## 版本号

遵循[语义化版本](https://semver.org/lang/zh-CN/) `主版本.次版本.修订号`：

- **修订号**：只修复问题，不改变数据格式和行为约定。
- **次版本**：新增功能，向下兼容。
- **主版本**：不兼容的变更（例如数据格式需要迁移）。

1.0.0 之前，次版本也可能包含不兼容变更，但必须在更新日志里写明。

## 内置插件

- 源码在 `src/plugins/<id>`，`npm run build:plugins` 把它构建到 `plugins/<id>`。改了插件源码后，构建结果要一起提交，因为 `plugins/<id>` 就是插件的更新来源。
- 插件有自己的版本号（`src/plugins/<id>/manifest.json` 里的 `version`），同样遵循语义化版本。只要改动了插件，就要提高它的版本号；否则已经装了旧版的用户不会收到更新。
- 插件用到的新接口需要更新的 Hearth 时，同时提高 `hearth` 里的最低版本。

## 发布步骤

1. 确认测试和类型检查通过：`npm test`、`npm run typecheck`。
2. 把 `CHANGELOG.md` 里「未发布」下的内容移到新版本标题下，写上日期，并更新底部的对比链接。
3. 修改 `package.json` 里的 `version`。
4. 同时修改 `README.md` 里的版本徽章。
5. 提交：`chore(release): vX.Y.Z`。
6. 打附注标签：`git tag -a vX.Y.Z -m "vX.Y.Z"`，推送提交和标签。
7. 构建安装包：`npm run dist`。`release/` 里会生成三个文件：
   - `Hearth-Setup-X.Y.Z.exe`：安装包。
   - `Hearth-Setup-X.Y.Z.exe.blockmap`：用来只下载有变化的部分。
   - `latest.yml`：版本号和校验值。
8. 在 GitHub 上用该标签创建 Release，正文取自更新日志，**三个文件都要上传**。

### 自动更新依赖的约定

已安装的 Hearth 会读取 GitHub 上标为「Latest」的 Release 里的 `latest.yml`，所以：

- Release 不能是草稿或预发布，标签必须是 `vX.Y.Z`。
- 三个文件必须来自同一次构建：`latest.yml` 里记着安装包的校验值，对不上就不会安装。
- 不要删除旧版本 Release 里的 `.blockmap`：用户从旧版更新时，要用它和新版对比，算出只需下载哪些部分。

### 在 Linux 上打包

electron-builder 需要用 wine 运行 Windows 工具（写入图标、生成卸载程序）。在 Debian / Ubuntu 上需要 64 位和 32 位的 wine：

```
sudo dpkg --add-architecture i386 && sudo apt update
sudo apt install wine wine64 wine32:i386
```

在 Windows 上打包不需要 wine。

## 测试素材

部分测试需要第三方文件（SillyTavern 默认角色、真实角色卡和预设），见 [tests/fixtures/README.md](tests/fixtures/README.md)。缺少时，这些测试会自动跳过。
