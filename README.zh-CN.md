# baoer_signal_grep

简体中文 · [English](README.md)

像一位熟悉项目的图书管理员，帮助 Pi、Claude Code、Codex 和其他 MCP 客户端找到正确的书架、翻开有用的页面，并接着上次的位置继续看。

## 它能帮上什么忙

- **问得具体，就直接拿到答案。** 像借一本指定的书，小范围搜索直接给出命中行和位置。
- **问得宽泛，先给你一张地图。** 不把所有页面堆到桌上，而是先说明哪些文件有相关内容，再用片段帮助你选择。
- **继续追问，不会丢掉书签。** Agent 可以接着翻结果，也可以打开刚找到的源码。
- **名字相同，也要看看上下文。** 定义、引用和调用帮助 Agent 分清同名内容；相关测试则作为进一步调查的线索。
- **缺页会说，书变了也会说。** 结果不完整或源码已经变化时会明确提示，让 Agent 知道何时需要重新确认。

## 常见用法

正常向 Agent 提问即可，例如：

- “找一下这条报错是从哪里抛出来的。”
- “先看看哪些文件处理登录，再打开相关代码。”
- “这个函数在哪里定义，谁在调用它？”
- “找一下和这次修改相关的测试。”
- “接着刚才的结果继续看。”

## 安装

需要 `PATH` 中可用的 `rg`。MCP 需要 Node.js 22.19+；Pi 需要 Pi 0.84.3+，以及 Node.js 22.19+ 或 Bun 1.4+。

### Pi

```bash
pi install npm:baoer_signal_grep
```

安装或更新后重启 Pi。Pi 默认让常规搜索使用本插件，读取、编辑、测试、构建和脚本仍可使用。如需关闭强制搜索，在 `~/.pi/agent/baoer_signal_grep.json` 中设置 `"enforceSearch": false` 后重启；设置 `"locale": "zh-CN"` 可启用中文界面。

### Claude Code 或 Codex：连接 MCP

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep baoer_signal_grep_mcp --stdio
```

配置或更新后重启宿主。服务器默认搜索当前项目，可用 `BAOER_SIGNAL_GREP_MCP_CWD` 指定其他根目录。仅连接 MCP 会添加工具，不会禁用其他搜索工具。

### 原生插件

如果希望在其他宿主中也强制常规搜索使用本插件：

- **Claude Code：** 先运行 `/plugin marketplace add xcjy8bao/baoer_signal_grep`，再运行 `/plugin install baoer-signal-grep@baoer-signal-grep`。
- **Codex：** 先运行 `codex plugin marketplace add xcjy8bao/baoer_signal_grep`，再运行 `codex plugin add baoer-signal-grep@baoer-signal-grep`，通过 `/hooks` 查看并信任钩子。
- **Kimi Code：** 使用本仓库或安装包中的插件目录，运行 `/plugins install /absolute/path/plugins/baoer-signal-grep`，确认信任后执行 `/reload`。

安装后重启。关闭方式：Claude Code 使用 `/plugin`，Codex 使用 `/hooks`，Kimi 使用 `/plugins disable baoer-signal-grep` 后执行 `/reload`。

本地搜索在你的机器上进行。请只允许 Agent 读取已获授权的文件。HTTP 服务对外开放前需要认证网关，详见[安全说明](SECURITY.md)。

[更新记录](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md) · [AGPL-3.0-only 许可证](LICENSE)
