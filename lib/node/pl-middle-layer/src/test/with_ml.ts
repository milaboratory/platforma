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
  await TestHelpers.withTempRoot(async (pl: PlClient) => {
    await runMl(pl, cb);
  });
}

/**
 * A live {@link MiddleLayer} over the temporary root `pl` is attached to, closed again when the
 * body returns — what a test restarting the middle layer over one root opens once per run.
 *
 * Each call opens a client of its own on that root, because closing a middle layer closes the
 * client it runs on. The work folder is fresh too, so nothing local carries over from one run to
 * the next.
 */
export async function withMlOn(
  pl: PlClient,
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>,
): Promise<void> {
  const root = pl.conf.alternativeRoot;
  if (root === undefined)
    throw new Error("withMlOn needs a client on a temporary root, as withTempRoot opens one.");

  const client = await TestHelpers.getTestClient(root);
  try {
    await runMl(client, cb);
  } finally {
    await client.close();
  }
}

//
// Internals
//

async function runMl(
  pl: PlClient,
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>,
): Promise<void> {
  const workFolder = path.resolve(`work/${randomUUID()}`);
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
}
