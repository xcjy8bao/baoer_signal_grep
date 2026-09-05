import { mkdir, mkdtemp, open, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CONCEPT_ASSETS,
  CONCEPT_MODEL,
  CONCEPT_REVISION,
  conceptModelDirectory,
  verifyConceptModel,
} from "./concept-model.js";

/** Explicit asset installation only. Never called by a search request. */
export async function installConceptModel(): Promise<void> {
  const destination = conceptModelDirectory();
  try {
    const existing = await stat(destination);
    if (!existing.isDirectory()) throw new Error("Concept model destination is not a directory");
    await verifyConceptModel(destination);
    process.stderr.write(`Concept model is already verified: ${destination}\n`);
    return;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const stage = await mkdtemp(join(dirname(destination), ".install-"));
  const signal = AbortSignal.timeout(10 * 60_000);
  try {
    for (const asset of CONCEPT_ASSETS) {
      process.stderr.write(
        `Downloading pinned concept asset: ${asset.path} (${String(asset.bytes)} bytes)\n`,
      );
      // oxlint-disable-next-line no-await-in-loop -- sequential streaming downloads bound memory and share one deadline.
      const response = await fetch(
        `https://huggingface.co/${CONCEPT_MODEL}/resolve/${CONCEPT_REVISION}/${asset.path}`,
        { signal },
      );
      if (!response.ok || !response.body)
        throw new Error(`Model download failed: ${String(response.status)} ${asset.path}`);
      const path = join(stage, asset.path);
      // oxlint-disable-next-line no-await-in-loop -- prepare only this staging asset.
      await mkdir(dirname(path), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- exclusive staging file, never overwrite a installed model.
      const file = await open(path, "wx");
      let size = 0;
      try {
        // oxlint-disable-next-line no-await-in-loop -- stream one bounded asset at a time.
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > asset.bytes) throw new Error(`Model asset exceeds pinned size: ${asset.path}`);
          await file.writeFile(chunk);
        }
        // oxlint-disable-next-line no-await-in-loop -- flush completed staged asset before atomic installation.
        await file.sync();
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- always release this owned staging descriptor.
        await file.close();
      }
    }
    await verifyConceptModel(stage);
    try {
      await rename(stage, destination);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        !["EEXIST", "ENOTEMPTY"].includes(String(error.code))
      )
        throw error;
      // A concurrent successful installer may have won the atomic directory rename.
      await verifyConceptModel(destination);
    }
    process.stderr.write(`Concept model verified and installed: ${destination}\n`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
