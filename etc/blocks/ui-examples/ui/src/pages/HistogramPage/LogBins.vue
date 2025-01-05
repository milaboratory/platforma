<script setup lang="ts">
import {
  PlRow,
  PlChartHistogram,
  useComponentProp,
} from '@platforma-sdk/ui-vue';
import bins from './assets/bins';

const settings = useComponentProp<typeof PlChartHistogram, 'settings'> (() => {
  return {
    type: 'log-bins',
    title: 'Predefined bins (log x scale)',
    bins,
    threshold: 19.0,
    yAxisLabel: 'Number of UMIs',
    xAxisLabel: 'Number of reads per UMI',
  };
});
</script>

<template>
  <PlRow>
    <PlChartHistogram :settings="settings" />
  </PlRow>
</template>
