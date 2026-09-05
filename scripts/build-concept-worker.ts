import { dirname } from "node:path";
import { buildConceptWorker, conceptWorkerArtifact } from "./concept-worker-artifact.js";
await buildConceptWorker(dirname(conceptWorkerArtifact));
