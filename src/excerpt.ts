import { MAX_LINE_CHARACTERS } from "./types.js";

export interface TextExcerpt {
  text: string;
  truncated: boolean;
  startCharacter: number;
  endCharacter: number;
}

function boundedCharacter(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(value)));
}

export function excerptText(
  text: string,
  focusStart = 0,
  focusEnd = focusStart,
  maximumCharacters = MAX_LINE_CHARACTERS,
): TextExcerpt {
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters <= 0) {
    throw new Error("Excerpt size must be a positive safe integer");
  }
  if (text.length <= maximumCharacters) {
    return {
      text,
      truncated: false,
      startCharacter: 0,
      endCharacter: text.length,
    };
  }

  const boundedStart = boundedCharacter(focusStart, text.length);
  const boundedEnd = Math.max(boundedStart, boundedCharacter(focusEnd, text.length));
  const focusLength = boundedEnd - boundedStart;
  const startCharacter =
    focusLength >= maximumCharacters
      ? Math.min(boundedStart, text.length - maximumCharacters)
      : Math.min(
          Math.max(0, boundedStart - Math.floor((maximumCharacters - focusLength) / 2)),
          text.length - maximumCharacters,
        );
  const endCharacter = startCharacter + maximumCharacters;
  const prefix = startCharacter > 0 ? "…" : "";
  const suffix = endCharacter < text.length ? "…" : "";

  return {
    text: `${prefix}${text.slice(startCharacter, endCharacter)}${suffix}`,
    truncated: true,
    startCharacter,
    endCharacter,
  };
}
