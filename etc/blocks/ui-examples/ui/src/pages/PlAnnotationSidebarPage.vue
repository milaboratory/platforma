<script setup lang="ts">
import { PlBlockPage, PlBtnPrimary } from '@platforma-sdk/ui-vue';
import { PlAnnotationSidebar } from '@milaboratories/uikit';
import { watch, ref } from 'vue';

const opened = ref(true);
const annotations = ref([
  { id: 1, name: 'Annotation 1', options: ['Option 1', 'Option 2'] },
  { id: 2, name: 'Annotation 2', options: ['Option A', 'Option B'] },
]);

watch(annotations, () => {
  console.log('Annotations:', annotations.value);
}, { deep: true });

</script>

<template>
  <PlBlockPage style="max-width: 100%; height: 100%">
    <PlBtnPrimary @click="opened = !opened">
      Toggle Sidebar
    </PlBtnPrimary>

    <PlAnnotationSidebar
      v-model:annotations="annotations"
      v-model:opened="opened"
      style="height: 100%"
      title="My Schema"
    />
  </plblockpage>
</template>
