<script lang="ts" setup>
import { computed } from 'vue';
import { datum } from '@milaboratory/platforma-core';

const props = defineProps<{
  value: string;
}>();

const parsed = computed(() => {
  if (props.value) {
    try {
      return JSON.parse(props.value);
    } catch (error) {
      return { segments: [] };
    }
  }

  return { segments: [] };
});

const segments = computed<
  | {
      geneFeature: string;
      sequence: string;
    }[]
  | null
>(() => parsed?.value?.segments ?? []);
</script>

<template>
  <div class="marked-sequence">
    <div
      v-for="(v, i) in segments"
      :key="i"
      :style="{
        backgroundColor: datum.getFeatureColor(v.geneFeature),
      }"
      :title="v.geneFeature"
    >
      {{ v.sequence }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.marked-sequence {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
}
</style>
