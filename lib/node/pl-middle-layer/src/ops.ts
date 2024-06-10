import { TemporalSynchronizedTreeOps } from './middle_layer/types';

export type MiddleLayerOps = {
  readonly defaultTreeOptions: TemporalSynchronizedTreeOps;
  readonly projectRefreshDelay: number;
  readonly stagingRenderingRate: number;
  readonly localSecret: string,
  readonly frontendDownloadPath: string;
}
export const DefaultMiddleLayerOps: Pick<MiddleLayerOps,
  'defaultTreeOptions' | 'projectRefreshDelay' | 'stagingRenderingRate'> = {
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  },
  projectRefreshDelay: 700,
  stagingRenderingRate: 5
};

/** Fields with default values are marked as optional here. */
export type MiddleLayerOpsConstructor =
  Omit<MiddleLayerOps, keyof typeof DefaultMiddleLayerOps>
  & Partial<typeof DefaultMiddleLayerOps>
