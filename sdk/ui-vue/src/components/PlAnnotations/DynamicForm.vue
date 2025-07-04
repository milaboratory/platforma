<script setup lang="ts" generic="T extends FilterUi = FilterUi">
import type { FilterUi, SUniversalPColumnId, TypeFieldRecord } from '@platforma-sdk/model';
import type { FilterUiType } from '@platforma-sdk/model';
import { computed, watch } from 'vue';
import { PlTextField, PlDropdown, PlNumberField, PlCheckbox } from '@milaboratories/uikit';
import { getFilterUiTypeOptions, getFilterUiMetadata } from '@platforma-sdk/model';
import type { SimplifiedUniversalPColumnEntry } from './types';
import { isNil } from '@milaboratories/helpers';

type ObjectEntries<T, K extends keyof T = keyof T> = [K, T[K]][];

const formData = defineModel<T>({ default: () => ({}) });

const props = defineProps<{
  columns: SimplifiedUniversalPColumnEntry[];
  formMetadata: TypeFieldRecord<T>;
}>();

const columnSpecRef = computed(() => {
  const value = formData.value;
  if ('column' in value) {
    return props.columns.find((c) => c.id === value.column)?.obj;
  }
  return undefined;
});

const typeMetadataRef = computed(() => {
  const value = formData.value;
  if (value.type && typeof value.type === 'string') {
    return getFilterUiMetadata(value.type);
  }
  return undefined;
});

const filterUiTypeOptions = computed(() => {
  return getFilterUiTypeOptions(columnSpecRef.value);
});

const firstColumnsOptions = computed(() => props.columns.map((c) => ({ label: c.label, value: c.id })));
const secondColumnOptions = computed(() => {
  const typeMetadata = typeMetadataRef.value;
  const columnSpec = columnSpecRef.value;
  if (typeMetadata && columnSpec) {
    return props.columns.filter((c) => typeMetadata.supportedFor(columnSpec, c.obj)).map((c) => ({
      label: c.label,
      value: c.id,
    }));
  }
  return [];
});

const setFieldValue = <K extends keyof T>(fieldName: K, value: T[K]) => {
  formData.value[fieldName] = value;
};

watch(() => props.formMetadata, (newForm) => {
  for (const [fieldName, field] of Object.entries(newForm) as ObjectEntries<typeof newForm>) {
    if (formData.value[fieldName] === undefined) {
      const value = field.defaultValue();
      if (!isNil(value)) {
        formData.value[fieldName] = value;
      }
    }
  }
},
{ immediate: true, deep: true },
);

</script>

<template>
  <div v-if="formMetadata" :class="$style.form">
    <template v-for="(field, fieldName) in formMetadata" :key="fieldName">
      <template v-if="field.fieldType === 'form'">
        <!-- TODO: Nested Form not described in FilterUi, we need to define it later. Even more in type it don't possible situations -->
        <DynamicForm
          v-if="'form' in field"
          :model-value="formData[fieldName] as any"
          :form-metadata="field.form as any"
          :columns="props.columns"
          @update:model-value="setFieldValue(fieldName, $event as T[keyof T])"
        />
      </template>
      <template v-else-if="field.fieldType === 'FilterUiType'">
        <PlDropdown
          :model-value="formData[fieldName] as FilterUiType"
          :label="field.label ?? fieldName"
          :options="filterUiTypeOptions"
          @update:model-value="setFieldValue(fieldName, $event as T[keyof T])"
        />
      </template>
      <template v-else-if="field.fieldType === 'string'">
        <PlTextField
          :model-value="formData[fieldName] as string"
          :label="field.label ?? fieldName"
          @update:model-value="setFieldValue(fieldName, $event as T[keyof T])"
        />
      </template>
      <template v-else-if="field.fieldType === 'SUniversalPColumnId'">
        <PlDropdown
          :model-value="formData[fieldName] as SUniversalPColumnId"
          :label="field.label ?? fieldName"
          :options="fieldName === 'column' ? firstColumnsOptions : secondColumnOptions"
          @update:model-value="setFieldValue(fieldName, $event as T[keyof T])"
        />
      </template>
      <template v-else-if="field.fieldType === 'number'">
        <PlNumberField
          :model-value="formData[fieldName] as number"
          :label="field.label ?? fieldName"
          @update:model-value="setFieldValue(fieldName, $event as T[keyof T])"
        />
      </template>
      <template v-else-if="field.fieldType === 'number?'">
        <PlNumberField
          :model-value="formData[fieldName] as (undefined | number)"
          :label="field.label ?? fieldName"
          :clearable="true"
          @update:model-value="setFieldValue(fieldName, $event as T[keyof T])"
        />
      </template>
      <template v-else-if="field.fieldType === 'boolean' || field.fieldType === 'boolean?'">
        <PlCheckbox
          :model-value="Boolean(formData[fieldName])"
          :label="field.label ?? fieldName"
          @update:model-value="setFieldValue(fieldName, $event as T[keyof T])"
        >
          {{ field.label ?? fieldName }}
        </PlCheckbox>
      </template>
      <template v-else>
        <pre>TODO:{{ field.fieldType }}</pre>
      </template>
    </template>
  </div>
</template>

<style module>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
