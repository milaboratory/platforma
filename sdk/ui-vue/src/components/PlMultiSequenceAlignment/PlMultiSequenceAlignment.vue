<script lang="ts" setup>
import {
  ref,
  onMounted,
  computed,
  watch,
  toRaw,
} from 'vue';
import type {
  ListOption,
} from '@milaboratories/uikit';
import {
  PlAlert,
  PlBtnGhost,
  PlBtnPrimary,
  PlSlideModal,
  PlDropdownMulti,
} from '@milaboratories/uikit';
import type {
  PColumnPredicate,
  PTableColumnIdJson,
} from '@platforma-sdk/model';
import {
  type PlMultiSequenceAlignmentModel,
  type PFrameHandle,
  type RowSelectionModel,
  type PObjectId,
} from '@platforma-sdk/model';
import {
  useDataTableToolsPanelTarget,
} from '../PlAgDataTableToolsPanel';
import type {
  AlignmentRow,
  SequenceRows,
} from './types';
import {
  getLabelColumnsOptions,
  getSequenceColumnsOptions,
  getSequenceRows,
} from './data_provider_logic';
import SequenceAlignment from './SequenceAlignment.vue';
import {
  WorkerManager,
} from './wm';
import * as lodash from 'lodash';

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

const props = defineProps<{
  /**
   * Handle to PFrame created using `createPFrameForGraphs`
   * Should contain all desired sequence and label columns
   */
  pframe: PFrameHandle | undefined;
  /**
   * Return true if column should be shown in sequence columns dropdown
   * By default, all sequence columns are selected
   */
  sequenceColumnPredicate: PColumnPredicate;
  /**
   * Return true if column should be shown in label columns dropdown
   * By default, common axes of selected sequence columns are selected
   */
  labelColumnOptionPredicate?: PColumnPredicate;
  /**
   * Sometimes sequence column and label column have disjoint axes
   * In this case you have to define `linkerColumnPredicate` to select
   * columns connecting axes of sequence and label columns.
   */
  linkerColumnPredicate?: PColumnPredicate;
  /**
   * Row selection model (from `PlAgDataTableV2` or `GraphMaker`)
   * If not provided or empty, all rows will be considered selected
   * Warning: should be forwarded as a field of `reactive` object
   */
  rowSelectionModel?: RowSelectionModel | undefined;
}>();

const show = ref(false);
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const teleportTarget = useDataTableToolsPanelTarget();

const epochRef = ref(0);
const loadingRef = ref(true);
const sequenceColumnsOptionsRef = ref<ListOption<PObjectId>[]>([]);
const sequenceColumnsIdsRef = computed<PObjectId[]>({
  get: () => model.value.sequenceColumnsIds ?? [],
  set: (value: PObjectId[]) => {
    model.value.sequenceColumnsIds = value;
  },
});
const labelColumnsOptionsRef = ref<ListOption<PTableColumnIdJson>[]>([]);
const labelColumnsIdsRef = computed<PTableColumnIdJson[]>({
  get: () => model.value.labelColumnsIds ?? [],
  set: (value: PTableColumnIdJson[]) => {
    model.value.labelColumnsIds = value;
  },
});
const sequenceRowsRef = ref<SequenceRows>({ epoch: epochRef.value, rows: [] });
const sequenceRowsCountRef = computed(() => sequenceRowsRef.value.rows.length);

/// Full state reset
watch (
  () => props.pframe,
  async (pframe, oldPframe) => {
    const sequenceColumnPredicate = props.sequenceColumnPredicate;
    const labelColumnOptionPredicate = props.labelColumnOptionPredicate;
    const linkerColumnPredicate = props.linkerColumnPredicate;
    const rowSelectionModel = props.rowSelectionModel;
    if (!pframe || pframe === oldPframe) return;

    const epoch = epochRef.value = epochRef.value + 1;
    loadingRef.value = true;
    // console.log(`watch 1 triggered, epoch: ${epoch}, pframe: ${pframe}`);
    try {
      const { options: sequenceColumnsOptions, defaults: sequenceColumnsIds }
        = await getSequenceColumnsOptions(pframe, sequenceColumnPredicate);
      if (epochRef.value !== epoch) return;

      const { options: labelColumnsOptions, defaults: labelColumnsIds }
        = await getLabelColumnsOptions(pframe, sequenceColumnsIds, labelColumnOptionPredicate);
      if (epochRef.value !== epoch) return;

      const sequenceRows = {
        epoch,
        rows: await getSequenceRows(
          { pframe, sequenceColumnsIds, labelColumnsIds, linkerColumnPredicate, rowSelectionModel },
        ),
      };
      if (epochRef.value !== epoch) return;

      sequenceColumnsOptionsRef.value = sequenceColumnsOptions;
      sequenceColumnsIdsRef.value = sequenceColumnsIds;
      labelColumnsOptionsRef.value = labelColumnsOptions;
      labelColumnsIdsRef.value = labelColumnsIds;
      sequenceRowsRef.value = sequenceRows;
    } catch (err: unknown) {
      if (epochRef.value !== epoch) return;
      console.error(err);
    } finally {
      if (epochRef.value === epoch) {
        loadingRef.value = false;
      }
      // console.log(`watch 1 finished, epoch: ${epoch}`);
    }
  },
  {
    immediate: true,
  },
);

/// Respond to label selection change or row selection change
watch(
  () => [sequenceColumnsIdsRef.value, labelColumnsIdsRef.value, props.rowSelectionModel] as const,
  async (state, oldState) => {
    const pframe = props.pframe;
    const [sequenceColumnsIds, labelColumnsIds, rowSelectionModel] = state;
    const linkerColumnPredicate = props.linkerColumnPredicate;
    if (!pframe || loadingRef.value || sequenceColumnsIds.length === 0
      || lodash.isEqual(state, oldState)) return;

    const epoch = epochRef.value = epochRef.value + 1;
    loadingRef.value = true;
    // console.log(`watch 2 triggered, epoch: ${epoch}, labelColumnsIds: ${labelColumnsIds}`);
    try {
      const sequenceRows = {
        epoch,
        rows: await getSequenceRows(
          { pframe, sequenceColumnsIds, labelColumnsIds, linkerColumnPredicate, rowSelectionModel },
        ),
      };
      if (epochRef.value !== epoch) return;

      sequenceRowsRef.value = sequenceRows;
    } catch (err: unknown) {
      if (epochRef.value !== epoch) return;
      console.error(err);
    } finally {
      if (epochRef.value === epoch) {
        loadingRef.value = false;
      }
      // console.log(`watch 2 finished, epoch: ${epoch}`);
    }
  },
  // {
  //   deep: true,
  // },
);

const aligningRef = ref(false);
const errorRef = ref<Error | null>(null);
const alignmentEpochRef = ref(epochRef.value - 1);
const alignmentRef = ref<AlignmentRow[]>([]);

const wm = new WorkerManager();
const runAlignment = async () => {
  const { epoch, rows: sequenceRows } = toRaw(sequenceRowsRef.value);
  if (sequenceRows.length === 0) return;

  const alignmentRefEpoch = alignmentEpochRef.value = epoch;
  aligningRef.value = true;
  errorRef.value = null;
  try {
    const result = await wm.align({ sequenceRows });
    if (alignmentEpochRef.value !== alignmentRefEpoch) return;

    alignmentRef.value = result.result;
  } catch (err) {
    if (alignmentEpochRef.value !== alignmentRefEpoch) return;
    errorRef.value = err instanceof Error ? err : new Error(String(err));
  } finally {
    if (alignmentEpochRef.value === alignmentRefEpoch) {
      aligningRef.value = false;
    }
  }
};

const isReady = computed(() => !loadingRef.value && !aligningRef.value
  && sequenceRowsCountRef.value >= 2 && alignmentEpochRef.value !== epochRef.value);
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
      :options="sequenceColumnsOptionsRef"
      :disabled="loadingRef"
      clearable
    />
    <PlDropdownMulti
      v-model="labelColumnsIdsRef"
      label="Label Columns"
      :options="labelColumnsOptionsRef"
      :disabled="loadingRef"
      clearable
    />

    <PlAlert v-if="errorRef" type="error" >
      {{ errorRef.message }}
    </PlAlert>
    <PlAlert v-if="sequenceRowsCountRef < 2" type="warn">
      Please select at least one sequence column and two or more rows to run alignment
    </PlAlert>

    <SequenceAlignment :output="alignmentRef" />

    <template #actions>
      <PlBtnPrimary
        :disabled="!isReady"
        :loading="aligningRef"
        @click="runAlignment"
      >
        Run Alignment ({{ sequenceRowsCountRef }} sequences)
      </PlBtnPrimary>
      <PlBtnGhost @click="show = false">Close</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>
