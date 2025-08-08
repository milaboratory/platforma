<script setup lang="ts">
import {
  PlBtnPrimary,
  PlCheckbox,
  PlDropdown,
  PlTextArea,
  PlTextField
} from '@platforma-sdk/ui-vue';
import { ref, watch } from 'vue';
import { useJsonField } from '../composables/useJsonField';
import type { ColumnSpecParam } from '../types/spec';
import { VALUE_TYPE_OPTIONS } from '../types/spec';
import SpecItem from './SpecItem.vue';

const props = defineProps<{
  modelValue: ColumnSpecParam[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ColumnSpecParam[]];
}>();

const { jsonToString, stringToJson } = useJsonField();

const localValue = ref<ColumnSpecParam[]>([...props.modelValue]);

// Watch for changes and emit
watch(localValue, (newValue) => {
  emit('update:modelValue', newValue);
}, { deep: true });

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  localValue.value = [...newValue];
}, { deep: true });

const addColumn = () => {
  localValue.value.push({
    column: '',
    spec: {
      valueType: 'String',
    }
  });
};

const removeColumn = (index: number) => {
  localValue.value.splice(index, 1);
};

const updateColumnDomain = (index: number, value: string) => {
  localValue.value[index].spec.domain = stringToJson(value);
};

const updateColumnAnnotations = (index: number, value: string) => {
  localValue.value[index].spec.annotations = stringToJson(value);
};
</script>

<template>
  <div :class="$style.section">
    <div :class="$style.sectionHeader">
      <h3>Columns Configuration</h3>
      <PlBtnPrimary @click="addColumn">Add Column</PlBtnPrimary>
    </div>

    <div v-if="localValue.length === 0" :class="$style.emptyState">
      No columns configured. Click "Add Column" to add your first column.
    </div>

    <SpecItem v-for="(column, index) in localValue" :key="index" :title="`Column ${index + 1}`"
      @remove="removeColumn(index)">
      <div :class="$style.formRow">
        <PlTextField v-model="column.column" label="Column" placeholder="Column label from XSV file" required />

        <PlTextField :model-value="column.filterOutRegex || ''"
          @update:model-value="column.filterOutRegex = $event || undefined" label="Filter Out Regex"
          placeholder="Regex to filter out rows (optional)" />
      </div>

      <div :class="$style.formRow">
        <PlTextField :model-value="column.naRegex || ''" @update:model-value="column.naRegex = $event || undefined"
          label="NA Regex" placeholder="Regex to identify N/A values (optional)" />

        <PlCheckbox :model-value="column.allowNA || false" @update:model-value="column.allowNA = $event">Allow NA Values
        </PlCheckbox>
      </div>

      <div :class="$style.formRow">
        <PlTextField :model-value="column.id || ''" @update:model-value="column.id = $event || undefined" label="ID"
          placeholder="Column ID (defaults to sanitized column label)" />
      </div>

      <!-- Column Spec -->
      <div :class="$style.nestedSection">
        <h5>Column Specification</h5>

        <div :class="$style.formRow">
          <PlTextField :model-value="column.spec.name || ''"
            @update:model-value="column.spec.name = $event || undefined" label="Name" :placeholder="column.column" />

          <PlDropdown v-model="column.spec.valueType" :options="VALUE_TYPE_OPTIONS" label="Value Type" required />
        </div>

        <div :class="$style.formRow">
          <PlTextArea :model-value="jsonToString(column.spec.domain)"
            @update:model-value="updateColumnDomain(index, $event)" label="Domain (JSON)" placeholder="{}" />

          <PlTextArea :model-value="jsonToString(column.spec.annotations)"
            @update:model-value="updateColumnAnnotations(index, $event)" label="Annotations (JSON)" placeholder="{}" />
        </div>
      </div>
    </SpecItem>
  </div>
</template>

<style module>
.section {
  margin-bottom: 40px;
}

.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.sectionHeader h3 {
  margin: 0;
  color: var(--txt-01);
}

.formRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.nestedSection {
  margin-top: 20px;
  padding: 16px;
  background-color: var(--bg-base);
  border-radius: 6px;
  border: 1px solid var(--border-color-div-grey);
}

.nestedSection h5 {
  margin: 0 0 16px 0;
  color: var(--txt-01);
  font-size: 14px;
  font-weight: 600;
}

.emptyState {
  text-align: center;
  padding: 40px;
  color: var(--txt-03);
  font-style: italic;
  background-color: var(--bg-elevated-01);
  border-radius: 8px;
  border: 1px dashed var(--border-color-div-grey);
}

@media (max-width: 768px) {
  .formRow {
    grid-template-columns: 1fr;
  }

  .sectionHeader {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}
</style>
