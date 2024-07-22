import { notEmpty } from '@milaboratory/helpers/utils';
import { type BlockOutputsBase, type Platforma } from '@milaboratory/sdk-ui';
import { inject, reactive } from 'vue';
import { createApp, type App } from './createApp';
import type { LocalState } from './types';

const pluginKey = Symbol('sdk-vue');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useBlockApp(): BlockApp {
  return inject(pluginKey)!;
}

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(platforma: Platforma<Args, Outputs, UiState, Href>, cb: () => LocalState<Href>) {
  let app: undefined | App<Args, Outputs, UiState, Href> = undefined;

  const blockApp = reactive({
    loaded: false,
    error: undefined as unknown,
    use() {
      return notEmpty(app, 'App is not loaded');
    },
    // @todo type portability issue with Vue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    install(app: any) {
      app.provide(pluginKey, this);
    },
  });

  platforma
    .loadBlockState()
    .then((state) => {
      blockApp.loaded = true;
      app = createApp<Args, Outputs, UiState, Href>(state, platforma, cb);
    })
    .catch((err) => {
      blockApp.error = err;
    });

  return blockApp;
}

export type BlockApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof defineApp<Args, Outputs, UiState, Href>>;
