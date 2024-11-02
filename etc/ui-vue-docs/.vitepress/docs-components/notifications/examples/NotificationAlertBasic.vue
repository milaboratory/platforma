<script setup lang="ts">
import { PlBtnPrimary, PlNotificationAlert, PlSpacer } from '@milaboratories/uikit';
import { ref } from 'vue';
const model = ref(true);
</script>

<template>
  <PlNotificationAlert type="neutral" width="100%" closable>
    Lorem ipsum dolor sit amet consectetur adipisicing elit.
  </PlNotificationAlert>
  <PlNotificationAlert type="success" width="100%">
    Lorem ipsum dolor sit amet consectetur adipisicing elit.
  </PlNotificationAlert>
  <PlNotificationAlert type="warning" width="100%">
    Lorem ipsum dolor sit amet consectetur adipisicing elit.
  </PlNotificationAlert>
  <PlNotificationAlert v-model="model" type="error" width="100%">
    Lorem ipsum dolor sit amet consectetur adipisicing elit.
    <template #actions>
      <PlSpacer />
      <PlBtnPrimary @click="model = false">Close alert</PlBtnPrimary>
    </template>
  </PlNotificationAlert>
  <PlNotificationAlert type="error" width="100%" closable>
    Lorem ipsum dolor sit amet consectetur adipisicing elit.
    <template #actions>
      <PlSpacer />
      <PlBtnPrimary>Report error</PlBtnPrimary>
    </template>
  </PlNotificationAlert>
  <PlNotificationAlert type="warning" width="100%" closable>
    Lorem ipsum dolor sit amet consectetur adipisicing elit. Earum nam cumque nemo commodi,
    doloremque illo vitae debitis, magni architecto obcaecati eius porro placeat! Ipsa voluptates
    ratione eveniet exercitationem nam ea.
    <template #actions>
      <PlSpacer />
      <PlBtnPrimary>Report warning</PlBtnPrimary>
    </template>
  </PlNotificationAlert>
</template>
