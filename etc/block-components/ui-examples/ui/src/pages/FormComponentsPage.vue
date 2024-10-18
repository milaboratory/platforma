<script setup lang="ts">
import {
  PlBlockPage,
  PlContainer,
  PlRow,
  PlBtnGroup,
  PlCheckboxGroup
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  single: 1,
  multiple: [1, 2]
});

const options = [
  {
    label: 'A',
    value: 1
  },
  {
    label: 'B',
    value: 2
  },
  {
    label: 'C',
    value: 3
  },
  {
    label: 'D',
    value: 4
  }
];
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Form components</template>
    <PlRow>
      <PlContainer width="400px">
        <PlRow>
          <PlBtnGroup v-model="data.single" label="PlBtnGroup" :options="options" />
        </PlRow>
        <PlRow>
          <PlCheckboxGroup v-model="data.multiple" label="PlCheckboxGroup" :options="options" />
        </PlRow>
      </PlContainer>
      <PlContainer width="400px">
        <pre style="border: 1px solid var(--txt-01); padding: 12px; font-weight: bolder">{{
          data
        }}</pre>
      </PlContainer>
    </PlRow>
  </PlBlockPage>
</template>
