# Pi Signal Grep

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

简体中文 · [English](README.md)

面向 [Pi 编码智能体](https://pi.dev) 的上下文高效、正确性优先的内容搜索和有界代码检查插件。Signal Grep 避免宽泛的 `ripgrep` 结果淹没模型上下文，同时绝不会把被截断的结果伪装成完整结果。

> **最新版本：** `0.4.0`。

## 为什么需要 Signal Grep？

编码智能体通常不需要立即看到 100 行匹配；它首先需要知道有效信息分布在哪里。

Signal Grep 使用自适应返回策略：

- **小规模搜索：** 一次调用返回按文件分组的具体匹配。
- **宽泛搜索：** 首先返回精确的文件级命中摘要。
- **完整展开：** 基于同一个稳定内存快照可靠分页。
- **上下文压力：** 只收紧隐式 `auto` 的详情试装，不改变显式请求和 cursor 请求。
- **达到边界：** 明确返回 `partial`，并要求智能体缩小搜索范围。

它不使用模糊兜底、静默截断、后台索引、数据库、遥测或网络请求。

## 一个直白的类比：研究型图书管理员，而不是复印机

假设你走进一座大型图书馆，对管理员说：

> 找出图书馆中所有出现过 `TODO` 的页面。

普通 grep 像一台复印机：发现一页就复印一页，然后把全部复印件堆到你的桌上。如果某本噪音很多的书重复出现了 30 次 `TODO`，这 30 张纸就可能把真正重要的 3 张纸埋住。

桌面就是模型的上下文窗口。每放入一张无关的纸，就少了一部分空间用于理解代码、推理行为和生成正确修改。只留下前 20 张也不是完整方案，因为桌面虽然干净了，却可能直接丢掉有价值的页面。

Signal Grep 更像一位研究型图书管理员。面对宽泛搜索，它先给模型一张目录：

```text
33 matches across 4 files

README.md       1
noise.ts       30
src/app.ts      1
utils.ts        1
```

模型一眼就能看出噪音集中在哪里，然后只索取真正相关的文件。如果确实需要全部页面，管理员会提供一张编号取件票，也就是 cursor；这张票对应一辆已经封好的结果资料车，也就是稳定快照。后续每一批结果都从同一辆资料车继续提取，所以即使原始搜索后仓库文件发生变化，已保留的匹配也不会被静默重复或跳过。

如果资料车超过保留上限，Signal Grep 会明确标记为 `partial`。它绝不会丢掉资料后仍声称搜索结果完整。

| 图书馆类比             | Signal Grep 概念      |
| ---------------------- | --------------------- |
| 整座图书馆             | 代码仓库              |
| 一本书                 | 一个文件              |
| 出现关键词的页面       | grep 匹配             |
| 有限的桌面空间         | 模型上下文窗口        |
| 标注每本书命中数的目录 | 文件级搜索摘要        |
| 封好的结果资料车       | 稳定内存快照          |
| 编号取件票             | cursor                |
| 容量不足提示           | 明确的 `partial` 状态 |

一句话总结：**普通 grep 把所有复印件堆到模型桌上；Signal Grep 先给模型一张目录，再准确取出它真正需要的资料。**

## 示例

仓库中有 233 行 `TODO`，其中一个类似生成产物的文件有 200 行，另一个噪音文件有 30 行。普通 grep 会在 100 条边界停止，无法暴露真实总数；Signal Grep 则返回：

```text
233 matches across 5 files (complete snapshot).

README.md        1
broad.ts       200
noise.ts        30
src/app.ts       1
utils.ts         1

Details are available from the stable snapshot with cursor="…".
```

对于完整且紧凑的结果，即使超过原先固定的 20 条阈值，Signal Grep 也会直接返回分组详情，避免简单搜索承担一次没有必要的摘要和 cursor 轮次。

对于没有显式 `limit` 的隐式 `auto` 搜索，首次详情试装会使用 Pi 报告的上下文余量：余量高于 40% 时为 `full`，目标约 2,000 个估算结果文本 Token；12%–40% 为 `tight`，目标约 1,000；低于 12% 为 `critical`，目标约 500。无论处于哪个档位，能装下的紧凑完整结果仍会直接返回。上下文用量未知时保持原有 2,000 Token 目标，也不会声称做过调整。`matches`、显式 `limit`、检查和 cursor 续页永不降档。

## 可复现的前后对比测试

仓库内置了基准脚本。它会创建上面的测试工程，让 Pi 真实的内置 grep 实现和 Signal Grep 搜索同一批文件，最后自动删除测试工程：

```bash
bun run benchmark
```

测试环境为 Pi 0.84.3、Bun 1.4.0、Node.js 22.22.2 和 ripgrep 15.2.0：

| 场景                   |       Pi 内置 grep |             Signal Grep |
| ---------------------- | -----------------: | ----------------------: |
| 紧凑搜索：实际匹配     |                 33 |                      33 |
| 紧凑搜索：首次响应     |           898 字节 |            **960 字节** |
| 紧凑搜索：额外详情轮次 |             不需要 |              **不需要** |
| 宽泛搜索：实际匹配     | 达到限制后不可观察 |                 **233** |
| 宽泛搜索：首次显示详情 |             100 行 | **0（先返回精确摘要）** |
| 宽泛搜索：首次响应     |         9,728 字节 |            **321 字节** |
| 宽泛搜索：首次响应缩减 |                  — |               **96.7%** |

同一份包含 18 条匹配的中等规模测试数据还会验证三个上下文档位：

| 档位       | 上下文余量 | 估算 Token 目标 | 首次返回详情 |   首次响应 |
| ---------- | ---------: | --------------: | -----------: | ---------: |
| `full`     |        80% |           2,000 |           18 | 4,580 字节 |
| `tight`    |        30% |           1,000 |  0（先摘要） |   333 字节 |
| `critical` |         8% |             500 |  0（先摘要） |   334 字节 |

紧凑场景证明自适应预算能够一次返回全部结果，同时提供精确 occurrence 范围且不增加额外轮次；范围元数据会带来少量、明确的响应开销。宽泛场景证明 Signal Grep 会暴露精确总数和文件分布，而不是把前 100 条结果伪装成完整搜索。显式设置 `limit=20` 时，33 条测试结果仍会稳定分页为 20 + 13，没有重复或遗漏。

这是“上下文形状”对比，不是速度或精确分词基准。字节数只统计进入模型的工具文本，不包含供应商序列化、工具 Schema 和模型分词。用于容量规划前，应在自己的平台上重新运行该命令。

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

| 参数         | 类型                                    | 默认值     | 作用                                                         |
| ------------ | --------------------------------------- | ---------- | ------------------------------------------------------------ |
| `pattern`    | string                                  | —          | 正则或纯文本；新搜索必填                                     |
| `path`       | string                                  | `.`        | 相对于工作目录的文件或目录；使用 cursor 时可选择一个保留文件 |
| `glob`       | string 或 string[]                      | `[]`       | 包含规则                                                     |
| `exclude`    | string 或 string[]                      | `[]`       | 排除规则                                                     |
| `literal`    | boolean                                 | `false`    | 固定字符串匹配                                               |
| `ignoreCase` | boolean                                 | 随模式变化 | 强制忽略或区分大小写                                         |
| `hidden`     | boolean                                 | `true`     | 搜索隐藏文件；始终排除 `.git`                                |
| `context`    | number                                  | `0`        | 前后文行数，限制在 0–20                                      |
| `limit`      | number                                  | 自适应     | 每页最大匹配数，限制在 1–100                                 |
| `mode`       | `auto`、`summary`、`matches`、`inspect` | `auto`     | 自适应、摘要、具体匹配或代码块检查                           |
| `line`       | number                                  | —          | `mode=inspect` 必填的 1 起始行号                             |
| `cursor`     | string                                  | —          | 继续或选择稳定搜索快照中的结果                               |

省略 `ignoreCase` 时，附加模式的 `signal_grep` 使用智能大小写；覆盖模式的 `grep` 保持 Pi 内置工具默认的区分大小写行为。

### 模式

- `auto`：隐式搜索按当前上下文档位进行首次详情试装，能装下时返回全部分组详情；显式提供 `limit` 时使用默认预算立即返回详情页；其他情况先返回文件摘要。
- `summary`：始终先返回文件命中数。
- `matches`：立即返回第一页自适应预算详情。
- `inspect`：检查 `path` 和 `line` 所在的最小可用代码符号；提供 cursor 时，若保留匹配对应的源文件已变化，则明确拒绝返回过期证据。
- `cursor`：从原始快照继续分页，不重新执行搜索；结合 `path` 可以只选择一个保留文件。

当 Pi 为符合条件的 `auto` 搜索提供可用上下文数据时，结构化详情会包含 `budgetTier`、`contextRemainderPercent` 和 `resultTokenBudget`；`tight` 与 `critical` 响应也会在模型可见文本中给出同样的归因说明。这些目标沿用现有 metrics 的保守字符估算；源代码和路径仍可能包含 CJK，因此它们不是精确的模型分词保证。

## 可选的累计 Token 对比

Token 对比默认关闭；关闭时不会生成额外的基准文本。使用以下命令开启一个全新、仅限当前会话的统计区间：

```text
/signal-grep-metrics on
```

启动 Metrics 会清空现有 Signal Grep 快照，避免统计区间开始前生成的 cursor 在区间内成功执行却无法配对计量。如果尚未启用覆盖模式，这一条命令会持久化开启 Override、自动重载 Pi，并在重载后自动启动 Metrics，确保每一次成功的 Pi `grep` 调用都进入统计。`/signal-grep-metrics off` 只结束统计区间；Override 会继续生效，直到执行 `/signal-grep-override off` 恢复 Pi 内置实现。

Pi 会在内置 Footer 统计下方追加一条紧凑、分色的扩展状态，并在每次可对比搜索后更新。`SG` 卡片使用主题高亮色，`NORMAL` 使用浅灰色，差值卡片使用成功/错误颜色：

```text
[ SG 3.2k ]  [ NORMAL 11.8k ]  [ ↓ 8.6k · 72.9% ]
```

`SG` 是 Signal Grep 结果文本的累计估算 Token，`normal` 基于完全相同的稳定匹配快照精确复现 Pi 普通 grep 的输出格式。cursor 页面只累加到 `SG`，不会重新执行或重复计算 normal 基准。如果完整分页比 normal 输出消耗更多，状态会如实显示 `↑1.3k (11.0%)` 之类的负收益。

Token 使用 Pi 同样的保守“字符数除以四”启发式估算，只覆盖进入模型的结果文本，不包括工具 Schema、供应商序列化，或请求 cursor 页面所需的额外模型轮次。最终报告同时保留精确的 UTF-8 字节数。Metrics 不会执行第二次搜索；空模式、空白敏感模式、多个 glob、排除规则和 `hidden=false` 等每次成功的 Pi `grep` 查询都会在两侧使用同一匹配集合。通过 `bash` 手写执行的 `rg` 以及其他扩展拥有的搜索工具不在本工具边界内，因此不会计入。

使用以下命令结束统计区间、仅移除 Signal Grep 状态并显示最终累计报告：

```text
/signal-grep-metrics off
```

使用 `/signal-grep-metrics status` 可以查看当前区间而不关闭。指标只保存在内存中，下次开启时归零，不会持久化或传输。

## 正确性契约

Signal Grep 将搜索完整性视为公开契约：

1. `complete` 快照保留 `rg` 发现的每一行匹配。
2. cursor 保持快照顺序，分页之间不得重复或遗漏已保留匹配。
3. 已保留的匹配行文本和 occurrence 范围保持快照稳定；可选的周边上下文会在页面格式化时读取，因此可能反映后续文件修改。
4. 超过 50,000 条保留上限时，文本和结构化详情都必须标记为 `partial`。
5. 隐式 `auto` 详情试装会依据上报的上下文余量，以约 2,000、1,000 或 500 个估算结果文本 Token 为目标；显式请求和续页保留 2,000 Token 目标。所有页面仍受 100 条匹配和 16 KiB 硬上限约束。
6. 超过 500 字符的行会被明确截断并在详情中计数；匹配列号仍基于未截断原行。
7. 大于 5 MiB、无法读取、没有可用结构 provider，或单个代码块超过页面字节预算的文件会省略结构/上下文并明确报告。
8. `mode=inspect` 只有在结构 provider 能证明范围时才返回 enclosing symbol，否则明确说明原因并返回有界源代码窗口。
9. 使用 cursor 检查时，如果源文件 revision 发生变化，必须拒绝返回过期代码证据。
10. cursor 无效、结构请求无效、子进程失败等情况必须报错，不能伪装成空搜索成功。

所有权和生命周期设计见[架构说明](docs/ARCHITECTURE.md)。

## 命令

- `/signal-grep-health`：查看 ripgrep/Universal Ctags 可用性和快照使用情况。
- `/signal-grep-clear`：清空快照并使现有 cursor 失效。
- `/signal-grep-override on|off|status`：持久化或查看可选的内置 grep 覆盖模式。
- `/signal-grep-metrics on|off|status`：控制或查看 Status Line 累计 Token 估算。

## 代码证据与结构

`mode=inspect` 接受相对于工作目录的 `path` 和 1 起始行号 `line`，返回有界、带行号的源代码范围；如果可用的结构 provider 能识别出最小 enclosing symbol，还会返回其名称、类型和范围。结合 cursor 时，检查会绑定到保留匹配，并在源文件发生变化时拒绝返回过期证据。

基础定位能力适用于所有文本语言，因为它来自 ripgrep 的匹配范围。符号检查采用能力协商：默认在存在支持 JSON 输出的 Universal Ctags 时使用它。该依赖是可选的，不会自动下载。缺少 provider、无法识别符号、解析失败、文件过大、源文件变化和文件不可读都会体现在 `details.structure.status` 中。

搜索页面会合并重叠上下文；对于有效 UTF-8 文本，匹配列使用 UTF-16 位置，带 `b` 后缀的范围则表示 ripgrep 返回的原始 UTF-8 字节偏移。原始 ripgrep 或 ctags 协议输出不会发送给模型，只返回有界的格式化证据。

Pi 会话关闭时也会自动清理快照。

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
- [AGENTS.md](AGENTS.md)

## 许可证

[GNU AGPL v3.0 only](LICENSE)
