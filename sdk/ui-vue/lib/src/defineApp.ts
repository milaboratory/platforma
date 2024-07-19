import { notEmpty } from '@milaboratory/helpers/utils';
import { type BlockOutputsBase, type Platforma } from '@milaboratory/sdk-ui';
import { reactive } from 'vue';
import { createApp, type App } from './createApp';
import type { LocalState } from './types';

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(platforma: Platforma<Args, Outputs, UiState, Href>, cb: () => LocalState<Href>) {
  let app: undefined | App<Args, Outputs, UiState, Href> = undefined;

  const BlockApp = reactive({
    loaded: false,
    error: undefined as unknown,
    use() {
      return notEmpty(app, 'App is not loaded');
    },
  });

  platforma
    .loadBlockState()
    .then((state) => {
      BlockApp.loaded = true;
      app = createApp<Args, Outputs, UiState, Href>(state, platforma, cb);
    })
    .catch((err) => {
      BlockApp.error = err;
    });

  return BlockApp;
}

export type BlockApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof defineApp<Args, Outputs, UiState, Href>>;
