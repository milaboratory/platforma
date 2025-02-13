import { SynchronizedTreeOps, SynchronizedTreeState } from '@milaboratories/pl-tree';
import { Computable, ComputableRenderingOps } from '@milaboratories/computable';

export type TemporalSynchronizedTreeOps = Pick<
  SynchronizedTreeOps,
  'pollingInterval' | 'stopPollingDelay' | 'logStat'
>;

export interface TreeAndComputable<T, ST extends T = T> {
  tree: SynchronizedTreeState;
  computable: Computable<T, ST>;
}

/** Helper type to express a TreeAndComputable with computable
 * with standard non-undefined-stable type signature. */
export type TreeAndComputableU<T> = TreeAndComputable<T | undefined, T>;