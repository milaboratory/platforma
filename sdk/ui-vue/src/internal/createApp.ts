import { deepClone, isJsonEqual, tap } from '@milaboratories/helpers';
import type { Mutable } from '@milaboratories/helpers';
import type { NavigationState, BlockOutputsBase, BlockState, Platforma, ValueWithUTag } from '@platforma-sdk/model';
import { reactive, computed, watch, ref } from 'vue';
import type { StateModelOptions, UnwrapOutputs, OptionalResult, OutputValues, OutputErrors, AppSettings } from '../types';
import { createModel } from '../createModel';
import { createAppModel } from './createAppModel';
import { parseQuery } from '../urls';
import { MultiError, unwrapValueOrErrors } from '../utils';
import { useDebounceFn } from '@vueuse/core';
import { applyPatch } from 'fast-json-patch';
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
export function createApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(
  state: ValueWithUTag<BlockState<Args, Outputs, UiState, Href>>,
  platforma: Platforma<Args, Outputs, UiState, Href>,
  settings: AppSettings,
) {
  type AppModel = {
    args: Args;
    ui: UiState;
  };

  const closedRef = ref(false);

  const uTagRef = ref(state.uTag);

  const log = (msg: string, ...rest: unknown[]) => {
    if (settings.debug) {
      console.log(`%c>>> %c${msg}`, 'color: orange; font-weight: bold', 'color: orange', ...rest);
    }
  };

  /**
   * Reactive snapshot of the application state, including args, outputs, UI state, and navigation state.
   */
  const snapshot = ref<{
    args: Readonly<Args>;
    outputs: Partial<Readonly<Outputs>>;
    ui: Readonly<UiState>;
    navigationState: Readonly<NavigationState<Href>>;
  }>({
    args: state.value.args,
    outputs: state.value.outputs,
    ui: state.value.ui,
    navigationState: state.value.navigationState as NavigationState<Href>,
  });

  const debounceSpan = settings.debounceSpan ?? 200;

  const maxWait = tap(settings.debounceMaxWait ?? 0, (v) => v < 20_000 ? 20_000 : v < debounceSpan ? debounceSpan * 100 : v);

  const setBlockArgs = useDebounceFn((args: Args) => {
    if (!isJsonEqual(args, snapshot.value.args)) {
      platforma.setBlockArgs(args);
    }
  }, debounceSpan, { maxWait });

  const setBlockUiState = useDebounceFn((ui: UiState) => {
    if (!isJsonEqual(ui, snapshot.value.ui)) {
      platforma.setBlockUiState(ui);
    }
  }, debounceSpan, { maxWait });

  const setBlockArgsAndUiState = useDebounceFn((args: Args, ui: UiState) => {
    if (!isJsonEqual(args, snapshot.value.args) || !isJsonEqual(ui, snapshot.value.ui)) {
      platforma.setBlockArgsAndUiState(args, ui);
    }
  }, debounceSpan, { maxWait });

  // Temporary solution to handle patches
  (async () => {
    while (!closedRef.value) {
      try {
        log('await getPatches', uTagRef.value);
        const patches = await platforma.getPatches(uTagRef.value);

        log('patches', JSON.stringify(patches, null, 2));

        log('uTagRef.value', uTagRef.value);
        log('patches.uTag', patches.uTag);
        log('is the same uTag', uTagRef.value === patches.uTag);

        uTagRef.value = patches.uTag;

        const newState = applyPatch(snapshot.value, patches.value).newDocument;

        log('newState is the same', newState === snapshot.value);

        snapshot.value = newState;
      } catch (err) {
        console.error('error in patches loop', err);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  })();

  const cloneArgs = () => deepClone(snapshot.value.args) as Args;
  const cloneUiState = () => deepClone(snapshot.value.ui) as UiState;
  const cloneNavigationState = () => deepClone(snapshot.value.navigationState) as Mutable<NavigationState<Href>>;

  const methods = {
    createArgsModel<T = Args>(options: StateModelOptions<Args, T> = {}) {
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
          setBlockArgs(newArgs);
        },
      });
    },
    /**
     * defaultUiState is temporarily here, remove it after implementing initialUiState
     */
    createUiModel<T = UiState>(options: StateModelOptions<UiState, T> = {}, defaultUiState: () => UiState) {
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
          setBlockUiState(newData);
        },
      });
    },
    /**
     * Note: Don't forget to list the output names, like: useOutputs('output1', 'output2', ...etc)
     * @param keys - List of output names
     * @returns {OptionalResult<UnwrapOutputs<Outputs, K>>}
     */
    useOutputs<K extends keyof Outputs>(...keys: K[]): OptionalResult<UnwrapOutputs<Outputs, K>> {
      const data = reactive({
        errors: undefined,
        value: undefined,
      });

      watch(
        () => snapshot.value.outputs,
        () => {
          try {
            Object.assign(data, {
              value: this.unwrapOutputs<K>(...keys),
              errors: undefined,
            });
          } catch (error) {
            Object.assign(data, {
              value: undefined,
              errors: [String(error)],
            });
          }
        },
        { immediate: true, deep: true },
      );

      return data as OptionalResult<UnwrapOutputs<Outputs, K>>;
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
    updateArgs(cb: (args: Args) => void) {
      const newArgs = cloneArgs();
      cb(newArgs);
      return platforma.setBlockArgs(newArgs);
    },
    /**
     * Updates the UI state by applying a callback.
     *
     * @param cb - Callback to modify the current UI state.
     * @returns A promise resolving after the update is applied.
     * @todo Make it mutable since there is already an initial one
     */
    updateUiState(cb: (args: UiState) => UiState): Promise<void> {
      const newUiState = cloneUiState();
      return platforma.setBlockUiState(cb(newUiState));
    },
    /**
     * Updates the navigation state by applying a callback.
     *
     * @param cb - Callback to modify the current navigation state.
     * @returns A promise resolving after the update is applied.
     */
    updateNavigationState(cb: (args: Mutable<NavigationState<Href>>) => void) {
      const newState = cloneNavigationState();
      cb(newState);
      log('>>> updateNavigationState', newState);
      return platforma.setNavigationState(newState);
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
      return platforma.setNavigationState(newState);
    },
  };

  const outputs = computed<OutputValues<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(([k, vOrErr]) => [k, vOrErr.ok && vOrErr.value !== undefined ? vOrErr.value : undefined]);
    return Object.fromEntries(entries);
  });

  const outputErrors = computed<OutputErrors<Outputs>>(() => {
    const entries = Object.entries(snapshot.value.outputs as Partial<Readonly<Outputs>>).map(([k, vOrErr]) => [k, vOrErr && !vOrErr.ok ? new MultiError(vOrErr.errors) : undefined]);
    return Object.fromEntries(entries);
  });

  const getters = {
    snapshot,
    queryParams: computed(() => parseQuery<Href>(snapshot.value.navigationState.href as Href)),
    href: computed(() => snapshot.value.navigationState.href),
    hasErrors: computed(() => Object.values(snapshot.value.outputs as Partial<Readonly<Outputs>>).some((v) => !v?.ok)),
  };

  const model = createAppModel(
    {
      get() {
        return { args: snapshot.value.args, ui: snapshot.value.ui } as AppModel;
      },
      autoSave: true,
      onSave(newData: AppModel) {
        log('>>> onSave', newData);
        setBlockArgsAndUiState(newData.args, newData.ui);
      },
    },
    {
      outputs,
      outputErrors,
    },
    settings,
  );

  return reactive(Object.assign(model, methods, getters));
}

export type BaseApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof createApp<Args, Outputs, UiState, Href>>;
