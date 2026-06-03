import type { PFrameFactoryAPIV5 } from "./api_factory";
import type { PFrameReadAPIV13 } from "./api_read";
import type { Logger } from "./common";
import type { PFrameId } from "./common";

/**
 * Full PFrame surface — factory operations plus data-side reads. Exposes
 * {@link PFrameReadAPIV13}, whose tables provide the `export` method.
 */
export interface PFrameV15 extends PFrameFactoryAPIV5, PFrameReadAPIV13 {}

export type PFrameOptionsV2 = {
  /** PFrame ID for logging purposes */
  frameId: PFrameId;
  /** Path to directory where PFrame can create temporary files */
  spillPath: string;
  /** Logger instance, no logging is performed when not provided */
  logger?: Logger;
};

/**
 * PFrame management functions exposed by the PFrame module. Creates
 * {@link PFrameV15} instances, whose tables provide the `export` method.
 */
export interface PFrameFactoryV6 {
  /**
   * Create a new PFrame instance.
   * @warning Use concurrency limiting to avoid OOM crashes when multiple instances are simultaneously in use.
   */
  createPFrame(options: PFrameOptionsV2): PFrameV15;

  /**
   * Dump active allocations from all PFrames instances in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump: () => Promise<Uint8Array>;
}
