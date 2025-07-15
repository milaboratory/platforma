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
  PObjectId,
  PTableColumnId,
} from '@platforma-sdk/model';
import { computed, ref, watchEffect } from 'vue';
import { defaultAlignmentParams } from './multi-sequence-alignment';

const { settings } = defineProps<{
  settings: Settings;
  sequenceColumnOptions: ListOptionNormalized<PObjectId>[] | undefined;
  labelColumnOptions: ListOptionNormalized<PTableColumnId>[] | undefined;
  colorSchemeOptions: ListOptionNormalized<ColorSchemeOption>[];
}>();

const emit = defineEmits<{
  updateSettings: [Partial<Settings>];
}>();

const settingsOpen = ref(false);

function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K] | undefined,
) {
  emit('updateSettings', { [key]: value });
}

function toggleWidget(
  widget: 'seqLogo' | 'consensus' | 'legend',
  checked: boolean,
) {
  updateSetting(
    'widgets',
    checked
      ? [...settings.widgets, widget]
      : settings.widgets.filter((w) => widget !== w),
  );
}

const alignmentParams = ref({ ...settings.alignmentParams });
watchEffect(() => {
  alignmentParams.value = { ...settings.alignmentParams };
});

const alignmentParamsChangesPending = computed(() =>
  !isJsonEqual(settings.alignmentParams, alignmentParams.value),
);

const canResetAlignmentParams = computed(() =>
  !isJsonEqual(settings.alignmentParams, defaultAlignmentParams),
);
</script>

<template>
  <div :class="$style.container">
    <div :class="$style.line">
      <div :class="$style.section">
        <PlDropdownMulti
          label="Sequence Columns"
          :model-value="settings.sequenceColumnIds ?? []"
          :options="sequenceColumnOptions"
          clearable
          @update:model-value="updateSetting('sequenceColumnIds', $event)"
        />
        <PlDropdownMulti
          :model-value="settings.labelColumnIds ?? []"
          label="Label Columns"
          :options="labelColumnOptions"
          clearable
          @update:model-value="updateSetting('labelColumnIds', $event)"
        />
        <PlDropdown
          :model-value="settings.colorScheme"
          label="Color Scheme"
          :options="colorSchemeOptions"
          @update:model-value="updateSetting('colorScheme', $event)"
        />
      </div>
      <div :class="$style.buttons">
        <PlBtnGhost icon="settings" @click.stop="settingsOpen = true">
          Settings
        </PlBtnGhost>
        <PlBtnGhost icon="export">Export</PlBtnGhost>
      </div>
    </div>
    <div :class="$style.line">
      <div :class="$style.section">
        <PlCheckbox
          :model-value="settings.widgets.includes('seqLogo')"
          @update:model-value="toggleWidget('seqLogo', $event)"
        >
          Seq logo
        </PlCheckbox>
        <PlCheckbox
          :model-value="settings.widgets.includes('consensus')"
          @update:model-value="toggleWidget('consensus', $event)"
        >
          Consensus
        </PlCheckbox>
        <PlCheckbox :model-value="false" disabled>Navigator</PlCheckbox>
        <PlCheckbox :model-value="false" disabled>Tree</PlCheckbox>
        <PlCheckbox
          :model-value="settings.widgets.includes('legend')"
          :disabled="settings.colorScheme.type === 'no-color'"
          @update:model-value="toggleWidget('legend', $event)"
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
      :class="$style['pending-changes']"
    >
      <PlBtnPrimary @click="updateSetting('alignmentParams', alignmentParams)">
        Apply
      </PlBtnPrimary>
      <PlBtnGhost @click="alignmentParams = settings.alignmentParams">
        Cancel
      </PlBtnGhost>
    </div>
    <PlBtnSecondary
      v-if="canResetAlignmentParams"
      :class="$style['reset-button']"
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

.pending-changes {
  display: flex;
  button {
    min-width: 160px;
  }
}

.reset-button {
  margin-block-start: auto;
  span {
    text-transform: none;
  }
}
</style>
