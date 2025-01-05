<script setup lang="ts">
import {
  PlRow,
  Gradient,
  PlChartStackedBar,
} from '@platforma-sdk/ui-vue';
import { computed } from 'vue';

const data = [{
  label: 'The best',
  value: 100,
}, {
  label: 'Good but not great',
  value: 60,
}, {
  label: 'A little worse',
  value: 40,
}, {
  label: 'Not good',
  value: 33,
}, {
  label: 'Awful',
  value: 330,
}, {
  label: 'Nightmare',
  value: 30,
}, {
  label: 'Hell',
  value: 30,
}];

const settings = computed(() => {
  const colors = Gradient('viridis').split(data.length);

  return {
    data: data.map((it, i) => ({ ...it, color: colors[i] })),
  };
});
</script>

<template>
  <PlRow>
    <PlChartStackedBar :settings="settings" />
  </PlRow>
  <PlRow>
    <pre>{{ JSON.stringify(settings, null, 2) }}</pre>
  </PlRow>
</template>
