<script setup lang="ts">
import { computed } from 'vue';
import type { ListOption } from '@/types';

const props = withDefaults(
  defineProps<{
    item: ListOption;
    isSelected: boolean;
    isHovered: boolean;
  }>(),
  {
    isSelected: false,
    isHovered: false,
  },
);

const classes = computed<string>(() => {
  const classList: string[] = [];
  if (props.isSelected) {
    classList.push('dropdown-tab-item__selected');
  }
  if (props.isHovered) {
    classList.push('hovered-item');
  }
  return classList.join(' ');
});
</script>
<template>
  <div :class="classes" class="dropdown-tab-item">
    <div class="dropdown-tab-item__title text-caps13">
      {{ props.item['text'] }}
    </div>
  </div>
</template>
