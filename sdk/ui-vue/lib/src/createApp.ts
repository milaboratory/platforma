import { deepClone, setProp } from '@milaboratory/helpers/objects';
import { type BlockOutputsBase, type BlockState, type Platforma } from '@milaboratory/sdk-ui';
import type { UnwrapRef, DeepReadonly } from 'vue';
import { reactive, nextTick } from 'vue';
import type { UnwrapValueOrErrors, Routes, LocalState } from './types';

export function createApp<Args = unknown, Outputs extends BlockOutputsBase = BlockOutputsBase, UiState = unknown>(
  state: BlockState<Args, Outputs, UiState>,
  platforma: Platforma<Args, Outputs, UiState>,
  cb: () => LocalState,
) {
  type ReadonlyArgs = DeepReadonly<Args>;

  const app = reactive({
    args: state.args as ReadonlyArgs,
    outputs: state.outputs,
    ui: state.ui,
    navigationState: {
      href: '/',
    },
    cloneArgs() {
      return deepClone(this.args) as Args;
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

  return Object.assign(app, cb());
}
