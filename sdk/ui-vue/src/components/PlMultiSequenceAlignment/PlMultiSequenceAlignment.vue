<script lang="ts" setup>
import type {
  Ref,
} from 'vue';
import {
  ref,
  onMounted,
  computed,
  watch,
  readonly,
  toRaw,
  toValue,
} from 'vue';
import {
  PlAlert,
  PlBtnGhost,
  PlBtnPrimary,
  PlSlideModal,
  PlDropdownMulti,
} from '@milaboratories/uikit';
import type {
  PColumnPredicate,
} from '@platforma-sdk/model';
import {
  type PlMultiSequenceAlignmentModel,
  type PFrameHandle,
  type RowSelectionModel,
} from '@platforma-sdk/model';
import {
  useDataTableToolsPanelTarget,
} from '../PlAgDataTableToolsPanel';
import type {
  AlignmentRow,
  SequenceRow,
} from './types';
import {
  useColumns,
  useSequenceRows,
} from './data_provider_logic';
import SequenceAlignment from './SequenceAlignment.vue';
import {
  WorkerManager,
} from './wm';

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

const props = defineProps<{
  /**
   * Handle to PFrame created using `createPFrameForGraphs`
   * Should contain all desired sequence and label columns
   */
  readonly pframe: PFrameHandle | undefined;
  /**
   * Return true if column should be shown in sequence columns dropdown
   * By default, all sequence columns are selected
   */
  readonly sequenceColumnPredicate: PColumnPredicate;
  /**
   * Return true if column should be shown in label columns dropdown
   * By default, common axes of selected sequence columns are selected
   */
  readonly labelColumnOptionPredicate?: PColumnPredicate;
  /**
   * Sometimes sequence column and label column have disjoint axes
   * In this case you have to define `linkerColumnPredicate` to select
   * columns connecting axes of sequence and label columns.
   */
  readonly linkerColumnPredicate?: PColumnPredicate;
  /**
   * Row selection model (from `PlAgDataTableV2` or `GraphMaker`)
   * If not provided or empty, all rows will be considered selected
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

// Loading data from PFrame
const loadingRef = ref(true);
// Make sure pframe is reactive
const pframeRef = computed(() => props.pframe);
// Update dropdown options on pframe update
const { sequenceColumnsRef, labelColumnsRef } = useColumns({
  pframe: pframeRef,
  sequenceColumnPredicate: props.sequenceColumnPredicate,
  labelColumnOptionPredicate: props.labelColumnOptionPredicate,
  loading: loadingRef,
});
// Make sure sequenceColumnsIds and labelColumnsIds are reactive
const sequenceColumnsIdsRef = computed({
  get: () => model.value.sequenceColumnsIds ?? sequenceColumnsRef.value.defaults,
  set: (value) => {
    model.value.sequenceColumnsIds = value;
  },
});
const labelColumnsIdsRef = computed({
  get: () => model.value.labelColumnsIds ?? labelColumnsRef.value.defaults,
  set: (value) => {
    model.value.labelColumnsIds = value;
  },
});
// Make sure rowSelectionModel is reactive
const rowSelectionModelRef = computed(() => props.rowSelectionModel);
// Update sequence rows on dropdown selection change
const { sequenceRowsRef } = useSequenceRows({
  pframe: pframeRef,
  sequenceColumnsIds: sequenceColumnsIdsRef,
  labelColumnsIds: labelColumnsIdsRef,
  linkerColumnPredicate: props.linkerColumnPredicate,
  rowSelectionModel: rowSelectionModelRef,
  loading: loadingRef,
});

// TODO: move to a separate file
function useAlignment(sequenceRowsRef: Ref<SequenceRow[]>) {
// Reset alignment state on sequence rows update
  const isAlignedRef = ref(false);
  // TODO: compare only sequence rows, ignore changes in label columns
  watch(() => sequenceRowsRef.value, () => isAlignedRef.value = false);

  // Alignment in progress
  const aligningRef = ref(false);
  // Alignment error
  const errorRef = ref<Error | null>(null);
  // Alignment result
  const alignmentRef = ref<AlignmentRow[]>([]);

  // Worker manager
  const wm = new WorkerManager();
  // Alignment generation counter
  let alignmentGeneration = 0;
  const runAlignment = async () => {
    const sequenceRows = toRaw(sequenceRowsRef.value);
    if (sequenceRows.length === 0) return;

    const generation = alignmentGeneration = alignmentGeneration + 1;
    aligningRef.value = true;
    errorRef.value = null;
    try {
      const result = await wm.align({ sequenceRows });
      if (generation !== alignmentGeneration) return;

      alignmentRef.value = result.result;
      isAlignedRef.value = true;
    } catch (err) {
      if (generation !== alignmentGeneration) return;
      errorRef.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (generation === alignmentGeneration) {
        aligningRef.value = false;
      }
    }
  };

  return {
    isAlignedRef: isAlignedRef,
    aligningRef: aligningRef,
    errorRef: errorRef,
    alignmentRef: alignmentRef,
    runAlignment,
  };
}
const { isAlignedRef, aligningRef, errorRef, alignmentRef, runAlignment } = useAlignment(sequenceRowsRef);

const isReady = computed(() => !loadingRef.value && !aligningRef.value
  && sequenceRowsRef.value.length >= 2 && !isAlignedRef.value);
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost icon="dna" @click.stop="show = true">Multi Alignment</PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="show" width="80%" :close-on-outside-click="false">
    <template #title>Multi Alignment</template>

    <PlDropdownMulti
      v-model="sequenceColumnsIdsRef"
      label="Sequence Columns"
      :options="sequenceColumnsRef.options"
      :disabled="loadingRef"
      clearable
    />
    <PlDropdownMulti
      v-model="labelColumnsIdsRef"
      label="Label Columns"
      :options="labelColumnsRef.options"
      :disabled="loadingRef"
      clearable
    />

    <PlAlert v-if="errorRef" type="error" >
      {{ errorRef.message }}
    </PlAlert>
    <PlAlert v-if="sequenceRowsRef.length < 2" type="warn">
      Please select at least one sequence column and two or more rows to run alignment
    </PlAlert>

    <SequenceAlignment :output="alignmentRef as AlignmentRow[]" />

    <template #actions>
      <PlBtnPrimary
        :disabled="!isReady"
        :loading="aligningRef"
        @click="runAlignment"
      >
        Run Alignment ({{ sequenceRowsRef.length }} sequences)
      </PlBtnPrimary>
      <PlBtnGhost @click="show = false">Close</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>
