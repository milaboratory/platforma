<script setup lang="ts">
import type { ListOption } from '@milaboratories/uikit';
import {
  PlBtnGhost,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
} from '@milaboratories/uikit';
import type { PObjectId, PTableColumnIdJson } from '@platforma-sdk/model';
import type { Settings } from './settings';

const sequenceColumns = defineModel<PObjectId[]>(
  'sequenceColumns',
  { required: true },
);

const labelColumns = defineModel<PTableColumnIdJson[]>(
  'labelColumns',
  { required: true },
);

const settings = defineModel<Settings>(
  'settings',
  { required: true },
);

defineProps<{
  sequenceColumnOptions: ListOption<PObjectId>[];
  labelColumnOptions: ListOption<PTableColumnIdJson>[];
}>();
</script>

<template>
  <div :class="$style.container">
    <div :class="$style.line">
      <div :class="$style.section">
        <PlDropdownMulti
          v-model="sequenceColumns"
          label="Sequence Columns"
          :options="sequenceColumnOptions"
          :disabled="!sequenceColumnOptions.length"
          clearable
        />
        <PlDropdownMulti
          v-model="labelColumns"
          label="Label Columns"
          :options="labelColumnOptions"
          :disabled="!labelColumnOptions.length"
          clearable
        />
        <PlDropdown
          v-model="settings.colorScheme"
          label="Color Scheme"
          :options="
            [{
              label: 'Chemical Properties',
              value: 'chemical-properties',
            }, {
              label: 'No Color',
              value: 'no-color',
            }]
          "
        />
      </div>
      <div :class="$style.buttons">
        <PlBtnGhost icon="settings">Settings</PlBtnGhost>
        <PlBtnGhost icon="export">Export</PlBtnGhost>
      </div>
    </div>
    <div :class="$style.line">
      <div :class="$style.section">
        <PlCheckbox v-model="settings.seqLogo">Seq logo</PlCheckbox>
        <PlCheckbox v-model="settings.consensus">Consensus</PlCheckbox>
        <PlCheckbox :model-value="false" disabled>Navigator</PlCheckbox>
        <PlCheckbox :model-value="false" disabled>Tree</PlCheckbox>
        <PlCheckbox v-model="settings.legend">Legend</PlCheckbox>
      </div>
    </div>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.line {
  display: flex;
  justify-content: space-between;
}

.section {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.buttons {
  display: flex;
}
</style>
