<script setup lang="ts">
import {
  PlRow,
  PlChartHistogram,
} from '@platforma-sdk/ui-vue';
import { computed } from 'vue';
import data from './assets/prices';

const settings = computed(() => {
  return {
    type: 'basic' as const,
    title: 'My histogram',
    numbers: data.map((it) => Number(it.price)).filter((it) => it < 1000),
    nBins: 35,
    log: true,
  };
});
</script>

<template>
  <PlRow>
    <PlChartHistogram :settings="settings" />
  </PlRow>
</template>
