<script lang="ts" setup>
import { PlErrorBoundary } from '@platforma-sdk/ui-vue';
import { defineComponent } from 'vue';

const BrokenComponent = defineComponent(() => {
  throw new Error('Broken component message');
}, {
  name: 'BrokenComponent',
});
</script>

<template>
  <PlErrorBoundary>
    <BrokenComponent />
  </PlErrorBoundary>
</template>
