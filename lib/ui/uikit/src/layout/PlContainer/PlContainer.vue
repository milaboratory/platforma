<script lang="ts">
/** Container with vertical spacing */
export default {
  name: 'PlContainer',
};
</script>

<script lang="ts" setup>
import { computed } from 'vue';
import './pl-container.scss';

const props = defineProps<{
  width?: string;
}>();

const style = computed(() => ({
  width: props.width,
}));
</script>

<template>
  <div class="pl-container pl-layout-component" :style="style">
    <slot />
  </div>
</template>
