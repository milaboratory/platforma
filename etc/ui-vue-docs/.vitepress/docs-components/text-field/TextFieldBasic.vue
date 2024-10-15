<script setup lang="ts">
import AppCodeBlock from '@app-components/AppCodeBlock.vue';
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import { BasicRaw, Basic, ClearableRaw, Clearable } from './examples';
import componentProps from './props';
</script>

<template>
  <div class="d-flex gap-20 flex-column">
    <AppCodeBlock>
      <CodeExample :code="BasicRaw">
        <template #name>Basic usage</template>
        <Basic />
      </CodeExample>
    </AppCodeBlock>

    <ComponentProps :data="componentProps" />

    <AppCodeBlock>
      <CodeExample :code="ClearableRaw">
        <template #name>Clearable</template>
        <Clearable />
      </CodeExample>
    </AppCodeBlock>
  </div>
</template>
