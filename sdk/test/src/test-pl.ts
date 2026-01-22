import type {
  OptionalResourceId,
  PlClient,
  ResourceId } from '@milaboratories/pl-middle-layer';
import {
  NullResourceId,
  resourceIdToString,
  TestHelpers,
} from '@milaboratories/pl-middle-layer';
import type { SynchronizedTreeOps } from '@milaboratories/pl-tree';
import { SynchronizedTreeState } from '@milaboratories/pl-tree';
import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
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
      tmpFolder: async ({ onTestFinished }, use) => {
        const workFolder = path.resolve(`work/${randomUUID()}`);
        await fsp.mkdir(workFolder, { recursive: true });
        await use(workFolder);
        onTestFinished(async (context) => {
          if (context.task.result?.state === 'pass') {
            await fsp.rm(workFolder, { recursive: true });
          } else {
            console.log(
              `TEST FAILED TMP FOLDER IS PRESERVED: ${workFolder}`,
            );
          }
        });
      },

      pl: async ({ onTestFinished }, use) => {
        const alternativeRoot = `test_${Date.now()}_${randomUUID()}`;
        let altRootId: OptionalResourceId = NullResourceId;
        const client = await TestHelpers.getTestClient(alternativeRoot);
        altRootId = client.clientRoot;
        try {
          await use(client);
        } finally {
          // Close the test client to avoid dangling gRPC channels
          // that can cause segfaults during process exit
          await client.close();
        }
        onTestFinished(async (context) => {
          if (context.task.result?.state === 'pass') {
            const rawClient = await TestHelpers.getTestClient();
            try {
              await rawClient.deleteAlternativeRoot(alternativeRoot);
            } finally {
              // Close the cleanup client to avoid dangling gRPC channels
              // that can cause segfaults during process exit
              await rawClient.close();
            }
          } else {
            console.log(
              `TEST FAILED SO ALTERNATIVE ROOT IS PRESERVED IN PL: ${alternativeRoot} (${resourceIdToString(
                altRootId,
              )})`,
            );
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
                stopPollingDelay: 400,
              },
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
      },
    });
