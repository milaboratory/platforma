import { platforma } from '@milaboratories/milaboratories.ui-examples.model';
import { animate, defineApp, makeEaseOut } from '@platforma-sdk/ui-vue';
import { computed, reactive, ref } from 'vue';
import LogViewPage from './pages/LogViewPage.vue';
import ModalsPage from './pages/ModalsPage.vue';
import InjectEnvPage from './pages/InjectEnvPage.vue';
import DropdownsPage from './pages/DropdownsPage.vue';
import UseWatchFetchPage from './pages/UseWatchFetchPage.vue';
import FormComponentsPage from './pages/FormComponentsPage.vue';
import TypographyPage from './pages/TypographyPage.vue';
import AgGridVuePage from './pages/AgGridVuePage.vue';
import SelectFilesPage from './pages/SelectFilesPage.vue';
import ErrorsPage from './pages/ErrorsPage.vue';
import PlAgDataTablePage from './pages/PlAgDataTablePage.vue';
import IconsPage from './pages/IconsPage.vue';
import PlTextFieldPage from './pages/PlTextFieldPage.vue';
import PlTabsPage from './pages/PlTabsPage.vue';
import DraftsPage from './pages/DraftsPage.vue';
import LayoutPage from './pages/LayoutPage.vue';

export const sdkPlugin = defineApp(platforma, (base) => {
  // Additional data
  const data = reactive({
    counter: 0
  });

  function incrementCounter() {
    data.counter++;
  }

  const argsAsJson = computed(() => JSON.stringify(base.snapshot.args));

  const progressRef = ref<boolean | number>();

  function showLoader(duration: number) {
    progressRef.value = true;
    setTimeout(() => (progressRef.value = false), duration);
  }

  function showProgress(duration: number) {
    progressRef.value = 0;
    animate({
      duration,
      timing: makeEaseOut((t) => t),
      draw: (progress) => {
        progressRef.value = progress;
      }
    });
  }

  return {
    data,
    incrementCounter,
    argsAsJson,
    showInfiniteProgress: showLoader,
    showProgress,
    progress: () => {
      return progressRef.value;
    },
    routes: {
      '/': () => IconsPage,
      '/layout': () => LayoutPage,
      '/log-view': () => LogViewPage,
      '/modals': () => ModalsPage,
      '/inject-env': () => InjectEnvPage,
      '/dropdowns': () => DropdownsPage,
      '/use-watch-fetch': () => UseWatchFetchPage,
      '/form-components': () => FormComponentsPage,
      '/typography': () => TypographyPage,
      '/ag-grid-vue': () => AgGridVuePage,
      '/pl-ag-data-table': () => PlAgDataTablePage,
      '/select-files': () => SelectFilesPage,
      '/errors': () => ErrorsPage,
      '/text-fields': () => PlTextFieldPage,
      '/tabs': () => PlTabsPage,
      '/drafts': () => DraftsPage
    }
  };
});

export const useApp = sdkPlugin.useApp;
