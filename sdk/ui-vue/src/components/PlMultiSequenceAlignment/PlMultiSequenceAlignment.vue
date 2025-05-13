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
  AxisId,
  PTableColumnId,

  CanonicalizedJson,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  PTableColumnIdJson } from '@platforma-sdk/model';
import {
  type PlMultiSequenceAlignmentModel,
  type PColumnSpec,
  type PFrameHandle,
  type RowSelectionModel,
  type PObjectId,
  getRawPlatformaInstance,
  getAxisId,
  canonicalizeJson,
  isLabelColumn,
  matchAxisId,
  stringifyPTableColumnId,
  parseJson,
} from '@platforma-sdk/model';
import {
  useDataTableToolsPanelTarget,
} from '../PlAgDataTableToolsPanel';
import type {
  AlignmentRow,
  SequenceRow,
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

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

const props = defineProps<{
  /// Handle to PFrame created using `createPFrameForGraphs`
  /// Should contain all desired sequence and label columns
  pframe: PFrameHandle | undefined;
  /// Return true if column should be shown in sequence columns dropdown
  /// By default, all sequence columns are selected
  sequenceColumnPredicate: (column: PColumnSpec) => boolean;
  /// Return true if column should be shown in label columns dropdown
  /// By default, common axes of selected sequence columns are selected
  labelColumnOptionPredicate?: (column: PColumnSpec) => boolean;
  /// Row selection model (from `PlAgDataTableV2` or `GraphMaker`)
  /// If not provided or empty, all rows will be considered selected
  /// Warning: should be forwarded as a field of `reactive` object
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
const sequenceRowsRef = ref<SequenceRow[]>([]);

/// Full state reset
watch (
  () => [props.pframe, props.sequenceColumnPredicate, props.labelColumnOptionPredicate] as const,
  async ([pframe, sequenceColumnPredicate, labelColumnOptionPredicate]) => {
    if (!pframe) return;

    const epoch = epochRef.value = epochRef.value + 1;
    loadingRef.value = true;
    try {
      const sequenceColumnsOptions = await getSequenceColumnsOptions(pframe, sequenceColumnPredicate);
      if (epochRef.value !== epoch) return;
      const sequenceColumnsIds = sequenceColumnsOptions.map((o) => o.value);

      const labelColumnsOptions = await getLabelColumnsOptions(pframe, sequenceColumnsIds, labelColumnOptionPredicate);
      if (epochRef.value !== epoch) return;
      const labelColumnsIds = labelColumnsOptions.filter((o) => parseJson(o.value).type === 'axis').map((o) => o.value);

      const sequenceRows = await getSequenceRows(
        pframe,
        sequenceColumnsIds,
        labelColumnsIds,
        props.rowSelectionModel,
      );
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
    }
  },
  {
    immediate: true,
  },
);

/// Respond to sequence selection change
watch(
  () => sequenceColumnsIdsRef.value,
  async (sequenceColumnsIds) => {
    const pframe = props.pframe;
    const labelColumnOptionPredicate = props.labelColumnOptionPredicate;
    if (!pframe || loadingRef.value || sequenceColumnsIds.length === 0) return;

    const epoch = epochRef.value = epochRef.value + 1;
    loadingRef.value = true;
    try {
      const labelColumnsOptions = await getLabelColumnsOptions(pframe, sequenceColumnsIds, labelColumnOptionPredicate);
      if (epochRef.value !== epoch) return;
      const labelColumnsIds = labelColumnsOptions.filter((o) => parseJson(o.value).type === 'axis').map((o) => o.value);

      const sequenceRows = await getSequenceRows(
        pframe,
        sequenceColumnsIds,
        labelColumnsIds,
        props.rowSelectionModel,
      );
      if (epochRef.value !== epoch) return;

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
    }
  },
);

/// Respond to label selection change
watch(
  () => labelColumnsIdsRef.value,
  async (labelColumnsIds) => {
    const pframe = props.pframe;
    const sequenceColumnsIds = sequenceColumnsIdsRef.value;
    if (!pframe || loadingRef.value || sequenceColumnsIds.length === 0) return;

    const epoch = epochRef.value = epochRef.value + 1;
    loadingRef.value = true;
    try {
      const sequenceRows = await getSequenceRows(
        pframe,
        sequenceColumnsIds,
        labelColumnsIds,
        props.rowSelectionModel,
      );
      if (epochRef.value !== epoch) return;

      sequenceRowsRef.value = sequenceRows;
    } catch (err: unknown) {
      if (epochRef.value !== epoch) return;
      console.error(err);
    } finally {
      if (epochRef.value === epoch) {
        loadingRef.value = false;
      }
    }
  },
);

const error = ref<Error | null>(null);
const isRunning = ref(false);
const isResolved = ref(false);
const output = ref<AlignmentRow[]>([]);

watch(
  () => sequenceRowsRef.value,
  () => isResolved.value = false,
);

const wm = new WorkerManager();
const runAlignment = async () => {
  const rows = toRaw(sequenceRowsRef.value);
  if (!rows) return;

  isRunning.value = true;
  error.value = null;
  try {
    const result = await wm.align({ sequenceRows: rows });
    output.value = result.result;
    isResolved.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err : new Error(String(err));
  } finally {
    isRunning.value = false;
  }
};

const hasRowsToAlign = computed(() => sequenceRowsRef.value.length > 0);
// TODO: enable loading check, for big datasets loading can take significant time
const isReady = computed(() => /* !loading.value && */ hasRowsToAlign.value && !isResolved.value);
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost icon="dna" @click.stop="show = true">Multi Alignment</PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="show" width="80%" :close-on-outside-click="false">
    <template #title>Multi Alignment</template>

    <div :style="{ maxInlineSize: 'fit-content' }">
      <PlDropdownMulti
        v-model="sequenceColumnsIdsRef"
        label="Sequence Columns"
        :options="sequenceColumnsOptionsRef"
      />
      <PlDropdownMulti
        v-model="labelColumnsIdsRef"
        label="Label Columns"
        :options="labelColumnsOptionsRef"
      />
    </div>

    <PlAlert v-if="error" type="error" >
      {{ error.message }}
    </PlAlert>
    <PlAlert v-if="!hasRowsToAlign" type="warn">
      Please select at least one sequence to run alignment
    </PlAlert>

    <SequenceAlignment :output="output" />

    <template #actions>
      <PlBtnPrimary
        :disabled="!isReady"
        :loading="isRunning"
        @click="runAlignment"
      >
        Run Alignment ({{ sequenceRowsRef.length }} sequences)
      </PlBtnPrimary>
      <PlBtnGhost @click="show = false">Close</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>
