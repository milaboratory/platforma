import path from "path";
import { randomUUID } from "node:crypto";
import type { PlClient } from "@milaboratories/pl-client";
import { TestHelpers } from "@milaboratories/pl-client";
import { afterAll } from "vitest";
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
 * A {@link withMl} for one test file whose temporary roots all outlive their tests and are deleted
 * together once the file is done. Call it at the top of the file; each test still gets a root of
 * its own.
 *
 * Deleting a root deletes every project in it, and the backend then cleans up each of their
 * templates one transaction at a time. That cleanup conflicts with any project being created
 * meanwhile, anywhere, so a file that deleted its roots test by test kept failing its own next
 * test's writes. Deferred, the cleanup happens once, after the file's last test.
 */
export function withMlKeepingRoots(): (
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>,
) => Promise<void> {
  const roots: string[] = [];

  afterAll(async () => {
    const owner = await TestHelpers.getTestClient();
    try {
      for (const root of roots) await owner.deleteAlternativeRoot(root);
    } finally {
      await owner.close();
    }
  });

  return async (cb) => {
    const root = `test_${Date.now()}_${randomUUID()}`;
    roots.push(root);
    await runMl(await TestHelpers.getTestClient(root), cb);
  };
}

/**
 * A live {@link MiddleLayer} over the test user's own root, on a client of its own, closed again
 * when the body returns — what a test restarting the middle layer opens once per run.
 *
 * The user's own root rather than a temporary one: a client asking for a temporary root by name
 * gets a fresh, empty one every time, so a second run would start from nothing. What a test
 * leaves in this root outlives it, so the test cleans up after itself. The work folder is fresh on
 * every call, so nothing local carries over from one run to the next.
 */
export async function withMlOnUserRoot(
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>,
): Promise<void> {
  await runMl(await TestHelpers.getTestClient(), cb);
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
