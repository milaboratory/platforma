<script lang="ts" setup>
import { PlAlert, PlSplash } from '@milaboratories/uikit';
import type {
  PColumnPredicate,
  PFrameHandle,
  PlMultiSequenceAlignmentModel,
  PlSelectionModel,
} from '@platforma-sdk/model';
import { computed, reactive, ref } from 'vue';
import {
  sequenceLimit,
  useLabelColumnsOptions,
  useMultipleAlignmentData,
  useSequenceColumnsOptions,
} from './data';
import Legend from './Legend.vue';
import MultiSequenceAlignmentView from './MultiSequenceAlignmentView.vue';
import { defaultSettings } from './settings';
import Toolbar from './Toolbar.vue';

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

const multipleAlignmentData = reactive(useMultipleAlignmentData(() => ({
  pframe: props.pFrame,
  sequenceColumnIds: selectedSequenceColumnIds.value,
  labelColumnIds: selectedLabelColumnIds.value,
  linkerColumnPredicate: props.linkerColumnPredicate,
  selection: props.selection,
})));

const settings = ref(defaultSettings);

const formatNumber = new Intl.NumberFormat('en').format;

const selectedTooManySequences = computed(
  () => props.selection && props.selection.selectedKeys.length > sequenceLimit,
);
</script>

<template>
  <Toolbar
    v-model:sequence-columns="selectedSequenceColumnIds"
    v-model:label-columns="selectedLabelColumnIds"
    v-model:settings="settings"
    :sequence-column-options="sequenceColumns.options"
    :label-column-options="labelColumns.options"
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
  <template v-else>
    <PlAlert
      v-if="selectedTooManySequences"
      type="warn"
      icon
      label="Visualization is limited"
    >
      MSA visualization supports {{ formatNumber(2) }} to
      {{ formatNumber(sequenceLimit) }} sequences. Only the first
      {{ formatNumber(sequenceLimit) }} will be desplayed.
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
          :colorScheme="settings.colorScheme"
          :consensus="settings.consensus"
          :seq-logo="settings.seqLogo"
        />
        <Legend v-if="settings.legend" />
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
