# baoer_signal_grep

简体中文 · [English](README.md)

**一个通用的本地搜索插件，让 Agent 更方便地查找文件、文档、笔记、日志和各类文本资料。**

它像一位耐心的图书管理员：你说想找什么，它帮你找到书架、翻到相关页面，再陪你沿着线索继续看。资料少时，直接把内容递给你；资料多时，先铺开一张地图，让你知道从哪里看起。

## 它能帮上什么忙

### 找一句话，不用翻完整个资料柜

想找一条报错、一段说明或某个名字，就像告诉管理员一本书里的关键词。命中不多时，插件直接给出原文和所在位置，省去逐个文件打开、来回翻找的过程。

### 资料很多，先给你地图

问“哪些资料提到退款”，可能一下找到很多内容。它会先整理相关文件和片段，像在地图上标出有线索的地点；Agent 可以先判断哪些值得看，再打开其中的原文，而不是一开始就面对满桌散页。

### 追问的时候，书签还在

你说“接着刚才的结果看”，它能沿着上次的位置继续翻页。也可以从某一条命中打开附近原文，像把书签夹在那一页，随时回来补看前因后果。

### 几个条件，可以一起交代

“找同时提到客户和退款的文件”，就像请管理员挑出同时贴着两张标签的资料；“这几个词任意一个出现都算”，则像列出一张候选清单。可以一次表达多个查找条件，减少反复搜索。

### 指定一个抽屉，就在里面找

需要只查某个文件夹时，可以明确告诉 Agent 限定范围。只记得文件名的一部分，也可以先找文件，再看内容。像先确定资料柜的哪一层，再逐步缩小到要找的那一份。

### 看到了多少，说得清楚

一页装不下的内容会分批展示，并提供继续查看的入口。原文发生变化时，也会提醒重新确认。像一位认真整理资料的助手，会把“已经看到的”和“还需要往后翻的”交代清楚。

## 常见用法

直接向 Agent 表达需求即可，例如：

- “帮我找一下，哪些文档提到了退款期限？”
- “这条报错在哪些日志里出现过？把附近的内容也给我看看。”
- “找同时包含客户名称和订单编号的文件。”
- “这几个关键词，任意一个出现都列出来。”
- “我只记得文件名里有会议记录，帮我找找。”
- “这次只查这个资料文件夹，不要扩大范围。”
- “先告诉我相关内容分布在哪些文件，再打开其中两份。”
- “接着刚才的位置继续看，把没展示完的部分找出来。”

插件提供文件位置和实际文本，帮助 Agent 根据原文回答，也方便你回到资料中核对。

## 安装

需要 `PATH` 中可用的 `rg`。MCP 需要 Node.js 22.19+；Pi 需要 Pi 0.84.3+，以及 Node.js 22.19+ 或 Bun 1.4+。

### Pi

```bash
pi install npm:baoer_signal_grep
```

安装或更新后重启 Pi。Pi 默认让常规搜索使用本插件，读取、编辑、测试、构建和脚本仍可使用。如需关闭强制搜索，在 `~/.pi/agent/baoer_signal_grep.json` 中设置 `"enforceSearch": false` 后重启；设置 `"locale": "zh-CN"` 可启用中文界面。

### Claude Code 或 Codex：连接 MCP

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

`@latest` 会在 MCP 启动时跟随最新发布版本，更新后重启宿主即可加载。服务器默认搜索当前项目，可用 `BAOER_SIGNAL_GREP_MCP_CWD` 指定其他根目录。仅连接 MCP 会添加工具，不会禁用其他搜索工具。

### 原生插件

如果希望在其他宿主中也强制常规搜索使用本插件：

- **Claude Code：** 先运行 `/plugin marketplace add xcjy8bao/baoer_signal_grep`，再运行 `/plugin install baoer-signal-grep@baoer-signal-grep`。
- **Codex：** 先运行 `codex plugin marketplace add xcjy8bao/baoer_signal_grep`，再运行 `codex plugin add baoer-signal-grep@baoer-signal-grep`，通过 `/hooks` 查看并信任钩子。
- **Kimi Code：** 使用本仓库或安装包中的插件目录，运行 `/plugins install /absolute/path/plugins/baoer-signal-grep`，确认信任后执行 `/reload`。

安装后重启。关闭方式：Claude Code 使用 `/plugin`，Codex 使用 `/hooks`，Kimi 使用 `/plugins disable baoer-signal-grep` 后执行 `/reload`。

本地搜索在你的机器上进行。请只允许 Agent 读取已获授权的文件。HTTP 服务对外开放前需要认证网关，详见[安全说明](SECURITY.md)。

[更新记录](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md) · [AGPL-3.0-only 许可证](LICENSE)
