import { notEmpty } from '@milaboratories/helpers';
import { type BlockOutputsBase, type Platforma } from '@platforma-sdk/model';
import type { Component, Reactive } from 'vue';
import { inject, markRaw, reactive } from 'vue';
import { createApp, type BaseApp } from './internal/createApp';
import type { AppSettings, ExtendSettings, Routes } from './types';
import { activateAgGrid } from './aggrid';

const pluginKey = Symbol('sdk-vue');

export function useSdkPlugin(): SdkPlugin {
  return inject(pluginKey)!;
}

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Extend extends ExtendSettings<Href> = ExtendSettings<Href>,
>(
  platforma: Platforma<Args, Outputs, UiState, Href>,
  extendApp: (app: BaseApp<Args, Outputs, UiState, Href>) => Extend,
  settings: AppSettings = {},
): SdkPlugin<Args, Outputs, UiState, Href, Extend> {
  let app: undefined | App<Args, Outputs, UiState, Href, Extend> = undefined;

  activateAgGrid();

  const loadApp = () => {
    platforma
      .loadBlockState()
      .then((state) => {
        plugin.loaded = true;
        const baseApp = createApp<Args, Outputs, UiState, Href>(state, platforma, settings);

        const localState = extendApp(baseApp);

        const routes = Object.fromEntries(
          Object.entries(localState.routes as Routes<Href>).map(([href, component]) => {
            const c = typeof component === 'function' ? component() : component;
            return [href, markRaw(c as Component)];
          }),
        );

        app = Object.assign(baseApp, {
          ...localState,
          getRoute(href: Href): Component | undefined {
            return routes[href];
          },
        } as unknown as App<Args, Outputs, UiState, Href, Extend>);
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
      return notEmpty(app, 'App is not loaded') as App<Args, Outputs, UiState, PageHref, Extend>;
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
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = BaseApp<Args, Outputs, UiState, Href> & Reactive<Omit<Local, 'routes'>> & { getRoute(href: Href): Component | undefined };

export type SdkPlugin<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = {
  loaded: boolean;
  error: unknown;
  useApp<PageHref extends Href = Href>(): App<Args, Outputs, UiState, PageHref, Local>;
  install(app: unknown): void;
};
