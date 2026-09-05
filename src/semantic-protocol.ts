import { fileURLToPath } from "node:url";
import { rpcRecord } from "./owned-json-rpc.js";
import { SignalGrepError } from "./errors.js";
import type { ByteRange, SourceDocument } from "./source-document.js";

export const SEMANTIC_MODES = [
  "definitions",
  "references",
  "implementations",
  "callers",
  "callees",
  "dependencies",
  "dependents",
] as const;
export type SemanticMode = (typeof SEMANTIC_MODES)[number];
export function isSemanticMode(mode: string | undefined): mode is SemanticMode {
  return SEMANTIC_MODES.some((candidate) => candidate === mode);
}
export interface LspPosition {
  line: number;
  character: number;
}
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}
export interface SemanticLocation {
  path: string;
  range: LspRange;
}
function readPosition(value: unknown): LspPosition {
  if (
    !rpcRecord(value) ||
    typeof value.line !== "number" ||
    !Number.isSafeInteger(value.line) ||
    value.line < 0 ||
    typeof value.character !== "number" ||
    !Number.isSafeInteger(value.character) ||
    value.character < 0
  )
    throw new SignalGrepError("Invalid compiler source position");
  return { line: value.line, character: value.character };
}
export function lspRange(value: unknown): LspRange {
  if (!rpcRecord(value)) throw new SignalGrepError("Invalid compiler source range");
  const start = readPosition(value.start),
    end = readPosition(value.end);
  if (end.line < start.line || (end.line === start.line && end.character < start.character))
    throw new SignalGrepError("Reversed compiler source range");
  return { start, end };
}
export function semanticLocation(value: unknown): SemanticLocation {
  if (!rpcRecord(value)) throw new SignalGrepError("Invalid compiler location");
  const uri = value.targetUri ?? value.uri;
  if (typeof uri !== "string" || !uri.startsWith("file:"))
    throw new SignalGrepError("Compiler returned a non-file location");
  return {
    path: fileURLToPath(uri),
    range: lspRange(value.targetSelectionRange ?? value.selectionRange ?? value.range),
  };
}
export function locations(value: unknown): SemanticLocation[] {
  if (value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(semanticLocation);
}
export function byteAt(document: SourceDocument, position: LspPosition): number {
  const line = document.lineRange(position.line + 1);
  const character = document.toCharacterOffset(line.start) + position.character;
  const end = document.toCharacterOffset(line.end);
  if (character > end || (position.line + 1 < document.lineStarts.length && character === end))
    throw new SignalGrepError("Compiler column is outside the source line");
  return document.toByteOffset(character);
}
export function byteRange(document: SourceDocument, range: LspRange): ByteRange {
  return { start: byteAt(document, range.start), end: byteAt(document, range.end) };
}
export function lspPosition(document: SourceDocument, character: number): LspPosition {
  const value = document.positionAt(document.toByteOffset(character));
  return { line: value.line - 1, character: value.column - 1 };
}
