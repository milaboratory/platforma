import type { PFrameFactoryAPIV4 } from './api_factory';
import type { PFrameReadAPIV9, PFrameReadAPIV10 } from './api_read';
import type { Logger } from './common';

// TODO: remove...

export interface PFrameV11 extends PFrameFactoryAPIV4, PFrameReadAPIV9 {}

// TODO: ...remove

export interface PFrameV12 extends PFrameFactoryAPIV4, PFrameReadAPIV10 {}

export type PFrameOptions = {
  /** Path to directory where PFrame can create temporary files */
  spillPath: string;
  /** Logger instance, no logging is performed when not provided */
  logger?: Logger;
}

// TODO: remove...

/** List of PFrame management functions exposed by PFrame module */
export interface PFrameFactoryV2 {
  /**
   * Create a new PFrame instance.
   * @warning Use concurrency limiting to avoid OOM crashes when multiple instances are simultaneously in use.
   */
  createPFrame(options: PFrameOptions): PFrameV11;

  /**
   * Dump active allocations from all PFrames instances in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump: () => Promise<Uint8Array>;
};

// TODO: ...remove

/** List of PFrame management functions exposed by PFrame module */
export interface PFrameFactoryV3 {
  /**
   * Create a new PFrame instance.
   * @warning Use concurrency limiting to avoid OOM crashes when multiple instances are simultaneously in use.
   */
  createPFrame(options: PFrameOptions): PFrameV12;

  /**
   * Dump active allocations from all PFrames instances in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump: () => Promise<Uint8Array>;
};
