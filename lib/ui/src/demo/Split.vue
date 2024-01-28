<script lang="ts" setup>
defineProps<{
  name: string;
  hideSecond?: boolean;
}>();
</script>

<template>
  <div class="split">
    <div class="split__header">
      {{ name }}
    </div>
    <div class="split__column">
      <slot />
    </div>
    <div v-if="!hideSecond" class="split__column" data-theme="dark">
      <slot />
    </div>
  </div>
</template>
