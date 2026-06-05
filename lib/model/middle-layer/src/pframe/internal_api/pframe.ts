import type { PFrameFactoryAPIV5, PFrameFactoryAPIV6 } from "./api_factory";
import type { PFrameReadAPIV14 } from "./api_read";
import type { Logger } from "./common";
import type { PFrameId } from "./common";

/**
 * Full PFrame surface — factory operations plus data-side reads. Exposes
 * {@link PFrameReadAPIV14}, whose tables' `export` takes a column-index →
 * header map.
 */
export interface PFrameV16 extends PFrameFactoryAPIV5, PFrameReadAPIV14 {}

/**
 * Full PFrame surface — factory operations plus data-side reads. Like
 * {@link PFrameV16} but with self-contained {@link PFrameFactoryAPIV6}
 * (column `typeSpec` embedded in `data`).
 */
export interface PFrameV17 extends PFrameFactoryAPIV6, PFrameReadAPIV14 {}

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
 * {@link PFrameV16} instances, whose tables' `export` takes a
 * column-index → header map.
 */
export interface PFrameFactoryV7 {
  /**
   * Create a new PFrame instance.
   * @warning Use concurrency limiting to avoid OOM crashes when multiple instances are simultaneously in use.
   */
  createPFrame(options: PFrameOptionsV2): PFrameV16;

  /**
   * Dump active allocations from all PFrames instances in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump: () => Promise<Uint8Array>;
}

/**
 * PFrame management functions exposed by the PFrame module. Creates
 * {@link PFrameV17} instances (self-contained column data info).
 */
export interface PFrameFactoryV8 {
  /**
   * Create a new PFrame instance.
   * @warning Use concurrency limiting to avoid OOM crashes when multiple instances are simultaneously in use.
   */
  createPFrame(options: PFrameOptionsV2): PFrameV17;

  /**
   * Dump active allocations from all PFrames instances in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump: () => Promise<Uint8Array>;
}
