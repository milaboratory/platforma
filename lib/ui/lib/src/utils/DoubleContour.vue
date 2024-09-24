<script lang="ts" setup></script>

<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<template>
  <div class="double-contour">
    <div v-bind="$attrs">
      <slot />
    </div>
  </div>
</template>
