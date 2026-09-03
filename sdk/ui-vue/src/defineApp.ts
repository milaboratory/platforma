import { notEmpty } from "@milaboratories/helpers";
import type {
  PlatformaV3,
  BlockCodeKnownFeatureFlags,
  UiServices as AllUiServices,
} from "@platforma-sdk/model";
import {
  getPlatformaApiVersion,
  unwrapResult,
  type BlockOutputsBase,
  type BlockModelInfo,
} from "@platforma-sdk/model";
import type { App as VueApp, Component, Reactive } from "vue";
import { inject, markRaw, reactive } from "vue";
import { createAppV3, type BaseAppV3 } from "./internal/createAppV3";
import type { AppSettings, ExtendSettings, Routes } from "./types";

const pluginKey = Symbol("sdk-vue");
export const pluginDataKey = Symbol("plugin-data-access");

export function useSdkPlugin(): SdkPlugin {
  return inject(pluginKey)!;
}

export function useFeatureFlags() {
  const sdk = useSdkPlugin();
  return sdk.featureFlags;
}

export function defineAppV3<
  Data = unknown,
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Href extends `/${string}` = `/${string}`,
  Plugins extends Record<string, unknown> = Record<string, unknown>,
  UiServices extends Partial<AllUiServices> = Partial<AllUiServices>,
  Extend extends ExtendSettings<Href> = ExtendSettings<Href>,
>(
  platforma: PlatformaV3<Data, Args, Outputs, Href, Plugins, UiServices> & {
    blockModelInfo: BlockModelInfo;
  },
  extendApp: (app: BaseAppV3<Data, Args, Outputs, Href, Plugins, UiServices>) => Extend,
  settings: AppSettings = {},
): SdkPluginV3<Data, Args, Outputs, Href, Plugins, Extend, UiServices> {
  let app: AppV3<Data, Args, Outputs, Href, Plugins, Extend, UiServices> | undefined = undefined;

  // Captured during install() so V3 can provide plugin data access after async load
  let vueAppInstance: VueApp | undefined;

  const runtimeApiVersion = 3;
  const blockRequestedApiVersion = getPlatformaApiVersion();

  const loadApp = async () => {
    if (blockRequestedApiVersion !== runtimeApiVersion) {
      throw new Error(`Block requested API version ${blockRequestedApiVersion} but runtime API version is ${runtimeApiVersion}.
      Please update the desktop app to use the latest API version.`);
    }

    await platforma.loadBlockState().then((stateOrError) => {
      const state = unwrapResult(stateOrError);
      plugin.loaded = true;
      const { app: baseApp, pluginAccess } = createAppV3<
        Data,
        Args,
        Outputs,
        Href,
        Plugins,
        UiServices
      >(state, platforma, settings);

      if (!vueAppInstance) {
        throw new Error(
          "Plugin data injection failed: Vue app instance not captured during install()",
        );
      }
      vueAppInstance.provide(pluginDataKey, pluginAccess);

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
      } as AppV3<Data, Args, Outputs, Href, Plugins, Extend, UiServices>);
    });
  };

  const plugin = reactive({
    apiVersion: 3,
    featureFlags: platforma.blockModelInfo.featureFlags,
    loaded: false,
    error: undefined,
    useApp<PageHref extends Href = Href>() {
      return notEmpty(app, "App is not loaded") as AppV3<
        Data,
        Args,
        Outputs,
        PageHref,
        Plugins,
        Extend,
        UiServices
      >;
    },
    install(app: VueApp) {
      vueAppInstance = app;
      app.provide(pluginKey, this);
      loadApp().catch((err) => {
        console.error("load initial state error", err);
        plugin.error = err;
      });
    },
  });

  return plugin as SdkPluginV3<Data, Args, Outputs, Href, Plugins, Extend, UiServices>;
}

export type AppV3<
  Data = unknown,
  Args = unknown,
  Outputs extends BlockOutputsBase = NonNullable<unknown>,
  Href extends `/${string}` = `/${string}`,
  Plugins extends Record<string, unknown> = Record<string, unknown>,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
  UiServices extends Partial<AllUiServices> = Partial<AllUiServices>,
> = BaseAppV3<Data, Args, Outputs, Href, Plugins, UiServices> &
  Reactive<Omit<Local, "routes">> & { getRoute(href: Href): Component | undefined };

// ---------------------------------------------------------------------------
// SdkPlugin types
// ---------------------------------------------------------------------------

export type SdkPluginV3<
  Data = unknown,
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Href extends `/${string}` = `/${string}`,
  Plugins extends Record<string, unknown> = Record<string, unknown>,
  Local extends ExtendSettings<Href> = ExtendSettings<Href>,
  UiServices extends Partial<AllUiServices> = Partial<AllUiServices>,
> = {
  apiVersion: 3;
  featureFlags: BlockCodeKnownFeatureFlags;
  loaded: boolean;
  error: unknown;
  useApp<PageHref extends Href = Href>(): AppV3<
    Data,
    Args,
    Outputs,
    PageHref,
    Plugins,
    Local,
    UiServices
  >;
  install(app: VueApp): void;
};

export type SdkPlugin = SdkPluginV3;
