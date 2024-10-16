<script setup lang="ts">
import { reactive } from 'vue';
import { PlTextField } from '@platforma-sdk/ui-vue';

const data = reactive({
  stringValue: 'Input text',
});
</script>

<template>
  <!-- Most basic example -->

  <PlTextField v-model="data.stringValue" label="Most basic" />

  <!-- Advanced -->
  <PlTextField
    v-model="data.stringValue"
    label="Advanced"
    placeholder="Enter text"
    clearable
    required
    prefix="$ :"
    :dashed="false"
    :disabled="false"
    :helper="'Current value: ' + data.stringValue"
  />
</template>
