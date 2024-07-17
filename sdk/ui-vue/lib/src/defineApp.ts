import { notEmpty } from '@milaboratory/helpers/utils';
import { type BlockOutputsBase, type Platforma } from '@milaboratory/sdk-ui';
import { reactive } from 'vue';
import { createApp } from './createApp';
import type { LocalState } from './types';

export function defineApp<Args = unknown, Outputs extends BlockOutputsBase = BlockOutputsBase, UiState = unknown>(
  platforma: Platforma<Args, Outputs, UiState>,
  cb: () => LocalState,
) {
  let app: undefined | ReturnType<typeof createApp<Args, Outputs, UiState>> = undefined;

  const App = reactive({
    loaded: false,
    error: undefined as unknown,
    use() {
      return notEmpty(app, 'App is not loaded');
    },
  });

  platforma
    .loadBlockState()
    .then((state) => {
      App.loaded = true;
      app = createApp<Args, Outputs, UiState>(state, platforma, cb);
    })
    .catch((err) => {
      App.error = err;
    });

  return App;
}
