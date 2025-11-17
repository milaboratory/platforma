import { uniqueId } from '@milaboratories/helpers';
import { platforma } from '@milaboratories/milaboratories.ui-examples.model';
import { animate, defineApp, makeEaseOut } from '@platforma-sdk/ui-vue';
import { computed, reactive, ref } from 'vue';
import AddSectionPage from './pages/AddSectionPage.vue';
import AdvancedFilterPage from './pages/PlAdvancedFilterPage.vue';
import { AgGridVuePage, AgGridVuePageWithBuilder } from './pages/AgGridVuePage';
import ButtonsPage from './pages/ButtonsPage.vue';
import DownloadsPage from './pages/DownloadsPage.vue';
import DraftsPage from './pages/DraftsPage.vue';
import ErrorsPage from './pages/ErrorsPage.vue';
import { FormComponentsPage } from './pages/FormComponentsPage';
import { HistogramPage } from './pages/HistogramPage';
import IconsPage from './pages/IconsPage.vue';
import InjectEnvPage from './pages/InjectEnvPage.vue';
import LayoutPage from './pages/LayoutPage.vue';
import LoadersPage from './pages/LoadersPage.vue';
import LogViewPage from './pages/LogViewPage.vue';
import ModalsPage from './pages/ModalsPage.vue';
import NotificationsPage from './pages/NotificationsPage.vue';
import PlAgDataTableV2Page from './pages/PlAgDataTableV2Page.vue';
import PlAnnotationPage from './pages/PlAnnotationPage.vue';
import PlAutocompleteMultiPage from './pages/PlAutocompleteMultiPage/index.vue';
import PlAutocompletePage from './pages/PlAutocompletePage.vue';
import PlElementListPage from './pages/PlElementListPage.vue';
import PlErrorBoundaryPage from './pages/PlErrorBoundaryPage.vue';
import PlFileInputPage from './pages/PlFileInputPage.vue';
import PlNumberFieldPage from './pages/PlNumberFieldPage.vue';
import PlSplashPage from './pages/PlSplashPage.vue';
import PlTabsPage from './pages/PlTabsPage.vue';
import PlTextFieldPage from './pages/PlTextFieldPage.vue';
import RadioPage from './pages/RadioPage.vue';
import SectionPage from './pages/SectionPage.vue';
import SelectFilesPage from './pages/SelectFilesPage.vue';
import { StackedBarPage } from './pages/StackedBarPage';
import StatePage from './pages/StatePage.vue';
import TypographyPage from './pages/TypographyPage.vue';
import UseWatchFetchPage from './pages/UseWatchFetchPage.vue';

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
      '/state': () => StatePage,
      '/layout': () => LayoutPage,
      '/log-view': () => LogViewPage,
      '/modals': () => ModalsPage,
      '/inject-env': () => InjectEnvPage,
      '/use-watch-fetch': () => UseWatchFetchPage,
      '/form-components': () => FormComponentsPage,
      '/typography': () => TypographyPage,
      '/ag-grid-vue': () => AgGridVuePage,
      '/ag-grid-vue-with-builder': () => AgGridVuePageWithBuilder,
      '/pl-annotations': () => PlAnnotationPage,
      '/pl-ag-data-table-v2': () => PlAgDataTableV2Page,
      '/pl-splash-page': () => PlSplashPage,
      '/pl-file-input-page': () => PlFileInputPage,
      '/pl-number-field-page': () => PlNumberFieldPage,
      '/pl-error-boundary-page': () => PlErrorBoundaryPage,
      '/pl-element-list-page': () => PlElementListPage,
      '/select-files': () => SelectFilesPage,
      '/text-fields': () => PlTextFieldPage,
      '/tabs': () => PlTabsPage,
      '/drafts': () => DraftsPage,
      '/pl-autocomplete': () => PlAutocompletePage,
      '/pl-autocomplete-multi': () => PlAutocompleteMultiPage,
      '/buttons': () => ButtonsPage,
      '/notifications': () => NotificationsPage,
      '/errors': () => ErrorsPage,
      '/downloads': () => DownloadsPage,
      '/stacked-bar': () => StackedBarPage,
      '/histogram': () => HistogramPage,
      '/loaders': () => LoadersPage,
      '/add-section': () => AddSectionPage,
      '/section': () => SectionPage,
      '/radio': () => RadioPage,
      '/advanced-filter': () => AdvancedFilterPage,
    },
  };
}, {
  debug: false,
});

export const useApp = sdkPlugin.useApp;
