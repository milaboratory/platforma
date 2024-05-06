<script setup lang="ts">
import { computed, ref, unref } from 'vue';
import { useMouseCapture } from '@/lib/composition/useMouseCapture';
import { tapIf } from '@/lib/helpers/functions';
import { clamp } from '@/lib/helpers/math';
import ThumbBig from '@/lib/assets/images/color-slider-thumb-big.svg?raw';
import ThumbSmall from '@/lib/assets/images/color-slider-thumb-small.svg?raw';

const props = defineProps<{
  barRef: HTMLElement;
  modelValue: number;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

const thumb = ref<HTMLElement>();
const min = 0;
const max = 100;
const step = 1;
let deltaValue = ref(0);
const range = max - min;

const localValue = computed(() => {
  return clamp((props.modelValue ?? 0) + deltaValue.value, min, max);
});

const thumbStyle = computed(() => {
  let value = Math.ceil((1 - position.value) * 100);
  return {
    right: `calc(${value}%) `,
  };
});

const position = computed(() => {
  return (localValue.value - min) / range;
});

function round(value: number) {
  const v = clamp(value, min, max);
  return Math.round((v + Number.EPSILON) * (1 / step)) / (1 / step);
}

useMouseCapture(thumb, (ev) => {
  console.log(ev);
  tapIf(unref(props.barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;
    deltaValue.value = (dx / rect.width) * range;
    if (ev.stop) {
      emit('update:modelValue', round(localValue.value));
      deltaValue.value = 0;
    }
  });
});
</script>
<template>
  <div :style="thumbStyle" class="pl-color-slider__thumb" tabindex="0">
    {{ localValue }}
    <div ref="thumb" class="pl-color-slider__thumb-roof"></div>
    <div class="pl-color-slider__thumb-"></div>
  </div>
</template>
