import { notEmpty } from '@milaboratory/helpers/utils';
import { type BlockOutputsBase, type Platforma } from '@milaboratory/sdk-ui';
import { inject, reactive } from 'vue';
import { createApp, type App } from './createApp';
import type { LocalState } from './types';

const pluginKey = Symbol('sdk-vue');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSdkPlugin(): SdkPlugin {
  return inject(pluginKey)!;
}

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends LocalState<Href> = LocalState<Href>,
>(platforma: Platforma<Args, Outputs, UiState, Href>, createLocalState: () => Local) {
  let app: undefined | App<Args, Outputs, UiState, Href, Local> = undefined;

  const loadApp = () => {
    platforma
      .loadBlockState()
      .then((state) => {
        plugin.loaded = true;
        app = createApp<Args, Outputs, UiState, Href, Local>(state, platforma, createLocalState);
      })
      .catch((err) => {
        plugin.error = err;
      });
  };

  const plugin = reactive({
    loaded: false,
    error: undefined as unknown,
    // Href to get typed query parameters for a specific route
    useApp<H extends Href = Href>() {
      return notEmpty(app, 'App is not loaded') as App<Args, Outputs, UiState, H, Local>;
    },
    // @todo type portability issue with Vue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    install(app: any) {
      app.provide(pluginKey, this);
      loadApp();
    },
  });

  return plugin;
}

export type SdkPlugin<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof defineApp<Args, Outputs, UiState, Href>>;
