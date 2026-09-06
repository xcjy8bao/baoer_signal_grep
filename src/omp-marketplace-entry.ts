import { registerOmpSignalGrepExtension } from "./omp-index.js";

export default async function marketplaceSignalGrepExtension(
  pi: Parameters<typeof registerOmpSignalGrepExtension>[0],
): Promise<void> {
  await registerOmpSignalGrepExtension(pi, new URL("./hooks/", import.meta.url));
}
