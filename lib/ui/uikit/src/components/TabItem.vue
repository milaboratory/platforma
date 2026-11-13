<script setup lang="ts">
import { computed } from "vue";
import type { ListOptionNormalized } from "../types";

const props = withDefaults(
  defineProps<{
    option: ListOptionNormalized;
    isSelected: boolean;
    isHovered: boolean;
  }>(),
  {
    isSelected: false,
    isHovered: false,
  },
);

const label = computed(() => props.option.label);

const classes = computed<string>(() => {
  const classList: string[] = [];
  if (props.isSelected) {
    classList.push("dropdown-tab-item__selected");
  }
  if (props.isHovered) {
    classList.push("hovered-item");
  }
  return classList.join(" ");
});
</script>
<template>
  <div data-testid="pl-tab-item" :class="classes" class="dropdown-tab-item">
    <div data-testid="pl-tab-item-title" class="dropdown-tab-item__title text-caps13">
      {{ label }}
    </div>
  </div>
</template>
