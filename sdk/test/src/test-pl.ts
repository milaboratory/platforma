import {
  NullResourceId,
  OptionalResourceId,
  PlClient,
  ResourceId,
  resourceIdToString,
  TestHelpers
} from '@milaboratory/pl-middle-layer';
import {
  SynchronizedTreeOps,
  SynchronizedTreeState
} from '@milaboratory/pl-tree';
import { randomUUID } from 'crypto';
import path from 'path';
import * as fsp from 'node:fs/promises';
import { test } from 'vitest';

export const plTest = test.extend<{
  pl: PlClient;
  createTree: (
    res: ResourceId,
    ops?: SynchronizedTreeOps
  ) => Promise<SynchronizedTreeState>;
  rootTree: SynchronizedTreeState;
  tmpFolder: string;
}>({
  tmpFolder: async ({}, use) => {
    const workFolder = path.resolve(`work/${randomUUID()}`);
    await fsp.mkdir(workFolder, { recursive: true });
    await use(workFolder);
    await fsp.rm(workFolder, { recursive: true });
  },

  pl: async ({ onTestFinished }, use) => {
    const altRoot = `test_${Date.now()}_${randomUUID()}`;
    let altRootId: OptionalResourceId = NullResourceId;
    const client = await TestHelpers.getTestClient(altRoot);
    altRootId = client.clientRoot;
    await use(client);
    onTestFinished(async (task) => {
      if (task.errors !== undefined) {
        console.log(
          `TEST FAILED SO ALTERNATIVE ROOT IS PRESETVED IN PL: ${altRoot} (${resourceIdToString(
            altRootId
          )})`
        );
      } else {
        const rawClient = await TestHelpers.getTestClient();
        await rawClient.deleteAlternativeRoot(altRoot);
      }
    });
  },

  createTree: async ({ pl }, use) => {
    const trees = new Map<ResourceId, Promise<SynchronizedTreeState>>();
    await use((res, ops) => {
      let treePromise = trees.get(res);
      if (treePromise === undefined) {
        treePromise = SynchronizedTreeState.init(
          pl,
          res,
          ops ?? {
            pollingInterval: 200,
            stopPollingDelay: 400
          }
        );
        trees.set(res, treePromise);
      }
      return treePromise;
    });
    for (const [, treePromise] of trees) {
      // TODO implement termination
      await (await treePromise).terminate();
    }
  },

  rootTree: async ({ pl, createTree: tree }, use) => {
    await use(await tree(pl.clientRoot));
  }
});
