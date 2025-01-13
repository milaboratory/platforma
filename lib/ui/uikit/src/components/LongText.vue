<script setup lang="ts">
import { computed, ref } from 'vue';
import { debounce, notEmpty } from '@milaboratories/helpers';

const hasElementEllipsis = ref(false);

const span = ref<HTMLElement>();

const isHovered = ref(false);

const classes = computed(() => (isHovered.value && hasElementEllipsis.value ? 'ui-lt-animate' : ''));

const updateStatus = debounce((val: boolean) => (isHovered.value = val), 500);

const animationTime = computed(() => {
  return span.value ? `${span.value?.innerHTML.length * 0.4}s` : '5s';
});

function isEllipsisEnabled() {
  const el = notEmpty(span.value, 'span cannot be empty');
  hasElementEllipsis.value = el.clientWidth < el.scrollWidth;
}

function mouseoverHandler() {
  isEllipsisEnabled();
  updateStatus(true);
}

function mouseoutHandler() {
  updateStatus(false);
}
</script>

<template>
  <div v-bind="$attrs" class="ui-lt-container">
    <span @mouseover="mouseoverHandler" @mouseleave="mouseoutHandler">
      <span ref="span" :class="classes"><slot /></span>
    </span>
  </div>
</template>

<style lang="scss">
.ui-lt-container {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  border-radius: 5px;

  span {
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    vertical-align: bottom;
    pointer-events: all !important;
  }

  .ui-lt-animate {
    position: relative;
    animation: left-to-right v-bind(animationTime) infinite alternate linear;

    overflow: unset !important;
    text-overflow: unset !important;
    width: fit-content !important;
  }
}

@keyframes left-to-right {
  0% {
    transform: translateX(0%);
    left: 0%;
  }

  100% {
    transform: translateX(-101%);
    left: 101%;
  }
}
</style>
