# Pi Signal Grep

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

简体中文 · [English](README.md)

面向 [Pi 编码智能体](https://pi.dev) 的上下文高效、正确性优先的内容搜索和有界代码检查插件。Signal Grep 将宽泛的 `ripgrep` 输出组织为文件计数、真实命中样例和明确的后续调用，同时保留匹配证据并报告各项限制。

> **最新版本：** `0.5.6`。发布署名：**宝儿**。

## 为什么需要 Signal Grep？

宽泛搜索之后，常见的下一步是选出相关文件并查看代码。Signal Grep 直接支持这一过程：

- **小规模搜索：** 能装下时，一次返回全部分组匹配。
- **宽泛搜索：** 先返回精确文件计数，并在预算允许时附上每个已展示文件的首条真实保留匹配。
- **直接展开：** 从结果正文复制 cursor，即可选择文件或一次检查最多五个可见匹配编号。
- **稳定证据：** cursor 页面读取保留快照；当前文件上下文和检查必须通过源码版本验证。
- **明确边界：** 区分保留匹配、样例、被省略范围、延后检查目标和部分保留状态。

样例只是实际命中文本，不是相关性评分或文件完整内容。文件排序依据命中数，不推测哪个文件能解决任务。插件没有模糊兜底、后台索引、数据库、遥测或网络请求。

## 示例：选择文件，再检查代码

示例工程在五个文件中包含 233 行 `TODO`。Pi 内置 grep 返回受限的匹配前缀并明确提示达到上限，但不会给出上限之后的精确总数。Signal Grep 在同一条模型可见响应中返回计数、源码样例和可用 cursor：

```text
233 matches across 5 files (complete snapshot).
Files 1-5 of 5, ordered by match count.

broad.ts     200
noise.ts      30
README.md       1
src/app.ts       1
utils.ts       1

Samples: first retained match per shown file, not relevance-ranked or exhaustive.
broad.ts:1 {match #34} // TODO broad 0
noise.ts:1 {match #4} // TODO fix 1
README.md:1 {match #3} TODO readme
src/app.ts:1 {match #1} // TODO app
utils.ts:1 {match #2} // TODO utils

Snapshot cursor="<returned-cursor>".
Inspect samples: mode="inspect", cursor, matchIndices=[one or more visible match numbers, max 5].
Retrieve matching lines: cursor with path or paths selecting exact files, no mode.
```

以上输出来自本地测试工程，cursor 在文档中替换为 `<returned-cursor>`。匹配编号属于这次快照，新搜索的编号可能不同。实际调用时请使用自己响应中的完整 cursor 和可见编号：

```json
{ "mode": "inspect", "cursor": "<returned-cursor>", "matchIndices": [1, 2] }
```

这会在一次有界调用中检查所选源码位置。如果只需要这两个文件里的匹配行：

```json
{ "cursor": "<returned-cursor>", "paths": ["src/app.ts", "utils.ts"] }
```

摘要按命中数降序排列，同数按路径排序。每页最多展示 30 个文件，也可能因文本预算展示更少文件；没有展示的样例会明确计数。使用返回的 cursor 加 `mode="summary"` 继续文件摘要页。原始摘要 cursor 可反复读取详情、选择单文件或最多 20 个精确 `paths`，不重新扫描。匹配 cursor 必须保持原有文件筛选集合。

紧凑完整搜索直接返回详情，避免一次摘要和 cursor 往返。每条匹配行有稳定的 `{match #N}` 标记；摘要 cursor 加 `matchIndex=N` 仍是单目标检查形式。长匹配行与 cursor 检查会保留首个 occurrence 的可见性，其余摘录和 occurrence 范围有明确展示上限。

没有显式 `limit` 的隐式 `auto` 搜索只对首次详情试装使用 Pi 上报的上下文余量：高于 40% 为 `full`，目标约 2,000 个估算结果文本 Token；12%–40% 为 `tight`，约 1,000；低于 12% 为 `critical`，约 500。用量未知时保持默认预算。显式 limit、`matches`、检查与 cursor 续页不会降档。

## 便于人类阅读的 Pi TUI

在 Pi 交互终端中，Signal Grep 会把同一份结果展示为响应式证据视图：摘要使用文件排名条，匹配页按文件呈现证据，`partial` 保留状态使用明确警告，源码检查展示有界范围和结构状态。收起视图会适配窄、中、宽终端；展开工具行后仍可查看完整原始结果。

这是纯展示层边界。renderer 不会改变模型可见文本、结构化 `details`、cursor、搜索策略、Metrics 统计、JSON/RPC/print 输出或持久化状态。如果当前文本与 details 无法被安全识别，或自定义布局渲染失败，Pi 工具行会直接回退为原始结果文本。

## 可复现的对比

运行本地上下文形状基准：

```bash
bun run benchmark
```

脚本创建临时文件，让 Pi 真实内置 grep 与 Signal Grep 分别搜索，报告当前响应体积并清理测试工程。行为验收包括：

| 场景              | Pi 内置 grep                  | Signal Grep                                                             |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------- |
| 紧凑的 33 条匹配  | 返回 33 行匹配                | 一次返回全部 33 行，并附 occurrence 和导航元数据                        |
| 宽泛的 233 条匹配 | 返回最多 100 行并明确提示上限 | 返回精确 233 条总数、文件分布、有界真实样例和 cursor                    |
| 显式分页          | 使用其配置的输出上限          | 将 33 条保留匹配还原为 20 + 13，没有重复或遗漏                          |
| 上下文压力        | 使用内置输出策略              | 同一份 18 条匹配在 `full` 直接返回，在 `tight`、`critical` 返回有界摘要 |

首次响应变短不等于整个任务成本降低：后续检查、cursor 调用、模型推理和正确性都需要计算。该基准测量结果形状与文本字节，不测搜索速度、精确模型 Token、任务成功率或费用节省。紧凑搜索可能因证据元数据而输出更多文本。

## 环境要求

### 运行时

- Pi 0.84.3 或更高版本
- Node.js 22+ 或 Bun 1.4+
- `PATH` 中可用的 [`ripgrep`](https://github.com/BurntSushi/ripgrep)（命令名 `rg`）
- 可选的、支持 JSON 输出并位于 `PATH` 中的 [Universal Ctags](https://docs.ctags.io/)，用于符号级代码检查

### 开发环境

- Bun 1.4+
- TypeScript 7+
- Node.js 22+，用于兼容性验证

## 安装

从 npm 安装最新版本：

```bash
pi install npm:pi-plugin-signal-grep
```

也可以安装 GitHub 上的当前版本：

```bash
pi install git:github.com/xcjy8bao/pi-plugin-signal-grep
```

然后重启 Pi。本地开发时：

```bash
pi -e ./src/index.ts
```

## 可选覆盖内置 grep

Signal Grep 默认使用附加模式，在 Pi 内置 `grep` 旁注册 `signal_grep`。如果希望所有普通 grep 调用都经过 Signal Grep，同时只向模型暴露一个公开搜索工具，执行：

```text
/signal-grep-override on
```

该命令会通过临时文件安全写入用户全局设置 `~/.pi/agent/signal-grep.json`，并自动重载 Pi 资源。覆盖模式将 Signal Grep 注册为 `grep`，兼容内置 grep 参数，在省略 `ignoreCase` 时保持内置 grep 的区分大小写行为，同时保留更丰富的 glob、排除、自适应摘要和 cursor 能力。`/signal-grep-health` 会显示当前 grep 的来源。持久化覆盖前，Signal Grep 会在其他扩展已拥有 `grep` 时拒绝切换且不修改配置；Pi 在加载扩展时也会拒绝重复注册。因此覆盖冲突会明确失败，不会静默分裂搜索所有权。使用以下命令关闭并恢复 Pi 内置实现：

```text
/signal-grep-override off
```

安装 `pi-hashline-edit-pro` 时，Signal Grep 会额外加入一条系统提示，要求模型在编辑 `signal_grep` 找到的位置前，先通过 hashline 的 `grep` 或 `read` 获取 served anchors。该提示不会在每次搜索响应中重复，不会影响 Metrics 计量，也不会声称 Signal Grep 能写入 hashline 的私有 served-state。
使用 `/signal-grep-override status` 查看当前模式。覆盖功能必须主动开启，因为其他扩展也可能替换 `grep`；发生工具冲突时 Pi 会在启动阶段明确警告。

## 界面语言

面向用户的命令说明、通知、健康检查输出和 Metrics 状态/报告默认使用英文。如需简体中文，请在 `~/.pi/agent/signal-grep.json` 中设置 `locale`，然后重启 Pi：

```json
{
  "overrideBuiltinGrep": false,
  "startMetricsOnNextLoad": false,
  "locale": "zh-CN"
}
```

支持的值为 `"en"` 和 `"zh-CN"`。未包含 `locale` 的现有配置仍使用英文。Signal Grep 命令更新覆盖模式或 Metrics 重载交接状态时会保留完整配置。搜索证据、工具参数、cursor 详情和面向模型的提示保持语言中立或英文，因此本地化不会改变搜索语义或 Metrics 计量。

## 工具接口

插件默认只注册 `signal_grep`；覆盖模式下只注册 `grep`。

| 参数           | 类型                                    | 默认值     | 作用                                                         |
| -------------- | --------------------------------------- | ---------- | ------------------------------------------------------------ |
| `pattern`      | string                                  | —          | 正则或纯文本；新搜索必填                                     |
| `path`         | string                                  | `.`        | 相对于工作目录的文件或目录；使用 cursor 时可选择一个保留文件 |
| `paths`        | string[]                                | —          | 使用 cursor 一次选择 1–20 个精确保留文件                     |
| `glob`         | string 或 string[]                      | `[]`       | 包含规则                                                     |
| `exclude`      | string 或 string[]                      | `[]`       | 排除规则                                                     |
| `literal`      | boolean                                 | `false`    | 固定字符串匹配                                               |
| `ignoreCase`   | boolean                                 | 随模式变化 | 强制忽略或区分大小写                                         |
| `hidden`       | boolean                                 | `true`     | 搜索隐藏文件；始终排除 `.git`                                |
| `context`      | number                                  | `0`        | 前后文行数，限制在 0–20                                      |
| `limit`        | number                                  | 自适应     | 每页最大匹配数，限制在 1–100                                 |
| `mode`         | `auto`、`summary`、`matches`、`inspect` | `auto`     | 自适应、摘要、具体匹配或代码块检查                           |
| `line`         | number                                  | —          | 单目标 `path` 检查使用的 1 起始行号                          |
| `matchIndex`   | number                                  | —          | cursor 检查使用的稳定 1 起始匹配编号；替代 `path` 和 `line`  |
| `matchIndices` | number[]                                | —          | 一次检查 1–5 个可见编号；要求 `cursor` 与 `mode="inspect"`   |
| `targets`      | `{path: string, line: number}[]`        | —          | 使用 `mode="inspect"` 检查 1–5 个已知源码位置，不带 cursor   |
| `cursor`       | string                                  | —          | 继续或选择稳定搜索快照中的结果                               |

省略 `ignoreCase` 时，附加模式的 `signal_grep` 使用智能大小写；覆盖模式的 `grep` 保持 Pi 内置工具默认的区分大小写行为。

### 模式

- `auto`：隐式搜索按当前上下文档位进行首次详情试装，能装下时返回全部分组详情；显式提供 `limit` 时使用默认预算立即返回详情页；其他情况先返回文件摘要。
- `summary`：返回按计数排序的文件页、有界首条保留匹配样例，以及正文中的 cursor；仍有文件时使用 `mode="summary"` 继续分页。
- `matches`：立即按默认预算返回第一页详情。
- `inspect`：检查单个 `path`/`line` 或 cursor 对应的 `matchIndex`；使用 `targets` 或 `matchIndices` 一次检查最多五个目标。没有结构 provider 时仍可返回有界源码，但不会虚构符号边界或接受未经验证的快照版本。
- `cursor`：从原始快照继续，不重新搜索。摘要 cursor 从第 1 条匹配读取详情，可反复选择 `path`/`paths`，也可结合 `mode="summary"` 继续文件摘要页；匹配 cursor 必须保持相同文件筛选。

当 Pi 为符合条件的 `auto` 搜索提供可用上下文数据时，结构化详情会包含 `budgetTier`、`contextRemainderPercent` 和 `resultTokenBudget`；`tight` 与 `critical` 响应也会在模型可见文本中给出同样的归因说明。这些目标沿用现有 metrics 的保守字符估算；源代码和路径仍可能包含 CJK，因此它们不是精确的模型分词保证。

## 可选的累计 Token 对比

Token 对比默认关闭；关闭时不会生成额外的基准文本。使用以下命令开启一个全新、仅限当前会话的统计区间：

```text
/signal-grep-metrics on
```

启动 Metrics 会清空现有 Signal Grep 快照，避免统计区间开始前生成的 cursor 在区间内成功执行却无法配对计量。如果尚未启用覆盖模式，这一条命令会持久化开启 Override、自动重载 Pi，并在重载后自动启动 Metrics，使后续可比较的 Pi 搜索进入统计；源码检查调用不计入。`/signal-grep-metrics off` 只结束统计区间；Override 会继续生效，直到执行 `/signal-grep-override off` 恢复 Pi 内置实现。

Pi 会在内置 Footer 统计下方追加一条紧凑、分色的扩展状态，并在每次可对比搜索后更新。`SG` 卡片使用主题高亮色，`NORMAL` 使用浅灰色，差值卡片使用成功/错误颜色：

```text
[ SG 3.2k ]  [ NORMAL 11.8k ]  [ ↓ 8.6k · 72.9% ]
```

`SG` 是可比较的 Signal Grep **搜索结果文本**的累计估算 Token；单项与批量 `mode="inspect"` 均不计入。`normal` 基于完全相同的稳定匹配快照精确复现 Pi 普通 grep 的输出格式。cursor 页面只累加到 `SG`，不会重新执行或重复计算 normal 基准。如果完整分页比 normal 输出消耗更多，状态会如实显示 `↑1.3k (11.0%)` 之类的负收益。

Token 使用 Pi 同样的保守“字符数除以四”启发式估算，不包括检查和 read 输出、工具 Schema、供应商序列化、搜索结果以外的模型输入输出，以及选择和读取证据所需的额外模型轮次。**Metrics 不是任务总 Token 或 API 费用，显示百分比也不是任务级节省比例。**最终报告同时保留精确的 UTF-8 字节数。Metrics 不增加内容搜索；空模式、空白敏感模式、多个 glob、排除规则和 `hidden=false` 等每次成功的 Pi `grep` 查询都会在两侧使用同一匹配集合。通过 `bash` 手写执行的 `rg` 以及其他扩展拥有的搜索工具不在本工具边界内，因此不会计入。

使用以下命令结束统计区间、仅移除 Signal Grep 状态并显示最终累计报告：

```text
/signal-grep-metrics off
```

使用 `/signal-grep-metrics status` 可以查看当前区间而不关闭。指标只保存在内存中，下次开启时归零，不会持久化或传输。

## 正确性契约

1. `complete` 搜索快照保留 `rg` 发现的每一行匹配，不表示整个仓库经过一次原子读取。
2. 匹配行跨页只出现一次，包括开启 context 且相邻多行均命中的情况。cursor 不重新搜索，也不静默改变已绑定的文件筛选集合。
3. 按计数排序的文件页在正文和 `details` 都暴露 cursor。样例来自保留匹配；未展示的样例明确计数。
4. 内容搜索前，先按相同路径、ignore、hidden 和 glob 规则枚举文件名，以有界并发为最多 50,000 个候选文件记录 revision。只有扫描前后 revision 一致的文件才能获得可信源码绑定；增加的是目录遍历和元数据读取，不是第二次内容搜索。
5. 已变更、新出现、不可读或未缓存的源码 revision 保持未验证状态。匹配行和计数仍保留；正文与 `sourceUnverifiedFileCount` 说明当前上下文和快照检查为何不可用。搜索结束后的源码变化同样会被拒绝。
6. 超过 50,000 行匹配保留上限时明确返回 `partial`。候选 revision 上限是另一项限制，不截断匹配集合。
7. 详情页同时受匹配条数和 16 KiB 约束。每条匹配行最多展示 20 个 occurrence 范围，保留快照中的范围不因此删除；正文和 `occurrenceRangesOmitted`/`occurrenceMatchesTruncated` 报告展示省略。高密度命中行不能为了装入预算丢失路径或稳定匹配编号。
8. 超过 500 个源码字符的行使用摘录。匹配行和 cursor 检查围绕首个 occurrence 居中；范围省略和行裁剪同时写入正文与结构化详情。源码读取限制为 5 MiB。
9. 单项与批量检查使用相同版本验证规则。整批共享 16 KiB 响应上限，逐项报告结果并去重源码行；返回目标仍可能包含明确标注的有界摘录。
10. `.git` 排除优先于用户 glob，显式指向 Git 内部的搜索路径会被拒绝。其他有意义的隐藏文件默认可搜索。
11. 无效 cursor、无效请求和运行时失败明确报错。取消或协议解析失败会终止并等待自有子进程关闭；清理失败是错误，不能表现为空搜索成功。

所有权和生命周期设计见[架构说明](docs/ARCHITECTURE.md)。

## 命令

- `/signal-grep-health`：查看 ripgrep 可用性、经运行参数能力验证的 Universal Ctags 状态和快照使用情况。
- `/signal-grep-clear`：清空快照并使现有 cursor 失效。
- `/signal-grep-override on|off|status`：持久化或查看可选的内置 grep 覆盖模式。
- `/signal-grep-metrics on|off|status`：控制或查看 Status Line 累计 Token 估算。

## 代码证据与结构

`mode="inspect"` 保留原有单目标形式：`path` 加 1 起始 `line`，或 cursor 加 1 起始 `matchIndex`。多个位置可以这样检查：

```json
{ "mode": "inspect", "cursor": "<returned-cursor>", "matchIndices": [1, 2, 3] }
```

```json
{
  "mode": "inspect",
  "targets": [
    { "path": "src/app.ts", "line": 1 },
    { "path": "utils.ts", "line": 1 }
  ]
}
```

每次只使用一种形式。`matchIndices` 必须带 cursor；`targets` 不能带 cursor。批量字段不得混入单目标的 `path`、`line` 或 `matchIndex`。两种数组都允许 1–5 项，无需迁移既有配置。

整批共享 16 KiB。`details.inspections` 的每项保留输入编号，并报告 `returned`、`deferred` 或 `error`；已返回项指向展示的源码块。同一文件、同一已验证 revision 的重叠源码行只展示一次。因预算延后的目标与有界范围可以附上完整单目标 `retry` 请求，正文也会打印。重试仍遵守单项检查的限制。无效请求在读取源码前失败；取消和非预期运行错误使整次调用失败，不能伪装成成功项。

批次的 `complete` 表示每个目标都返回了有界源码，不表示每个 enclosing symbol 都返回全文。每项 `source` 说明实际范围、前后省略行和被裁剪行。快照版本缺失或已变化时需要刷新搜索；直接使用当前 `path`/`line` 是另一次当前源码检查，不能替代快照版本验证。

Universal Ctags 是可选依赖，不会自动下载。provider 必须支持实际使用的 JSON、line/end 和 extras 参数。只有可证明的符号范围才会被采用；否则仍可读取有界源码，并明确报告结构状态。provider 缺失、没有可靠 enclosing range、解析失败、文件过大、源码不可用和源码变化使用不同状态。直接检查也会在结构与源码读取后复核 revision。

有效 UTF-8 文本的匹配列使用 UTF-16 位置；带 `b` 后缀的范围是非 UTF-8 数据的原始字节偏移。原始 ripgrep/Ctags 协议输出不会发送给模型。会话关闭时清理保留快照。

## 安全与隐私

- 搜索完全在本地运行。
- 插件没有网络请求和遥测。
- 使用参数数组直接启动 `rg` 和可选的 Universal Ctags，不经过 shell。
- 搜索和检查路径限制在工作目录内。
- 始终排除 `.git` 内部文件。
- Pi 扩展拥有用户进程的完整权限；安装第三方扩展前应审查源码。

漏洞报告方式和受支持版本见 [SECURITY.md](SECURITY.md)。

## 开发

```bash
bun install
bun run check
bun run pack:check
```

测试使用 Bun 原生测试运行器，并包含真实 ripgrep 集成测试。`bun run test:node` 会临时构建 Node 目标、使用 Node.js 导入，然后清理产物。

所有变更（包括 AI 编写的变更）都必须通过 Pull Request：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [AI Pull Request Guide](docs/AI_PULL_REQUEST_GUIDE.md)
- [质量门禁](docs/QUALITY_GATES.md)

## 许可证

[GNU AGPL v3.0 only](LICENSE)
