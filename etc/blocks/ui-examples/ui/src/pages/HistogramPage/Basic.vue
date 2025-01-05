<script setup lang="ts">
import {
  PlRow,
  PlChartHistogram,
  useComponentProp,
} from '@platforma-sdk/ui-vue';
import data from './assets/prices';

const settings = useComponentProp<typeof PlChartHistogram, 'settings'>(() => {
  return {
    type: 'basic',
    title: 'My histogram',
    numbers: data.map((it) => Number(it.price)).filter((it) => it < 1000),
    nBins: 35,
  };
});
</script>

<template>
  <PlRow>
    <PlChartHistogram :settings="settings" />
  </PlRow>
</template>
