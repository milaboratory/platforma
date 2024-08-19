/** A storage where we keep all the assets.
 * If you run tests locally, the storage should be named `library` and point
 * to the `assets` directory in this repository,
 * but in CI the storage is defined in env and it points to S3 bucket. */
export const libraryStorage = process.env.PL_TEST_STORAGE_ID
  ? process.env.PL_TEST_STORAGE_ID
  : 'library';
