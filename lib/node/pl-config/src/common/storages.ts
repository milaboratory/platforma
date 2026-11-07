import upath from "upath";
import fs from "node:fs/promises";

/** Paths of the storages of a local backend. */
export interface LocalStoragesSettings {
  /** Runner's working dir, served as the "work" storage. */
  runner: string;
  /** Root of the primary ("main") storage. */
  mainStoragePath: string;
}

/** Creates the directories of the storages of a local backend in its working dir. */
export async function createDefaultLocalStorages(workdir: string): Promise<LocalStoragesSettings> {
  const storages: LocalStoragesSettings = {
    runner: upath.join(workdir, "storages", "work"),
    mainStoragePath: upath.join(workdir, "storages", "main"),
  };

  for (const d of [storages.runner, storages.mainStoragePath]) {
    await fs.mkdir(d, { recursive: true });
  }

  return storages;
}
