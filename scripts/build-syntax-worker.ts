import { dirname } from "node:path";
import { buildSyntaxWorker, syntaxWorkerArtifact } from "./syntax-worker-artifact.js";

await buildSyntaxWorker(dirname(syntaxWorkerArtifact));
