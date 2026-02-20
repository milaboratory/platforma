<script lang="ts" setup>
withDefaults(
  defineProps<{
    groupPosition?:
      | "top"
      | "bottom"
      | "left"
      | "right"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "middle";
  }>(),
  {
    groupPosition: undefined,
  },
);
</script>

<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<template>
  <div class="double-contour" :class="{ [groupPosition]: true }">
    <div v-bind="$attrs">
      <slot />
    </div>
  </div>
</template>
<style>
.double-contour {
  &.top > div {
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0;
  }
}
.double-contour {
  &.bottom > div {
    border-top-right-radius: 0;
    border-top-left-radius: 0;
  }
}
.double-contour {
  &.left > div {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
}
.double-contour {
  &.right > div {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
}
.double-contour {
  &.top-left > div {
    border-top-right-radius: 0;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
}
.double-contour {
  &.top-right > div {
    border-bottom-right-radius: 0;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
}
.double-contour {
  &.bottom-left > div {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-top-left-radius: 0;
  }
}
.double-contour {
  &.bottom-right > div {
    border-top-right-radius: 0;
    border-bottom-left-radius: 0;
    border-top-left-radius: 0;
  }
}
.double-contour {
  &.middle > div {
    border-radius: 0;
  }
}
</style>
