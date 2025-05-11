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
import {
  type PlMultiSequenceAlignmentModel,
  type PColumnSpec,
  type PFrameHandle,
  type RowSelectionModel,
  type PObjectId,
  getRawPlatformaInstance,
} from '@platforma-sdk/model';
import {
  useDataTableToolsPanelTarget,
} from '../PlAgDataTableToolsPanel';
import type {
  AlignmentRow,
  SequenceRow,
} from './types';
import {
  getSequenceRows,
} from './data_provider_logic';
import SequenceAlignment from './SequenceAlignment.vue';
import {
  WorkerManager,
} from './wm';

const model = defineModel<PlMultiSequenceAlignmentModel>({ default: {} });

const props = defineProps<{
  labelColumnOptionPredicate: (column: PColumnSpec) => boolean;
  sequenceColumnPredicate: (column: PColumnSpec) => boolean;
  pframe: PFrameHandle | undefined;
  rowSelectionModel?: RowSelectionModel | undefined;
}>();

const show = ref(false);
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const teleportTarget = useDataTableToolsPanelTarget();

const labelColumnsOptions = ref<ListOption<PObjectId>[]>([]);
const labelColumnsIds = computed<PObjectId[]>({
  get: () => model.value.labelColumnsIds ?? [],
  set: (value: PObjectId[]) => {
    model.value.labelColumnsIds = value;
  },
});

const loading = ref(false);
const abortedRef = ref({ aborted: false });
const sequenceRows = ref<SequenceRow[]>([]);
watch(
  () => [props.pframe, props.rowSelectionModel, labelColumnsIds.value] as const,
  async ([pframe, rowSelectionModel, labelColumnsIds]) => {
    if (!pframe) {
      labelColumnsOptions.value = [];
      sequenceRows.value = [];
      return;
    }
    loading.value = true;
    const aborted = abortedRef.value;

    const columns = await getRawPlatformaInstance().pFrameDriver.listColumns(pframe);
    if (aborted.aborted) return;
    labelColumnsOptions.value = columns
      .filter((c) => props.labelColumnOptionPredicate(c.spec))
      .map((c) => ({
        label: c.spec.annotations?.['pl7.app/label'] ?? '',
        value: c.columnId,
      }));
    const sequenceColumnsIds = columns
      .filter((c) => props.sequenceColumnPredicate(c.spec))
      .map((c) => c.columnId);
    if (labelColumnsIds.length === 0
      || !labelColumnsIds.every((id) => columns.find((c) => c.columnId === id))
      || sequenceColumnsIds.length === 0) {
      sequenceRows.value = [];
      loading.value = false;
      return;
    }

    const rows = await getSequenceRows(
      pframe,
      labelColumnsIds,
      sequenceColumnsIds,
      rowSelectionModel,
    );
    if (aborted.aborted) return;
    sequenceRows.value = rows;
    loading.value = false;
  },
  {
    immediate: true,
  },
);

const error = ref<Error | null>(null);
const isRunning = ref(false);
const isResolved = ref(false);
const output = ref<AlignmentRow[]>([]);

watch(
  () => sequenceRows.value,
  () => isResolved.value = false,
);

const wm = new WorkerManager();
const runAlignment = async () => {
  const rows = toRaw(sequenceRows.value);
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

const hasRowsToAlign = computed(() => sequenceRows.value.length > 0);
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
        v-model="labelColumnsIds"
        label="Label Columns"
        :options="labelColumnsOptions"
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
        Run Alignment ({{ sequenceRows?.length }} sequences)
      </PlBtnPrimary>
      <PlBtnGhost @click="show = false">Close</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>
