import { pathToFileURL } from "node:url";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type { SourceDocument } from "./source-document.js";
import { SearchPathPolicy } from "./path-policy.js";

/** Compiler module resolution may canonicalize a workspace package symlink or a macOS /var alias. */
export async function semanticSources(cwd: string, documents: Iterable<SourceDocument>) {
  const known = new Map<string, SourceDocument>();
  const policy = new SearchPathPolicy(cwd);
  for (const document of documents) {
    const absolute = resolve(cwd, document.path);
    known.set(absolute, document);
    // oxlint-disable-next-line no-await-in-loop -- canonical aliases refer only to already policy-checked source documents.
    known.set(await realpath(absolute), document);
  }
  return async (path: string): Promise<SourceDocument | undefined> => {
    const absolute = resolve(cwd, path);
    policy.assertPath(absolute);
    const direct = known.get(absolute);
    if (direct) return direct;
    try {
      return known.get(await realpath(absolute));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
      )
        return undefined;
      throw error;
    }
  };
}

export async function semanticUri(cwd: string, path: string): Promise<string> {
  return pathToFileURL(await realpath(resolve(cwd, path))).href;
}
