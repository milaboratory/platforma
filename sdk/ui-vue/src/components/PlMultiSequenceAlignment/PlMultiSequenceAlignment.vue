<script lang="ts" setup>
import { isJsonEqual } from '@milaboratories/helpers';
import {
  type ListOptionNormalized,
  PlAlert,
  PlSplash,
} from '@milaboratories/uikit';
import {
  getRawPlatformaInstance,
  type PColumnPredicate,
  type PFrameHandle,
  type PlMultiSequenceAlignmentColorSchemeOption,
  type PlMultiSequenceAlignmentModel,
  type PlMultiSequenceAlignmentSettings,
  type PlSelectionModel,
} from '@platforma-sdk/model';
import {
  computed,
  onBeforeMount,
  onUnmounted,
  reactive,
  useCssModule,
  useTemplateRef,
  watchEffect,
} from 'vue';
import {
  SEQUENCE_LIMIT,
  useLabelColumnsOptions,
  useMarkupColumnsOptions,
  useMultipleAlignmentData,
  useSequenceColumnsOptions,
} from './data';
import { runMigrations } from './migrations';
import MultiSequenceAlignmentView from './MultiSequenceAlignmentView.vue';
import { defaultSettings } from './settings';
import Toolbar from './Toolbar.vue';

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

onBeforeMount(() => {
  runMigrations(model);
});

const settings = reactive<PlMultiSequenceAlignmentSettings>({
  ...defaultSettings,
});

const props = defineProps<{
  /**
   * Handle to PFrame created using `createPFrameForGraphs`.
   * Should contain all desired sequence and label columns.
   */
  readonly pFrame: PFrameHandle | undefined;
  /**
   * Return true if column should be shown in sequence columns dropdown.
   * By default, all sequence columns are selected.
   */
  readonly sequenceColumnPredicate: PColumnPredicate;
  /**
   * Row selection model (from `PlAgDataTableV2` or `GraphMaker`).
   * If not provided or empty, all rows will be considered selected.
   * Warning: should be forwarded as a field of `reactive` object
   */
  readonly selection?: PlSelectionModel;
}>();

const classes = useCssModule();

const sequenceColumns = reactive(useSequenceColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnPredicate: props.sequenceColumnPredicate,
})));

const labelColumns = reactive(useLabelColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnIds: settings.sequenceColumnIds,
})));

const markupColumns = reactive(useMarkupColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnIds: settings.sequenceColumnIds,
})));

const multipleAlignmentData = reactive(useMultipleAlignmentData(() => ({
  pFrame: props.pFrame,
  sequenceColumnIds: settings.sequenceColumnIds,
  labelColumnIds: settings.labelColumnIds,
  selection: props.selection,
  colorScheme: settings.colorScheme,
  alignmentParams: settings.alignmentParams,
  shouldBuildPhylogeneticTree: settings.widgets.includes('tree'),
})));

const formatNumber = new Intl.NumberFormat('en').format;

const colorSchemeOptions = computed<
  ListOptionNormalized<PlMultiSequenceAlignmentColorSchemeOption>[]
>(
  () => [
    {
      label: 'Chemical Properties',
      value: { type: 'chemical-properties' },
    },
    {
      label: 'No Color',
      value: { type: 'no-color' },
    },
    ...(markupColumns.data ?? []).map(({ label, value }) => ({
      label,
      value: {
        type: 'markup' as const,
        columnIds: value,
      },
    })),
  ],
);

const error = computed(() =>
  sequenceColumns.error
  ?? labelColumns.error
  ?? markupColumns.error
  ?? multipleAlignmentData.error,
);

function applySettings(
  settingsPatch: Partial<PlMultiSequenceAlignmentSettings>,
) {
  model.value = Object.fromEntries(
    Object.entries({ ...model.value, ...settingsPatch })
      .filter(([_key, value]) => value !== undefined),
  );
}

watchEffect(() => {
  const patch: Partial<PlMultiSequenceAlignmentSettings> = Object.fromEntries(
    Object.entries({
      ...defaultSettings,
      sequenceColumnIds: sequenceColumns.data?.defaults,
      labelColumnIds: labelColumns.data?.defaults,
      ...model.value,
    }).filter(([key, value]) =>
      !isJsonEqual(
        settings[key as keyof PlMultiSequenceAlignmentSettings],
        value,
      ),
    ),
  );
  Object.assign(settings, patch);
});

// Reset stale settings
watchEffect(() => {
  const settingsToReset: (keyof PlMultiSequenceAlignmentSettings)[] = [];
  if (
    !sequenceColumns.isLoading
    && settings.sequenceColumnIds?.some((id) =>
      (sequenceColumns.data?.options ?? []).every(
        ({ value }) => !isJsonEqual(value, id),
      ),
    )
  ) {
    settingsToReset.push('sequenceColumnIds');
  }
  if (
    !labelColumns.isLoading
    && settings.labelColumnIds?.some((id) =>
      (labelColumns.data?.options ?? []).every(
        ({ value }) => !isJsonEqual(value, id),
      ),
    )
  ) {
    settingsToReset.push('labelColumnIds');
  }

  const markupColumnIds = settings.colorScheme?.type === 'markup'
    ? settings.colorScheme.columnIds
    : undefined;

  if (
    !markupColumns.isLoading
    && markupColumnIds
    && (markupColumns.data ?? []).every(
      ({ value }) => !isJsonEqual(value, markupColumnIds),
    )
  ) {
    settingsToReset.push('colorScheme');
  }
  if (settingsToReset.length) {
    applySettings(Object.fromEntries(
      settingsToReset.map((key) => [key, undefined]),
    ));
  }
});

const msaEl = useTemplateRef('msa');

async function exportPdf() {
  const exportToPdf = getRawPlatformaInstance()?.lsDriver
    ?.exportToPdf;
  if (!exportToPdf) {
    return console.error(
      'API getPlatformaRawInstance().lsDriver.exportToPdf is not available',
    );
  }
  const msaRoot = msaEl.value?.rootEl;
  if (!msaRoot) {
    throw new Error('MSA element is not available.');
  }
  const printTarget = document.createElement('div');
  printTarget.id = `print-target-${crypto.randomUUID()}`;
  const printStyleSheet = new CSSStyleSheet();
  document.adoptedStyleSheets.push(printStyleSheet);
  printStyleSheet.insertRule(`
@media screen {
  #${printTarget.id} {
    visibility: hidden;
    position: fixed;
  }
}`);
  const msaClone = msaRoot.cloneNode(true) as HTMLElement;
  msaClone.dataset.prePrint = '';
  printTarget.replaceChildren(msaClone);
  document.body.appendChild(printTarget);
  const { height, width } = printTarget.getBoundingClientRect();
  const margin = CSS.cm(1);
  const pageSize = [width, height]
    .map((value) => CSS.px(value).add(margin.mul(2)))
    .join(' ');
  printStyleSheet.insertRule(`
@media print {
  @page {
    size: ${pageSize};
    margin: ${margin};
  }
  body > :not(#${printTarget.id}) {
    display: none;
  }
}`);
  try {
    await exportToPdf();
  } catch (error) {
    console.error(error);
  } finally {
    document.body.removeChild(printTarget);
    const index = document.adoptedStyleSheets.indexOf(printStyleSheet);
    if (index >= 0) {
      document.adoptedStyleSheets.splice(index, 1);
    }
  }
}

onUnmounted(() => {
  multipleAlignmentData.data = undefined;
});
</script>

<template>
  <Toolbar
    :settings="settings"
    :sequence-column-options="sequenceColumns.data?.options"
    :label-column-options="labelColumns.data?.options"
    :color-scheme-options="colorSchemeOptions"
    @update-settings="applySettings"
    @export="exportPdf"
  />
  <PlAlert v-if="error" type="error">
    {{ error }}
  </PlAlert>
  <PlAlert
    v-else-if="!multipleAlignmentData.isLoading && !multipleAlignmentData.data"
    type="warn"
    icon
  >
    Please select at least one sequence column and two or more rows to run
    alignment
  </PlAlert>
  <template v-else>
    <PlAlert
      v-if="multipleAlignmentData.data?.exceedsLimit"
      type="warn"
      icon
      label="Visualization is limited"
    >
      MSA visualization supports {{ formatNumber(2) }} to
      {{ formatNumber(SEQUENCE_LIMIT) }} sequences. Only the first
      {{ formatNumber(SEQUENCE_LIMIT) }} will be displayed.
    </PlAlert>
    <PlSplash
      type="transparent"
      :class="classes.splash"
      :loading="multipleAlignmentData.isLoading"
    >
      <MultiSequenceAlignmentView
        v-if="multipleAlignmentData.data"
        ref="msa"
        :sequences="multipleAlignmentData.data.sequences"
        :labels="multipleAlignmentData.data.labels"
        :highlight-legend="multipleAlignmentData.data.highlightLegend"
        :phylogenetic-tree="multipleAlignmentData.data.phylogeneticTree"
        :widgets="settings.widgets"
      />
    </PlSplash>
  </template>
</template>

<style module>
.splash {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
</style>
