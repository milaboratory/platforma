<script setup lang="ts">
import CodeExample from '@app-components/CodeExample.vue';
import ComponentProps from '@app-components/ComponentProps.vue';
import AppDocCodeContainer from '@app-components/AppDocCodeContainer.vue';
import { NotificationAlertBasic, NotificationAlertBasicRaw } from './examples';
</script>
<template>
  <AppDocCodeContainer>
    <CodeExample :code="NotificationAlertBasicRaw">
      <template #name>Basic usage</template>
      <NotificationAlertBasic />
    </CodeExample>
  </AppDocCodeContainer>
</template>
