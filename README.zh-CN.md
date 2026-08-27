# Pi Signal Grep

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简体中文 · [English](README.md)

面向 [Pi 编码智能体](https://pi.dev) 的上下文高效、正确性优先的内容搜索插件。Signal Grep 避免宽泛的 `ripgrep` 结果淹没模型上下文，同时绝不会把被截断的结果伪装成完整结果。

> **项目状态：** 预发布。首个实现正在通过 Pull Request 审查，尚未发布到 npm。

## 为什么需要 Signal Grep？

编码智能体通常不需要立即看到 100 行匹配；它首先需要知道有效信息分布在哪里。

Signal Grep 使用自适应返回策略：

- **小规模搜索：** 一次调用返回按文件分组的具体匹配。
- **宽泛搜索：** 首先返回精确的文件级命中摘要。
- **完整展开：** 基于同一个稳定内存快照可靠分页。
- **达到边界：** 明确返回 `partial`，并要求智能体缩小搜索范围。

它不使用模糊兜底、静默截断、后台索引、数据库、遥测或网络请求。

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

首个 Pull Request 合并后，可以从 GitHub 安装：

```bash
pi install git:github.com/xcjy8bao/pi-plugin-signal-grep
```

然后重启 Pi。本地开发时：

```bash
pi -e ./src/index.ts
```

计划使用的 npm 包名是 `pi-plugin-signal-grep`，目前尚未发布 npm 版本。

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

## 正确性契约

Signal Grep 将搜索完整性视为公开契约：

1. `complete` 快照保留 `rg` 发现的每一行匹配。
2. cursor 保持快照顺序，分页之间不得重复或遗漏已保留匹配。
3. 超过 50,000 条保留上限时，文本和结构化详情都必须标记为 `partial`。
4. 每页同时受匹配数量和 16 KiB 模型输出限制。
5. 超过 500 字符的行会被明确截断，并在详情中计数。
6. 大于 5 MiB、无法读取，或单个上下文块超过页面字节预算的文件会省略上下文并明确报告。
7. cursor 无效、子进程失败等情况必须报错，不能伪装成空搜索成功。

所有权和生命周期设计见[架构说明](docs/ARCHITECTURE.md)。

## 命令

- `/signal-grep-health`：查看 ripgrep 版本和快照使用情况。
- `/signal-grep-clear`：清空快照并使现有 cursor 失效。

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

[MIT](LICENSE)
