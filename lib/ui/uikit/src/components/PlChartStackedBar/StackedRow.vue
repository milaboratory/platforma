<script lang="ts" setup>
import { tapIf } from '@milaboratories/helpers';
import { computed } from 'vue';
import type { PlChartStackedBarSegment } from './types';

const props = defineProps<{
  value: PlChartStackedBarSegment[];
  height?: number;
  showFractionInLabel?: boolean;
}>();

const style = computed(() => ({
  height: '100%',
  minHeight: '82px',
}));

const parts = computed(() => {
  const parts = props.value || [];
  const total = parts.reduce((res, it) => res + it.value, 0);
  return parts.map((p) => {
    const fraction = (p.value / total) * 100;
    const fractionString = ((p.value / total) * 100).toFixed(1);
    const label = tapIf(p.label, (label) => {
      if (props.showFractionInLabel) {
        return `${label} ${fractionString}%`;
      }

      return label;
    });
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
    <div :class="$style.track">
      <div
        v-for="(v, i) in [0, 25, 50, 75, 100]"
        :key="i"
        :style="`left: ${v}%`"
        :data-content="`${v}%`"
      />
    </div>
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
  height: auto;
  position: relative;
  overflow: visible;
  border: 1px solid green;

  border: 1px solid var(--txt-01);
  padding: 12px 6px;
  border-radius: 0;
  margin-bottom: 24px;
}

.container {
  display: flex;
  flex-direction: row;
  gap: 1px;
  width: 100%;
  height: 100%;
  align-items: center;
  overflow: hidden;
  > div {
    height: 100%;
    display: flex;
    align-items: center;
  }
}

.track {
  position: absolute;
  top: 0;
  left: 6px;
  right: 6px;
  bottom: 0;
  /* z-index: 1; */
  > div {
    height: 100%;
    position: absolute;
    bottom: 0;
    border-left: 1px solid #e1e3eb;
    &::after {
      position: absolute;
      content: attr(data-content);
      left: 0;
      bottom: -24px;
      transform: translateX(-50%);
    }
  }
}

.notReady {
  color: var(--txt-03) !important;
}

.component .notReady {
  font-size: larger;
  font-weight: bolder;
  color: var(--txt-mask);
  margin-left: 24px;
}

.component .container {
  position: relative;
  z-index: 1;
}
</style>
