import type { PFrameFactoryAPIV6 } from "./api_factory";
import type { PFrameReadAPIV15 } from "./api_read";
import type { Logger } from "./common";
import type { PFrameId } from "./common";

/**
 * Full PFrame surface — factory operations plus data-side reads. Exposes
 * the self-contained {@link PFrameFactoryAPIV6} (column `typeSpec` embedded in
 * `data`) plus {@link PFrameReadAPIV15}, whose tables' `export` takes an
 * `ops.headers` list of `[column index, header name]` pairs.
 */
export interface PFrameV18 extends PFrameFactoryAPIV6, PFrameReadAPIV15 {}

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
 * {@link PFrameV18} instances (self-contained column data info), whose tables'
 * `export` takes an `ops.headers` list of `[column index, header name]` pairs.
 */
export interface PFrameFactoryV9 {
  /**
   * Create a new PFrame instance.
   * @warning Use concurrency limiting to avoid OOM crashes when multiple instances are simultaneously in use.
   */
  createPFrame(options: PFrameOptionsV2): PFrameV18;

  /**
   * Dump active allocations from all PFrames instances in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump: () => Promise<Uint8Array>;
}
