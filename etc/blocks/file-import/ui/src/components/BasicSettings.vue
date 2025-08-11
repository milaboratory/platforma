<script setup lang="ts">
import type { Spec } from '@milaboratories/milaboratories.file-import-block.model';
import { PlCheckbox, PlDropdown, PlTextArea, PlTextField } from '@platforma-sdk/ui-vue';
import { isNil } from 'es-toolkit';
import { ref, watch } from 'vue';
import { jsonToString, stringToJson } from '../utils/json';

// Type for basic settings (all Spec fields except axes and columns)
type BasicSettingsData = Omit<Spec, 'axes' | 'columns'>;

const props = defineProps<{
  modelValue: BasicSettingsData;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: BasicSettingsData];
}>();

const localValue = ref<BasicSettingsData>({ ...props.modelValue });

// Storage format options
const storageFormatOptions = [
  { label: 'Binary', value: 'Binary' as const },
  { label: 'Json', value: 'Json' as const },
];
// Watch for changes and emit
watch(localValue, (newValue) => {
  emit('update:modelValue', newValue);
}, { deep: true });

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  localValue.value = { ...newValue };
}, { deep: true });

// Helper functions for index configuration2
const updateIndexDomain = (value: string) => {
  if (!localValue.value.index) {
    localValue.value.index = { name: '' };
  }
  localValue.value.index.domain = stringToJson(value);
};

const updateIndexAnnotations = (value: string) => {
  if (!localValue.value.index) {
    localValue.value.index = { name: '' };
  }
  localValue.value.index.annotations = stringToJson(value);
};

const removeIndex = () => {
  localValue.value.index = undefined;
};

const addIndex = () => {
  localValue.value.index = { name: 'Index' };
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
        <PlTextField
          :model-value="localValue.separator || ''" label="Separator" placeholder=","
          @update:model-value="localValue.separator = $event || undefined"
        />
        <PlTextField
          :model-value="localValue.commentLinePrefix || ''" label="Comment Line Prefix"
          placeholder="#" @update:model-value="localValue.commentLinePrefix = $event || undefined"
        />
      </div>

      <div :class="$style.formRow">
        <PlCheckbox
          :model-value="localValue.skipEmptyLines || false"
          @update:model-value="localValue.skipEmptyLines = $event"
        >
          Skip Empty Lines
        </PlCheckbox>

        <PlCheckbox
          :model-value="localValue.allowColumnLabelDuplicates !== false"
          @update:model-value="localValue.allowColumnLabelDuplicates = $event"
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
          :model-value="localValue.columnNamePrefix || ''" label="Column Name Prefix"
          placeholder="Optional prefix for all columns"
          @update:model-value="localValue.columnNamePrefix = $event || undefined"
        />

        <PlCheckbox
          :model-value="localValue.allowArtificialColumns || false"
          @update:model-value="localValue.allowArtificialColumns = $event"
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
          :model-value="localValue.storageFormat || 'Binary'" :options="storageFormatOptions"
          label="Storage Format" @update:model-value="localValue.storageFormat = $event"
        />

        <PlTextField
          :model-value="String(localValue.partitionKeyLength || 0)" label="Partition Key Length"
          placeholder="0" @update:model-value="localValue.partitionKeyLength = parseInt($event) || 0"
        />
      </div>
    </div>

    <!-- Index Configuration -->
    <div :class="$style.formGroup">
      <div :class="$style.subsectionHeader">
        <h4>Row Index Configuration</h4>
        <div :class="$style.indexControls">
          <PlCheckbox
            :model-value="!isNil(localValue.index)"
            @update:model-value="$event ? addIndex() : removeIndex()"
          >
            Enable Row Index
          </PlCheckbox>
        </div>
      </div>

      <div v-if="localValue.index" :class="$style.indexSection">
        <div :class="$style.formRow">
          <PlTextField v-model="localValue.index.name" label="Index Name" placeholder="Index" required />
        </div>

        <div :class="$style.formRow">
          <PlTextArea
            :model-value="jsonToString(localValue.index.domain)" label="Domain (JSON)"
            placeholder="{}" @update:model-value="updateIndexDomain($event)"
          />

          <PlTextArea
            :model-value="jsonToString(localValue.index.annotations)" label="Annotations (JSON)"
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
