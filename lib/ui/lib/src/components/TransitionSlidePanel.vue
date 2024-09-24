<script lang="ts" setup>
function onAfterEnter() {
  window.dispatchEvent(new CustomEvent('adjust'));
}

function onAfterLeave() {
  window.dispatchEvent(new CustomEvent('adjust'));
}
</script>

<template>
  <Transition name="slide-panel" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
    <slot />
  </Transition>
</template>
