import { platforma } from '@milaboratories/milaboratories.file-import-block.model';
import { createPlDataTableStateV2 } from '@platforma-sdk/model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { toRaw, watch } from 'vue';
import DataPage from './DataPage.vue';
import MainPage from './MainPage.vue';
import { prepareSpec } from './utils/spec';

export const sdkPlugin = defineApp(platforma, (app) => {
  app.model.ui.tableState ??= createPlDataTableStateV2();

  watch(() => app.model.ui, (state) => {
    app.model.args.fileHandle = state.fileHandle;
    app.model.args.fileExt = state.fileHandle?.includes('.csv')
      ? 'csv'
      : state.fileHandle?.includes('.tsv')
        ? 'tsv'
        : undefined;

    app.model.args.spec = state.spec ? prepareSpec(toRaw(state.spec)) : undefined;
  }, { deep: true, immediate: true });

  return {
    routes: {
      '/': () => MainPage,
      '/data': () => DataPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
