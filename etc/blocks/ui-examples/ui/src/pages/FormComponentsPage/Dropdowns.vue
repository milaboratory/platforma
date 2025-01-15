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
  PlRow,
} from '@platforma-sdk/ui-vue';
import type { Ref } from 'vue';
import { reactive, ref } from 'vue';

const data = reactive({
  disabled: false,
  clearable: true,
  model: 1,
  multi: [],
  multiRefSelected: [
    {
      __isRef: true as const,
      blockId: '1',
      name: 'Block 1 Ref',
    },
  ],
  ref: undefined,
});

const simpleOptions = ref(
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
      text: 'Three',
      value: 3,
    },
    {
      text: 'NaN',
      value: NaN,
    },
  ]),
);

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

const toggleRefValue = (r: Ref<unknown>) => {
  const prev = r.value;

  r.value = undefined;

  setTimeout(() => {
    r.value = prev;
  }, 3000);
};

const showOptionsLoading = () => {
  toggleRefValue(simpleOptions);
  toggleRefValue(refOptions);
};
</script>

<template>
  <PlContainer>
    <PlRow>
      <PlCheckbox v-model="data.disabled">Disabled</PlCheckbox>
      <PlCheckbox v-model="data.clearable">Clearable</PlCheckbox>
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
        />
        <PlDropdownRef
          v-model="data.ref"
          :disabled="data.disabled"
          :clearable="data.clearable"
          label="PlDropdownRef"
          :options="refOptions"
        />

        <PlDropdownMulti
          v-model="data.multi"
          :disabled="data.disabled"
          :options="simpleOptions ?? []"
          label="PlDropdownMulti"
        />

        <PlDropdownMultiRef
          v-model="data.multiRefSelected"
          :disabled="data.disabled"
          :options="refOptionsMulti ?? []"
          label="PlDropdownMultiRef"
        />

        <PlDropdownMulti
          v-model="data.multi"
          :disabled="data.disabled"
          :options="undefined"
          label="PlDropdownMulti"
        />

        <PlDropdownMultiRef
          v-model="data.multi"
          :disabled="data.disabled"
          :options="undefined"
          label="PlDropdownMultiRef"
        />

        <div v-if="false" style="height: 1200px; background-color: green; width: 50px"/>
      </PlContainer>
    </PlRow>
    <PlRow>
      <pre>{{ data }}</pre>
    </PlRow>
  </PlContainer>
</template>
