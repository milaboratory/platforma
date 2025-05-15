<script lang="ts" setup>
import {
  PlAlert,
  PlBtnGhost,
  PlDropdownMulti,
  PlSlideModal,
} from '@milaboratories/uikit';
import type { PColumnPredicate } from '@platforma-sdk/model';
import {
  type PFrameHandle,
  type PlMultiSequenceAlignmentModel,
  type RowSelectionModel,
} from '@platforma-sdk/model';
import { computed, onMounted, ref } from 'vue';
import { useDataTableToolsPanelTarget } from '../PlAgDataTableToolsPanel';
import {
  useLabelColumns,
  useSequenceColumns,
  useSequenceRows,
} from './data_provider_logic';
import SequenceAlignment from './SequenceAlignment.vue';

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

const props = defineProps<{
  /**
   * Handle to PFrame created using `createPFrameForGraphs`.
   * Should contain all desired sequence and label columns.
   */
  readonly pframe: PFrameHandle | undefined;
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
  readonly rowSelectionModel?: RowSelectionModel | undefined;
}>();

// SlidePanel visibility flag
const show = ref(false);

// Teleport open button to DataTableToolsPanel after mount
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const teleportTarget = useDataTableToolsPanelTarget();

const sequenceColumns = useSequenceColumns(() => ({
  pframe: props.pframe,
  sequenceColumnPredicate: props.sequenceColumnPredicate,
}));

const labelColumns = useLabelColumns(() => ({
  pframe: props.pframe,
  sequenceColumnIds: sequenceColumns.defaults,
  labelColumnOptionPredicate: props.labelColumnOptionPredicate,
}));

const selectedSequenceColumnIds = computed({
  get: () => model.value.sequenceColumnIds ?? sequenceColumns.defaults,
  set: (value) => {
    model.value.sequenceColumnIds = value;
  },
});
const selectedLabelColumnIds = computed({
  get: () => model.value.labelColumnIds ?? labelColumns.defaults,
  set: (value) => {
    model.value.labelColumnIds = value;
  },
});

const sequenceRows = useSequenceRows(() => ({
  pframe: props.pframe,
  sequenceColumnIds: selectedSequenceColumnIds.value,
  labelColumnIds: selectedLabelColumnIds.value,
  linkerColumnPredicate: props.linkerColumnPredicate,
  rowSelectionModel: props.rowSelectionModel,
}));
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost icon="dna" @click.stop="show = true">
      Multi Alignment
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="show" width="80%" :close-on-outside-click="false">
    <template #title>Multi Alignment</template>

    <PlDropdownMulti
      v-model="selectedSequenceColumnIds"
      label="Sequence Columns"
      :options="sequenceColumns.options"
      :disabled="sequenceColumns.loading"
      clearable
    />
    <PlDropdownMulti
      v-model="selectedLabelColumnIds"
      label="Label Columns"
      :options="labelColumns.options"
      :disabled="labelColumns.loading"
      clearable
    />

    <!-- <PlAlert v-if="errorRef" type="error">
      {{ errorRef.message }}
    </PlAlert> -->
    <PlAlert v-if="sequenceRows.value.length < 2" type="warn">
      Please select at least one sequence column and two or more rows to run
      alignment
    </PlAlert>

    <SequenceAlignment v-else :rows="sequenceRows.value" />
  </PlSlideModal>
</template>
