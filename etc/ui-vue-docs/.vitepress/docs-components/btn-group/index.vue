<script lang="ts" setup>
import ComponentProps from '@app-components/ComponentProps.vue';
import AppCodeBlock from '@app-components/AppCodeBlock.vue';
import CodeExample from '@app-components/CodeExample.vue';
import { BtnGroupBasic, BtnGroupBasicRaw, BtnGroupLabel, BtnGroupLabelRaw } from './examples';
import componentProps from './props';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';
</script>

<template>
  <AppDocCodeContainer>
    <AppCodeBlock>
      <template #description> A component for selecting one value from a list of options </template>
      <CodeExample :code="BtnGroupBasicRaw">
        <template #name>Basic usage</template>
        <BtnGroupBasic />
      </CodeExample>
    </AppCodeBlock>
    <ComponentProps :data="componentProps" />
    <AppCodeBlock>
      <CodeExample :code="BtnGroupLabelRaw">
        <template #name>Label and tooltip</template>
        <BtnGroupLabel />
      </CodeExample>
    </AppCodeBlock>
  </AppDocCodeContainer>
</template>
