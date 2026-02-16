import { deepClone, delay, uniqueId } from "@milaboratories/helpers";
import type { Mutable } from "@milaboratories/helpers";
import type {
  NavigationState,
  BlockOutputsBase,
  BlockStateV3,
  PlatformaV3,
  ValueWithUTag,
  AuthorMarker,
} from "@platforma-sdk/model";
import {
  hasAbortError,
  unwrapResult,
  deriveDataFromStorage,
  getPluginData,
  normalizeBlockStorage,
} from "@platforma-sdk/model";
import type { Ref } from "vue";
import { reactive, computed, ref } from "vue";
import type { OutputValues, OutputErrors, AppSettings } from "../types";
import { parseQuery } from "../urls";
import { MultiError } from "../utils";
import { applyPatch } from "fast-json-patch";
import { UpdateSerializer } from "./UpdateSerializer";
import { watchIgnorable } from "@vueuse/core";

export const patchPoolingDelay = 150;

/** Internal interface for plugin data access — injected separately from the app. */
export interface PluginDataAccess {
  readonly pluginDataMap: Record<string, unknown>;
  setPluginData(pluginId: string, value: unknown): Promise<boolean>;
  initPluginDataSlot(pluginId: string): void;
}

export const createNextAuthorMarker = (marker: AuthorMarker | undefined): AuthorMarker => ({
  authorId: marker?.authorId ?? uniqueId(),
  localVersion: (marker?.localVersion ?? 0) + 1,
});

const stringifyForDebug = (v: unknown) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};

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
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Data = unknown,
  Href extends `/${string}` = `/${string}`,
>(
  state: ValueWithUTag<BlockStateV3<Outputs, Data, Href>>,
  platforma: PlatformaV3<Args, Outputs, Data, Href>,
  settings: AppSettings,
) {
  const debug = (msg: string, ...rest: unknown[]) => {
    if (settings.debug) {
      console.log(
        `%c>>> %c${msg}`,
        "color: orange; font-weight: bold",
        "color: orange",
        ...rest.map((r) => stringifyForDebug(r)),
      );
    }
  };

  const error = (msg: string, ...rest: unknown[]) => {
    console.error(
      `%c>>> %c${msg}`,
      "color: red; font-weight: bold",
      "color: red",
      ...rest.map((r) => stringifyForDebug(r)),
    );
  };

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
  const pluginDataQueues = new Map<string, UpdateSerializer>();
  const getPluginDataQueue = (pluginId: string): UpdateSerializer => {
    let queue = pluginDataQueues.get(pluginId);
    if (!queue) {
      queue = new UpdateSerializer({ debounceSpan });
      pluginDataQueues.set(pluginId, queue);
    }
    return queue;
  };
  const setNavigationStateQueue = new UpdateSerializer({ debounceSpan });

  /** Reactive map of plugin data keyed by pluginId. Optimistic state for plugin components. */
  const pluginDataMap = reactive<Record<string, unknown>>({});
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
    return platforma.mutateStorage({ operation: "update-data", value }, nextAuthorMarker());
  };

  const updatePluginData = async (pluginId: string, value: unknown) => {
    return platforma.mutateStorage(
      { operation: "update-plugin", pluginId, value },
      nextAuthorMarker(),
    );
  };

  /** Derives plugin data for a given pluginId from the current snapshot. */
  const derivePluginDataFromSnapshot = (pluginId: string): unknown => {
    const storage = normalizeBlockStorage(snapshot.value.blockStorage);
    return getPluginData(storage, pluginId);
  };

  const setNavigationState = async (state: NavigationState<Href>) => {
    return platforma.setNavigationState(state);
  };

  const outputs = computed<OutputValues<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(
      ([k, vOrErr]) => [k, vOrErr.ok && vOrErr.value !== undefined ? vOrErr.value : undefined],
    );
    return Object.fromEntries(entries);
  });

  const outputErrors = computed<OutputErrors<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(
      ([k, vOrErr]) => [
        k,
        vOrErr && vOrErr.ok === false ? new MultiError(vOrErr.errors) : undefined,
      ],
    );
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
          error("error in dispose", err);
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
            for (const pluginId of Object.keys(pluginDataMap)) {
              pluginDataMap[pluginId] = derivePluginDataFromSnapshot(pluginId);
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

  /** Plugin internals — provided via separate injection key, not exposed on useApp(). */
  const pluginAccess: PluginDataAccess = {
    pluginDataMap,
    setPluginData(pluginId: string, value: unknown): Promise<boolean> {
      pluginDataMap[pluginId] = value;
      debug("setPluginData", pluginId, value);
      return getPluginDataQueue(pluginId).run(() =>
        updatePluginData(pluginId, value).then(unwrapResult),
      );
    },
    initPluginDataSlot(pluginId: string): void {
      if (!(pluginId in pluginDataMap)) {
        pluginDataMap[pluginId] = derivePluginDataFromSnapshot(pluginId);
      }
    },
  };

  const getters = {
    closedRef,
    snapshot,
    queryParams: computed(() => parseQuery<Href>(snapshot.value.navigationState.href as Href)),
    href: computed(() => snapshot.value.navigationState.href),
    hasErrors: computed(() =>
      Object.values(snapshot.value.outputs as Partial<Readonly<Outputs>>).some((v) => !v?.ok),
    ),
  };

  const app = reactive(Object.assign(appModel, methods, getters));

  if (settings.debug) {
    // @ts-expect-error (to inspect in console in debug mode)
    globalThis.__block_app__ = app;
  }

  return { app, pluginAccess };
}

export type BaseAppV3<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Data = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof createAppV3<Args, Outputs, Data, Href>>["app"];
