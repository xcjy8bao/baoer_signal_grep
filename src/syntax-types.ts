/** Syntax offsets are UTF-16 half-open ranges into the supplied, unchanged text. */
export type SyntaxLanguage = "javascript" | "typescript" | "tsx" | "go";

export interface SyntaxNode {
  kind: string;
  start: number;
  end: number;
  parent: number | null;
  field?: string;
  named: boolean;
}

export interface SyntaxSymbol {
  name: string;
  kind: string;
  start: number;
  end: number;
  bodyStart?: number;
  bodyEnd?: number;
  scope?: string;
  hasBody: boolean;
  /** True means a directly provable export, not runtime API accessibility. */
  exported: boolean;
  node: number;
}

export type SyntaxRoleName =
  | "declaration"
  | "call"
  | "import"
  | "export"
  | "comment"
  | "string"
  | "jsx-text"
  | "code"
  | "unknown";

export interface SyntaxRole {
  start: number;
  end: number;
  role: SyntaxRoleName;
  certainty: "syntax" | "candidate";
  subkind?: string;
  node: number;
}

export type SyntaxStatus = "ok" | "unsupported" | "parse-error" | "limit" | "timeout";

export interface SyntaxDiagnostic {
  kind: string;
  start: number;
  end: number;
}

/** Lives for this request only. Never put nodes or children into a session snapshot. */
export interface SyntaxAnalysis {
  language?: SyntaxLanguage;
  status: SyntaxStatus;
  nodes: SyntaxNode[];
  children: number[][];
  symbols: SyntaxSymbol[];
  roles: SyntaxRole[];
  diagnostics: SyntaxDiagnostic[];
  limited: boolean;
}

export interface SyntaxWorkerResult {
  status: "ok" | "parse-error" | "limit";
  nodes: SyntaxNode[];
}
