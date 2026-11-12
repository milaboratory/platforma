/** A storage where we keep all the assets.
 * If you run tests locally, the storage should be named `library` and point
 * to the `assets` directory in this repository,
 * but in CI the storage is defined in env and it points to S3 bucket. */
export const libraryStorage = process.env.PL_TEST_STORAGE_ID
  ? process.env.PL_TEST_STORAGE_ID
  : "library";

/** Finds the test data library by its ID or by its display name: a deployment can give the
 * library a display name that differs from its ID. */
export function findLibraryStorage<T extends { id: string; name: string }>(
  storages: T[],
): T | undefined {
  return (
    storages.find((s) => s.id === libraryStorage) ?? storages.find((s) => s.name === libraryStorage)
  );
}

/** The smallest scratch volume the deployment gives to a job, in GiB. A request below it gets
 * the minimum. 0 when the deployment has no minimum. */
export const scratchMinGiB = Number(process.env.PL_TEST_SCRATCH_MIN_GIB ?? "0");

/** The scratch size in GiB that a job gets when it requests `requestedGiB`. */
export function expectedScratchGiB(requestedGiB: number): string {
  return String(Math.max(requestedGiB, scratchMinGiB));
}
