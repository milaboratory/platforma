/** Middle layer provides information about where frontend for a specific block
 * was unpacked and basic meta information about the enclosed UI
 * (i.e. SDK version). */
export interface FrontendData {
  /** Path in local file system where frontend was unpacked */
  readonly path: string;

  /** SDK version used by the UI */
  readonly sdkVersion: string;
}
