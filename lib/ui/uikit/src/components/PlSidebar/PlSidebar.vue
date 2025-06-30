<script setup lang="ts">
import PlSidebarGroup from './PlSidebarGroup.vue';

const opened = defineModel<boolean>('opened');
const props = defineProps<{
  closeable?: boolean;
}>();
const slots = defineSlots<{
  [K in `item-${number}`]: (props: { key: string; class: string | string[] }) => unknown;
}>();
</script>

<template>
  <Transition name="slide-fade">
    <PlSidebarGroup v-if="opened" :class="$style.root" :closable="props.closeable" @close="opened = false">
      <template v-for="name in Object.keys(slots) as `item-${number}`[]" :key="name" #[name]="slotProps">
        <slot :key="slotProps.key" :name="name" :class="[slotProps.class, $style.item]"/>
      </template>
    </PlSidebarGroup>
  </Transition>
</template>

<style type="scss" module>
@use '../../assets/variables.scss';

.root {
  display: flex;
  border-radius: 6px;
  box-shadow: var(--shadow-l);

  &:global(.slide-fade-enter-active),
  &:global(.slide-fade-leave-active) {
    transition: all 0.3s ease;
  }

  &:global(.slide-fade-enter-from),
  &:global(.slide-fade-leave-to) {
    opacity: 0;
    transform: translateX(100%);
  }
}

.item {
  flex: 1 1 0;
  border-right: 1px solid var(--border-color-div-grey);

  &:nth-last-child() {
    border-right: none;
  }
}
</style>
