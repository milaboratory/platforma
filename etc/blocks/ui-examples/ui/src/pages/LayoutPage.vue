<script setup lang="ts">
import { PlBlockPage, PlCheckbox } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  noBodyGutters: false
});
</script>

<template>
  <PlBlockPage :no-body-gutters="data.noBodyGutters">
    <template #title> Layout page (wip) </template>
    <template #append>
      <PlCheckbox v-model="data.noBodyGutters">No body gutters</PlCheckbox>
    </template>
    <div :class="$style.content">Content</div>
  </PlBlockPage>
</template>

<style module>
/* :global(.pl-container) {
  outline: 1px dotted #eee;
}

:global(.pl-section-separator) {
  outline: 1px dashed #eee;
} */

.content {
  display: flex;
  place-items: center;
  place-content: center;
  height: 100%;
  background-color: #eee;
  color: #fff;
  font-size: 34px;
  font-weight: bold;
}
</style>
