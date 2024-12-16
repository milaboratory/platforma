import { debounce, deepClone, isJsonEqual, throttle } from '@milaboratories/helpers';
import type { Mutable } from '@milaboratories/helpers';
import type { NavigationState, BlockOutputsBase, BlockState, Platforma } from '@platforma-sdk/model';
import { reactive, nextTick, computed, watch } from 'vue';
import type { StateModelOptions, UnwrapOutputs, OptionalResult, OutputValues, OutputErrors, AppSettings } from '../types';
import { createModel } from '../createModel';
import { createAppModel } from './createAppModel';
import { parseQuery } from '../urls';
import { MultiError, unwrapValueOrErrors } from '../utils';
import { useDebounceFn } from '@vueuse/core';
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
>(state: BlockState<Args, Outputs, UiState, Href>, platforma: Platforma<Args, Outputs, UiState, Href>, settings: AppSettings) {
  type AppModel = {
    args: Args;
    ui: UiState;
  };

  const log = (msg: string, ...rest: unknown[]) => {
    if (settings.debug) {
      console.log(`%c>>> %c${msg}`, 'color: orange; font-weight: bold', 'color: orange', ...rest);
    }
  };

  /**
   * Reactive snapshot of the application state, including args, outputs, UI state, and navigation state.
   */
  const snapshot = reactive({
    args: Object.freeze(state.args),
    outputs: Object.freeze(state.outputs),
    ui: Object.freeze(state.ui),
    navigationState: Object.freeze(state.navigationState) as NavigationState<Href>,
  }) as {
    args: Readonly<Args>;
    outputs: Partial<Readonly<Outputs>>;
    ui: Readonly<UiState>;
    navigationState: Readonly<NavigationState<Href>>;
  };

  const debounceSpan = settings.debounceSpan ?? 100;

  const maxWait = settings.debounceMaxWait ?? 1000;

  const setBlockArgs = useDebounceFn((args: Args) => {
    if (!isJsonEqual(args, snapshot.args)) {
      platforma.setBlockArgs(args);
    }
  }, debounceSpan, { maxWait });

  const setBlockUiState = useDebounceFn((ui: UiState) => {
    if (!isJsonEqual(ui, snapshot.ui)) {
      platforma.setBlockUiState(ui);
    }
  }, debounceSpan, { maxWait });

  const setBlockArgsAndUiState = useDebounceFn((args: Args, ui: UiState) => {
    if (!isJsonEqual(args, snapshot.args) || !isJsonEqual(ui, snapshot.ui)) {
      platforma.setBlockArgsAndUiState(args, ui);
    }
  }, debounceSpan, { maxWait });

  platforma.onStateUpdates(async (updates) => {
    updates.forEach((patch) => {
      if (patch.key === 'args') {
        snapshot.args = Object.freeze(patch.value);
        log('args patch', snapshot.args);
      }

      if (patch.key === 'ui') {
        snapshot.ui = Object.freeze(patch.value);
        log('ui patch', snapshot.ui);
      }

      if (patch.key === 'outputs') {
        snapshot.outputs = Object.freeze(patch.value);
        log('outputs patch', snapshot.outputs);
      }

      if (patch.key === 'navigationState') {
        if (!isJsonEqual(snapshot.navigationState, patch.value)) {
          snapshot.navigationState = Object.freeze(patch.value);
          log('navigationState patch', snapshot.navigationState);
        }
      }
    });

    await nextTick();
  });

  const cloneArgs = () => deepClone(snapshot.args) as Args;
  const cloneUiState = () => deepClone(snapshot.ui) as UiState;
  const cloneNavigationState = () => deepClone(snapshot.navigationState) as Mutable<NavigationState<Href>>;

  const methods = {
    createArgsModel<T = Args>(options: StateModelOptions<Args, T> = {}) {
      return createModel<T, Args>({
        get() {
          if (options.transform) {
            return options.transform(snapshot.args);
          }

          return snapshot.args as T;
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
            return options.transform(snapshot.ui);
          }

          return (snapshot.ui ?? defaultUiState()) as T;
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
        () => snapshot.outputs,
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
      const outputs = snapshot.outputs;
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
    const entries = Object.entries(snapshot.outputs).map(([k, vOrErr]) => [k, vOrErr.ok && vOrErr.value !== undefined ? vOrErr.value : undefined]);
    return Object.fromEntries(entries);
  });

  const outputErrors = computed<OutputErrors<Outputs>>(() => {
    const entries = Object.entries(snapshot.outputs).map(([k, vOrErr]) => [k, vOrErr && !vOrErr.ok ? new MultiError(vOrErr.errors) : undefined]);
    return Object.fromEntries(entries);
  });

  const getters = {
    snapshot,
    queryParams: computed(() => parseQuery<Href>(snapshot.navigationState.href)),
    href: computed(() => snapshot.navigationState.href),
    hasErrors: computed(() => Object.values(snapshot.outputs).some((v) => !v?.ok)),
  };

  const model = createAppModel(
    {
      get() {
        return { args: snapshot.args, ui: snapshot.ui } as AppModel;
      },
      autoSave: true,
      onSave(newData: AppModel) {
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
