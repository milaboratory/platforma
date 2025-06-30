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
  [K in `item-${number}`]: (props: { key: string; class: string }) => unknown;
}>();
</script>

<template>
  <div :class="$style.root">
    <PlIcon16 v-if="props.closeable" name="close" :class="$style.close" @click="emit('close')" />
    <slot v-for="name in Object.keys(slots) as `item-${number}`[]" :key="name" :name="name" :class="$style.item" />
  </div>
</template>

<style lang="scss" module>
@use '../../assets/variables.scss';

.root {
  position: relative;
  display: flex;
  flex-direction: row;
}

.item {
  border-right: 1px solid var(--border-color-div-grey);

  &:last-child {
    border-right: none;
  }
}
</style>
