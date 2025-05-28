<script lang="ts" setup>
import { PlAlert } from '@milaboratories/uikit';
import type {
  PColumnPredicate,
  PFrameHandle,
  PlMultiSequenceAlignmentModel,
  PlSelectionModel,
} from '@platforma-sdk/model';
import { computed, ref } from 'vue';
import {
  useLabelColumnsOptions,
  useSequenceColumnsOptions,
  useSequenceRows,
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

const sequenceRows = useSequenceRows(() => ({
  pframe: props.pFrame,
  sequenceColumnIds: selectedSequenceColumnIds.value,
  labelColumnIds: selectedLabelColumnIds.value,
  linkerColumnPredicate: props.linkerColumnPredicate,
  selection: props.selection,
}));

const settings = ref(defaultSettings);
</script>

<template>
  <PlAlert v-if="sequenceRows.length < 2" type="warn">
    Please select at least one sequence column and two or more rows to run
    alignment
  </PlAlert>
  <template v-else>
    <Toolbar
      v-model:sequence-columns="selectedSequenceColumnIds"
      v-model:label-columns="selectedLabelColumnIds"
      v-model:settings="settings"
      :sequence-column-options="sequenceColumns.options"
      :label-column-options="labelColumns.options"
    />
    <MultiSequenceAlignmentView
      :sequenceRows
      :colorScheme="settings.colorScheme"
      :consensus="settings.consensus"
      :seq-logo="settings.seqLogo"
    />
    <Legend v-if="settings.legend" />
  </template>
</template>
