<script lang="ts">
/** Grid container */
export default {
  name: 'PlGrid',
};
</script>

<script lang="ts" setup>
import { computed } from 'vue';
import './pl-grid.scss';

const props = defineProps<{
  columns: number;
}>();

const style = computed(() => {
  return {
    gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))`,
  };
});
</script>

<template>
  <div class="pl-layout-component pl-grid" :style="style">
    <slot />
  </div>
</template>
