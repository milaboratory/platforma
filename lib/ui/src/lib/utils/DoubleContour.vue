<template>
  <div class="double-contour">
    <div v-bind="$attrs">
      <slot/>
    </div>
  </div>
</template>

<script>
export default {
  inheritAttrs: false
}
</script>
