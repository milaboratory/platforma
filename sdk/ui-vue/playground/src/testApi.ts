import { unionize } from '@milaboratory/helpers/utils';
import { wrapValueOrErrors } from 'lib';

import type { BlockState, BlockStatePatch, NavigationState, Platforma, ValueOrErrors } from '@milaboratory/sdk-ui';

type OnUpdates = (updates: BlockStatePatch<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`>[]) => Promise<void>;

const state: BlockState<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`> = {
  args: undefined,
  ui: undefined,
  navigationState: {
    href: '/second',
  },
  outputs: {},
};

const onUpdateListeners: OnUpdates[] = [];

const setPatches = async (updates: BlockStatePatch[]) => await Promise.all(onUpdateListeners.map((cb) => cb(updates)));

let x = 1;

const testError = {
  ok: false,
  errors: ['y contains an unknown error'],
  moreErrors: false,
} as ValueOrErrors<number>;

setInterval(() => {
  setPatches([
    {
      key: 'outputs',
      value: {
        x: wrapValueOrErrors(++x),
        y: x % 5 === 0 ? testError : wrapValueOrErrors(2),
      },
    },
  ]);
}, 2000);

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
