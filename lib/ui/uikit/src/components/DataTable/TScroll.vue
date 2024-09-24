<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useMouseCapture } from '@/composition/useMouseCapture';

const emit = defineEmits<{
  (e: 'change:offset', value: number): void;
}>();

const props = defineProps<{
  offset: number;
  windowSize: number;
  dataSize: number;
}>();

const handleRef = ref<HTMLElement>();

const scrollSize = computed(() => props.windowSize - 12);

const isVisible = computed(() => props.windowSize < props.dataSize);

const handleOffset = computed(() => Math.ceil(props.offset * (scrollSize.value / props.dataSize)));

const handleLength = computed(() => Math.ceil((scrollSize.value * scrollSize.value) / props.dataSize));

const handleStyle = computed(() => ({ top: `${handleOffset.value}px`, height: `${handleLength.value}px` }));

useMouseCapture(handleRef, (ev, state) => {
  const newOffset = ((handleOffset.value + ev.dy) * props.dataSize) / scrollSize.value;
  emit('change:offset', newOffset);
  state.x = ev.x;
  state.y = ev.y;
});
</script>

<template>
  <div class="t-scroll" :style="{ height: `${windowSize}px` }">
    <div>
      <div v-if="isVisible" ref="handleRef" class="t-scroll__handle" :style="handleStyle" />
    </div>
  </div>
</template>
