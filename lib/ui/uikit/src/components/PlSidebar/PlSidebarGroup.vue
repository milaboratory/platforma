<script setup lang="ts">
import { PlIcon16 } from '../PlIcon16';

const props = defineProps<{
  opened?: boolean;
  closeable?: boolean;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();
const slots = defineSlots<{
  [K in `item-${number}`]: () => unknown;
}>();
</script>

<template>
  <div :class="$style.root">
    <PlIcon16 v-if="props.closeable" name="close" :class="$style.close" @click="emit('close')" />
    <div v-for="name in Object.keys(slots) as `item-${number}`[]" :key="name" :class="$style.item">
      <slot :name="name" />
    </div>
  </div>
</template>

<style lang="scss" module>
.root {
  position: relative;
  display: flex;
  flex-direction: column;
}
.item {
  border-right: 1px solid var(--border-color-div-grey);

  &:nth-last-child() {
    border-right: none;
  }
}
</style>
