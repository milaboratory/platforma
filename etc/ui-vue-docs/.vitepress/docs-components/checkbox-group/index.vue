<script lang="ts" setup>
import { Basic, BasicRaw } from './examples';
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import AppCodeBlock from '@app-components/AppCodeBlock.vue';
import props from './props';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';
</script>

<template>
  <AppDocCodeContainer>
    <AppCodeBlock>
      <template #description>
        Component for selecting multiple values from a list of options.
      </template>
      <CodeExample :code="BasicRaw">
        <template #name>Basic usage</template>
        <Basic />
      </CodeExample>
    </AppCodeBlock>
    <ComponentProps :data="props" />
  </AppDocCodeContainer>
</template>
