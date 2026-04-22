<script setup lang="ts">
import { computed, ref } from "vue";
import { debounce, notEmpty } from "@milaboratories/helpers";

const hasElementEllipsis = ref(false);

const span = ref<HTMLElement>();

const isHovered = ref(false);

const classes = computed(() =>
  isHovered.value && hasElementEllipsis.value ? "ui-lt-animate" : "",
);

const updateStatus = debounce((val: boolean) => (isHovered.value = val), 500);

const animationTime = computed(() => {
  return span.value ? `${span.value?.innerHTML.length * 0.4}s` : "5s";
});

function isEllipsisEnabled() {
  const el = notEmpty(span.value, "span cannot be empty");
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
  position: relative;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  border-radius: 5px;

  span {
    display: inline-block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  .ui-lt-animate {
    position: relative;
    width: fit-content;
    overflow: unset;
    text-overflow: unset;
    animation: left-to-right v-bind(animationTime) infinite alternate linear;
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
