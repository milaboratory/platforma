<script lang="ts" setup>
import { computed, ref, unref } from 'vue';
import { useEventListener } from '../composition/useEventListener';
import { eventListener } from '../helpers/dom';

const emit = defineEmits(['update:scrollTop']);

const props = defineProps<{
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}>();

const scrollRef = ref<EventTarget>();

const ratioRef = computed(() => props.clientHeight / (props.scrollHeight || 1));

const visibleRef = computed(() => {
  return ratioRef.value < 1;
});

const scrollbarStyle = computed(() => {
  const ratio = unref(ratioRef);
  return {
    top: props.scrollTop * ratio + 'px',
    height: Math.floor(props.clientHeight * ratio) + 'px',
  };
});

useEventListener(scrollRef, 'pointerdown', (down: PointerEvent) => {
  const s = {
    clientY: down.clientY,
  };

  const update = (e: MouseEvent) => {
    const dy = (e.clientY - s.clientY) / ratioRef.value;
    emit('update:scrollTop', props.scrollTop + dy);
    s.clientY = e.clientY;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removePointerMove = eventListener(document as any, 'mousemove', update);

  ['mouseup', 'pointercancel'].forEach((eventType) => {
    document.addEventListener(eventType, removePointerMove, { once: true });
  });
});
</script>

<template>
  <div v-if="visibleRef" ref="scrollRef" class="v-scroll">
    <div :style="scrollbarStyle" class="v-scroll__scrollbar" />
  </div>
</template>
