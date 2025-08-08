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
import type { AxisSpecParam } from '../types/spec';
import { VALUE_TYPE_OPTIONS } from '../types/spec';
import SpecItem from './SpecItem.vue';

const props = defineProps<{
  modelValue: AxisSpecParam[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AxisSpecParam[]];
}>();

const { jsonToString, stringToJson } = useJsonField();

const localValue = ref<AxisSpecParam[]>([...props.modelValue]);

// Watch for changes and emit
watch(localValue, (newValue) => {
  emit('update:modelValue', newValue);
}, { deep: true });

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  localValue.value = [...newValue];
}, { deep: true });

const addAxis = () => {
  localValue.value.push({
    column: '',
    allowNA: false,
    spec: {
      type: 'String',
    }
  });
};

const removeAxis = (index: number) => {
  localValue.value.splice(index, 1);
};

const updateAxisDomain = (index: number, value: string) => {
  localValue.value[index].spec.domain = stringToJson(value);
};

const updateAxisAnnotations = (index: number, value: string) => {
  localValue.value[index].spec.annotations = stringToJson(value);
};
</script>

<template>
  <div :class="$style.section">
    <div :class="$style.sectionHeader">
      <h3>Axes Configuration</h3>
      <PlBtnPrimary @click="addAxis">Add Axis</PlBtnPrimary>
    </div>

    <div v-if="localValue.length === 0" :class="$style.emptyState">
      No axes configured. Click "Add Axis" to add your first axis.
    </div>

    <SpecItem v-for="(axis, index) in localValue" :key="index" :title="`Axis ${index + 1}`" @remove="removeAxis(index)">
      <div :class="$style.formRow">
        <PlTextField v-model="axis.column" label="Column" placeholder="Column label from XSV file" required />

        <PlTextField :model-value="axis.filterOutRegex || ''"
          @update:model-value="axis.filterOutRegex = $event || undefined" label="Filter Out Regex"
          placeholder="Regex to filter out rows (optional)" />
      </div>

      <div :class="$style.formRow">
        <PlTextField :model-value="axis.naRegex || ''" @update:model-value="axis.naRegex = $event || undefined"
          label="NA Regex" placeholder="Regex to identify N/A values (optional)" />

        <PlCheckbox :model-value="axis.allowNA || false" @update:model-value="axis.allowNA = $event">Allow NA Values
        </PlCheckbox>
      </div>

      <!-- Axis Spec -->
      <div :class="$style.nestedSection">
        <h5>Axis Specification</h5>

        <div :class="$style.formRow">
          <PlTextField :model-value="axis.spec.name || ''" @update:model-value="axis.spec.name = $event || undefined"
            label="Name" :placeholder="axis.column" />

          <PlDropdown v-model="axis.spec.type" :options="VALUE_TYPE_OPTIONS" label="Type" required />
        </div>

        <div :class="$style.formRow">
          <PlTextArea :model-value="jsonToString(axis.spec.domain)"
            @update:model-value="updateAxisDomain(index, $event)" label="Domain (JSON)" placeholder="{}" />

          <PlTextArea :model-value="jsonToString(axis.spec.annotations)"
            @update:model-value="updateAxisAnnotations(index, $event)" label="Annotations (JSON)" placeholder="{}" />
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
