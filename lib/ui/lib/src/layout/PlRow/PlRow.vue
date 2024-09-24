<script lang="ts">
/** Horizontal Flex flow container */
export default {
  name: 'PlRow',
};
</script>

<script lang="ts" setup>
import './pl-row.scss';

defineProps<{
  wrap?: boolean;
  alignCenter?: boolean;
}>();
</script>

<template>
  <div class="pl-layout-component pl-row" :class="{ wrap, 'align-center': alignCenter }">
    <slot />
  </div>
</template>
