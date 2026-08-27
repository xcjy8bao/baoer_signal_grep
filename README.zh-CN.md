# Pi Signal Grep

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

简体中文 · [English](README.md)

面向 [Pi 编码智能体](https://pi.dev) 的上下文高效、正确性优先的内容搜索插件。Signal Grep 避免宽泛的 `ripgrep` 结果淹没模型上下文，同时绝不会把被截断的结果伪装成完整结果。

> **最新版本：** `0.2.0`。

## 为什么需要 Signal Grep？

编码智能体通常不需要立即看到 100 行匹配；它首先需要知道有效信息分布在哪里。

Signal Grep 使用自适应返回策略：

- **小规模搜索：** 一次调用返回按文件分组的具体匹配。
- **宽泛搜索：** 首先返回精确的文件级命中摘要。
- **完整展开：** 基于同一个稳定内存快照可靠分页。
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

仓库中有 33 行 `TODO`：其中 `noise.ts` 有 30 行，另外三个关键文件各有一行。Signal Grep 默认不会把 33 行全部送进上下文，而是返回：

```text
33 matches across 4 files (complete snapshot).

README.md        1
noise.ts        30
src/app.ts       1
utils.ts         1

Details are available from the stable snapshot with cursor="…".
```

智能体随后可以通过 `path` 缩小范围，或者请求完整分页。默认页大小下，完整结果严格是 20 条加 13 条，没有重复和遗漏。

## 可复现的前后对比测试

仓库内置了基准脚本。它会创建上面的测试工程，让 Pi 真实的内置 grep 实现和 Signal Grep 搜索同一批文件，最后自动删除测试工程：

```bash
bun run benchmark
```

测试环境为 Pi 0.84.3、Bun 1.4.0、Node.js 22.22.2 和 ripgrep 15.2.0：

| 测量项                 |   Pi 内置 grep |                Signal Grep |
| ---------------------- | -------------: | -------------------------: |
| 实际发现的匹配数       |             33 |                         33 |
| 包含匹配的文件数       |              4 |                          4 |
| 首次响应中的具体匹配行 |             33 |            0（先返回摘要） |
| 首次进入模型的响应文本 |       898 字节 |                   220 字节 |
| 首次响应缩减           |              — |                  **75.5%** |
| 完整详情获取方式       | 一次返回 33 条 | 同一稳定快照分页为 20 + 13 |
| 完整详情文本合计       |       898 字节 |                   830 字节 |

结果验证了预期效果：默认的宽泛搜索响应显著缩小，但完整的 33 条匹配仍然可以取回。Signal Grep 的完整详情还会按文件分组，因此不需要在每一行重复输出文件路径。

这是“上下文形状”对比，不是搜索速度或 Token 数量基准。字节数只统计进入模型的工具文本，不包含供应商序列化、工具 Schema、模型分词，以及完整分页所需的额外工具轮次。用于容量规划前，应在自己的平台上重新运行该命令。

## 环境要求

### 运行时

- Pi 0.84.3 或更高版本
- Node.js 22+ 或 Bun 1.4+
- `PATH` 中可用的 [`ripgrep`](https://github.com/BurntSushi/ripgrep)（命令名 `rg`）

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

## 工具接口

插件只注册一个工具：`signal_grep`。

| 参数         | 类型                         | 默认值     | 作用                          |
| ------------ | ---------------------------- | ---------- | ----------------------------- |
| `pattern`    | string                       | —          | 正则或纯文本；新搜索必填      |
| `path`       | string                       | `.`        | 相对于工作目录的文件或目录    |
| `glob`       | string 或 string[]           | `[]`       | 包含规则                      |
| `exclude`    | string 或 string[]           | `[]`       | 排除规则                      |
| `literal`    | boolean                      | `false`    | 固定字符串匹配                |
| `ignoreCase` | boolean                      | 智能大小写 | 强制忽略或区分大小写          |
| `hidden`     | boolean                      | `true`     | 搜索隐藏文件；始终排除 `.git` |
| `context`    | number                       | `0`        | 前后文行数，限制在 0–20       |
| `limit`      | number                       | `20`       | 每页具体匹配数，限制在 1–100  |
| `mode`       | `auto`、`summary`、`matches` | `auto`     | 自适应、摘要或具体匹配模式    |
| `cursor`     | string                       | —          | 继续读取稳定搜索快照          |

### 模式

- `auto`：不超过 `limit` 时返回分组详情，否则先返回文件摘要。
- `summary`：始终先返回文件命中数。
- `matches`：立即返回第一页具体匹配。
- `cursor`：从原始快照继续分页，不重新执行搜索。

## 可选的累计 Token 对比

Token 对比默认关闭；关闭时不会执行额外的基准搜索。使用以下命令开启一个全新、仅限当前会话的统计区间：

```text
/signal-grep-metrics on
```

Pi 会在内置 Footer 统计下方追加一条紧凑的扩展状态，并在每次可对比搜索后更新：

```text
SG 3.2k / normal 11.8k · ↓8.6k (72.9%)
```

`SG` 是 Signal Grep 结果文本的累计估算 Token，`normal` 是相同新搜索使用 Pi 普通 grep 时结果文本的累计估算 Token。cursor 页面只累加到 `SG`，不会重新执行或重复计算普通 grep 基准。如果完整分页比普通 grep 消耗更多，状态会如实显示 `↑1.3k (11.0%)` 之类的负收益。

Token 使用 Pi 同样的保守“字符数除以四”启发式估算，只覆盖进入模型的结果文本，不包括工具 Schema、供应商序列化，或请求 cursor 页面所需的额外模型轮次。最终报告同时保留精确的 UTF-8 字节数。开启统计后，每个可对比的新搜索会额外执行一次普通 grep。多个包含 glob、排除 glob 或 `hidden=false` 无法由普通 grep 等价表达，因此会带有明确警告并排除在对比之外。

使用以下命令结束统计区间、仅移除 Signal Grep 状态并显示最终累计报告：

```text
/signal-grep-metrics off
```

使用 `/signal-grep-metrics status` 可以查看当前区间而不关闭。指标只保存在内存中，下次开启时归零，不会持久化或传输。

## 正确性契约

Signal Grep 将搜索完整性视为公开契约：

1. `complete` 快照保留 `rg` 发现的每一行匹配。
2. cursor 保持快照顺序，分页之间不得重复或遗漏已保留匹配。
3. 已保留的匹配行文本保持快照稳定；可选的周边上下文会在页面格式化时读取，因此可能反映后续文件修改。
4. 超过 50,000 条保留上限时，文本和结构化详情都必须标记为 `partial`。
5. 每页同时受匹配数量和 16 KiB 模型输出限制。
6. 超过 500 字符的行会被明确截断，并在详情中计数。
7. 大于 5 MiB、无法读取，或单个上下文块超过页面字节预算的文件会省略上下文并明确报告。
8. cursor 无效、子进程失败等情况必须报错，不能伪装成空搜索成功。

所有权和生命周期设计见[架构说明](docs/ARCHITECTURE.md)。

## 命令

- `/signal-grep-health`：查看 ripgrep 版本和快照使用情况。
- `/signal-grep-clear`：清空快照并使现有 cursor 失效。
- `/signal-grep-metrics on|off|status`：控制或查看 Status Line 累计 Token 估算。

Pi 会话关闭时也会自动清理快照。

## 安全与隐私

- 搜索完全在本地运行。
- 插件没有网络请求和遥测。
- 使用参数数组直接启动 `rg`，不经过 shell。
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
