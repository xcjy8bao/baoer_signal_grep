/**
 * Templates for human-facing Signal Grep messages: command output, status line,
 * and notifications. Tool response text is intentionally NOT routed through
 * this module — it is read by the model and stays in English regardless of any
 * future locale setting. Structured `details` fields are protocol constants and
 * are never localized.
 */
const EN = {
  overrideDegraded:
    'Signal Grep override is enabled in config, but "grep" is owned by {source}. ' +
    'Loading additively as "signal_grep" for this session. ' +
    'Remove {source} to restore the override, or set "overrideBuiltinGrep": false to keep additive mode.',
  metricsRequiresOverride:
    'Signal Grep metrics require the built-in grep override, but "grep" is owned by {source}. ' +
    "Metrics were not enabled.",
  overrideEnableRefused:
    'Cannot enable Signal Grep override: "{source}" is installed and owns the public "grep" tool name. ' +
    'Remove it first, or keep using additive "signal_grep".',
  healthDegradedMode: 'degraded to additive "signal_grep" (conflict: {source})',
} as const;

export type MessageKey = keyof typeof EN;
export type MessageParams = Readonly<Record<string, string>>;

export function message(key: MessageKey, params?: MessageParams): string {
  let text: string = EN[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, value);
    }
  }
  return text;
}
