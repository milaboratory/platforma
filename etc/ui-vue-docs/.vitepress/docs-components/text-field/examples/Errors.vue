<script setup lang="ts">
import { computed, reactive } from 'vue';
import { PlTextField, PlCheckbox } from '@platforma-sdk/ui-vue';

const data = reactive({
  model: '123456',
  placeholder: 'Enter text',
  showExternalError: false,
});

const externalError = computed(() =>
  data.showExternalError ? 'Some exteral error.' : undefined,
);

const rules = [
  // check if there is some value
  (v?: string) => {
    if (v) {
      return (
        v.length > 4 || '(rule) Length must be more than 4 chars.'
      );
    }
    return true;
  },
  // value must be
  (v?: string) =>
    (v && v.length > 4) || '(rule) Length must be more than 4 chars.',
  // value must be
  (v?: string) =>
    (v && /^\d+$/.test(v)) || '(rule) Only numbers allowed.',
];
</script>

<template>
  <PlTextField
    v-model="data.model"
    label="Input label"
    clearable
    :error="externalError"
    prefix="$ &nbsp;"
    :rules="rules"
  />

  <PlCheckbox v-model="data.showExternalError" class="mt-4">
    Pass external error
  </PlCheckbox>
</template>
