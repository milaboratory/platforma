<script setup lang="ts">
import { isJsonEqual } from '@milaboratories/helpers';
import {
  type ListOptionNormalized,
  PlBtnGhost,
  PlBtnPrimary,
  PlBtnSecondary,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlNumberField,
  PlSlideModal,
} from '@milaboratories/uikit';
import type {
  PlMultiSequenceAlignmentColorSchemeOption as ColorSchemeOption,
  PlMultiSequenceAlignmentSettings as Settings,
  PlMultiSequenceAlignmentWidget,
  PObjectId,
  PTableColumnId,
} from '@platforma-sdk/model';
import { computed, ref, useCssModule, watchEffect } from 'vue';
import { defaultSettings } from './settings';

const props = defineProps<{
  settings: Settings;
  sequenceColumnOptions: ListOptionNormalized<PObjectId>[] | undefined;
  labelColumnOptions: ListOptionNormalized<PTableColumnId>[] | undefined;
  colorSchemeOptions: ListOptionNormalized<ColorSchemeOption>[];
}>();

const emit = defineEmits<{
  updateSettings: [Partial<Settings>];
  export: [];
}>();

const classes = useCssModule();

const settingsOpen = ref(false);

function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K] | undefined,
) {
  emit('updateSettings', { [key]: value });
}

function toggleWidget(
  widget: PlMultiSequenceAlignmentWidget,
  checked: boolean,
) {
  updateSetting(
    'widgets',
    checked
      ? [...props.settings.widgets, widget]
      : props.settings.widgets.filter((w) => widget !== w),
  );
}

const alignmentParams = ref({ ...props.settings.alignmentParams });
watchEffect(() => {
  alignmentParams.value = { ...props.settings.alignmentParams };
});

const alignmentParamsChangesPending = computed(() =>
  !isJsonEqual(props.settings.alignmentParams, alignmentParams.value),
);

const canResetAlignmentParams = computed(() =>
  !isJsonEqual(props.settings.alignmentParams, defaultSettings.alignmentParams),
);
</script>

<template>
  <div :class="classes.container">
    <div :class="classes.line">
      <div :class="classes.section">
        <PlDropdownMulti
          label="Sequence Columns"
          :model-value="props.settings.sequenceColumnIds ?? []"
          :options="props.sequenceColumnOptions"
          clearable
          @update:model-value="event => updateSetting('sequenceColumnIds', event)"
        />
        <PlDropdownMulti
          :model-value="props.settings.labelColumnIds ?? []"
          label="Label Columns"
          :options="props.labelColumnOptions"
          clearable
          @update:model-value="event => updateSetting('labelColumnIds', event)"
        />
        <PlDropdown
          :model-value="props.settings.colorScheme"
          label="Color Scheme"
          :options="props.colorSchemeOptions"
          @update:model-value="event => updateSetting('colorScheme', event)"
        />
      </div>
      <div :class="classes.buttons">
        <PlBtnGhost icon="settings" @click.stop="settingsOpen = true">
          Settings
        </PlBtnGhost>
        <PlBtnGhost icon="export" @click.stop="emit('export')">
          Export
        </PlBtnGhost>
      </div>
    </div>
    <div :class="classes.line">
      <div :class="classes.section">
        <PlCheckbox
          :model-value="props.settings.widgets.includes('seqLogo')"
          @update:model-value="event => toggleWidget('seqLogo', event)"
        >
          Seq logo
        </PlCheckbox>
        <PlCheckbox
          :model-value="props.settings.widgets.includes('consensus')"
          @update:model-value="event => toggleWidget('consensus', event)"
        >
          Consensus
        </PlCheckbox>
        <PlCheckbox :model-value="false" disabled>Navigator</PlCheckbox>
        <PlCheckbox
          :model-value="props.settings.widgets.includes('tree')"
          @update:model-value="event => toggleWidget('tree', event)"
        >
          Tree
        </PlCheckbox>
        <PlCheckbox
          :model-value="props.settings.widgets.includes('legend')"
          :disabled="props.settings.colorScheme.type === 'no-color'"
          @update:model-value="event => toggleWidget('legend', event)"
        >
          Legend
        </PlCheckbox>
      </div>
    </div>
  </div>
  <PlSlideModal v-model="settingsOpen">
    <template #title>Settings</template>
    <PlNumberField
      v-model="alignmentParams.gpo"
      label="Gap open penalty"
      :step="0.1"
      @keyup.enter="updateSetting('alignmentParams', alignmentParams)"
    >
      <template #tooltip>
        Penalty score assigned to the introduction of a gap in the alignment
      </template>
    </PlNumberField>
    <PlNumberField
      v-model="alignmentParams.gpe"
      label="Gap extension penalty"
      :step="0.1"
      @keyup.enter="updateSetting('alignmentParams', alignmentParams)"
    >
      <template #tooltip>
        Penalty score assigned to each additional residue added to an existing
        gap
      </template>
    </PlNumberField>
    <PlNumberField
      v-model="alignmentParams.tgpe"
      label="Terminal gap extension penalty"
      :step="0.1"
      @keyup.enter="updateSetting('alignmentParams', alignmentParams)"
    >
      <template #tooltip>
        Penalty score assigned to extending gaps at the ends of sequences
      </template>
    </PlNumberField>
    <div
      v-if="alignmentParamsChangesPending"
      :class="classes.pendingChanges"
    >
      <PlBtnPrimary @click="updateSetting('alignmentParams', alignmentParams)">
        Apply
      </PlBtnPrimary>
      <PlBtnGhost @click="alignmentParams = props.settings.alignmentParams">
        Cancel
      </PlBtnGhost>
    </div>
    <PlBtnSecondary
      v-if="canResetAlignmentParams"
      :class="classes.resetButton"
      icon="reverse"
      @click="updateSetting('alignmentParams', undefined)"
    >
      Reset to Default
    </PlBtnSecondary>
  </PlSlideModal>
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

.pendingChanges {
  display: flex;
  button {
    min-width: 160px;
  }
}

.resetButton {
  margin-block-start: auto;
  span {
    text-transform: none;
  }
}
</style>
