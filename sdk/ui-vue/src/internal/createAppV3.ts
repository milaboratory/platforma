import { deepClone, delay, uniqueId } from "@milaboratories/helpers";
import type { Mutable } from "@milaboratories/helpers";
import type {
  NavigationState,
  BlockOutputsBase,
  BlockStateV3,
  PlatformaV3,
  ValueWithUTag,
  AuthorMarker,
  PlatformaExtended,
  InferPluginHandles,
  PluginHandle,
  InferFactoryData,
  InferFactoryOutputs,
  PluginFactoryLike,
  UiServices as AllUiServices,
  InferFactoryUiServices,
} from "@platforma-sdk/model";
import {
  hasAbortError,
  unwrapResult,
  deriveDataFromStorage,
  getPluginData,
  isPluginOutputKey,
  pluginOutputPrefix,
} from "@platforma-sdk/model";
import type { Ref } from "vue";
import { reactive, computed, ref, markRaw } from "vue";
import type { OutputValues, OutputErrors, AppSettings } from "../types";
import { parseQuery } from "../urls";
import { ensureOutputHasStableFlag, MultiError } from "../utils";
import { applyPatch } from "fast-json-patch";
import { UpdateSerializer } from "./UpdateSerializer";
import { watchIgnorable } from "@vueuse/core";
import type { PluginState, PluginAccess } from "../composition/usePlugin";
import { logDebug, logError } from "./utils";
import { getServices } from "./getServices";

export const patchPoolingDelay = 150;

/** Internal per-plugin state with reconciliation support. */
interface InternalPluginState<
  Data = unknown,
  Outputs = unknown,
  Services = Record<string, unknown>,
> extends PluginState<Data, Outputs, Services> {
  readonly ignoreUpdates: (fn: () => void) => void;
}

export const createNextAuthorMarker = (marker: AuthorMarker | undefined): AuthorMarker => ({
  authorId: marker?.authorId ?? uniqueId(),
  localVersion: (marker?.localVersion ?? 0) + 1,
});

/**
 * Creates an application instance with reactive state management, outputs, and methods for state updates and navigation.
 *
 * @template Args - The type of arguments used in the application.
 * @template Outputs - The type of block outputs extending `BlockOutputsBase`.
 * @template Data - The type of the block data.
 * @template Href - The type of navigation href, defaulting to a string starting with `/`.
 *
 * @param state - Initial state of the application, including args, outputs, UI state, and navigation state.
 * @param platforma - A platform interface for interacting with block states.
 * @param settings - Application settings, such as debug flags.
 *
 * @returns A reactive application object with methods, getters, and state.
 */
export function createAppV3<
  Data = unknown,
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Href extends `/${string}` = `/${string}`,
  Plugins extends Record<string, unknown> = Record<string, unknown>,
  UiServices extends Partial<AllUiServices> = Partial<AllUiServices>,
>(
  state: ValueWithUTag<BlockStateV3<Data, Outputs, Href>>,
  platforma: PlatformaExtended<PlatformaV3<Data, Args, Outputs, Href, Plugins, UiServices>>,
  settings: AppSettings,
) {
  const debug = settings.debug ? logDebug : () => {};
  const error = logError;

  const data = {
    isExternalSnapshot: false,
    author: {
      authorId: uniqueId(),
      localVersion: 0,
    },
  };

  const nextAuthorMarker = () => {
    data.author = createNextAuthorMarker(data.author);
    debug("nextAuthorMarker", data.author);
    return data.author;
  };

  const closedRef = ref(false);

  const uTagRef = ref(state.uTag);

  const debounceSpan = settings.debounceSpan ?? 200;

  const setDataQueue = new UpdateSerializer({ debounceSpan });
  const pluginDataQueues = new Map<PluginHandle, UpdateSerializer>();
  const getPluginDataQueue = (handle: PluginHandle): UpdateSerializer => {
    let queue = pluginDataQueues.get(handle);
    if (!queue) {
      queue = new UpdateSerializer({ debounceSpan });
      pluginDataQueues.set(handle, queue);
    }
    return queue;
  };
  const setNavigationStateQueue = new UpdateSerializer({ debounceSpan });

  /** Lazily-created per-plugin reactive states. */
  const pluginStates = new Map<PluginHandle, InternalPluginState>();
  /**
   * Reactive snapshot of the application state, including args, outputs, UI state, and navigation state.
   */
  const snapshot = ref<{
    outputs: Partial<Outputs>;
    blockStorage: unknown;
    navigationState: NavigationState<Href>;
  }>(state.value) as Ref<{
    outputs: Partial<Outputs>;
    blockStorage: unknown;
    navigationState: NavigationState<Href>;
  }>;

  const updateData = async (value: Data) => {
    return platforma.mutateStorage({ operation: "update-block-data", value }, nextAuthorMarker());
  };

  const updatePluginData = async (handle: PluginHandle, value: unknown) => {
    return platforma.mutateStorage(
      { operation: "update-plugin-data", pluginId: handle, value },
      nextAuthorMarker(),
    );
  };

  const setNavigationState = async (state: NavigationState<Href>) => {
    return platforma.setNavigationState(state);
  };

  const outputs = computed<OutputValues<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>)
      .filter(([k]) => !isPluginOutputKey(k))
      .map(([k, outputWithStatus]) =>
        platforma.blockModelInfo.outputs[k]?.withStatus
          ? [k, ensureOutputHasStableFlag(outputWithStatus)]
          : [
              k,
              outputWithStatus.ok && outputWithStatus.value !== undefined
                ? outputWithStatus.value
                : undefined,
            ],
      );
    return Object.fromEntries(entries);
  });

  const outputErrors = computed<OutputErrors<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>)
      .filter(([k]) => !isPluginOutputKey(k))
      .map(([k, vOrErr]) => [
        k,
        vOrErr && vOrErr.ok === false ? new MultiError(vOrErr.errors) : undefined,
      ]);
    return Object.fromEntries(entries);
  });

  const appModel = reactive({
    apiVersion: 3,
    error: "",
    model: {
      data: deepClone(deriveDataFromStorage<Data>(snapshot.value.blockStorage)) as Data,
      outputs,
      outputErrors,
    },
  }) as {
    error: string;
    model: {
      data: Data;
      outputs: OutputValues<Outputs>;
      outputErrors: OutputErrors<Outputs>;
    };
  };

  const { ignoreUpdates } = watchIgnorable(
    () => appModel.model,
    (_newData) => {
      const newData = deepClone(_newData);
      debug("setDataQueue appModel.model, data", newData.data);
      setDataQueue.run(() => updateData(newData.data).then(unwrapResult));
    },
    { deep: true },
  );

  const updateAppModel = (newData: { data: Data }) => {
    debug("updateAppModel", newData);
    appModel.model.data = deepClone(newData.data) as Data;
  };

  (async () => {
    window.addEventListener("beforeunload", () => {
      closedRef.value = true;
      platforma
        .dispose()
        .then(unwrapResult)
        .catch((err) => {
          error("platforma error in dispose", err);
        });
    });

    while (!closedRef.value) {
      try {
        const patches = await platforma.getPatches(uTagRef.value).then(unwrapResult);

        debug("patches.length", patches.value.length);
        debug("uTagRef.value", uTagRef.value);
        debug("patches.uTag", patches.uTag);
        debug("patches.author", patches.author);
        debug("data.author", data.author);

        uTagRef.value = patches.uTag;

        if (patches.value.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, patchPoolingDelay));
          continue;
        }

        const isAuthorChanged = data.author?.authorId !== patches.author?.authorId;

        // Immutable behavior, apply external changes to the snapshot
        if (isAuthorChanged || data.isExternalSnapshot) {
          debug("got external changes, applying them to the snapshot", patches.value);
          ignoreUpdates(() => {
            snapshot.value = applyPatch(snapshot.value, patches.value, false, false).newDocument;
            updateAppModel({ data: deriveDataFromStorage<Data>(snapshot.value.blockStorage) });
            // Reconcile plugin data from external source
            for (const [handle, pluginState] of pluginStates) {
              pluginState.ignoreUpdates(() => {
                pluginState.model.data = deepClone(
                  getPluginData(snapshot.value.blockStorage, handle),
                );
              });
            }
            data.isExternalSnapshot = isAuthorChanged;
          });
        } else {
          // Mutable behavior
          debug("outputs changed", patches.value);
          ignoreUpdates(() => {
            snapshot.value = applyPatch(snapshot.value, patches.value).newDocument;
          });
        }

        await new Promise((resolve) => setTimeout(resolve, patchPoolingDelay));
      } catch (err) {
        if (hasAbortError(err)) {
          debug("patches loop aborted");
          closedRef.value = true;
        } else {
          error("error in patches loop", err);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  })();

  const cloneData = () => deepClone(appModel.model.data) as Data;
  const cloneNavigationState = () =>
    deepClone(snapshot.value.navigationState) as Mutable<NavigationState<Href>>;

  const methods = {
    cloneData,
    cloneNavigationState,
    /**
     * Updates the UI state by applying a callback.
     *
     * @param cb - Callback to modify the current UI state.
     * @returns A promise resolving after the update is applied.
     * @todo Make it mutable since there is already an initial one
     */
    updateData(cb: (data: Data) => Data): Promise<boolean> {
      const newData = cb(cloneData());
      debug("updateData", newData);
      appModel.model.data = newData;
      return setDataQueue.run(() => updateData(newData).then(unwrapResult));
    },
    /**
     * Navigates to a specific href by updating the navigation state.
     *
     * @param href - The target href to navigate to.
     * @returns A promise resolving after the navigation state is updated.
     */
    navigateTo(href: Href) {
      const newState = cloneNavigationState();
      newState.href = href;
      return setNavigationStateQueue.run(() => setNavigationState(newState).then(unwrapResult));
    },
    async allSettled() {
      await delay(0);
      const allQueues = [
        setDataQueue.allSettled(),
        ...Array.from(pluginDataQueues.values()).map((q) => q.allSettled()),
      ];
      await Promise.all(allQueues);
    },
  };

  const services = getServices<UiServices>({ platforma });

  /** Creates a lazily-cached per-plugin reactive state. */
  const createPluginState = <F extends PluginFactoryLike>(
    handle: PluginHandle<F>,
  ): InternalPluginState<InferFactoryData<F>, InferFactoryOutputs<F>> => {
    const prefix = pluginOutputPrefix(handle);

    const pluginOutputs = computed(() => {
      const result: Record<string, unknown> = {};
      for (const [key, outputWithStatus] of Object.entries(
        snapshot.value.outputs as Partial<Readonly<Outputs>>,
      )) {
        if (!key.startsWith(prefix)) continue;
        const outputKey = key.slice(prefix.length);
        if (platforma.blockModelInfo.outputs[key]?.withStatus) {
          result[outputKey] = outputWithStatus
            ? ensureOutputHasStableFlag(outputWithStatus)
            : undefined;
        } else {
          result[outputKey] =
            outputWithStatus.ok && outputWithStatus.value !== undefined
              ? outputWithStatus.value
              : undefined;
        }
      }
      return result;
    });

    const pluginOutputErrors = computed(() => {
      const result: Record<string, Error | undefined> = {};
      for (const [key, vOrErr] of Object.entries(
        snapshot.value.outputs as Partial<Readonly<Outputs>>,
      )) {
        if (!key.startsWith(prefix)) continue;
        result[key.slice(prefix.length)] =
          vOrErr && vOrErr.ok === false ? new MultiError(vOrErr.errors) : undefined;
      }
      return result;
    });

    const pluginModel = reactive({
      data: deepClone(getPluginData(snapshot.value.blockStorage, handle)),
      outputs: pluginOutputs,
      outputErrors: pluginOutputErrors,
    }) as InternalPluginState<InferFactoryData<F>, InferFactoryOutputs<F>>["model"];

    const { ignoreUpdates } = watchIgnorable(
      () => pluginModel.data,
      (newData) => {
        if (newData === undefined) return;
        debug("plugin setData", handle, newData);
        getPluginDataQueue(handle).run(() =>
          updatePluginData(handle, deepClone(newData)).then(unwrapResult),
        );
      },
      { deep: true },
    );

    return {
      model: pluginModel,
      services: markRaw(services),
      ignoreUpdates,
    };
  };

  /** Plugin internals — provided via separate injection key, not exposed on useApp(). */
  const pluginAccess: PluginAccess = {
    getOrCreatePluginState<F extends PluginFactoryLike>(handle: PluginHandle<F>) {
      const existing = pluginStates.get(handle);
      if (existing) {
        return existing as unknown as PluginState<
          InferFactoryData<F>,
          InferFactoryOutputs<F>,
          InferFactoryUiServices<F>
        >;
      }
      const state = createPluginState(handle);
      pluginStates.set(handle, state);
      return state as unknown as PluginState<
        InferFactoryData<F>,
        InferFactoryOutputs<F>,
        InferFactoryUiServices<F>
      >;
    },
  };

  const plugins = Object.fromEntries(
    platforma.blockModelInfo.pluginIds.map((id) => [id, { handle: id }]),
  ) as InferPluginHandles<Plugins>;

  const getters = {
    closedRef,
    snapshot,
    plugins,
    services: markRaw(services),
    queryParams: computed(() => parseQuery<Href>(snapshot.value.navigationState.href as Href)),
    href: computed(() => snapshot.value.navigationState.href),
    hasErrors: computed(() =>
      Object.values(snapshot.value.outputs as Partial<Readonly<Outputs>>).some((v) => !v?.ok),
    ),
  };

  const app = Object.assign(reactive(Object.assign(appModel, getters)), methods);

  if (settings.debug) {
    // @ts-expect-error (to inspect in console in debug mode)
    globalThis.__block_app__ = app;
  }

  return { app, pluginAccess };
}

export type BaseAppV3<
  Data = unknown,
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Href extends `/${string}` = `/${string}`,
  Plugins extends Record<string, unknown> = Record<string, unknown>,
  UiServices extends Partial<AllUiServices> = Partial<AllUiServices>,
> = ReturnType<typeof createAppV3<Data, Args, Outputs, Href, Plugins, UiServices>>["app"];
