<script lang="ts" setup>
import {computed, ref, unref} from 'vue';
import {useEventListener} from '@/lib/composition/useEventListener';
import {eventListener} from '@/lib/helpers/dom';

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
    width: Math.floor(props.clientWidth * ratio) + 'px'
  };
});

useEventListener(scrollRef, 'pointerdown', (down: PointerEvent) => {
  const s = {
    clientX: down.clientX
  };

  const update = (e: MouseEvent) => {
    const dy = (e.clientX - s.clientX) / ratioRef.value;
    emit('update:scrollLeft', props.scrollLeft + dy);
    s.clientX = e.clientX;
  };

  const removePointerMove = eventListener(document as any, 'mousemove', update);

  [
    'mouseup',
    'pointercancel',
  ].forEach(eventType => {
    document.addEventListener(eventType, removePointerMove, {once: true});
  });
});
</script>

<template>
  <div v-if="visibleRef" ref="scrollRef" class="h-scroll">
    <div class="h-scroll__scrollbar" :style="scrollbarStyle"/>
  </div>
</template>
