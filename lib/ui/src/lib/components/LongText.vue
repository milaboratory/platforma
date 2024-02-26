<script setup lang="ts">
import { computed, ref } from 'vue';
import { debounce } from '../helpers/utils';

const hasElementEllipsis = ref(false);

const span = ref<HTMLElement>();

const isHovered = ref(false);

const classes = computed(() => (isHovered.value && hasElementEllipsis.value ? 'ui-lt-animate' : ''));

const updateStatus = debounce((val: boolean) => (isHovered.value = val), 500);

const animationTime = computed(() => (span.value ? `${span.value?.innerHTML.length * 0.3}s` : '5s'));

function isEllipsisEnabled() {
  if (!span.value) {
    throw Error('WOW');
  }

  hasElementEllipsis.value = span.value.clientWidth < span.value.scrollWidth;
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
  <div v-bind="$attrs" class="ui-lt-container" @mouseover="mouseoverHandler" @mouseleave="mouseoutHandler">
    <span>
      <span ref="span" :class="classes"><slot /></span>
    </span>
  </div>
</template>

<style lang="scss">
.ui-lt-container {
  min-width: 0;
  color: #13d31f;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  border-radius: 5px;
  pointer-events: all !important;

  span {
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    vertical-align: bottom;
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
