/** Middle layer provides information about where frontend for a specific block
 * was unpacked and basic meta information about the enclosed UI
 * (i.e. SDK version). */
export interface FrontendData {
  /** URL of the frontend */
  readonly url: string;

  /** SDK version used by the UI */
  readonly sdkVersion: string;
}
