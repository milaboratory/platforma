import { deepClone, setProp } from '@milaboratory/helpers/objects';
import type { NavigationState, BlockOutputsBase, BlockState, Platforma } from '@milaboratory/sdk-ui';
import type { UnwrapRef, Component } from 'vue';
import { reactive, nextTick, markRaw } from 'vue';
import type { UnwrapValueOrErrors, LocalState } from './types';

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export function createApp<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(state: BlockState<Args, Outputs, UiState>, platforma: Platforma<Args, Outputs, UiState, Href>, createLocalState: () => LocalState<Href>) {
  const app = reactive({
    args: state.args,
    outputs: state.outputs,
    ui: state.ui,
    navigationState: state.navigationState as NavigationState<Href>,
    cloneArgs() {
      return deepClone(this.args) as Args;
    },
    cloneNavigationState() {
      return deepClone(this.navigationState) as Mutable<NavigationState<Href>>;
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
    updateNavigationState(cb: (args: Mutable<NavigationState<Href>>) => void) {
      const newState = this.cloneNavigationState();
      cb(newState);
      platforma.setNavigationState(newState);
    },
    setArgField<K extends keyof Args>(key: K, value: Args[K]) {
      platforma.setBlockArgs(setProp(this.cloneArgs(), key, value));
    },
  });

  platforma.onStateUpdates(async (updates) => {
    updates.forEach((patch) => {
      if (patch.key === 'args') {
        app.args = patch.value as UnwrapRef<Args>;
      }

      if (patch.key === 'ui') {
        app.ui = patch.value as UnwrapRef<UiState>;
      }

      if (patch.key === 'outputs') {
        app.outputs = patch.value as UnwrapRef<Outputs>;
      }

      if (patch.key === 'navigationState') {
        app.navigationState = patch.value as UnwrapRef<NavigationState<Href>>;
      }
    });

    await nextTick(); // @todo remove
  });

  const local = createLocalState();

  return Object.assign(app, {
    routes: Object.fromEntries(
      Object.entries(local.routes).map(([href, component]) => {
        return [href, markRaw(component as Component)];
      }),
    ),
  } as LocalState<Href>);
}

export type App<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = ReturnType<typeof createApp<Args, Outputs, UiState, Href>>;
