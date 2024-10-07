import { deepClone, throttle } from '@milaboratories/helpers';
import type { Mutable } from '@milaboratories/helpers';
import type { NavigationState, BlockOutputsBase, BlockState, Platforma } from '@platforma-sdk/model';
import { reactive, nextTick, computed, watch } from 'vue';
import type { UnwrapValueOrErrors, StateModelOptions, UnwrapOutputs, OptionalResult, OutputValues, OutputErrors } from '../types';
import { createModel } from '../createModel';
import { parseQuery } from '../urls';
import { MultiError, unwrapValueOrErrors } from '../utils';
import { pick } from 'lodash';

export function createApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(state: BlockState<Args, Outputs, UiState, Href>, platforma: Platforma<Args, Outputs, UiState, Href>) {
  type AppModel = {
    args: Args;
    ui: UiState;
  };

  const throttleSpan = 100; // @todo settings and more flexible

  const setBlockArgs = throttle(platforma.setBlockArgs, throttleSpan);

  const setBlockUiState = throttle(platforma.setBlockUiState, throttleSpan);

  const setBlockArgsAndUiState = throttle(platforma.setBlockArgsAndUiState, throttleSpan);

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

  platforma.onStateUpdates(async (updates) => {
    updates.forEach((patch) => {
      if (patch.key === 'args') {
        snapshot.args = Object.freeze(patch.value);
      }

      if (patch.key === 'ui') {
        snapshot.ui = Object.freeze(patch.value);
      }

      if (patch.key === 'outputs') {
        snapshot.outputs = Object.freeze(patch.value);
      }

      if (patch.key === 'navigationState') {
        snapshot.navigationState = Object.freeze(patch.value);
      }
    });

    await nextTick(); // @todo remove
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
    createAppModel<T = AppModel>(options: StateModelOptions<AppModel, T> = {}) {
      return createModel<T, AppModel>({
        get() {
          if (options.transform) {
            return options.transform(snapshot);
          }

          return { args: snapshot.args, ui: snapshot.ui } as T;
        },
        validate: options.validate,
        autoSave: true,
        onSave(newData) {
          setBlockArgsAndUiState(newData.args, newData.ui);
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
     * @throws Error
     * @param keys
     * @returns
     */
    unwrapOutputs<K extends keyof Outputs>(...keys: K[]): UnwrapOutputs<Outputs, K> {
      const outputs = snapshot.outputs;
      const entries = keys.map((key) => [key, unwrapValueOrErrors(outputs[key])]);
      return Object.fromEntries(entries);
    },
    /**
     * @deprecated use app.outputs.[fieldName] instead
     * @see outputs
     */
    getOutputField(key: keyof Outputs) {
      return snapshot.outputs[key];
    },
    /**
     * @deprecated use outputValues instead
     * @see outputValues
     */
    getOutputFieldOkOptional<K extends keyof Outputs>(key: K): UnwrapValueOrErrors<Outputs[K]> | undefined {
      console.warn('use reactive app.outputValues.fieldName instead instead of getOutputFieldOkOptional(fieldName)');

      const result = this.getOutputField(key);

      if (result && result.ok) {
        return result.value;
      }

      return undefined;
    },
    getOutputFieldErrorsOptional<K extends keyof Outputs>(key: K): string[] | undefined {
      console.warn('use reactive app.outputErrors.fieldName instead instead of getOutputFieldErrorsOptional(fieldName)');

      const result = this.getOutputField(key);

      if (result && !result.ok) {
        return result.errors;
      }

      return undefined;
    },
    updateArgs(cb: (args: Args) => void) {
      const newArgs = cloneArgs();
      cb(newArgs);
      return platforma.setBlockArgs(newArgs);
    },
    updateUiState(cb: (args: UiState) => UiState) {
      const newUiState = cloneUiState();
      return platforma.setBlockUiState(cb(newUiState));
    },
    updateNavigationState(cb: (args: Mutable<NavigationState<Href>>) => void) {
      const newState = cloneNavigationState();
      cb(newState);
      return platforma.setNavigationState(newState);
    },
    navigateTo(href: Href) {
      const newState = cloneNavigationState();
      newState.href = href;
      return platforma.setNavigationState(newState);
    },
  };

  const getters = {
    args: computed(() => snapshot.args),
    outputs: computed(() => snapshot.outputs),
    ui: computed(() => snapshot.ui),
    navigationState: computed(() => snapshot.navigationState),
    href: computed(() => snapshot.navigationState.href),

    outputValues: computed<OutputValues<Outputs>>(() => {
      const entries = Object.entries(snapshot.outputs).map(([k, vOrErr]) => [k, vOrErr.ok && vOrErr.value !== undefined ? vOrErr.value : undefined]);
      return Object.fromEntries(entries);
    }),

    outputErrors: computed<OutputErrors<Outputs>>(() => {
      const entries = Object.entries(snapshot.outputs).map(([k, vOrErr]) => [k, vOrErr && !vOrErr.ok ? new MultiError(vOrErr.errors) : undefined]);
      return Object.fromEntries(entries);
    }),

    queryParams: computed(() => parseQuery<Href>(snapshot.navigationState.href)),
    hasErrors: computed(() => Object.values(snapshot.outputs).some((v) => !v?.ok)), // @TODO: there is middle-layer error, v sometimes is undefined
  };

  const appModel = methods.createAppModel();

  return reactive(Object.assign(appModel, methods, getters));
}

export type BaseApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof createApp<Args, Outputs, UiState, Href>>;
