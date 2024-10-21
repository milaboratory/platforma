<script setup lang="ts">
import CodeExample from '@app-components/CodeExample.vue';
import { Errors, ErrorsRaw } from './examples';
</script>

<template>
  <CodeExample :code="ErrorsRaw">
    <template #name>Validation</template>
    <Errors />
  </CodeExample>
</template>
