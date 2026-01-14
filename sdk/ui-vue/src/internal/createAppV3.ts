import { deepClone, delay, uniqueId } from '@milaboratories/helpers';
import type { Mutable } from '@milaboratories/helpers';
import type {
  NavigationState,
  BlockOutputsBase,
  BlockStateV3,
  PlatformaV3,
  ValueWithUTag,
  AuthorMarker,
} from '@platforma-sdk/model';
import { hasAbortError, unwrapResult } from '@platforma-sdk/model';
import type { Ref } from 'vue';
import { reactive, computed, ref } from 'vue';
import type { OutputValues, OutputErrors, AppSettings } from '../types';
import { parseQuery } from '../urls';
import { MultiError } from '../utils';
import { applyPatch } from 'fast-json-patch';
import { UpdateSerializer } from './UpdateSerializer';
import { watchIgnorable } from '@vueuse/core';

export const patchPoolingDelay = 150;

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
 * @template State - The type of the UI state.
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
  console.log('createAppV3 state', state);
  const debug = (msg: string, ...rest: unknown[]) => {
    if (settings.debug) {
      console.log(`%c>>> %c${msg}`, 'color: orange; font-weight: bold', 'color: orange', ...rest.map((r) => stringifyForDebug(r)));
    }
  };

  const error = (msg: string, ...rest: unknown[]) => {
    console.error(`%c>>> %c${msg}`, 'color: red; font-weight: bold', 'color: red', ...rest.map((r) => stringifyForDebug(r)));
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
    debug('nextAuthorMarker', data.author);
    return data.author;
  };

  const closedRef = ref(false);

  const uTagRef = ref(state.uTag);

  const debounceSpan = settings.debounceSpan ?? 200;

  const setDataQueue = new UpdateSerializer({ debounceSpan });
  const setNavigationStateQueue = new UpdateSerializer({ debounceSpan });
  /**
   * Reactive snapshot of the application state, including args, outputs, UI state, and navigation state.
   */
  const snapshot = ref<{
    outputs: Partial<Outputs>;
    data: Data;
    navigationState: NavigationState<Href>;
  }>(state.value) as Ref<{
    outputs: Partial<Outputs>;
    data: Data;
    navigationState: NavigationState<Href>;
  }>;

  const setBlockData = async (data: Data) => {
    console.log('createAppV3 setBlockData data', data);
    return platforma.setState(data, nextAuthorMarker());
  };

  const setNavigationState = async (state: NavigationState<Href>) => {
    return platforma.setNavigationState(state);
  };

  const outputs = computed<OutputValues<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(([k, vOrErr]) => [k, vOrErr.ok && vOrErr.value !== undefined ? vOrErr.value : undefined]);
    return Object.fromEntries(entries);
  });

  const outputErrors = computed<OutputErrors<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(([k, vOrErr]) => [k, vOrErr && vOrErr.ok === false ? new MultiError(vOrErr.errors) : undefined]);
    return Object.fromEntries(entries);
  });

  const appModel = reactive({
    apiVersion: 3,
    error: '',
    model: {
      data: deepClone(snapshot.value.data) as Data,
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
      debug('setStateQueue appModel.model, data', newData.data);
      setDataQueue.run(() => setBlockData(newData.data).then(unwrapResult));
    },
    { deep: true },
  );

  const updateAppModel = (newData: {
    data: Data;
  }) => {
    debug('updateAppModel', newData);
    appModel.model.data = deepClone(newData.data) as Data;
  };

  (async () => {
    window.addEventListener('beforeunload', () => {
      closedRef.value = true;
      platforma.dispose().then(unwrapResult).catch((err) => {
        error('error in dispose', err);
      });
    });

    while (!closedRef.value) {
      try {
        const patches = await platforma.getPatches(uTagRef.value).then(unwrapResult);

        debug('patches.length', patches.value.length);
        debug('uTagRef.value', uTagRef.value);
        debug('patches.uTag', patches.uTag);
        debug('patches.author', patches.author);
        debug('data.author', data.author);

        uTagRef.value = patches.uTag;

        if (patches.value.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, patchPoolingDelay));
          continue;
        }

        const isAuthorChanged = data.author?.authorId !== patches.author?.authorId;

        // Immutable behavior, apply external changes to the snapshot
        if (isAuthorChanged || data.isExternalSnapshot) {
          debug('got external changes, applying them to the snapshot', patches.value);
          ignoreUpdates(() => {
            snapshot.value = applyPatch(snapshot.value, patches.value, false, false).newDocument;
            updateAppModel({ data: snapshot.value.data });
            data.isExternalSnapshot = isAuthorChanged;
          });
        } else {
          // Mutable behavior
          debug('outputs changed', patches.value);
          ignoreUpdates(() => {
            snapshot.value = applyPatch(snapshot.value, patches.value).newDocument;
          });
        }

        await new Promise((resolve) => setTimeout(resolve, patchPoolingDelay));
      } catch (err) {
        if (hasAbortError(err)) {
          debug('patches loop aborted');
          closedRef.value = true;
        } else {
          error('error in patches loop', err);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  })();

  const cloneData = () => deepClone(appModel.model.data) as Data;
  const cloneNavigationState = () => deepClone(snapshot.value.navigationState) as Mutable<NavigationState<Href>>;

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
      debug('updateData', newData);
      appModel.model.data = newData;
      return setDataQueue.run(() => setBlockData(newData).then(unwrapResult));
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
      return setDataQueue.allSettled();
    },
  };

  const getters = {
    closedRef,
    snapshot,
    queryParams: computed(() => parseQuery<Href>(snapshot.value.navigationState.href as Href)),
    href: computed(() => snapshot.value.navigationState.href),
    hasErrors: computed(() => Object.values(snapshot.value.outputs as Partial<Readonly<Outputs>>).some((v) => !v?.ok)),
  };

  const app = reactive(Object.assign(appModel, methods, getters));

  if (settings.debug) {
    // @ts-expect-error (to inspect in console in debug mode)
    globalThis.__block_app__ = app;
  }

  return app;
}

export type BaseAppV3<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  State = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof createAppV3<Args, Outputs, State, Href>>;
