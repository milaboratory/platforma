<script setup lang="ts">
import { PlBlockPage } from '@platforma-sdk/ui-vue';
import { PlAnnotationSidebar } from '@milaboratories/uikit';
import { reactive } from 'vue';

const props = reactive({
  model: undefined,
});

</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlAnnotationSidebar/>
  </plblockpage>
</template>
