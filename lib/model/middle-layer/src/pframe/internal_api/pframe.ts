import type { PFrameFactoryAPIV2, PFrameFactoryAPIV3 } from './api_factory';
import type { PFrameReadAPIV8, PFrameReadAPIV9 } from './api_read';
import type { Logger } from './common';

export interface PFrameV9 extends PFrameFactoryAPIV2, PFrameReadAPIV8 {}

export interface PFrameV10 extends PFrameFactoryAPIV3, PFrameReadAPIV9 {}

export type PFrameOptions = {
  /** Path to directory where PFrame can create temporary files */
  spillPath: string;
  /** Logger instance, no logging is performed when not provided */
  logger?: Logger;
}

/** List of PFrame management functions exposed by PFrame module */
export interface PFrameFactory {
  /**
   * Create a new PFrame instance.
   * @warning Use concurrency limiting to avoid OOM crashes when multiple instances are simultaneously in use.
   */
  createPFrame(options: PFrameOptions): PFrameV10;

  /**
   * Dump active allocations from all PFrames instances in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump: () => Promise<Uint8Array>;
};
