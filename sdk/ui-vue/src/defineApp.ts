import { notEmpty } from "@milaboratories/helpers";
import type {
  PlatformaExtended,
  PlatformaV3,
  PlatformaV1,
  PlatformaV2,
} from "@platforma-sdk/model";
import {
  getPlatformaApiVersion,
  unwrapResult,
  type BlockOutputsBase,
  type Platforma,
  type BlockModelInfo,
} from "@platforma-sdk/model";
import type { Component, Reactive } from "vue";
import { inject, markRaw, reactive } from "vue";
import { createAppV1, type BaseAppV1 } from "./internal/createAppV1";
import { createAppV2, type BaseAppV2 } from "./internal/createAppV2";
import { createAppV3, type BaseAppV3 } from "./internal/createAppV3";
import type { AppSettings, ExtendSettings, Routes } from "./types";
import { activateAgGrid } from "./aggrid";

const pluginKey = Symbol("sdk-vue");

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
  platforma: PlatformaV1<Args, Outputs, UiState, Href> & {
    blockModelInfo: BlockModelInfo;
  },
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
  platforma: PlatformaV2<Args, Outputs, UiState, Href> & {
    blockModelInfo: BlockModelInfo;
  },
  extendApp: (app: BaseAppV2<Args, Outputs, UiState, Href>) => Extend,
  settings?: AppSettings,
): SdkPluginV2<Args, Outputs, UiState, Href, Extend>;

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Data = unknown,
  Href extends `/${string}` = `/${string}`,
  Extend extends ExtendSettings<Href> = ExtendSettings<Href>,
>(
  platforma: PlatformaV3<Args, Outputs, Data, Href> & {
    blockModelInfo: BlockModelInfo;
  },
  extendApp: (app: BaseAppV3<Args, Outputs, Data, Href>) => Extend,
  settings?: AppSettings,
): SdkPluginV3<Args, Outputs, Data, Href, Extend>;

export function defineApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiStateOrData = unknown,
  Href extends `/${string}` = `/${string}`,
  Extend extends ExtendSettings<Href> = ExtendSettings<Href>,
>(
  platforma: PlatformaExtended<Platforma<Args, Outputs, UiStateOrData, Href>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extendApp: (app: any) => Extend,
  settings: AppSettings = {},
): SdkPlugin<Args, Outputs, UiStateOrData, Href, Extend> {
  let app:
    | undefined
    | AppV1<Args, Outputs, UiStateOrData, Href, Extend>
    | AppV2<Args, Outputs, UiStateOrData, Href, Extend>
    | AppV3<Args, Outputs, UiStateOrData, Href, Extend> = undefined;

  activateAgGrid();

  const runtimeApiVersion = platforma.apiVersion ?? 1; // undefined means 1 (backward compatibility)

  const blockRequestedApiVersion = getPlatformaApiVersion();

  const loadApp = async () => {
    if (blockRequestedApiVersion !== runtimeApiVersion) {
      throw new Error(`Block requested API version ${blockRequestedApiVersion} but runtime API version is ${runtimeApiVersion}.
      Please update the desktop app to use the latest API version.`);
    }

    if (platforma.apiVersion === undefined || platforma.apiVersion === 1) {
      await platforma.loadBlockState().then((state) => {
        plugin.loaded = true;
        const baseApp = createAppV1<Args, Outputs, UiStateOrData, Href>(state, platforma, settings);

        const localState = extendApp(baseApp);

        const routes = Object.fromEntries(
          Object.entries(localState.routes as Routes<Href>).map(([href, component]) => {
            const c = typeof component === "function" ? component() : component;
            return [href, markRaw(c as Component)];
          }),
        );

        app = Object.assign(baseApp, {
          ...localState,
          getRoute(href: Href): Component | undefined {
            return routes[href];
          },
        } as unknown as AppV1<Args, Outputs, UiStateOrData, Href, Extend>);
      });
    } else if (platforma.apiVersion === 2) {
      await platforma.loadBlockState().then((stateOrError) => {
        const state = unwrapResult(stateOrError);
        plugin.loaded = true;
        const baseApp = createAppV2<Args, Outputs, UiStateOrData, Href>(state, platforma, settings);

        const localState = extendApp(baseApp);

        const routes = Object.fromEntries(
          Object.entries(localState.routes as Routes<Href>).map(([href, component]) => {
            const c = typeof component === "function" ? component() : component;
            return [href, markRaw(c as Component)];
          }),
        );

        app = Object.assign(baseApp, {
          ...localState,
          getRoute(href: Href): Component | undefined {
            return routes[href];
          },
        } as unknown as AppV2<Args, Outputs, UiStateOrData, Href, Extend>);
      });
    } else if (platforma.apiVersion === 3) {
      await platforma.loadBlockState().then((stateOrError) => {
        const state = unwrapResult(stateOrError);
        plugin.loaded = true;
        const baseApp = createAppV3<Args, Outputs, UiStateOrData, Href>(state, platforma, settings);

        const localState = extendApp(baseApp);

        const routes = Object.fromEntries(
          Object.entries(localState.routes as Routes<Href>).map(([href, component]) => {
            const c = typeof component === "function" ? component() : component;
            return [href, markRaw(c as Component)];
          }),
        );

        app = Object.assign(baseApp, {
          ...localState,
          getRoute(href: Href): Component | undefined {
            return routes[href];
          },
        } as unknown as AppV3<Args, Outputs, UiStateOrData, Href, Extend>);
      });
    }
  };

  const plugin = reactive({
    apiVersion: platforma.apiVersion ?? 1,
    loaded: false,
    error: undefined as unknown,
    // Href to get typed query parameters for a specific route
    useApp<PageHref extends Href = Href>() {
      return notEmpty(app, "App is not loaded") as App<
        Args,
        Outputs,
        UiStateOrData,
        PageHref,
        Extend
      >;
    },
    // @todo type portability issue with Vue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    install(app: any) {
      app.provide(pluginKey, this);
      loadApp().catch((err) => {
        console.error("load initial state error", err);
        plugin.error = err;
      });
    },
  });

  return plugin as SdkPlugin<Args, Outputs, UiStateOrData, Href, Extend>;
}

export type AppV1<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = BaseAppV1<Args, Outputs, UiState, Href> &
  Reactive<Omit<Local, "routes">> & { getRoute(href: Href): Component | undefined };

export type AppV2<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = BaseAppV2<Args, Outputs, UiState, Href> &
  Reactive<Omit<Local, "routes">> & { getRoute(href: Href): Component | undefined };

export type AppV3<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Data = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = BaseAppV3<Args, Outputs, Data, Href> &
  Reactive<Omit<Local, "routes">> & { getRoute(href: Href): Component | undefined };

export type App<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> =
  | AppV1<Args, Outputs, UiState, Href, Local>
  | AppV2<Args, Outputs, UiState, Href, Local>
  | AppV3<Args, Outputs, UiState, Href, Local>;

export type SdkPluginV1<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = {
  apiVersion: 1;
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
  apiVersion: 2;
  loaded: boolean;
  error: unknown;
  useApp<PageHref extends Href = Href>(): AppV2<Args, Outputs, UiState, PageHref, Local>;
  install(app: unknown): void;
};

export type SdkPluginV3<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Data = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> = {
  apiVersion: 3;
  loaded: boolean;
  error: unknown;
  useApp<PageHref extends Href = Href>(): AppV3<Args, Outputs, Data, PageHref, Local>;
  install(app: unknown): void;
};

export type SdkPlugin<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
> =
  | SdkPluginV1<Args, Outputs, UiState, Href, Local>
  | SdkPluginV2<Args, Outputs, UiState, Href, Local>
  | SdkPluginV3<Args, Outputs, UiState, Href, Local>;
