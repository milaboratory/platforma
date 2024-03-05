<script lang="ts" setup>
import { computed, reactive, ref, unref, useSlots } from 'vue';
import { useMouseCapture } from '@/lib/composition/useMouseCapture';
import { tapIf } from '@/lib/helpers/functions';
import { clamp } from '@/lib/helpers/math';
import Tooltip from '@/lib/components/Tooltip.vue';
import type { SliderMode } from '@/lib/types';

const slots = useSlots();

const emit = defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max: number;
    step?: number;
    label?: string;
    helper?: string;
    error?: string;
    mode?: SliderMode;
    measure?: string;
  }>(),
  {
    label: undefined,
    helper: undefined,
    error: undefined,
    min: 0,
    step: 1,
    mode: 'text',
    measure: '',
  },
);

const data = reactive({
  deltaValue: 0,
});

const range = computed(() => props.max - props.min);

const localValue = computed(() => {
  return clamp((props.modelValue ?? 0) + data.deltaValue, props.min, props.max);
});

const error = computed(() => {
  const v = props.modelValue;

  if (!Number.isFinite(v)) {
    return 'Not a number';
  }

  if (v < props.min) {
    return `Min value: ${props.min}`;
  }

  if (v > props.max) {
    return `Max value: ${props.max}`;
  }

  return props.error;
});

const position = computed(() => {
  return (localValue.value - props.min) / range.value;
});

const progressStyle = computed(() => ({
  right: Math.ceil((1 - position.value) * 100) + '%',
}));

const thumbStyle = computed(() => {
  let value = Math.ceil((1 - position.value) * 100);
  value = value > 98 ? 98 : value < 2 ? 2 : value;
  return {
    right: `calc(${value}%) `,
  };
});

const barRef = ref<HTMLElement>();
const thumbRef = ref<HTMLElement>();

function round(value: number) {
  const v = clamp(value, props.min, props.max);
  // This is the same as Math.round(v / props.step) * props.step but here we need this magic to avoid numbers like 3.00000000000000000004
  return Math.round((v + Number.EPSILON) * (1 / props.step)) / (1 / props.step);
}

useMouseCapture(thumbRef, (ev) => {
  tapIf(unref(barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;

    data.deltaValue = (dx / rect.width) * range.value;

    if (ev.stop) {
      emit('update:modelValue', round(localValue.value));
      data.deltaValue = 0;
    }
  });
});

function setModelValue(value: number) {
  emit('update:modelValue', round(value));
}

function updateModelValue(event: Event) {
  setModelValue(+(event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="ui-slider__envelope">
    <div :class="`ui-slider__mode-${props.mode}`" class="ui-slider">
      <div class="ui-slider__wrapper">
        <div class="ui-slider__label-section">
          <label v-if="label" class="text-s">
            <span>{{ label }}</span>
            <tooltip v-if="slots.tooltip" class="info" position="top">
              <template #tooltip>
                <slot name="tooltip" />
              </template>
            </tooltip>
          </label>
          <div v-if="props.mode === 'text'" class="ui-slider__value-static text-s">{{ modelValue }}</div>
        </div>
        <div class="ui-slider__base">
          <div class="ui-slider__container">
            <div ref="barRef" class="ui-slider__bar">
              <div class="ui-slider__progress" :style="progressStyle" />
            </div>
            <div ref="thumbRef" class="ui-slider__thumb" :style="thumbStyle" />
          </div>
        </div>
      </div>

      <div class="ui-slider__input-wrapper d-flex">
        <input v-if="props.mode === 'input'" :value="modelValue" class="ui-slider__value text-s" @input="updateModelValue($event)" />
      </div>
    </div>
    <div v-if="helper" class="ui-slider__helper">
      {{ helper }}
    </div>
    <div v-if="error" class="ui-slider__error">
      {{ error }}
    </div>
  </div>
</template>
