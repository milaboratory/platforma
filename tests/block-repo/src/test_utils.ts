import path from "node:path";
import fsp from "node:fs/promises";
import { test } from "vitest";
import { randomUUID } from "node:crypto";

// oxlint-disable-next-line jest/expect-expect jest/no-disabled-tests
export const regTest = test.extend<{
  tmpFolder: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  tmpFolder: async ({}, use) => {
    const workFolder = path.resolve(`work/${randomUUID()}`);
    await fsp.mkdir(workFolder, { recursive: true });
    await use(workFolder);
    // await fsp.rm(workFolder, { recursive: true });
  },
});
