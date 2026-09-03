import { expect, test } from "bun:test";
import { redactSignalGrepResult } from "../src/redaction.js";

test("redaction masks credential values in text and structured evidence", () => {
  const result = redactSignalGrepResult({
    text: 'API_KEY="super-secret"\nToken: string\npassword: hunter2\n',
    details: {
      version: 1,
      mode: "matches",
      status: "complete",
      totalMatches: 1,
      storedMatches: 1,
      totalFiles: 1,
      returnedMatches: 1,
      snapshotComplete: true,
      analysis: {
        kind: "roles",
        unit: "occurrences",
        totalItems: 1,
        returnedItems: 1,
        reasons: [],
        items: [
          {
            path: "secret.env",
            line: 1,
            label: "token=still-secret",
            index: 1,
          },
        ],
      },
    },
  });
  expect(result.text).not.toContain("super-secret");
  expect(result.text).not.toContain("hunter2");
  expect(result.text).toContain("Token: string");
  expect(JSON.stringify(result.details)).not.toContain("still-secret");
  expect(result.details.redactedCount).toBe(3);
});

test("redaction masks private key bodies while preserving their type", () => {
  const result = redactSignalGrepResult({
    text: "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret-body\n-----END OPENSSH PRIVATE KEY-----",
    details: {
      version: 1,
      mode: "matches",
      status: "complete",
      totalMatches: 1,
      storedMatches: 1,
      totalFiles: 1,
      returnedMatches: 1,
      snapshotComplete: true,
    },
  });
  expect(result.text).toContain("BEGIN OPENSSH PRIVATE KEY");
  expect(result.text).not.toContain("secret-body");
  expect(result.details.redactedCount).toBe(1);
});
