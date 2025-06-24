<script lang="ts" setup>
import type { ListOptionNormalized } from '@milaboratories/uikit';
import { PlAlert, PlSplash } from '@milaboratories/uikit';
import type {
  PColumnPredicate,
  PFrameHandle,
  PlMultiSequenceAlignmentModel,
  PlSelectionModel,
} from '@platforma-sdk/model';
import { computed, onBeforeMount, reactive, ref, watchEffect } from 'vue';
import { chemicalPropertiesColorMap } from './chemical-properties';
import {
  sequenceLimit,
  useLabelColumnsOptions,
  useMarkupColumnsOptions,
  useMultipleAlignmentData,
  useSequenceColumnsOptions,
} from './data';
import Legend from './Legend.vue';
import { markupColors } from './markup';
import { runMigrations } from './migrations';
import MultiSequenceAlignmentView from './MultiSequenceAlignmentView.vue';
import { defaultSettings } from './settings';
import Toolbar from './Toolbar.vue';
import type { ColorScheme, ColorSchemeOption } from './types';

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

onBeforeMount(() => {
  runMigrations(model);
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
   * Return true if column should be shown in label columns dropdown.
   * By default, common axes of selected sequence columns are selected.
   */
  readonly labelColumnOptionPredicate?: PColumnPredicate;
  /**
   * Sometimes sequence column and label column have disjoint axes.
   * In this case you have to define `linkerColumnPredicate` to select columns
   * connecting axes of sequence and label columns.
   */
  readonly linkerColumnPredicate?: PColumnPredicate;
  /**
   * Row selection model (from `PlAgDataTableV2` or `GraphMaker`).
   * If not provided or empty, all rows will be considered selected.
   * Warning: should be forwarded as a field of `reactive` object
   */
  readonly selection?: PlSelectionModel;
}>();

const settings = ref(defaultSettings);

const sequenceColumns = reactive(useSequenceColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnPredicate: props.sequenceColumnPredicate,
})));

const selectedSequenceColumnIds = computed({
  get: () => model.value.sequenceColumnIds ?? sequenceColumns.data.defaults,
  set: (value) => {
    model.value.sequenceColumnIds = value;
  },
});

const labelColumns = reactive(useLabelColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnIds: selectedSequenceColumnIds.value,
  labelColumnOptionPredicate: props.labelColumnOptionPredicate,
})));

const selectedLabelColumnIds = computed({
  get: () => model.value.labelColumnIds ?? labelColumns.data.defaults,
  set: (value) => {
    model.value.labelColumnIds = value;
  },
});

const markupColumns = reactive(useMarkupColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnIds: selectedSequenceColumnIds.value,
})));

const multipleAlignmentData = reactive(useMultipleAlignmentData(() => ({
  pframe: props.pFrame,
  sequenceColumnIds: selectedSequenceColumnIds.value,
  labelColumnIds: selectedLabelColumnIds.value,
  markupColumnId: settings.value.colorScheme.type === 'markup'
    ? settings.value.colorScheme.columnId
    : undefined,
  linkerColumnPredicate: props.linkerColumnPredicate,
  selection: props.selection,
})));

const formatNumber = new Intl.NumberFormat('en').format;

const selectedTooManySequences = computed(
  () => props.selection && props.selection.selectedKeys.length > sequenceLimit,
);

const colorSchemeOptions = computed<ListOptionNormalized<ColorSchemeOption>[]>(
  () => [
    {
      label: 'Chemical Properties',
      value: { type: 'chemical-properties' },
    },
    {
      label: 'No Color',
      value: { type: 'no-color' },
    },
    ...markupColumns.data.map(({ label, value }) => ({
      label,
      value: {
        type: 'markup' as const,
        columnId: value,
      },
    })),
  ],
);

const colorScheme = computed<ColorScheme>(() => {
  switch (settings.value.colorScheme.type) {
    case 'no-color':
      return {
        type: 'no-color',
        colors: {},
      };
    case 'chemical-properties':
      return {
        type: 'chemical-properties',
        colors: chemicalPropertiesColorMap,
      };
    case 'markup':
      return {
        type: 'markup',
        colors: Object.fromEntries(
          Object.entries(
            multipleAlignmentData.data.markup?.labels ?? {},
          ).map(([id, label], index) => [
            id,
            { label, color: markupColors[index % markupColors.length] },
          ]),
        ),
      };
    default:
      throw new Error(`Unknown color scheme ${settings.value.colorScheme}`);
  }
});

watchEffect(() => {
  const markupColumnId = settings.value.colorScheme.type === 'markup'
    ? settings.value.colorScheme.columnId
    : undefined;
  if (
    markupColumnId
    && markupColumns.data.every(({ value }) => value !== markupColumnId)
  ) {
    settings.value.colorScheme = { type: 'no-color' };
  }
});

const error = computed(() =>
  sequenceColumns.error
  ?? labelColumns.error
  ?? markupColumns.error
  ?? multipleAlignmentData.error,
);
</script>

<template>
  <Toolbar
    v-model:sequence-columns="selectedSequenceColumnIds"
    v-model:label-columns="selectedLabelColumnIds"
    v-model:settings="settings"
    :sequence-column-options="sequenceColumns.data.options"
    :label-column-options="labelColumns.data.options"
    :color-scheme-options="colorSchemeOptions"
  />
  <PlAlert
    v-if="
      !multipleAlignmentData.loading
        && multipleAlignmentData.data.sequences.length < 2
    "
    type="warn"
    icon
  >
    Please select at least one sequence column and two or more rows to run
    alignment
  </PlAlert>
  <PlAlert v-else-if="error" type="error">
    {{ error }}
  </PlAlert>
  <template v-else>
    <PlAlert
      v-if="selectedTooManySequences"
      type="warn"
      icon
      label="Visualization is limited"
    >
      MSA visualization supports {{ formatNumber(2) }} to
      {{ formatNumber(sequenceLimit) }} sequences. Only the first
      {{ formatNumber(sequenceLimit) }} will be displayed.
    </PlAlert>
    <PlSplash
      type="transparent"
      :class="$style.splash"
      :loading="multipleAlignmentData.loading"
    >
      <template v-if="multipleAlignmentData.data.sequences.length">
        <MultiSequenceAlignmentView
          :sequence-rows="multipleAlignmentData.data.sequences"
          :label-rows="multipleAlignmentData.data.labels"
          :markup="multipleAlignmentData.data.markup"
          :colorScheme
          :consensus="settings.consensus"
          :seq-logo="settings.seqLogo"
        />
        <Legend
          v-if="
            settings.legend
              && settings.colorScheme.type !== 'no-color'
          "
          :colors="colorScheme.colors"
        />
      </template>
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
