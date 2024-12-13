<script setup lang="ts">
import { PlBlockPage, PlStatusTag } from '@platforma-sdk/ui-vue';
</script>
<template>
  <PlBlockPage>
    <template #title>Notifications and Alerts</template>
    <div class="d-flex gap-8 align-center">
      <PlStatusTag type="success"/>
      <PlStatusTag type="warning" />
      <PlStatusTag type="alert" />
      <PlStatusTag type="hold" />
    </div>
  </PlBlockPage>
</template>
