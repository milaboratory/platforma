<script lang="ts" setup>
import { computed, onMounted, reactive, ref, unref, useSlots } from 'vue';
import { useMouseCapture } from '../composition/useMouseCapture';
import { tapIf } from '../helpers/functions';
import { clamp } from '../helpers/math';
import { PlTooltip } from '../components/PlTooltip';
import type { SliderMode } from '../types';
import { useSliderBreakpoints } from '../composition/useSliderBreakpoints';

type ModelType = [number, number, number];
const slots = useSlots();

const emit = defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    modelValue: ModelType;
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
    measure: '%',
    breakpoints: false,
    disabled: false,
  },
);

const data = reactive({
  deltaValue1: 0,
  deltaValue2: 0,
  deltaValue3: 0,
});

const barRef = ref<HTMLElement>();
const thumbRef1 = ref<HTMLElement>();
const thumbRef2 = ref<HTMLElement>();
const thumbRef3 = ref<HTMLElement>();

const range = computed(() => props.max - props.min);

const propsRef = computed(() => props);

const breakpointsRef = useSliderBreakpoints(propsRef);

const localValue1 = computed(() => clamp((props.modelValue[0] ?? 0) + data.deltaValue1, props.min, props.max));
const localValue2 = computed(() => clamp((props.modelValue[1] ?? 0) + data.deltaValue2, props.min, props.max));
const localValue3 = computed(() => clamp((props.modelValue[2] ?? 0) + data.deltaValue3, props.min, props.max));

const error = computed(() => {
  const v = props.modelValue as unknown;

  const isValidModel = Array.isArray(v) && v.length === 3 && v.every((it) => Number.isFinite(it));

  if (!isValidModel) {
    return 'Expected model [number, number, number]';
  }

  const errors: string[] = [];

  [...props.modelValue].forEach((v) => {
    if (v > props.max) {
      errors.push(`Max model value must be lower than max props ${props.max}.`);
    }
    if (v < props.min) {
      errors.push('Min model value must be greater than max props.');
    }
  });

  if (errors.length > 0) {
    return errors.join(' ');
  }

  return props.error;
});

const position1 = computed(() => {
  return (localValue1.value - props.min) / range.value;
});

const position2 = computed(() => {
  return (localValue2.value - props.min) / range.value;
});

const position3 = computed(() => {
  return (localValue3.value - props.min) / range.value;
});

const leftRight = computed(() => getLeftAndRight());

const progressStyle = computed(() => ({
  right: leftRight.value[0] + '%',
  left: 100 - leftRight.value[2] + '%',
}));

const thumbStyle1 = computed(() => ({
  right: Math.ceil((1 - position1.value) * 100) + '%',
}));

const thumbStyle2 = computed(() => ({
  right: Math.ceil((1 - position2.value) * 100) + '%',
}));

const thumbStyle3 = computed(() => ({
  right: Math.ceil((1 - position3.value) * 100) + '%',
}));

useMouseCapture(thumbRef1, (ev) => {
  tapIf(unref(barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;
    data.deltaValue1 = (dx / rect.width) * range.value;

    if (thumbRef1.value) {
      updateDatasetForThumb(thumbRef1.value, props.modelValue[0], data.deltaValue1);
    }

    if (ev.stop) {
      setModelValue([round(localValue1.value), round(localValue2.value), round(localValue3.value)]);
      data.deltaValue1 = 0;
    }
  });
});

useMouseCapture(thumbRef2, (ev) => {
  tapIf(unref(barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;
    data.deltaValue2 = (dx / rect.width) * range.value;

    if (thumbRef2.value) {
      updateDatasetForThumb(thumbRef2.value, props.modelValue[1], data.deltaValue2);
    }

    if (ev.stop) {
      setModelValue([round(localValue1.value), round(localValue2.value), round(localValue3.value)]);
      data.deltaValue2 = 0;
    }
  });
});

useMouseCapture(thumbRef3, (ev) => {
  tapIf(unref(barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;
    data.deltaValue3 = (dx / rect.width) * range.value;

    if (thumbRef3.value) {
      updateDatasetForThumb(thumbRef3.value, props.modelValue[2], data.deltaValue3);
    }

    if (ev.stop) {
      setModelValue([round(localValue1.value), round(localValue2.value), round(localValue3.value)]);
      data.deltaValue3 = 0;
    }
  });
});

function updateDatasetForThumb(thumb: HTMLElement, modelVal: number, delta: number) {
  const value = round(clamp((modelVal ?? 0) + delta, props.min, props.max));
  thumb.dataset.percent = `${value}${props.measure}`;
  getHint();
}

function getLeftAndRight() {
  const point1 = Math.ceil((1 - position1.value) * 100);
  const point2 = Math.ceil((1 - position2.value) * 100);
  const point3 = Math.ceil((1 - position3.value) * 100);
  return [point1, point2, point3].sort((a, b) => a - b);
}

function round(value: number) {
  const v = clamp(value, props.min, props.max);
  // This is the same as Math.round(v / props.step) * props.step but here we need this magic to avoid numbers like 3.00000000000000000004
  return Math.round((v + Number.EPSILON) * (1 / props.step)) / (1 / props.step);
}

function setModelValue(value: ModelType) {
  emit('update:modelValue', value);
}

function getHint() {
  const right1 = Number(thumbStyle1.value.right.substring(0, thumbStyle1.value.right.length - 1));
  const right2 = Number(thumbStyle2.value.right.substring(0, thumbStyle2.value.right.length - 1));
  const right3 = Number(thumbStyle3.value.right.substring(0, thumbStyle3.value.right.length - 1));

  const arr = [
    { r: right1, th: thumbRef1 },
    { r: right2, th: thumbRef2 },
    { r: right3, th: thumbRef3 },
  ].sort((a, b) => a.r - b.r);

  if (arr[0].th.value) {
    arr[0].th.value.dataset.hint = 'high';
  }
  if (arr[1].th.value) {
    arr[1].th.value.dataset.hint = 'mid';
  }

  if (arr[2].th.value) {
    arr[2].th.value.dataset.hint = 'low';
  }
}

function handleKeyPress(e: { code: string; preventDefault(): void }, index: number) {
  if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  const nextStep
    = e.code === 'ArrowUp' || e.code === 'ArrowRight' ? props.step * 1 : e.code === 'ArrowDown' || e.code === 'ArrowLeft' ? props.step * -1 : 0;

  const arr: ModelType = [...props.modelValue];
  arr[index] = clamp(arr[index] + nextStep, props.min, props.max);
  setModelValue(arr);
  getHint();
}

onMounted(() => {
  getHint();
});
</script>

<template>
  <div :class="props.disabled ? 'ui-slider__disabled' : undefined" class="ui-slider__envelope ui-slider__triple">
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
        </div>
        <div class="ui-slider__base">
          <div class="ui-slider__container">
            <div ref="barRef" class="ui-slider__bar">
              <div class="ui-slider__progress" :style="progressStyle" />
            </div>
          </div>
          <div class="ui-slider__container ui-slider__container-thumb">
            <template v-if="props.breakpoints">
              <div v-for="(item, index) in breakpointsRef" :key="index" :style="{ right: `${item}%` }" class="ui-slider__thumb-step"/>
            </template>
            <div
              ref="thumbRef1"
              :style="thumbStyle1"
              :data-percent="props.modelValue[0] + '%'"
              class="ui-slider__thumb ui-slider__triple-thumb"
              r1
              tabindex="0"
              @keydown="handleKeyPress($event, 0)"
            >
              <div class="ui-slider__thumb-focused-contour" />
            </div>
            <div
              ref="thumbRef2"
              :style="thumbStyle2"
              :data-percent="props.modelValue[1] + '%'"
              class="ui-slider__thumb ui-slider__triple-thumb"
              r2
              tabindex="0"
              @keydown="handleKeyPress($event, 1)"
            >
              <div class="ui-slider__thumb-focused-contour" />
            </div>
            <div
              ref="thumbRef3"
              :style="thumbStyle3"
              :data-percent="props.modelValue[2] + '%'"
              class="ui-slider__thumb ui-slider__triple-thumb"
              r3
              tabindex="0"
              @keydown="handleKeyPress($event, 2)"
            >
              <div class="ui-slider__thumb-focused-contour" />
            </div>
          </div>
        </div>
      </div>

      <div class="ui-slider__input-wrapper d-flex">
        <!-- {{ props.modelValue }} -->
        <!-- <InputRange v-if="props.mode === 'input'" v-model="inputRange" class="ui-focused-border" /> -->
      </div>
    </div>
    <!-- <div v-if="helper" class="ui-slider__helper">
      {{ helper }}
    </div> -->
    <div v-if="error" class="ui-slider__error">
      {{ error }}
    </div>
  </div>
</template>

<style></style>
