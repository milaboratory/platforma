<script setup lang="ts">
import CodeExample from '@app-components/CodeExample.vue';
import { Basic, BasicRaw } from './examples';

import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';
</script>

<template>
  <AppDocCodeContainer>
    <CodeExample :code="BasicRaw">
      <template #name>Basic usage</template>
      <Basic />
    </CodeExample>
  </AppDocCodeContainer>
</template>
