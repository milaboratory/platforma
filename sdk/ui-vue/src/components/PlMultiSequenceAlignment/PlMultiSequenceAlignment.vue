<script lang="ts" setup>
import {
  PlAlert,
  PlBtnGhost,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlSlideModal,
} from '@milaboratories/uikit';
import type {
  PColumnPredicate,
  PFrameHandle,
  PlMultiSequenceAlignmentModel,
  PlSelectionModel,
} from '@platforma-sdk/model';
import { computed, onMounted, reactive, ref } from 'vue';
import { useDataTableToolsPanelTarget } from '../PlAgDataTableToolsPanel';
import {
  useLabelColumnsOptions,
  useSequenceColumnsOptions,
  useSequenceRows,
} from './data';
import {
  chemicalCategories,
  chemicalPropertiesColors,
  chemicalPropertiesLabels,
} from './highlight/chemical-properties';
import MultiSequenceAlignmentView from './MultiSequenceAlignmentView.vue';
import type { ColorScheme } from './types';

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

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

// SlidePanel visibility flag
const show = ref(false);

// Teleport open button to DataTableToolsPanel after mount
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const teleportTarget = useDataTableToolsPanelTarget();

const sequenceColumns = useSequenceColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnPredicate: props.sequenceColumnPredicate,
}));

const labelColumns = useLabelColumnsOptions(() => ({
  pFrame: props.pFrame,
  sequenceColumnIds: sequenceColumns.value.defaults,
  labelColumnOptionPredicate: props.labelColumnOptionPredicate,
}));

const selectedSequenceColumnIds = computed({
  get: () => model.value.sequenceColumnIds ?? sequenceColumns.value.defaults,
  set: (value) => {
    model.value.sequenceColumnIds = value;
  },
});

const selectedLabelColumnIds = computed({
  get: () => model.value.labelColumnIds ?? labelColumns.value.defaults,
  set: (value) => {
    model.value.labelColumnIds = value;
  },
});

const sequenceRows = useSequenceRows(() => ({
  pframe: props.pFrame,
  sequenceColumnIds: selectedSequenceColumnIds.value,
  labelColumnIds: selectedLabelColumnIds.value,
  linkerColumnPredicate: props.linkerColumnPredicate,
  selection: props.selection,
}));

const settings = reactive({
  colorScheme: 'chemical-properties' as ColorScheme,
  seqLogo: true,
  noColor: false,
  legend: true,
});
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost icon="dna" @click.stop="show = true">
      Multi Alignment
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="show" width="100%" :close-on-outside-click="false">
    <template #title>Multiple Sequence Alignment</template>

    <div :class="$style.toolbar">
      <div :class="$style['toolbar-line']">
        <div :class="$style['toolbar-section']">
          <PlDropdownMulti
            v-model="selectedSequenceColumnIds"
            label="Sequence Columns"
            :options="sequenceColumns.options"
            :disabled="!sequenceColumns.options.length"
            clearable
          />
          <PlDropdownMulti
            v-model="selectedLabelColumnIds"
            label="Label Columns"
            :options="labelColumns.options"
            :disabled="!labelColumns.options.length"
            clearable
          />
          <PlDropdown
            v-model="settings.colorScheme"
            label="Color Scheme"
            :options="
              [{
                label: 'Chemical Properties',
                value: 'chemical-properties',
              }]
            "
            disabled
          />
        </div>
        <div :class="$style['toolbar-buttons']">
          <PlBtnGhost icon="settings">Settings</PlBtnGhost>
          <PlBtnGhost icon="export">Export</PlBtnGhost>
        </div>
      </div>
      <div :class="$style['toolbar-line']">
        <div :class="$style['toolbar-section']">
          <PlCheckbox v-model="settings.seqLogo">Seq logo</PlCheckbox>
          <PlCheckbox :model-value="false" disabled>Histogram</PlCheckbox>
          <PlCheckbox :model-value="false" disabled>Navigator</PlCheckbox>
          <PlCheckbox :model-value="false" disabled>Tree</PlCheckbox>
          <PlCheckbox v-model="settings.noColor">No Color</PlCheckbox>
          <PlCheckbox v-model="settings.legend">Legend</PlCheckbox>
        </div>
      </div>
    </div>
    <PlAlert v-if="sequenceRows.length < 2" type="warn">
      Please select at least one sequence column and two or more rows to run
      alignment
    </PlAlert>

    <MultiSequenceAlignmentView
      v-else
      :sequenceRows="sequenceRows"
      :colorScheme="settings.noColor ? undefined : settings.colorScheme"
      :seq-logo="settings.seqLogo"
    />

    <div v-if="settings.legend" :class="$style.legend">
      <div
        v-for="category in chemicalCategories"
        :key="category"
        :class="$style['legend-item']"
      >
        <div
          :class="$style['color-sample']"
          :style="{ backgroundColor: chemicalPropertiesColors[category] }"
        />
        {{ chemicalPropertiesLabels[category] }}
      </div>
    </div>
  </PlSlideModal>
</template>

<style module>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.toolbar-line {
  display: flex;
  justify-content: space-between;
}

.toolbar-section {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.toolbar-buttons {
  display: flex;
}

.legend {
  margin-block-start: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.legend-item {
  display: flex;
  gap: 4px;
}

.color-sample {
  display: inline-block;
  block-size: 18px;
  inline-size: 18px;
  border-radius: 3px;
}
</style>
