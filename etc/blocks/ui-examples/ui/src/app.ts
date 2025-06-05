import { platforma } from '@milaboratories/milaboratories.ui-examples.model';
import { animate, defineApp, makeEaseOut } from '@platforma-sdk/ui-vue';
import { computed, reactive, ref } from 'vue';
import LogViewPage from './pages/LogViewPage.vue';
import ModalsPage from './pages/ModalsPage.vue';
import InjectEnvPage from './pages/InjectEnvPage.vue';
import UseWatchFetchPage from './pages/UseWatchFetchPage.vue';
import TypographyPage from './pages/TypographyPage.vue';
import { AgGridVuePage, AgGridVuePageWithBuilder } from './pages/AgGridVuePage';
import SelectFilesPage from './pages/SelectFilesPage.vue';
import ErrorsPage from './pages/ErrorsPage.vue';
import PlAgDataTablePage from './pages/PlAgDataTablePage.vue';
import PlAgDataTableV2Page from './pages/PlAgDataTableV2Page.vue';
import IconsPage from './pages/IconsPage.vue';
import PlTextFieldPage from './pages/PlTextFieldPage.vue';
import PlTabsPage from './pages/PlTabsPage.vue';
import DraftsPage from './pages/DraftsPage.vue';
import LayoutPage from './pages/LayoutPage.vue';
import ButtonsPage from './pages/ButtonsPage.vue';
import NotificationsPage from './pages/NotificationsPage.vue';
import LoadersPage from './pages/LoadersPage.vue';
import AddSectionPage from './pages/AddSectionPage.vue';
import { uniqueId } from '@milaboratories/helpers';
import SectionPage from './pages/SectionPage.vue';
import { FormComponentsPage } from './pages/FormComponentsPage';
import { HistogramPage } from './pages/HistogramPage';
import { StackedBarPage } from './pages/StackedBarPage';
import PlSplashPage from './pages/PlSplashPage.vue';
import PlAutocompletePage from './pages/PlAutocompletePage.vue';
import RadioPage from './pages/RadioPage.vue';
import PlFileInputPage from './pages/PlFileInputPage.vue';
import PlErrorBoundaryPage from './pages/PlErrorBoundaryPage.vue';

export const sdkPlugin = defineApp(platforma, (app) => {
  // Additional data
  const data = reactive({
    counter: 0,
  });

  function incrementCounter() {
    data.counter++;
  }

  const argsAsJson = computed(() => JSON.stringify(app.snapshot.args));

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
      },
    });
  }

  function createSection(label: string) {
    const id = uniqueId();
    app.model.ui.dynamicSections.push({
      id,
      label,
    });
    return id;
  }

  return {
    data,
    incrementCounter,
    argsAsJson,
    showInfiniteProgress: showLoader,
    showProgress,
    createSection,
    progress: () => {
      return progressRef.value;
    },
    routes: {
      '/': () => IconsPage,
      '/layout': () => LayoutPage,
      '/log-view': () => LogViewPage,
      '/modals': () => ModalsPage,
      '/inject-env': () => InjectEnvPage,
      '/use-watch-fetch': () => UseWatchFetchPage,
      '/form-components': () => FormComponentsPage,
      '/typography': () => TypographyPage,
      '/ag-grid-vue': () => AgGridVuePage,
      '/ag-grid-vue-with-builder': () => AgGridVuePageWithBuilder,
      '/pl-ag-data-table': () => PlAgDataTablePage,
      '/pl-ag-data-table-v2': () => PlAgDataTableV2Page,
      '/pl-splash-page': () => PlSplashPage,
      '/pl-file-input-page': () => PlFileInputPage,
      '/pl-error-boundary-page': () => PlErrorBoundaryPage,
      '/select-files': () => SelectFilesPage,
      '/errors': () => ErrorsPage,
      '/text-fields': () => PlTextFieldPage,
      '/tabs': () => PlTabsPage,
      '/drafts': () => DraftsPage,
      '/pl-autocomplete': () => PlAutocompletePage,
      '/buttons': () => ButtonsPage,
      '/notifications': () => NotificationsPage,
      '/stacked-bar': () => StackedBarPage,
      '/histogram': () => HistogramPage,
      '/loaders': () => LoadersPage,
      '/add-section': () => AddSectionPage,
      '/section': () => SectionPage,
      '/radio': () => RadioPage,
    },
  };
}, {
  debug: true,
  deepPatchModel: true,
});

export const useApp = sdkPlugin.useApp;
