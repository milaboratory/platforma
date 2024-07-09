import path from "path";
import { test } from "vitest";
import * as fsp from "node:fs/promises";
import { randomUUID } from "crypto";
import {
  BlockPackSpecAny,
  MiddleLayer,
  NullResourceId,
  OptionalResourceId,
  PlClient,
  Project,
  resourceIdToString,
  TestHelpers,
} from "@milaboratory/pl-middle-layer";

export const templateTest = test.extend<{
  pl: PlClient;
}>({
  pl: async ({}, use) => {
    const altRoot = `test_${Date.now()}_${randomUUID()}`;
    let altRootId: OptionalResourceId = NullResourceId;
    try {
      const client = await TestHelpers.getTestClient(altRoot);
      await use(client);
      const rawClient = await TestHelpers.getTestClient();
      await rawClient.deleteAlternativeRoot(altRoot);
    } catch (err: any) {
      console.log(
        `ALTERNATIVE ROOT: ${altRoot} (${resourceIdToString(altRootId)})`
      );
      throw new Error(err.message, { cause: err });
    }
  },
});
