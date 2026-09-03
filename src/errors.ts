export class SignalGrepError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SignalGrepError";
  }
}

export class CursorError extends SignalGrepError {
  readonly code:
    | "E_CURSOR_MALFORMED"
    | "E_CURSOR_NOT_FOUND"
    | "E_CURSOR_EXPIRED"
    | "E_CURSOR_WRONG_KIND"
    | "E_CURSOR_OPTIONS_CONFLICT"
    | "E_CURSOR_OFFSET_INVALID";

  constructor(
    message: string,
    code:
      | "E_CURSOR_MALFORMED"
      | "E_CURSOR_NOT_FOUND"
      | "E_CURSOR_EXPIRED"
      | "E_CURSOR_WRONG_KIND"
      | "E_CURSOR_OPTIONS_CONFLICT"
      | "E_CURSOR_OFFSET_INVALID" = "E_CURSOR_MALFORMED",
  ) {
    super(`${code}: ${message}`);
    this.name = "CursorError";
    this.code = code;
  }
}

export function abortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}
