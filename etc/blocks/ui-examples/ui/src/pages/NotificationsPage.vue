<script setup lang="ts">
import { PlBlockPage, PlStatusTag } from '@platforma-sdk/ui-vue';
</script>
<template>
  <PlBlockPage>
    <template #title>Notifications and Alerts</template>
    <div class="d-flex gap-8 align-center">
      <PlStatusTag type="OK"/>
      <PlStatusTag type="WARN" />
      <PlStatusTag type="WARN" > Slot text </PlStatusTag>
      <PlStatusTag type="ALERT" />
      <PlStatusTag type="HOLD" />
    </div>
  </PlBlockPage>
</template>
