import type { SignalGrepLocale } from "./config.js";

const EN = {
  commandHealthDescription:
    "Show ripgrep, structure-provider availability, and in-memory snapshot usage",
  healthRipgrepFailure: "Signal Grep cannot run ripgrep: {error}",
  healthUnknownRipgrepVersion: "ripgrep (unknown version)",
  healthUnknownCtagsVersion: "Universal Ctags (unknown version)",
  healthCtagsUnavailable: "Universal Ctags unavailable",
  healthOverrideMode: "override built-in grep",
  healthAdditiveMode: "additive signal_grep",
  healthDegradedMode: 'degraded to additive "signal_grep" (conflict: {source})',
  healthReport:
    "{ripgrepVersion}\nStructure provider: {structureVersion}\nTool mode (effective): {effectiveMode}\nSearch tools: {searchTools}\nActive grep owner: {activeGrepOwner}\nSnapshots: {snapshots}\nRetained matches: {retainedMatches}",
  commandClearDescription: "Clear all in-memory Signal Grep snapshots and invalidate their cursors",
  snapshotsCleared: "Signal Grep snapshots cleared",
  commandOverrideDescription: "Enable, disable, or inspect the persistent built-in grep override",
  overrideEnabled: "Signal Grep override is enabled.",
  overrideDisabled: "Signal Grep override is disabled.",
  overrideUsage: "Usage: /signal-grep-override on|off|status",
  overrideAlreadyEnabled: "Signal Grep override is already enabled.",
  overrideAlreadyDisabled: "Signal Grep override is already disabled.",
  overrideEnableRefused:
    'Cannot enable Signal Grep override: "{source}" is installed and owns the public "grep" tool name. ' +
    'Remove it first, or keep using additive "signal_grep".',
  overrideActiveOwner:
    "Cannot enable Signal Grep override because grep is already owned by {source}.",
  overrideReloadEnabled: "Signal Grep override enabled; reloading tools.",
  overrideReloadDisabled: "Signal Grep override disabled; reloading tools.",
  overrideDegraded:
    'Signal Grep override is enabled in config, but "grep" is owned by {source}. ' +
    'Loading additively as "signal_grep" for this session. ' +
    'Remove {source} to restore the override, or set "overrideBuiltinGrep": false to keep additive mode.',
  commandMetricsDescription:
    "Toggle or inspect cumulative Signal Grep versus normal grep token estimates",
  metricsAlreadyEnabled: "Signal Grep metrics are already enabled",
  metricsRequiresOverride:
    'Signal Grep metrics require the built-in grep override, but "grep" is owned by {source}. ' +
    "Metrics were not enabled.",
  metricsActiveOwner: "Signal Grep metrics cannot start because grep is already owned by {source}.",
  metricsReloading: "Enabling the grep override and reloading before Signal Grep metrics start.",
  metricsEnabled:
    "Signal Grep metrics enabled. Every successful Pi grep call will be compared from one shared snapshot.",
  metricsAlreadyDisabled: "Signal Grep metrics are already disabled",
  metricsDisabledStatus:
    "Signal Grep metrics are disabled. Use /signal-grep-metrics on to enable the grep override if needed and start a new comparison window.",
  metricsUsage: "Usage: /signal-grep-metrics on|off|status",
  overrideAndMetricsEnabled:
    "Signal Grep override and metrics enabled. Every successful Pi grep call will be compared.",
  conflictDetectionFailed: "unknown (conflict detection failed)",
  missingSource: "missing",
  unknownSource: "unknown",
} as const;

export type MessageKey = keyof typeof EN;
export type MessageParams = Readonly<Record<string, string | number>>;
type MessageCatalog = { [K in MessageKey]: string };

const ZH_CN: MessageCatalog = {
  commandHealthDescription: "显示 ripgrep、结构提供器可用性和内存快照用量",
  healthRipgrepFailure: "Signal Grep 无法运行 ripgrep：{error}",
  healthUnknownRipgrepVersion: "ripgrep（版本未知）",
  healthUnknownCtagsVersion: "Universal Ctags（版本未知）",
  healthCtagsUnavailable: "Universal Ctags 不可用",
  healthOverrideMode: "覆盖内置 grep",
  healthAdditiveMode: "附加 signal_grep",
  healthDegradedMode: "已降级为附加 signal_grep（冲突：{source}）",
  healthReport:
    "{ripgrepVersion}\n结构提供器：{structureVersion}\n工具模式（实际）：{effectiveMode}\n搜索工具：{searchTools}\n当前 grep 所有者：{activeGrepOwner}\n快照数：{snapshots}\n保留匹配数：{retainedMatches}",
  commandClearDescription: "清空所有内存 Signal Grep 快照并使其 cursor 失效",
  snapshotsCleared: "Signal Grep 快照已清空",
  commandOverrideDescription: "启用、停用或查看持久化的内置 grep 覆盖",
  overrideEnabled: "Signal Grep 覆盖已启用。",
  overrideDisabled: "Signal Grep 覆盖已停用。",
  overrideUsage: "用法：/signal-grep-override on|off|status",
  overrideAlreadyEnabled: "Signal Grep 覆盖已经启用。",
  overrideAlreadyDisabled: "Signal Grep 覆盖已经停用。",
  overrideEnableRefused:
    "无法启用 Signal Grep 覆盖：已安装的“{source}”拥有公开工具名“grep”。" +
    "请先移除该包，或继续使用附加的 signal_grep。",
  overrideActiveOwner: "无法启用 Signal Grep 覆盖，因为 grep 已由 {source} 持有。",
  overrideReloadEnabled: "Signal Grep 覆盖已启用；正在重新加载工具。",
  overrideReloadDisabled: "Signal Grep 覆盖已停用；正在重新加载工具。",
  overrideDegraded:
    "Signal Grep 配置已启用覆盖，但 grep 由 {source} 持有。" +
    "本会话将以附加的 signal_grep 加载。" +
    "移除 {source} 可在下次加载时恢复覆盖；也可将 overrideBuiltinGrep 设为 false 继续使用附加模式。",
  commandMetricsDescription: "切换或查看 Signal Grep 与普通 grep 的累计 Token 估算对比",
  metricsAlreadyEnabled: "Signal Grep Metrics 已经启用",
  metricsRequiresOverride:
    "Signal Grep Metrics 需要覆盖内置 grep，但 grep 由 {source} 持有。Metrics 未启用。",
  metricsActiveOwner: "Signal Grep Metrics 无法启动，因为 grep 已由 {source} 持有。",
  metricsReloading: "正在启用 grep 覆盖并重新加载，之后将启动 Signal Grep Metrics。",
  metricsEnabled: "Signal Grep Metrics 已启用。每次成功的 Pi grep 调用都会基于同一快照进行对比。",
  metricsAlreadyDisabled: "Signal Grep Metrics 已经停用",
  metricsDisabledStatus:
    "Signal Grep Metrics 已停用。如有需要，请使用 /signal-grep-metrics on 启用 grep 覆盖并开始新的对比区间。",
  metricsUsage: "用法：/signal-grep-metrics on|off|status",
  overrideAndMetricsEnabled:
    "Signal Grep 覆盖和 Metrics 已启用。每次成功的 Pi grep 调用都会参与对比。",
  conflictDetectionFailed: "未知（冲突检测失败）",
  missingSource: "缺失",
  unknownSource: "未知",
};

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)]
    .map((match) => match[1] ?? "")
    .toSorted((left, right) => left.localeCompare(right));
}

const CATALOGS: Readonly<Record<SignalGrepLocale, MessageCatalog>> = {
  en: EN,
  "zh-CN": ZH_CN,
};

export function message(locale: SignalGrepLocale, key: MessageKey, params?: MessageParams): string {
  let text = CATALOGS[locale][key];
  const required = placeholders(text);
  if (placeholders(EN[key]).join("\0") !== required.join("\0")) {
    throw new Error(`Signal Grep message placeholders differ for: ${key}`);
  }
  for (const name of required) {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Missing Signal Grep message parameter: ${name}`);
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
