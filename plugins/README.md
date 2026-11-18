# 内置插件

这里是 Hearth 自带的插件，每个文件夹是一个插件：

| 文件夹 | 插件 |
| --- | --- |
| `prompt-template` | 提示词模板，兼容 ST-Prompt-Template |
| `tavern-helper` | 酒馆助手，兼容 JS-Slash-Runner |
| `tabletop` | 跑团 |

- 文件夹里的 `server.mjs` 由 `npm run build:plugins` 从 `src/plugins/<id>` 生成，不要直接修改。
- 这些文件夹也是插件的更新来源。已安装的 Hearth 会按 `manifest.json` 里的 `repository` 检查新版本。
- 安装第三方插件：在「设置 → 插件」里粘贴插件的 GitHub 链接；或者把插件文件夹放进数据目录的 `plugins/` 里，再重新打开 Hearth。

插件的格式和接口见[架构说明](../docs/architecture.md#4-插件)。
