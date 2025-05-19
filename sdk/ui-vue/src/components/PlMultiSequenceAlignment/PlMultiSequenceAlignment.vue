<script lang="ts" setup>
import {
  PlAlert,
  PlBtnGhost,
  PlDropdownMulti,
  PlIcon24,
  PlSlideModal,
  PlTooltip,
} from '@milaboratories/uikit';
import type {
  PColumnPredicate,
  PFrameHandle,
  PlMultiSequenceAlignmentModel,
  SelectionModel,
} from '@platforma-sdk/model';
import { computed, onMounted, reactive, ref } from 'vue';
import { useDataTableToolsPanelTarget } from '../PlAgDataTableToolsPanel';
import { useLabelColumns, useSequenceColumns, useSequenceRows } from './data';
import {
  chemicalCategories,
  chemicalPropertiesColors,
  chemicalPropertiesLabels,
} from './highlight/chemical-properties';
import MultiSequenceAlignmentView from './MultiSequenceAlignmentView.vue';

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
  readonly selection?: SelectionModel | undefined;
}>();

// SlidePanel visibility flag
const show = ref(false);

// Teleport open button to DataTableToolsPanel after mount
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const teleportTarget = useDataTableToolsPanelTarget();

const sequenceColumns = reactive(useSequenceColumns(() => ({
  pframe: props.pFrame,
  sequenceColumnPredicate: props.sequenceColumnPredicate,
})));

const labelColumns = reactive(useLabelColumns(() => ({
  pframe: props.pFrame,
  sequenceColumnIds: sequenceColumns.defaults,
  labelColumnOptionPredicate: props.labelColumnOptionPredicate,
})));

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

const sequenceRows = reactive(useSequenceRows(() => ({
  pframe: props.pFrame,
  sequenceColumnIds: selectedSequenceColumnIds.value,
  labelColumnIds: selectedLabelColumnIds.value,
  linkerColumnPredicate: props.linkerColumnPredicate,
  selection: props.selection,
})));
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost icon="dna" @click.stop="show = true">
      Multi Alignment
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="show" width="100%" :close-on-outside-click="false">
    <template #title>
      Multi Alignment
      <PlTooltip :class="$style.tooltip" position="southwest">
        <PlIcon24 name="info" />
        <template #tooltip>
          <div
            v-for="category in chemicalCategories"
            :key="category"
          >
            <span
              :class="$style['color-sample']"
              :style="
                {
                  backgroundColor:
                    chemicalPropertiesColors[category],
                }
              "
            />
            {{ chemicalPropertiesLabels[category] }}
          </div>
        </template>
      </PlTooltip>
    </template>

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

    <PlAlert v-if="sequenceRows.data.length < 2" type="warn">
      Please select at least one sequence column and two or more rows to run
      alignment
    </PlAlert>

    <MultiSequenceAlignmentView
      v-else
      :sequenceRows="sequenceRows.data"
      highlight="chemical-properties"
    />
  </PlSlideModal>
</template>

<style module>
.tooltip {
  display: inline-flex;
}
.color-sample {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1px solid #ccc;
  margin-right: 8px;
  vertical-align: middle;
}
</style>
