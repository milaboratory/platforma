import { deepClone, delay, uniqueId } from '@milaboratories/helpers';
import type { Mutable } from '@milaboratories/helpers';
import type { NavigationState, BlockOutputsBase, BlockState, PlatformaV2, ValueWithUTag, AuthorMarker } from '@platforma-sdk/model';
import { hasAbortError, unwrapResult } from '@platforma-sdk/model';
import type { Ref } from 'vue';
import { reactive, computed, ref, watch } from 'vue';
import type { StateModelOptions, UnwrapOutputs, OutputValues, OutputErrors, AppSettings } from '../types';
import { createModel } from '../createModel';
import { parseQuery } from '../urls';
import { MultiError, unwrapValueOrErrors } from '../utils';
import { applyPatch } from 'fast-json-patch';
import { UpdateSerializer } from './UpdateSerializer';

export const patchPoolingDelay = 100;

export const createNextAuthorMarker = (marker: AuthorMarker | undefined): AuthorMarker => ({
  authorId: marker?.authorId ?? uniqueId(),
  localVersion: (marker?.localVersion ?? 0) + 1,
});

/**
 * Creates an application instance with reactive state management, outputs, and methods for state updates and navigation.
 *
 * @template Args - The type of arguments used in the application.
 * @template Outputs - The type of block outputs extending `BlockOutputsBase`.
 * @template UiState - The type of the UI state.
 * @template Href - The type of navigation href, defaulting to a string starting with `/`.
 *
 * @param state - Initial state of the application, including args, outputs, UI state, and navigation state.
 * @param platforma - A platform interface for interacting with block states.
 * @param settings - Application settings, such as debug flags.
 *
 * @returns A reactive application object with methods, getters, and state.
 */
export function createAppV2<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(
  state: ValueWithUTag<BlockState<Args, Outputs, UiState, Href>>,
  platforma: PlatformaV2<Args, Outputs, UiState, Href>,
  settings: AppSettings,
) {
  type AppModel = {
    args: Args;
    ui: UiState;
  };

  const debug = (msg: string, ...rest: unknown[]) => {
    if (settings.debug) {
      console.log(`%c>>> %c${msg}`, 'color: orange; font-weight: bold', 'color: orange', settings.appId, ...rest);
    }
  };

  const error = (msg: string, ...rest: unknown[]) => {
    console.error(`%c>>> %c${msg}`, 'color: red; font-weight: bold', 'color: red', settings.appId, ...rest);
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

  const setArgsQueue = new UpdateSerializer({ debounceSpan });
  const setUiStateQueue = new UpdateSerializer({ debounceSpan });
  const setArgsAndUiStateQueue = new UpdateSerializer({ debounceSpan });
  const setNavigationStateQueue = new UpdateSerializer({ debounceSpan });
  /**
   * Reactive snapshot of the application state, including args, outputs, UI state, and navigation state.
   */
  const snapshot = ref<{
    args: Args;
    outputs: Partial<Outputs>;
    ui: UiState;
    navigationState: NavigationState<Href>;
  }>(state.value) as Ref<{
    args: Args;
    outputs: Partial<Outputs>;
    ui: UiState;
    navigationState: NavigationState<Href>;
  }>;

  const setBlockArgs = async (args: Args) => {
    return platforma.setBlockArgs(args, nextAuthorMarker());
  };

  const setBlockUiState = async (ui: UiState) => {
    return platforma.setBlockUiState(ui, nextAuthorMarker());
  };

  const setBlockArgsAndUiState = async (args: Args, ui: UiState) => {
    return platforma.setBlockArgsAndUiState(args, ui, nextAuthorMarker());
  };

  const setNavigationState = async (state: NavigationState<Href>) => {
    return platforma.setNavigationState(state);
  };

  const outputs = computed<OutputValues<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(([k, vOrErr]) => [k, vOrErr.ok && vOrErr.value !== undefined ? vOrErr.value : undefined]);
    return Object.fromEntries(entries);
  });

  const outputErrors = computed<OutputErrors<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(([k, vOrErr]) => [k, vOrErr && !vOrErr.ok ? new MultiError(vOrErr.errors) : undefined]);
    return Object.fromEntries(entries);
  });

  const appModel = reactive({
    error: '',
    model: {
      args: deepClone(snapshot.value.args) as Args,
      ui: deepClone(snapshot.value.ui) as UiState,
      outputs,
      outputErrors,
    },
  }) as {
    error: string;
    model: {
      args: Args;
      ui: UiState;
      outputs: OutputValues<Outputs>;
      outputErrors: OutputErrors<Outputs>;
    };
  };

  const appModelWatch = watch(
    () => appModel.model,
    (_newData) => {
      const newData = deepClone(_newData);
      debug('appModel.model', newData);
      setArgsAndUiStateQueue.run(() => setBlockArgsAndUiState(newData.args, newData.ui).then(unwrapResult));
    },
    { deep: true },
  );

  const updateAppModelSilently = (newData: AppModel) => {
    debug('updateAppModelSilently', newData);
    appModelWatch.pause();
    appModel.model.args = newData.args as Args;
    appModel.model.ui = newData.ui as UiState;
    appModelWatch.resume();
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
          debug('got external changes, applying them to the snapshot', JSON.stringify(snapshot.value, null, 2));
          snapshot.value = applyPatch(snapshot.value, patches.value, false, false).newDocument;
          updateAppModelSilently(snapshot.value);
          data.isExternalSnapshot = isAuthorChanged;
        } else {
          // Mutable behavior
          snapshot.value = applyPatch(snapshot.value, patches.value).newDocument;
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

  const cloneArgs = () => deepClone(appModel.model.args) as Args;
  const cloneUiState = () => deepClone(appModel.model.ui) as UiState;
  const cloneNavigationState = () => deepClone(snapshot.value.navigationState) as Mutable<NavigationState<Href>>;

  const methods = {
    cloneArgs,
    cloneUiState,
    cloneNavigationState,
    createArgsModel<T extends Args = Args>(options: StateModelOptions<Args, T> = {}) {
      return createModel<T, Args>({
        get() {
          if (options.transform) {
            return options.transform(snapshot.value.args as Args);
          }

          return snapshot.value.args as T;
        },
        validate: options.validate,
        autoSave: true,
        onSave(newArgs) {
          setArgsQueue.run(() => setBlockArgs(newArgs).then(unwrapResult));
        },
      });
    },
    /**
     * defaultUiState is temporarily here, remove it after implementing initialUiState
     */
    createUiModel<T extends UiState = UiState>(options: StateModelOptions<UiState, T> = {}, defaultUiState: () => UiState) {
      return createModel<T, UiState>({
        get() {
          if (options.transform) {
            return options.transform(snapshot.value.ui as UiState);
          }

          return (snapshot.value.ui ?? defaultUiState()) as T;
        },
        validate: options.validate,
        autoSave: true,
        onSave(newData) {
          setUiStateQueue.run(() => setBlockUiState(newData).then(unwrapResult));
        },
      });
    },
    /**
     * Retrieves the unwrapped values of outputs for the given keys.
     *
     * @template K - Keys of the outputs to unwrap.
     * @param keys - List of output names.
     * @throws Error if the outputs contain errors.
     * @returns An object with unwrapped output values.
     */
    unwrapOutputs<K extends keyof Outputs>(...keys: K[]): UnwrapOutputs<Outputs, K> {
      const outputs = snapshot.value.outputs as Partial<Readonly<Outputs>>;
      const entries = keys.map((key) => [key, unwrapValueOrErrors(outputs[key])]);
      return Object.fromEntries(entries);
    },
    /**
     * Updates the arguments state by applying a callback.
     *
     * @param cb - Callback to modify the current arguments.
     * @returns A promise resolving after the update is applied.
     */
    updateArgs(cb: (args: Args) => void): Promise<boolean> {
      const newArgs = cloneArgs();
      cb(newArgs);
      debug('updateArgs', newArgs);
      appModel.model.args = newArgs;
      return setArgsQueue.run(() => setBlockArgs(newArgs).then(unwrapResult));
    },
    /**
     * Updates the UI state by applying a callback.
     *
     * @param cb - Callback to modify the current UI state.
     * @returns A promise resolving after the update is applied.
     * @todo Make it mutable since there is already an initial one
     */
    updateUiState(cb: (args: UiState) => UiState): Promise<boolean> {
      const newUiState = cb(cloneUiState());
      debug('updateUiState', newUiState);
      appModel.model.ui = newUiState;
      return setUiStateQueue.run(() => setBlockUiState(newUiState).then(unwrapResult));
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
      return setArgsAndUiStateQueue.allSettled();
    },
  };

  const getters = {
    closedRef,
    snapshot,
    queryParams: computed(() => parseQuery<Href>(snapshot.value.navigationState.href as Href)),
    href: computed(() => snapshot.value.navigationState.href),
    hasErrors: computed(() => Object.values(snapshot.value.outputs as Partial<Readonly<Outputs>>).some((v) => !v?.ok)),
  };

  return reactive(Object.assign(appModel, methods, getters));
}

export type BaseAppV2<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof createAppV2<Args, Outputs, UiState, Href>>;
