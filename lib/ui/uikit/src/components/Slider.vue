<script lang="ts" setup>
import { computed, reactive, ref, unref, useSlots, watch } from 'vue';
import { useMouseCapture } from '@/composition/useMouseCapture';
import { tapIf } from '@/helpers/functions';
import { clamp } from '@/helpers/math';
import { PlTooltip } from '@/components/PlTooltip';
import type { SliderMode } from '@/types';
import { useSliderBreakpoints } from '@/composition/useSliderBreakpoints';

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
    breakpoints?: boolean;
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    helper: undefined,
    error: undefined,
    min: 0,
    step: 1,
    mode: 'text',
    measure: '',
    breakpoints: false,
    disabled: false,
  },
);

const data = reactive({
  deltaValue: 0,
});

const range = computed(() => props.max - props.min);

const localValue = computed(() => {
  return clamp((props.modelValue ?? 0) + data.deltaValue, props.min, props.max);
});

const realtimeVal = ref(props.modelValue);

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

const propsRef = computed(() => props);

const breakpointsRef = useSliderBreakpoints(propsRef);

const position = computed(() => {
  return (localValue.value - props.min) / range.value;
});

const progressStyle = computed(() => ({
  right: Math.ceil((1 - position.value) * 100) + '%',
}));

const thumbStyle = computed(() => {
  let value = Math.ceil((1 - position.value) * 100);
  return {
    right: `calc(${value}%) `,
  };
});

const barRef = ref<HTMLElement>();
const thumbRef = ref<HTMLElement>();

watch(
  () => props.modelValue,
  (val) => {
    realtimeVal.value = val;
  },
);

function round(value: number) {
  const v = clamp(value, props.min, props.max);
  // This is the same as Math.round(v / props.step) * props.step but here we need this magic to avoid numbers like 3.00000000000000000004
  return Math.round((v + Number.EPSILON) * (1 / props.step)) / (1 / props.step);
}

useMouseCapture(thumbRef, (ev) => {
  tapIf(unref(barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;

    data.deltaValue = (dx / rect.width) * range.value;

    realtimeVal.value = round(clamp((props.modelValue ?? 0) + data.deltaValue, props.min, props.max));

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

function handleKeyPress(e: { code: string; preventDefault(): void }) {
  if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  const nextStep =
    e.code === 'ArrowUp' || e.code === 'ArrowRight' ? props.step * 1 : e.code === 'ArrowDown' || e.code === 'ArrowLeft' ? props.step * -1 : 0;

  setModelValue(props.modelValue + nextStep);
}
</script>

<template>
  <div :class="props.disabled ? 'ui-slider__disabled' : undefined" class="ui-slider__envelope">
    <div :class="`ui-slider__mode-${props.mode}`" class="ui-slider">
      <div class="ui-slider__wrapper">
        <div class="ui-slider__label-section">
          <label v-if="label" class="text-s">
            <span>{{ label }}</span>
            <PlTooltip v-if="slots.tooltip" class="info" position="top">
              <template #tooltip>
                <slot name="tooltip" />
              </template>
            </PlTooltip>
          </label>
          <div v-if="props.mode === 'text'" class="ui-slider__value-static text-s">{{ realtimeVal }}{{ measure }}</div>
        </div>
        <div class="ui-slider__base">
          <div class="ui-slider__container">
            <div ref="barRef" class="ui-slider__bar">
              <div class="ui-slider__progress" :style="progressStyle" />
            </div>
          </div>
          <div class="ui-slider__container ui-slider__container-thumb">
            <template v-if="props.breakpoints">
              <div v-for="(item, index) in breakpointsRef" :key="index" :style="{ right: `${item}%` }" class="ui-slider__thumb-step"></div>
            </template>
            <div ref="thumbRef" tabindex="0" class="ui-slider__thumb ui-slider__thumb-active" :style="thumbStyle" @keydown="handleKeyPress">
              <div class="ui-slider__thumb-focused-contour" />
            </div>
          </div>
        </div>
      </div>

      <div class="ui-slider__input-wrapper d-flex">
        <input v-if="props.mode === 'input'" :value="realtimeVal" class="ui-slider__value text-s" @change="updateModelValue($event)" />
      </div>
    </div>
    <!-- <div v-if="props.helper" class="ui-slider__helper">
      {{ props.helper }}
    </div> -->
    <div v-if="error" class="ui-slider__error">
      {{ error }}
    </div>
  </div>
</template>
