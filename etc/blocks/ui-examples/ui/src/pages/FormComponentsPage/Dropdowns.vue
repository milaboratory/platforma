<script setup lang="ts">
import { undef } from '@milaboratories/helpers';
import {
  PlBtnPrimary,
  PlCheckbox,
  PlContainer,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownMultiRef,
  PlDropdownRef,
  PlIcon16,
  PlRow,
} from '@platforma-sdk/ui-vue';
import { computed, reactive, ref } from 'vue';
import type { ListOption } from '@platforma-sdk/ui-vue';

const data = reactive({
  disabled: false,
  clearable: true,
  withGroups: false,
  optionsLoading: false,
  model: 1 as number | string | undefined,
  multi: [] as (number | string)[],
  multiRefSelected: [
    {
      __isRef: true as const,
      blockId: '1',
      name: 'Block 1 Ref',
    },
  ],
  ref: undefined,
});

const simpleOptionsBase = ref<ListOption<unknown>[] | undefined>(
  undef([
    {
      label: 'One',
      value: 1,
    },
    {
      label: 'Two',
      value: 2,
    },
    {
      label: 'Three',
      value: 3,
    },
    {
      label: 'Letter C',
      value: 'C',
    },
    {
      label: 'Four (4)',
      value: 4,
    },
    {
      label: 'Five',
      value: 5,
    },
    {
      text: 'Letter A',
      value: 'A',
    },
    {
      label: 'Letter B',
      value: 'B',
    },
    {
      label: 'Letter D (no group)',
      value: 'D',
    },
  ]),
);

const simpleOptions = computed(() => {
  if (data.optionsLoading) {
    return undefined;
  }

  return simpleOptionsBase.value?.map((option) => ({
    ...option,
    group: data.withGroups ? (option.value === 'D' ? undefined : typeof option.value) : undefined,
  }));
});

const refOptions = computed(() => {
  if (data.optionsLoading) {
    return undefined;
  }

  return undef([
    {
      label: 'Block 1 label',
      ref: {
        __isRef: true as const,
        blockId: '1',
        name: 'Block 1',
      },
      group: data.withGroups ? 'Group 1' : undefined,
    },
    {
      label: 'Block 2 label',
      ref: {
        __isRef: true as const,
        blockId: '2',
        name: 'Block 2',
      },
      group: data.withGroups ? 'Group 2' : undefined,
    },
  ]);
});

const refOptionsMulti = computed(() => {
  if (data.optionsLoading) {
    return undefined;
  }

  return undef([
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
  ]);
});

const showOptionsLoading = () => {
  data.optionsLoading = true;

  setTimeout(() => {
    data.optionsLoading = false;
  }, 3000);
};
</script>

<template>
  <PlContainer>
    <PlRow>
      <PlCheckbox v-model="data.disabled">Disabled</PlCheckbox>
      <PlCheckbox v-model="data.clearable">Clearable</PlCheckbox>
      <PlCheckbox v-model="data.withGroups">With groups</PlCheckbox>
      <PlBtnPrimary @click="showOptionsLoading">Show options loading</PlBtnPrimary>
    </PlRow>
    <PlRow>
      <PlContainer width="400px">
        <PlDropdown
          v-model="data.model"
          :disabled="data.disabled"
          :clearable="data.clearable"
          label="PlDropdown"
          :options="simpleOptions"
        />
        <PlDropdown
          v-model="data.model"
          :disabled="data.disabled"
          :clearable="data.clearable"
          label="PlDropdown"
          :options="simpleOptions"
        >
          <template #append>
            <PlIcon16 name="settings" />
          </template>
        </PlDropdown>
        <PlDropdown
          v-model="data.model"
          :disabled="data.disabled"
          :clearable="data.clearable"
          label="PlDropdown"
          :options="simpleOptions"
        />
        <PlDropdownRef
          v-model="data.model"
          :disabled="data.disabled"
          :clearable="data.clearable"
          label="PlDropdownRef (with regular options)"
          :options="simpleOptions"
        />
        <PlDropdownRef
          v-model="data.ref"
          :disabled="data.disabled"
          :clearable="data.clearable"
          label="PlDropdownRef (with ref options)"
          :options="refOptions"
        />

        <PlDropdownMulti
          v-model="data.multi"
          :disabled="data.disabled"
          :options="simpleOptions"
          label="PlDropdownMulti"
        />

        <PlDropdownMulti
          v-model="data.multi"
          :disabled="data.disabled"
          :options="simpleOptions"
          label="PlDropdownMulti"
        >
          <template #append>
            <PlIcon16 name="settings" />
          </template>
        </PlDropdownMulti>

        <PlDropdownMultiRef
          v-model="data.multiRefSelected"
          :disabled="data.disabled"
          :options="refOptionsMulti"
          label="PlDropdownMultiRef"
        />
      </PlContainer>
    </PlRow>
    <PlRow>
      <pre>{{ data }}</pre>
    </PlRow>
  </PlContainer>
</template>
