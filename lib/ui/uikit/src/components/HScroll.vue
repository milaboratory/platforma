<script lang="ts" setup>
import { computed, ref, unref } from 'vue';
import { useEventListener } from '../composition/useEventListener';
import { eventListener } from '../helpers/dom';

const emit = defineEmits(['update:scrollLeft']);

const props = defineProps<{
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}>();

const scrollRef = ref<EventTarget>();

const ratioRef = computed(() => props.clientWidth / (props.scrollWidth || 1));

const visibleRef = computed(() => {
  return ratioRef.value < 1;
});

const scrollbarStyle = computed(() => {
  const ratio = unref(ratioRef);
  return {
    left: props.scrollLeft * ratio + 'px',
    width: Math.floor(props.clientWidth * ratio) + 'px',
  };
});

useEventListener(scrollRef, 'pointerdown', (down: PointerEvent) => {
  const s = {
    clientX: down.clientX,
  };

  const update = (e: MouseEvent) => {
    const dy = (e.clientX - s.clientX) / ratioRef.value;
    emit('update:scrollLeft', props.scrollLeft + dy);
    s.clientX = e.clientX;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removePointerMove = eventListener(document as any, 'mousemove', update);

  ['mouseup', 'pointercancel'].forEach((eventType) => {
    document.addEventListener(eventType, removePointerMove, { once: true });
  });
});
</script>

<template>
  <div v-if="visibleRef" ref="scrollRef" class="h-scroll">
    <div :style="scrollbarStyle" class="h-scroll__scrollbar" />
  </div>
</template>
