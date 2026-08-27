export class SignalGrepError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SignalGrepError";
  }
}

export class CursorError extends SignalGrepError {
  constructor(message: string) {
    super(message);
    this.name = "CursorError";
  }
}

export function abortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}
