<script lang="ts" setup>
import { computed } from 'vue';
import type { PlChartStackedBarSegment } from './types';

const props = defineProps<{
  value: PlChartStackedBarSegment[];
  height?: number;
}>();

const style = computed(() => ({
  height: props.height ?? '100%',
  minHeight: '24px',
}));

const parts = computed(() => {
  const parts = props.value || [];
  const total = parts.reduce((res, it) => res + it.value, 0);
  return parts.map((p) => {
    const fraction = (p.value / total) * 100;
    const label = p.label;
    return {
      color: p.color.toString(),
      description: p.description,
      fraction,
      label,
    };
  });
});
</script>

<template>
  <div
    :class="[$style.component]" :style="style"
  >
    <div :class="$style.container">
      <div v-if="!parts.length" :class="$style.notReady">Not ready</div>
      <div
        v-for="(p, i) in parts"
        :key="i"
        :title.prop="p.description ?? p.label"
        :style="{
          width: `${p.fraction}%`,
          backgroundColor: p.color
        }"
      />
    </div>
  </div>
</template>

<style lang="scss" module>
.component {
  display: flex;
  position: relative;
  overflow: hidden;
  padding: 0;
  border-radius: 2px;

  .notReady {
    color: var(--txt-01);
    font-family: var(--font-family-base);
    font-size: 14px;
    font-style: normal;
    font-weight: 500;
    line-height: 20px;
  }

  .container {
    position: relative;
  }
}

.container {
  display: flex;
  flex-direction: row;
  width: 100%;
  flex: 1;
  align-items: center;
  overflow: hidden;
  > div {
    height: 100%;
    display: flex;
    align-items: center;
  }
}

.notReady {
  color: var(--txt-03) !important;
}
</style>
