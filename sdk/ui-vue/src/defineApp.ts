import { notEmpty } from '@milaboratories/helpers';
import { type BlockOutputsBase, type Platforma } from '@platforma-sdk/model';
import type { Component, Reactive } from 'vue';
import { inject, markRaw, reactive } from 'vue';
import { createApp, type BaseApp } from './internal/createApp';
import type { LocalState, Routes } from './types';
import { activateAgGrid } from './aggrid';

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
>(platforma: Platforma<Args, Outputs, UiState, Href>, extendApp: (app: BaseApp<Args, Outputs, UiState, Href>) => Local) {
  let app: undefined | App<Args, Outputs, UiState, Href, Local> = undefined;

  activateAgGrid();

  const loadApp = () => {
    platforma
      .loadBlockState()
      .then((state) => {
        plugin.loaded = true;
        const baseApp = createApp<Args, Outputs, UiState, Href>(state, platforma);

        const localState = extendApp(baseApp);

        app = Object.assign(baseApp, {
          ...localState,
          routes: Object.fromEntries(
            Object.entries(localState.routes as Routes<Href>).map(([href, component]) => {
              return [href, markRaw(component as Component)];
            }),
          ),
        } as unknown as App<Args, Outputs, UiState, Href, Local>);
      })
      .catch((err) => {
        console.error('load initial state error', err);
        plugin.error = err;
      });
  };

  const plugin = reactive({
    loaded: false,
    error: undefined as unknown,
    // Href to get typed query parameters for a specific route
    useApp<PageHref extends Href = Href>() {
      return notEmpty(app, 'App is not loaded') as App<Args, Outputs, UiState, PageHref, Local>;
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

export type App<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends LocalState<Href> = LocalState<Href>,
> = BaseApp<Args, Outputs, UiState, Href> & Reactive<Local>;

export type SdkPlugin<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof defineApp<Args, Outputs, UiState, Href>>;
