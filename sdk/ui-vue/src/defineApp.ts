import { notEmpty } from '@milaboratories/helpers';
import type { PlatformaV1, PlatformaV2 } from '@platforma-sdk/model';
import { getPlatformaOrDefault, unwrapResult, type BlockOutputsBase, type Platforma } from '@platforma-sdk/model';
import type { Component, Reactive } from 'vue';
import { inject, markRaw, reactive } from 'vue';
import { createAppV1, type BaseAppV1 } from './internal/createAppV1';
import { createAppV2, type BaseAppV2 } from './internal/createAppV2';
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
  platforma: PlatformaV1<Args, Outputs, UiState, Href>,
  extendApp: (app: BaseAppV1<Args, Outputs, UiState, Href>) => Extend,
  settings?: AppSettings,
): SdkPluginV1<Args, Outputs, UiState, Href, Extend>;

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Extend extends ExtendSettings<Href> = ExtendSettings<Href>,
>(
  platforma: PlatformaV2<Args, Outputs, UiState, Href>,
  extendApp: (app: BaseAppV2<Args, Outputs, UiState, Href>) => Extend,
  settings?: AppSettings,
): SdkPluginV2<Args, Outputs, UiState, Href, Extend>;

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Extend extends ExtendSettings<Href> = ExtendSettings<Href>,
>(
  platforma: Platforma<Args, Outputs, UiState, Href>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extendApp: (app: any) => Extend,
  settings: AppSettings = {},
): SdkPlugin<Args, Outputs, UiState, Href, Extend> {
  let app: undefined | AppV1<Args, Outputs, UiState, Href, Extend> | AppV2<Args, Outputs, UiState, Href, Extend> = undefined;

  activateAgGrid();

  const loadApp = () => {
    if (platforma.apiVersion === undefined) {
      platforma
        .loadBlockState()
        .then((state) => {
          plugin.loaded = true;
          const baseApp = createAppV1<Args, Outputs, UiState, Href>(state, platforma, settings);

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
          } as unknown as AppV1<Args, Outputs, UiState, Href, Extend>);
        })
        .catch((err) => {
          console.error('load initial state error', err);
          plugin.error = err;
        });
    } else if (platforma.apiVersion === 2) {
      platforma
        .loadBlockState()
        .then((stateOrError) => {
          const state = unwrapResult(stateOrError);
          plugin.loaded = true;
          const baseApp = createAppV2<Args, Outputs, UiState, Href>(state, platforma, settings);

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
          } as unknown as AppV2<Args, Outputs, UiState, Href, Extend>);
        })
        .catch((err) => {
          console.error('load initial state error', err);
          plugin.error = err;
        });
    }
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

  return plugin as SdkPlugin<Args, Outputs, UiState, Href, Extend>;
}

export type AppV1<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = (BaseAppV1<Args, Outputs, UiState, Href>) & Reactive<Omit<Local, 'routes'>> & { getRoute(href: Href): Component | undefined };

export type AppV2<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = (BaseAppV2<Args, Outputs, UiState, Href>) & Reactive<Omit<Local, 'routes'>> & { getRoute(href: Href): Component | undefined };

export type App<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = AppV1<Args, Outputs, UiState, Href, Local> | AppV2<Args, Outputs, UiState, Href, Local>;

export type SdkPluginV1<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = {
  loaded: boolean;
  error: unknown;
  useApp<PageHref extends Href = Href>(): AppV1<Args, Outputs, UiState, PageHref, Local>;
  install(app: unknown): void;
};

export type SdkPluginV2<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = {
  loaded: boolean;
  error: unknown;
  useApp<PageHref extends Href = Href>(): AppV2<Args, Outputs, UiState, PageHref, Local>;
  install(app: unknown): void;
};

export type SdkPlugin<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = SdkPluginV1<Args, Outputs, UiState, Href, Local> | SdkPluginV2<Args, Outputs, UiState, Href, Local>;
