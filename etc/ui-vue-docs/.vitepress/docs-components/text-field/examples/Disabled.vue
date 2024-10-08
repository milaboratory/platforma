<script setup lang="ts">
import { reactive } from 'vue';
import { PlTextField } from '@platforma-sdk/ui-vue';

const data = reactive({
  model: 'Input text',
});
</script>

<template>
  <!-- You cannot interact with the control of the disabled parameter is set to `true.` -->
  <PlTextField
    v-model="data.model"
    label="Disabled control"
    :disabled="true"
  />
</template>
