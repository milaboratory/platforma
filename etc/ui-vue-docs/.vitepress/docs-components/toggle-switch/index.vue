<script lang="ts" setup>
import { Base, BaseRaw } from './examples';
import CodeExample from '@app-components/CodeExample.vue';
import AppCodeBlock from '@app-components/AppCodeBlock.vue';
import componentProps from './props';
import ComponentProps from '@app-components/ComponentProps.vue';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';
</script>

<template>
  <AppDocCodeContainer>
    <AppCodeBlock>
      <template #description> It is a component for manipulating a boolean value </template>
      <CodeExample :code="BaseRaw">
        <template #name>Switcher</template>
        <Base />
      </CodeExample>
    </AppCodeBlock>
    <ComponentProps :data="componentProps" />
  </AppDocCodeContainer>
</template>
