import { platforma } from '@milaboratories/milaboratories.file-import-block.model';
import { createPlDataTableStateV2 } from '@platforma-sdk/model';
import { defineApp } from '@platforma-sdk/ui-vue';
import DataPage from './DataPage.vue';
import MainPage from './MainPage.vue';

export const sdkPlugin = defineApp(platforma, (app) => {
  app.model.args.fileExt ??= 'csv';
  app.model.ui.tableState ??= createPlDataTableStateV2();

  return {
    routes: {
      '/': () => MainPage,
      '/data': () => DataPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
