import { TemporalSynchronizedTreeOps } from './types';

/** Configuration controlling different aspects of middle layer behaviour. */
export type MiddleLayerOps = {
  /** Contain temporal options controlling how often should pl trees be
   * synchronized with the pl server. */
  readonly defaultTreeOptions: TemporalSynchronizedTreeOps;

  /** Defines interval in milliseconds for running periodic project maintenance job.
   * Project maintenance includes gradual staging rendering and cached outputs cleanup. */
  readonly projectRefreshInterval: number;

  /** This controls average number of block staging states that are rendered per
   * second during project maintenance job execution. */
  readonly stagingRenderingRate: number;

  /** Local secret, that is used to sign and verify different pieces of information
   * that can be used to access local data, like local paths for ongoing uploads. */
  readonly localSecret: string,

  /** Common root where to put frontend code. */
  readonly frontendDownloadPath: string;
}

/** Some defaults fot MiddleLayerOps. */
export const DefaultMiddleLayerOps: Pick<MiddleLayerOps,
  'defaultTreeOptions' | 'projectRefreshInterval' | 'stagingRenderingRate'> = {
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  },
  projectRefreshInterval: 700,
  stagingRenderingRate: 5
};

/** Fields with default values are marked as optional here. */
export type MiddleLayerOpsConstructor =
  Omit<MiddleLayerOps, keyof typeof DefaultMiddleLayerOps>
  & Partial<typeof DefaultMiddleLayerOps>
