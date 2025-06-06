<script lang="ts" setup>
import { computed } from 'vue';
import type { Color } from '../../colors';

function splitBy<T>(arr: T[], n: number): T[][] {
  const res = [];
  let chunk: T[] = [];

  for (let i = 0; i < arr.length; i++) {
    if (chunk.length < n) {
      chunk.push(arr[i]);
    } else {
      res.push(chunk);
      chunk = [arr[i]];
    }
  }

  res.push(chunk);

  return res;
}

const props = defineProps<{
  maxInColumn?: number;
  legends: {
    color: string | Color;
    text: string;
  }[];
}>();

const groups = computed(() => {
  return splitBy(props.legends, props.maxInColumn ?? 5);
});
</script>

<template>
  <div :class="$style.component">
    <div v-for="(group, k) in groups" :key="k" :class="$style.legend">
      <div v-for="(l, i) in group" :key="i" :class="$style.item">
        <div :class="$style.chip" :style="{ backgroundColor: l.color.toString() }" />
        {{ l.text }}
      </div>
    </div>
  </div>
</template>

<style lang="css" module>
.component {
  display: flex;
  flex-direction: row;
  gap: 24px;
  justify-content: space-between;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-wrap: nowrap;
  margin-top: 24px;
  max-height: 120px;
  flex: 1;
}

.chip {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  flex-grow: 0;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: var(--color-txt-01);
}
</style>
