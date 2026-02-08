import type { PlClient } from "@milaboratories/pl-client";
import { MiddleLayer, TestHelpers } from "@milaboratories/pl-middle-layer";
import { randomUUID } from "node:crypto";
import path from "node:path";

export async function withMl(
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>,
): Promise<void> {
  // Resolve work folder relative to this source file, not the current working directory
  const workFolder = path.resolve(import.meta.dirname, "..", "work", randomUUID());

  await TestHelpers.withTempRoot(async (pl: PlClient) => {
    const ml = await MiddleLayer.init(pl, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [], // TODO must be different with local pl
      openFileDialogCallback: () => {
        throw new Error("Not implemented.");
      },
    });
    ml.addRuntimeCapability("requiresUIAPIVersion", 1);
    ml.addRuntimeCapability("requiresUIAPIVersion", 2);
    ml.addRuntimeCapability("requiresUIAPIVersion", 3);
    try {
      await cb(ml, workFolder);
    } finally {
      console.log(JSON.stringify(pl.allTxStat));
      await ml.close();
    }
  });
}

export async function withMlAndProxy(
  cb: (ml: MiddleLayer, workFolder: string, proxy: TestHelpers.TestTcpProxy) => Promise<void>,
): Promise<void> {
  const workFolder = path.resolve(import.meta.dirname, "..", "work", randomUUID());

  await TestHelpers.withTempRoot(
    async (pl: PlClient, proxy) => {
      const ml = await MiddleLayer.init(pl, workFolder, {
        defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
        devBlockUpdateRecheckInterval: 300,
        localSecret: MiddleLayer.generateLocalSecret(),
        localProjections: [], // TODO must be different with local pl
        openFileDialogCallback: () => {
          throw new Error("Not implemented.");
        },
      });
      ml.addRuntimeCapability("requiresUIAPIVersion", 1);
      ml.addRuntimeCapability("requiresUIAPIVersion", 2);
      ml.addRuntimeCapability("requiresUIAPIVersion", 3);
      try {
        await cb(ml, workFolder, proxy);
      } finally {
        console.log(JSON.stringify(pl.allTxStat));
        await ml.close();
      }
    },
    { viaTcpProxy: true },
  );
}
