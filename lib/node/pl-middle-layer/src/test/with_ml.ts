import path from "path";
import { randomUUID } from "node:crypto";
import type { PlClient } from "@milaboratories/pl-client";
import { TestHelpers } from "@milaboratories/pl-client";
import { MiddleLayer } from "../middle_layer/middle_layer";

/**
 * A live {@link MiddleLayer} over a temporary root, closed again when the body returns.
 *
 * Needs a backend: the client comes from `PL_ADDRESS` (plus `PL_TEST_USER` /
 * `PL_TEST_PASSWORD` where the server requires auth), so a test using this fails at
 * connect time when none is configured.
 */
export async function withMl(
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>,
): Promise<void> {
  const workFolder = path.resolve(`work/${randomUUID()}`);

  await TestHelpers.withTempRoot(async (pl: PlClient) => {
    const ml = await MiddleLayer.init(pl, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [],
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
      await ml.close();
    }
  });
}
