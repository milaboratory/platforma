import { fileExists, MiLogger, spawnAsync } from "@milaboratories/ts-helpers";
import * as fs from "node:fs/promises";

/** Creates a sparse file for all systems
 * Table of what supports sparse files:
 * https://en.wikipedia.org/wiki/Comparison_of_file_systems#Allocation_and_layout_policies */
export async function createSparseFile(logger: MiLogger, path: string, platform: NodeJS.Platform) {
  try {
    const ensureCreated = await fs.open(path, "w");
    await ensureCreated.close();

    await ensureSparseOnWindows(path, platform);
  } catch (error: unknown) {
    logger.error(`Error creating file ${path} on platform ${platform}: ${error}`);
  }
}

/** Sets a sparse flag on Windows.
 * We could check the file is sparse by running:
 * `fsutil sparse queryflag <path>`
 * and
 * `fsutil sparse queryrange <path>`
 */
async function ensureSparseOnWindows(path: string, platform: NodeJS.Platform) {
  if (platform === "win32") {
    // https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-sparse
    await spawnAsync("fsutil", ["sparse", "setflag", path], { stdio: "pipe" });
  }
}

/** Ensures the file is created and writes to it. */
export async function writeToSparseFile(
  logger: MiLogger,
  platform: NodeJS.Platform,
  path: string,
  data: Uint8Array,
  from: number,
) {
  if (!(await fileExists(path))) {
    await createSparseFile(logger, path, platform);
  }

  const fileHandle = await fs.open(path, "r+");
  await fileHandle.write(data, 0, data.length, from);
  await fileHandle.close();
}
