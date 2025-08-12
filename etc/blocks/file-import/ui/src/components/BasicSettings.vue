<script setup lang="ts">
import type { Spec } from '@milaboratories/milaboratories.file-import-block.model';
import { PlCheckbox, PlDropdown, PlTextArea, PlTextField } from '@platforma-sdk/ui-vue';
import { isNil } from 'es-toolkit';
import { jsonToString, stringToJson } from '../utils/json';

// Type for basic settings (all Spec fields except axes and columns)
type BasicSettingsData = Omit<Spec, 'axes' | 'columns'>;

const settings = defineModel<BasicSettingsData>({ required: true });

// Storage format options
const storageFormatOptions = [
  { label: 'Binary', value: 'Binary' as const },
  { label: 'Json', value: 'Json' as const },
];

// Helper functions for index configuration2
const updateIndexDomain = (value: string) => {
  if (!settings.value.index) {
    settings.value.index = { name: '' };
  }
  settings.value.index.domain = stringToJson(value);
};

const updateIndexAnnotations = (value: string) => {
  if (!settings.value.index) {
    settings.value.index = { name: '' };
  }
  settings.value.index.annotations = stringToJson(value);
};

const removeIndex = () => {
  settings.value.index = undefined;
};

const addIndex = () => {
  settings.value.index = { name: 'Index' };
};
</script>

<template>
  <div :class="$style.basicSettings">
    <div :class="$style.sectionHeader">
      <h3>Basic Settings</h3>
    </div>

    <!-- File Format Settings -->
    <div :class="$style.formGroup">
      <h4>File Format</h4>
      <div :class="$style.formRow">
        <PlDropdown
          label="Separator"
          :options="[
            { label: 'Comma (,)', value: ',' },
            { label: 'Tab (\\t)', value: '\\t' },
            { label: 'Semicolon (;)', value: ';' },
            { label: 'Space ( )', value: ' ' },
          ]"
          :model-value="settings.separator || ''"
          @update:model-value="settings.separator = $event || undefined"
        />

        <PlDropdown
          label="Comment Line Prefix"
          :options="[
            { label: 'Hash (#)', value: '#' },
            { label: 'Double Slash (//)', value: '//' },
            { label: 'Semicolon (;)', value: ';' },
          ]"
          :model-value="settings.commentLinePrefix || '#'"
          @update:model-value="settings.commentLinePrefix = $event || undefined"
        />
      </div>

      <div :class="$style.formRow">
        <PlCheckbox
          :model-value="settings.skipEmptyLines || false"
          @update:model-value="settings.skipEmptyLines = $event"
        >
          Skip Empty Lines
        </PlCheckbox>

        <PlCheckbox
          :model-value="settings.allowColumnLabelDuplicates !== false"
          @update:model-value="settings.allowColumnLabelDuplicates = $event"
        >
          Allow Column Label Duplicates
        </PlCheckbox>
      </div>
    </div>

    <!-- Column Settings -->
    <div :class="$style.formGroup">
      <h4>Column Settings</h4>
      <div :class="$style.formRow">
        <PlTextField
          :model-value="settings.columnNamePrefix || ''" label="Column Name Prefix"
          placeholder="Optional prefix for all columns"
          @update:model-value="settings.columnNamePrefix = $event || undefined"
        />

        <PlCheckbox
          :model-value="settings.allowArtificialColumns || false"
          @update:model-value="settings.allowArtificialColumns = $event"
        >
          Allow Artificial Columns
        </PlCheckbox>
      </div>
    </div>

    <!-- Storage Settings -->
    <div :class="$style.formGroup">
      <h4>Storage Settings</h4>
      <div :class="$style.formRow">
        <PlDropdown
          :model-value="settings.storageFormat || 'Binary'" :options="storageFormatOptions"
          label="Storage Format" @update:model-value="settings.storageFormat = $event"
        />

        <PlTextField
          :model-value="String(settings.partitionKeyLength || 0)" label="Partition Key Length"
          placeholder="0" @update:model-value="settings.partitionKeyLength = parseInt($event) || 0"
        />
      </div>
    </div>

    <!-- Index Configuration -->
    <div :class="$style.formGroup">
      <div :class="$style.subsectionHeader">
        <h4>Row Index Configuration</h4>
        <div :class="$style.indexControls">
          <PlCheckbox
            :model-value="!isNil(settings.index)"
            @update:model-value="$event ? addIndex() : removeIndex()"
          >
            Enable Row Index
          </PlCheckbox>
        </div>
      </div>

      <div v-if="settings.index" :class="$style.indexSection">
        <div :class="$style.formRow">
          <PlTextField v-model="settings.index.name" label="Index Name" placeholder="Index" required />
        </div>

        <div :class="$style.formRow">
          <PlTextArea
            :model-value="jsonToString(settings.index.domain)" label="Domain (JSON)"
            placeholder="{}" @update:model-value="updateIndexDomain($event)"
          />

          <PlTextArea
            :model-value="jsonToString(settings.index.annotations)" label="Annotations (JSON)"
            placeholder="{}" @update:model-value="updateIndexAnnotations($event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.basicSettings {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.sectionHeader {
    margin-bottom: 16px;
}

.sectionHeader h3 {
    margin: 0;
    color: var(--txt-01);
}

.formGroup {
    border: 1px solid var(--border-color-div-grey);
    border-radius: 8px;
    padding: 16px;
    background-color: var(--bg-elevated-01);
}

.formGroup h4 {
    margin: 0 0 12px 0;
    color: var(--txt-01);
    font-size: 14px;
    font-weight: 600;
}

.subsectionHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.subsectionHeader h4 {
    margin: 0;
}

.indexControls {
    display: flex;
    gap: 8px;
}

.formRow {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 12px;
}

.formRow:last-child {
    margin-bottom: 0;
}

.indexSection {
    padding: 12px;
    background-color: var(--bg-base);
    border-radius: 6px;
    border: 1px solid var(--border-color-div-grey);
    margin-top: 12px;
}

@media (max-width: 768px) {
    .formRow {
        grid-template-columns: 1fr;
    }

    .subsectionHeader {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
    }
}
</style>
