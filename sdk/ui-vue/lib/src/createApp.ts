import { deepClone } from '@milaboratory/helpers';
import type { Mutable } from '@milaboratory/helpers/types';
import type { NavigationState, BlockOutputsBase, BlockState, Platforma } from '@milaboratory/sdk-ui';
import { reactive, nextTick, computed, watch } from 'vue';
import type { UnwrapValueOrErrors, StateModelOptions, UnwrapOutputs, OptionalResult, OutputValues, OutputErrors } from './types';
import { createModel } from './createModel';
import { parseQuery } from './urls';
import { MultiError, unwrapValueOrErrors } from './utils';

export function createApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(state: BlockState<Args, Outputs, UiState, Href>, platforma: Platforma<Args, Outputs, UiState, Href>) {
  const innerState = reactive({
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
        innerState.args = Object.freeze(patch.value);
      }

      if (patch.key === 'ui') {
        innerState.ui = Object.freeze(patch.value);
      }

      if (patch.key === 'outputs') {
        innerState.outputs = Object.freeze(patch.value);
      }

      if (patch.key === 'navigationState') {
        innerState.navigationState = Object.freeze(patch.value);
      }
    });

    await nextTick(); // @todo remove
  });

  const cloneArgs = () => deepClone(innerState.args) as Args;
  const cloneUiState = () => deepClone(innerState.ui) as UiState;
  const cloneNavigationState = () => deepClone(innerState.navigationState) as Mutable<NavigationState<Href>>;

  const methods = {
    createArgsModel<T = Args>(options: StateModelOptions<Args, T> = {}) {
      return createModel<T, Args>({
        get() {
          if (options.transform) {
            return options.transform(innerState.args);
          }

          return innerState.args as T;
        },
        validate: options.validate,
        autoSave: true,
        onSave(newArgs) {
          platforma.setBlockArgs(newArgs);
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
            return options.transform(innerState.ui);
          }

          return (innerState.ui ?? defaultUiState()) as T;
        },
        validate: options.validate,
        autoSave: true,
        onSave(newData) {
          platforma.setBlockUiState(newData);
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
        () => innerState.outputs,
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
      const outputs = innerState.outputs;
      const entries = keys.map((key) => [key, unwrapValueOrErrors(outputs[key])]);
      return Object.fromEntries(entries);
    },
    /**
     * @deprecated use app.outputs.[fieldName] instead
     * @see outputs
     */
    getOutputField(key: keyof Outputs) {
      return innerState.outputs[key];
    },
    /**
     * @deprecated use outputValues instead
     * @see outputValues
     */
    getOutputFieldOkOptional<K extends keyof Outputs>(key: K): UnwrapValueOrErrors<Outputs[K]> | undefined {
      const result = this.getOutputField(key);

      if (result && result.ok) {
        return result.value;
      }

      return undefined;
    },
    getOutputFieldErrorsOptional<K extends keyof Outputs>(key: K): string[] | undefined {
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
    args: computed(() => innerState.args),
    outputs: computed(() => innerState.outputs),
    ui: computed(() => innerState.ui),
    navigationState: computed(() => innerState.navigationState),
    href: computed(() => innerState.navigationState.href),

    outputValues: computed<OutputValues<Outputs>>(() => {
      const entries = Object.entries(innerState.outputs).map(([k, vOrErr]) => [
        k,
        vOrErr.ok && vOrErr.value !== undefined ? vOrErr.value : undefined,
      ]);
      return Object.fromEntries(entries);
    }),

    outputErrors: computed<OutputErrors<Outputs>>(() => {
      const entries = Object.entries(innerState.outputs).map(([k, vOrErr]) => [k, vOrErr && !vOrErr.ok ? new MultiError(vOrErr.errors) : undefined]);
      return Object.fromEntries(entries);
    }),

    queryParams: computed(() => parseQuery<Href>(innerState.navigationState.href)),
    hasErrors: computed(() => Object.values(innerState.outputs).some((v) => !v?.ok)), // @TODO: there is middle-layer error, v sometimes is undefined
  };

  return reactive(Object.assign(methods, getters));
}

export type BaseApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof createApp<Args, Outputs, UiState, Href>>;
