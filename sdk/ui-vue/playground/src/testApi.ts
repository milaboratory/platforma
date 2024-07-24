import { unionize } from '@milaboratory/helpers/utils';

import type { BlockState, BlockStatePatch, NavigationState, Platforma, ValueOrErrors } from '@milaboratory/sdk-ui';

type OnUpdates = (updates: BlockStatePatch<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`>[]) => Promise<void>;

const state: BlockState<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`> = {
  args: undefined,
  ui: undefined,
  navigationState: {
    href: '/',
  },
  outputs: {},
};

const onUpdateListeners: OnUpdates[] = [];

export const platforma: Platforma = {
  sdkInfo: {
    sdkVersion: '',
  },
  loadBlockState: async function (): Promise<BlockState<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`>> {
    return state;
  },
  onStateUpdates: function (cb: OnUpdates): () => void {
    console.log('register on updates callback', cb);

    onUpdateListeners.push(cb);

    return () => {
      console.log('unregister');
    };
  },
  setBlockArgs: function (_args: unknown): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setBlockUiState: function (_state: unknown): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setBlockArgsAndUiState: function (_args: unknown, _state: unknown): Promise<void> {
    throw new Error('Function not implemented.');
  },
  async setNavigationState(navigationState: NavigationState<`/${string}`>): Promise<void> {
    state.navigationState = navigationState;
    const updates = unionize(state) as BlockStatePatch[];
    onUpdateListeners.map((cb) => cb(updates));
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blobDriver: undefined as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logDriver: undefined as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lsDriver: undefined as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pFrameDriver: undefined as any,
};
