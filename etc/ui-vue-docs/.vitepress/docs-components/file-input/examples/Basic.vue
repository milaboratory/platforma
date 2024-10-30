<script setup lang="ts">
import { PlFileInput } from '@platforma-sdk/ui-vue';
import type { ImportFileHandle } from '@platforma-sdk/model';
import { reactive } from 'vue';

const data = reactive({
  model: undefined as ImportFileHandle | undefined
});
</script>

<template>
  <PlFileInput v-model="data.model" label="Import file" />
</template>
