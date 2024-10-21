<script setup lang="ts">
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import { Basic, BasicRaw } from './examples';
import componentProps from './props';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';
</script>

<template>
  <AppDocCodeContainer>
    <CodeExample :code="BasicRaw">
      <template #name>Basic usage</template>
      <Basic />
    </CodeExample>

    <ComponentProps :data="componentProps" />
  </AppDocCodeContainer>
</template>
