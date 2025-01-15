<script setup lang="ts">
import { undef } from '@milaboratories/helpers';
import {
  PlContainer,
  PlBtnGroup,
  PlCheckboxGroup,
  PlTextField,
  PlDropdown,
  listToOptions,
  PlDropdownMulti,
  PlDropdownRef,
  PlDropdownMultiRef,
  PlNumberField,
  PlLogView,
  PlTextArea,
} from '@platforma-sdk/ui-vue';
import { reactive, ref } from 'vue';

const data = reactive({
  text: 'some text',
  number: 0,
  single: 'A',
  multiple: ['A', 'B'],
  importHandles: [] as unknown[],
  currentTab: 'one',
  ref: undefined,
  multiRef: [],
});

const shortOptions = listToOptions(['A', 'B', 'C', 'D']);
const options = listToOptions(['A', 'B', 'C', 'D']);
const refOptions = ref(
  undef([
    {
      label: 'Block 1 label',
      ref: {
        __isRef: true as const,
        blockId: '1',
        name: 'Block 1',
      },
    },
    {
      label: 'Block 2 label',
      ref: {
        __isRef: true as const,
        blockId: '2',
        name: 'Block 2',
      },
    },
  ]),
);
const refOptionsMulti = ref(
  undef([
    {
      label: 'Block 1 label Ref',
      ref: {
        __isRef: true as const,
        blockId: '1',
        name: 'Block 1 Ref',
      },
    },
    {
      label: 'Block 2 label Ref',
      ref: {
        __isRef: true as const,
        blockId: '2',
        name: 'Block 2 Ref',
      },
    },
  ]),
);
</script>

<template>
  <PlContainer width="400px">
    <PlBtnGroup
      v-model="data.single"
      label="PlBtnGroup"
      :options="shortOptions"
    >
      <template #tooltip>
        Tooltip content
      </template>
    </PlBtnGroup>
    <PlTextField v-model="data.text" label="PlTextField" clearable >
      <template #tooltip>
        Tooltip content
      </template>
    </PlTextField>
    <PlNumberField v-model="data.number" label="PlNumberField" clearable>
      <template #tooltip>
        Tooltip content
      </template>
    </PlNumberField>
    <PlDropdown v-model="data.single" label="PlDropdown" :options="options" >
      <template #tooltip>
        Tooltip content
      </template>
    </PlDropdown>
    <PlDropdownRef
      v-model="data.ref"
      label="PlDropdownRef"
      :options="refOptions"
    >
      <template #tooltip>
        Tooltip content
      </template>
    </PlDropdownRef>
    <PlDropdownMultiRef
      v-model="data.multiRef"
      :options="refOptionsMulti ?? []"
      label="PlDropdownMultiRef"
    >
      <template #tooltip>
        Tooltip content
      </template>
    </PlDropdownMultiRef>
    <PlDropdownMulti v-model="data.multiple" label="PlDropdownMulti" :options="options" >
      <template #tooltip>
        Tooltip content
      </template>
    </PlDropdownMulti>
    <PlCheckboxGroup v-model="data.multiple" label="PlCheckboxGroup" :options="options" >
      <template #tooltip>
        Tooltip content
      </template>
    </PlCheckboxGroup>
  </PlContainer>
  <PlContainer width="400px" style="margin: 0 24px 0 24px">
    <PlTextArea label="PlTextArea">
      <template #tooltip>
        Tooltip content
      </template>
    </PlTextArea>
    <PlLogView label="PlLogView" value="logs content">
      <template #tooltip>
        Tooltip content
      </template>
    </PlLogView>
  </PlContainer>
</template>
