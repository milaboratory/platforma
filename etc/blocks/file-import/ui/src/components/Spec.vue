<script setup lang="tsx">
import type { SpecUI } from '@milaboratories/milaboratories.file-import-block.model';
import type { XsvMetadata } from '../hooks/useMetadataXsv';
import AxesConfiguration from './AxesConfiguration.vue';
import BasicSettings from './BasicSettings.vue';
import ColumnsConfiguration from './ColumnsConfiguration.vue';

const spec = defineModel<SpecUI>({ required: true });
const props = defineProps<{ metadata?: XsvMetadata }>();
</script>

<template>
  <div :class="$style.specForm">
    <BasicSettings v-model="spec" />

    <div>
      <AxesConfiguration v-model="spec.axes" :metadata="props.metadata" />
      <ColumnsConfiguration v-model="spec.columns" :metadata="props.metadata" />
    </div>
  </div>
</template>

<style module>
.specForm {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
