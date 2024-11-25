<script lang="ts" setup>
const onStart = (el: Element) => {
  (el as HTMLElement).style.setProperty('--component-height', el.scrollHeight + 'px');
  el.classList.add('expand-collapse-fix');
};

const onAfter = (el: Element) => {
  (el as HTMLElement).style.removeProperty('--component-height');
  el.classList.remove('expand-collapse-fix');
};
</script>

<template>
  <Transition name="expand-collapse" @enter="onStart" @leave="onStart" @after-enter="onAfter" @after-leave="onAfter">
    <slot></slot>
  </Transition>
</template>

<style>
.expand-collapse-fix {
  overflow: hidden;
}

.expand-collapse-enter-active,
.expand-collapse-leave-active {
  transition:
    height 0.2s ease-in-out,
    opacity 0.2s ease-in-out;
  height: var(--component-height);
}

.expand-collapse-enter-from,
.expand-collapse-leave-to {
  opacity: 0.5;
  height: 0;
}
</style>
