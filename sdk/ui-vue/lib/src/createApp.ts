import { deepClone, setProp } from '@milaboratory/helpers/objects';
import type { BlockOutputsBase, BlockState, Platforma } from '@milaboratory/sdk-ui';
import type { UnwrapRef, DeepReadonly } from 'vue';
import { reactive, nextTick, computed, ref } from 'vue';
import { ZodError } from 'zod';
import type { UnwrapValueOrErrors, ModelOptions, Model } from './types';

const identity = <T, V = T>(v: T): V => v as unknown as V;

const ensureError = (cause: unknown) => {
  if (cause instanceof Error) {
    return cause;
  }

  return Error(String(cause));
};

const isZodError = (err: Error): err is ZodError => {
  return err.name === 'ZodError';
};

export function createApp<Args = unknown, Outputs extends BlockOutputsBase = BlockOutputsBase, UiState = unknown>(
  state: BlockState<Args, Outputs, UiState>,
  platforma: Platforma<Args, Outputs, UiState>,
) {
  type ReadonlyArgs = DeepReadonly<Args>;

  const app = reactive({
    args: state.args as ReadonlyArgs,
    outputs: state.outputs,
    ui: state.ui,
    cloneArgs() {
      return deepClone(this.args) as Args;
    },
    createModel<M, V = unknown>(options: ModelOptions<M, V>): Model<M> {
      const validate = options.validate ?? identity;

      const { autoSave } = options;

      const error = ref<Error | undefined>();

      const localValue = ref<M>();

      const save = () => {
        if (localValue.value) {
          options.onSave(validate(localValue.value));
        }
      };

      const modelValue = computed({
        get: () => {
          if (localValue.value !== undefined) {
            return localValue.value;
          }

          return options.get();
        },
        set(v) {
          localValue.value = v;
          error.value = undefined;
          console.log('flush error');
          try {
            validate(v);
            if (autoSave) {
              save();
            }
          } catch (cause: unknown) {
            const err = ensureError(cause);
            console.log('err instanceof ZodError', err instanceof ZodError);
            if (isZodError(err)) {
              error.value = Error(err.format()._errors.join(',')); // @todo temp
            } else {
              error.value = err as Error; // @todo ensureError
            }
          }
        },
      });

      const valid = computed(() => !error.value);

      const isChanged = computed(() => localValue.value !== undefined);

      const errorString = computed(() => (error.value ? error.value.message : ''));

      return reactive({
        modelValue,
        valid,
        isChanged,
        error,
        errorString,
        save,
      });
    },
    getOutputField(key: keyof Outputs) {
      return this.outputs[key];
    },
    getOutputFieldOkOptional<K extends keyof Outputs>(key: K): UnwrapValueOrErrors<Outputs[K]> | undefined {
      const result = this.getOutputField(key);

      if (result.ok) {
        return result.value;
      }

      return undefined;
    },
    getOutputFieldErrorsOptional<K extends keyof Outputs>(key: K): UnwrapValueOrErrors<Outputs[K]> | undefined {
      const result = this.getOutputField(key);

      if (result.ok) {
        return result.value as UnwrapValueOrErrors<Outputs[K]>;
      }

      return undefined;
    },
    updateArgs(cb: (args: Args) => void) {
      const newArgs = this.cloneArgs();
      cb(newArgs);
      platforma.setBlockArgs(newArgs);
    },
    setArgField<K extends keyof Args>(key: K, value: Args[K]) {
      platforma.setBlockArgs(setProp(this.cloneArgs(), key, value));
    },
  });

  platforma.onStateUpdates(async (updates) => {
    updates.forEach((patch) => {
      if (patch.key === 'args') {
        app.args = patch.value as UnwrapRef<ReadonlyArgs>;
      }

      if (patch.key === 'ui') {
        app.ui = patch.value as UnwrapRef<UiState>;
      }

      if (patch.key === 'outputs') {
        app.outputs = patch.value as UnwrapRef<Outputs>;
      }
    });

    await nextTick(); // @todo remove
  });

  return app;
}
