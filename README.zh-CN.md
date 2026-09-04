# baoer_signal_grep

[![CI](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

简体中文 · [English](README.md)

baoer_signal_grep 是供 [Pi](https://pi.dev)、Claude Code、Codex 和其他 MCP 客户端使用的搜索工具。

它像一个真正听懂你需求的男朋友或女朋友。你问一个简单问题，它直接告诉你答案；你问得很宽，它不会把一大堆杂乱内容丢给你，而是先把重点分好，再陪你一层层看下去。它记得刚才找到了什么，也知道什么时候旧答案已经不能继续相信。

## 它会怎样陪 AI 找代码

### 小问题，直接回答

当结果不多时，它会一次把完整结果交给 AI，不故意拆成好几轮，也不让 AI 为了看完几行内容反复追问。

### 大问题，先替你整理

当结果很多时，它会先告诉 AI：一共找到了多少处、分布在哪些文件、每个文件大概有多少，并附上真实的代码片段。就像你问“我们聊过旅行的事吗”，对方不会把几年聊天记录全部甩过来，而是先告诉你在哪几段对话里提过，再陪你打开其中一段。

文件按照实际出现次数排列，不会假装知道哪个文件最重要。展示出来的片段只是原文中的一小段，也不会冒充整份文件。

### 你说了几个要求，它会一个个记住

你可以让它同时寻找几样东西。它会把每个词分别记账，不会查到其中一个就把其他要求忘掉。

如果你说“这些条件必须同时出现”，它只留下真正同时满足的文件；如果你进一步说“必须出现在同一个函数里”，它也不会拿散落在文件各处的内容来凑数。

### 它分得清“名字一样”和“真的是同一个”

代码里同一个名字可能是在定义、调用、导入、导出、注释或普通文字中出现。baoer_signal_grep 会把这些用途分开，避免只看名字就下结论。

当 AI 想围绕一个函数或类继续调查时，它会整理一份小档案：目标在哪里、同名内容各自是什么用途、哪些测试可能有关。它会把线索交出来，但不会把“名字相同”说成“一定是同一个东西”，也不会把“找到了测试文件”说成“已经测试过”或“肯定有覆盖”。

### 它知道你是在问整个项目，还是只问这次改动

你可以让它只看这次修改过的文件或行，也可以让它列出一个文件里的主要结构、顺着明确的导入关系继续找，或者整理可能相关的测试。它只报告自己真正看见的内容，不把猜测包装成事实。

### 追问“刚才那个”，它不会从头再找

一次搜索完成后，它会把当时的结果妥善保留。AI 可以继续打开某个文件、翻到下一页，或一次查看最多五个已找到的位置，不需要重新搜索。

如果这期间源码变了，它不会拿旧位置配上新内容继续回答，而是明确告诉 AI 需要重新确认。过期、写错或不属于这次结果的继续请求也会直接失败，不会悄悄换成一次新的搜索。

### 内容太多时，它会明确说没有展示完

baoer_signal_grep 会控制一次交给 AI 的内容量，避免一场搜索挤满整段对话。能完整交付时，它会说明结果完整；只能保留一部分时，它会说明只获得了部分结果以及原因。

长代码不会因为显示空间不够就被假装成完整内容。AI 可以沿着它给出的下一步继续读取，直到拿到需要的原文。

## 装好后不用照看它

插件只为 Pi 增加一个名为 `baoer_signal_grep` 的工具，不会替换或重新配置其他搜索工具，也没有需要用户记忆的命令。AI 在适合的时候使用它，结果过期、内存整理、搜索进程结束和会话关闭时的清理都由插件自己完成。

第一次查询完成后，Pi 会显示一条很短的会话记录：

```text
baoer_signal_grep：已处理 8 次查询，结果全部完整；3 次结果已自动按文件整理
```

它只记录本次会话里真实发生的三件事：处理了几次新查询、结果是否完整、多少次结果被自动按文件整理。翻页和继续读取不会重复计算，关闭会话后记录会清空，也不会为了这条记录再做一次搜索。

## 它不会把代码带出本机

作为本地 Pi 插件或本地 stdio MCP 服务使用时，搜索、整理和读取都在客户端机器完成。baoer_signal_grep 没有遥测，不会把查询、代码或会话统计发到网络，也不会在后台建立索引或下载模型。`npx` 首次安装包时可能访问已配置的 npm registry。使用可选的远端 HTTP MCP 服务时，请求和返回的证据会通过部署者配置的连接传输。

未提供路径时，搜索仍限制在当前工作目录。显式绝对路径或 `..` 路径可以搜索、检查工作目录外的位置，但 `.git` 内部、已知凭据存储目录和特殊系统区域会被拒绝；这些限制只是纵深防护，并不保证识别所有敏感文件。普通 Git 变更比较仍限制在当前工作目录。除此之外，普通隐藏文件仍然可以找到。插件会直接调用本机已有的 `rg`，不会把搜索内容拼成 shell 命令。

## Claude Code 与 Codex

npm 包提供本地 stdio MCP transport。它需要 Node.js 22.19+，并且 `PATH` 中能够找到 `rg`；不需要 Pi 或 Bun。每个客户端启动自己的进程，拥有独立的游标存储，并在 MCP 连接关闭时完成清理。

添加到当前 Claude Code 项目：

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.0.0 baoer_signal_grep_mcp --stdio
```

Claude Code 会通过 `CLAUDE_PROJECT_DIR` 提供稳定的项目根目录。上述命令使用 Claude Code 默认的 local scope，不会修改其他项目。只有明确希望 Claude Code 写入团队共享的 `.mcp.json` 时，才添加 `--scope project`。

添加到 Codex：

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.0.0 baoer_signal_grep_mcp --stdio
```

Codex 会在当前项目工作目录启动服务。两个客户端都可以用 `BAOER_SIGNAL_GREP_MCP_CWD` 显式覆盖默认根目录。stdio transport 不会监听网络端口，stdout 只写协议消息，启动诊断写到 stderr。MCP 初始化 instructions 和工具 schema 会携带与 Pi 插件相同的搜索工作流指导。

如果已经全局安装本包，可以用 `baoer_signal_grep_mcp --stdio` 替换上述 `npx` 命令。

## 远端 HTTP MCP 服务

本包也可以通过 MCP 服务，把同一个 `baoer_signal_grep` 能力提供给远端 Agent。服务读取它所在机器的文件，不会通过 SSH 跳到其他机器，也不会执行调用方传来的任意 shell 命令。

在远程机器安装独立服务；这种模式不需要 Pi 或 Bun：

```bash
npm install --global baoer_signal_grep
```

MCP 可执行程序需要 Node.js 22.19+，并且 `PATH` 中能够找到 `rg`。本包为 x64 和 ARM64 的 Linux、macOS、Windows 带有预编译的 JS、TS、TSX 识别组件；Go 识别组件覆盖三种系统的 x64，以及 Linux、macOS 的 ARM64。Windows ARM64 上普通搜索仍可使用，但 Go 结构分析需要本机具备可构建的 Go 解析器。Universal Ctags 仍然只是可选能力。

开发时可构建随包提供的 Node 兼容服务产物：

```bash
bun run build:mcp
```

在 Linux 或 macOS 上，让服务指向远程项目并启动：

```bash
BAOER_SIGNAL_GREP_MCP_CWD=/path/to/project baoer_signal_grep_mcp --http
```

在 Windows PowerShell 上：

```powershell
$env:BAOER_SIGNAL_GREP_MCP_CWD = "C:\path\to\project"
baoer_signal_grep_mcp --http
```

服务端点是 `/mcp`，默认监听 `127.0.0.1:3000`。不带参数运行 `baoer_signal_grep_mcp` 等价于 `--http`。服务本身不内置鉴权；没有经过鉴权的网关时，不要把它绑定到公开网卡。部署网关可以把它暴露给经过鉴权的远端客户端。如需其他配置，可设置 `BAOER_SIGNAL_GREP_MCP_HOST`、`BAOER_SIGNAL_GREP_MCP_PORT` 和 `BAOER_SIGNAL_GREP_MCP_CWD`。

标准 MCP 客户端不会发送浏览器 `Origin` 头，不需要额外配置。浏览器客户端需要通过逗号分隔的 `BAOER_SIGNAL_GREP_MCP_ALLOWED_ORIGINS` 显式放行；服务会为已放行来源返回直接访问所需的预检和可见 session 响应头。服务默认最多保留 100 个 session，并主动回收空闲超过 10 分钟的 session；部署可通过 `BAOER_SIGNAL_GREP_MCP_MAX_SESSIONS` 和 `BAOER_SIGNAL_GREP_MCP_SESSION_IDLE_MS` 调整这两个运行边界。单个请求体上限为 16 MiB。

远端调用保持本地工具契约，包括结果限流、游标、源码检查、静态分析线索、显示脱敏和保护路径校验。默认搜索在配置的工作目录中进行；显式绝对路径和 `..` 路径可以访问服务进程有读权限的其他非保护路径。Git 变更检索仍限制在当前仓库。

## 安装到 Pi

从 npm 安装：

```bash
pi install npm:baoer_signal_grep
```

也可以安装 GitHub 上的当前代码：

```bash
pi install git:github.com/xcjy8bao/baoer_signal_grep
```

重启 Pi 后即可使用。

在 Pi 中使用时，请确认：Pi 不低于 0.84.3；系统中可以运行 `rg`；运行环境为 Node.js 22.19+ 或 Bun 1.4+。插件已经带上 JS、TS、TSX 和 Go 所需的代码识别组件，不需要另外下载模型。Universal Ctags 只是其他语言需要更细代码范围时的可选帮手，插件不会自动下载它。

## 中文界面

会话记录和交互式结果默认使用英文。如需简体中文，在 `~/.pi/agent/baoer_signal_grep.json` 中写入：

```json
{
  "locale": "zh-CN"
}
```

然后重启 Pi。已有配置中的旧设置会被忽略，不影响搜索。

## 想了解更多

- [安全与隐私](SECURITY.md)
- [完整工作方式与边界](docs/ARCHITECTURE.md)
- [参与开发](CONTRIBUTING.md)

## 许可证

[GNU AGPL v3.0 only](LICENSE)
