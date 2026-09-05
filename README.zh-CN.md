# baoer_signal_grep

简体中文 · [English](README.md)

为 Pi、Claude Code、Codex 和其他 MCP 客户端提供本地代码搜索与导航。小范围搜索直接返回命中行；广泛搜索先给出文件地图和片段，再按需翻页或查看源码。

**升级提示：** 1.2.0 修复部分 MCP 客户端看不到搜索正文的问题。更新后请重启宿主。自 1.0.0 起，工具名为 `baoer_signal_grep`，MCP 环境变量使用 `BAOER_SIGNAL_GREP_MCP_*`；旧名称不再兼容。

## 安装

需要 `PATH` 中可用的 `rg`。MCP 需要 Node.js 22.19+；Pi 需要 Pi 0.84.3+，以及 Node.js 22.19+ 或 Bun 1.4+。

包内提供 JS/TS/TSX 和 Go 识别能力。Windows ARM64 的 Go 结构模式需要本机可构建的 Go 解析器，普通搜索不受影响。其他语言可选装 Universal Ctags 以获得更细的代码范围。

### Pi

```bash
pi install npm:baoer_signal_grep
```

安装后重启 Pi。**默认强制常规搜索使用本工具：** 内置 grep/find 和直接搜索命令会被拦截。读取、编辑、目录浏览、测试、构建和脚本仍可使用。

需要中文界面时，创建 `~/.pi/agent/baoer_signal_grep.json`：

```json
{ "locale": "zh-CN" }
```

如需关闭强制搜索，在该配置中添加 `"enforceSearch": false`，然后重启 Pi。

### Claude Code 与 Codex：仅连接 MCP

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_mcp --stdio
```

服务器默认搜索当前项目，可用 `BAOER_SIGNAL_GREP_MCP_CWD` 指定其他根目录。仅连接 MCP 会添加搜索工具，不会禁用宿主的其他工具。MCP 模式不需要 Pi 或 Bun。

### 需要强制搜索时安装原生插件

- **Claude Code：** 依次运行 `/plugin marketplace add xcjy8bao/baoer_signal_grep` 和 `/plugin install baoer-signal-grep@baoer-signal-grep`。
- **Codex：** 依次运行 `codex plugin marketplace add xcjy8bao/baoer_signal_grep` 和 `codex plugin add baoer-signal-grep@baoer-signal-grep`，再通过 `/hooks` 查看并信任插件钩子。
- **Kimi Code：** 使用本仓库或安装包中的插件目录，运行 `/plugins install /absolute/path/plugins/baoer-signal-grep`，确认信任后执行 `/reload`。

安装或更新后重启宿主。这些插件包含 MCP 连接并拦截常规替代搜索入口；强制效果依赖已启用、受信任且正常工作的钩子。它不是操作系统沙箱，不能阻止自定义程序自行搜索。

关闭方式：Claude Code 使用 `/plugin`；Codex 使用 `/hooks` 或 `codex plugin remove baoer-signal-grep@baoer-signal-grep`；Kimi 使用 `/plugins disable baoer-signal-grep` 后执行 `/reload`。

## 使用

正常要求 Agent 查找代码即可，也可以向 `baoer_signal_grep` 传入：

```json
{ "pattern": "authorize", "literal": true, "path": "src" }
```

| 需求                        | 请求选项                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| 搜索文本                    | `pattern`；可选 `literal`、`ignoreCase`、`wholeWord`、`glob`、`exclude`                             |
| 同时满足多个词 / 任意一个词 | `allOf: ["first", "second"]` / `anyOf: ["first", "second"]`                                         |
| 文件地图或命中行            | `mode: "summary"` / `mode: "matches"`；省略模式时自动选择                                           |
| 严格限制在指定路径          | `path: "src/api", scope: "strict"`                                                                  |
| 继续取结果                  | 复制返回的 `nextRequest` 或 `cursor`                                                                |
| 查看源码                    | `mode: "inspect", path: "src/api.ts", line: 12`；批量 `targets` 最多五项                            |
| 查找文件名                  | `mode: "files", query: "request handler"`                                                           |
| 按代码形状搜索              | `mode: "structure", pattern: "compare($X, $X)"`                                                     |
| 查定义、引用和调用          | `definitions`、`references`、`implementations`、`callers`、`callees`，配合 `path`、`line`、`column` |
| 查看模块关系                | `dependencies`、`dependents`、`outline`、`imports`、`tests` 或 `impact`                             |
| 搜索 Git 改动               | `changes: {"base":"HEAD","scope":"lines","side":"new"}`                                             |
| 自然语言发现                | 安装可选模型后使用 `mode: "concept", query: "在哪里拒绝访问？"`                                     |

行列从 1 开始，列按 UTF-16 计数。JS/TS 编译器导航反映静态代码关系；相关测试与相似度候选只是线索，不代表运行时行为正确或测试已经通过。工具输入说明列出了各模式接受的参数。

内容搜索不指定路径时从项目根目录开始。子路径无结果时可能重试项目根目录；需要禁止扩展时使用 `scope: "strict"`。`exclude` 使用文件或路径 glob。隐藏文件可搜索，`.git` 内部文件始终排除。

结果会提示覆盖不完整或截断。需要更多内容时复制继续请求，不要将一页视为全部结果。源码变化可能使旧的继续请求失效；宿主自身也可能限制输出长度。

### 可选的本地概念模型

```bash
npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_model --install-model
```

这条显式安装命令会下载约 129 MiB 的公开模型文件，默认存放于 `~/.cache/baoer_signal_grep/models/`；可用 `SIGNAL_GREP_MODEL_DIR` 指定父目录。随后概念搜索离线运行，普通搜索无需模型。缺少模型时会明确报错，不会自动下载。

## HTTP MCP

需要 HTTP 连接时，在项目所在机器安装并启动服务器：

```bash
npm install --global baoer_signal_grep@1.2.0
BAOER_SIGNAL_GREP_MCP_CWD=/path/to/project baoer_signal_grep_mcp --http
```

PowerShell 下先设置 `$env:BAOER_SIGNAL_GREP_MCP_CWD = "C:\path\to\project"`，再运行服务器命令。

默认地址为 `http://127.0.0.1:3000/mcp`。可配置 `BAOER_SIGNAL_GREP_MCP_HOST`、`BAOER_SIGNAL_GREP_MCP_PORT` 和 `BAOER_SIGNAL_GREP_MCP_CWD`。浏览器客户端还需要通过 `BAOER_SIGNAL_GREP_MCP_ALLOWED_ORIGINS` 设置逗号分隔的来源列表。会话限制可通过 `BAOER_SIGNAL_GREP_MCP_MAX_SESSIONS`、`BAOER_SIGNAL_GREP_MCP_SESSION_IDLE_MS` 配置。

**HTTP 不内置身份认证。** 请保持回环监听，或放在有认证的网关后。服务器读取其运行机器的文件，不会通过 SSH 访问其他机器。

## 隐私与访问范围

本地搜索在你的机器上执行，无遥测，不上传源码。安装包或可选模型时可能联网；远程 HTTP 会将搜索请求和结果传输到配置的服务器。

显式绝对路径和 `..` 可以访问进程有权限读取的其他路径，并受保护路径规则限制。项目内文件也可能含有秘密；可选 `redact: true` 会遮盖常见凭据值，但无法识别所有敏感内容。详见[安全说明](SECURITY.md)。

[参与贡献](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [AGPL-3.0-only 许可证](LICENSE)
