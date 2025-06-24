<script setup lang="ts">
import PlSidebarGroup from './PlSidebarGroup.vue';

const opened = defineModel<boolean>('opened');
const props = defineProps<{
  closeable?: boolean;
}>();
const slots = defineSlots<{
  [K in `item-${number}`]: () => unknown;
}>();
</script>

<template>
  <Transition name="slide-fade">
    <PlSidebarGroup v-if="opened" :class="$style.root" :closable="props.closeable" @close="opened = false">
      <template v-for="name in Object.keys(slots) as `item-${number}`[]" :key="name" #[name]>
        <slot :name="name" />
      </template>
    </PlSidebarGroup>
  </Transition>
</template>

<style module>
.root {
  position: relative;
  display: flex;
  flex-direction: column;

  &:global(.slide-fade-enter-active),
  &:global(.slide-fade-leave-active) {
    transition: all 0.3s ease;
  }

  &:global(.slide-fade-enter-from),
  &:global(.slide-fade-leave-to) {
    opacity: 0;
    transform: translateX(-100%);
  }
}
.item {
  border-right: 1px solid var(--border-color-div-grey);

  &:nth-last-child() {
    border-right: none;
  }
}
</style>
