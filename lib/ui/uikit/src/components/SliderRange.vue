<script lang="ts" setup>
import { computed, reactive, ref, unref, useSlots, watch } from 'vue';
import { useMouseCapture } from '@/composition/useMouseCapture';
import { tapIf } from '@/helpers/functions';
import { clamp } from '@/helpers/math';
import { PlTooltip } from '@/components/PlTooltip';
import type { SliderMode } from '@/types';
import InputRange from '@/components/InputRange.vue';
import { useSliderBreakpoints } from '@/composition/useSliderBreakpoints';

const slots = useSlots();

const emit = defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    modelValue: [number, number];
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
  deltaValue1: 0,
  deltaValue2: 0,
});

const barRef = ref<HTMLElement>();
const thumbRef1 = ref<HTMLElement>();
const thumbRef2 = ref<HTMLElement>();
const inputRange = ref<[number, number]>(props.modelValue);
const leftDelta = ref(props.modelValue[0]);
const rightDelta = ref(props.modelValue[1]);

const propsRef = computed(() => props);

const breakpointsRef = useSliderBreakpoints(propsRef);

const textModelValue = computed(() => [leftDelta.value, rightDelta.value].sort((a, b) => a - b).join('-'));

const range = computed(() => props.max - props.min);

const localValue1 = computed(() => {
  return clamp((props.modelValue[0] ?? 0) + data.deltaValue1, props.min, props.max);
});

const localValue2 = computed(() => clamp((props.modelValue[1] ?? 0) + data.deltaValue2, props.min, props.max));

const error = computed(() => {
  const v = props.modelValue as unknown;

  const isValidModel = Array.isArray(v) && v.length === 2 && v.every((it) => Number.isFinite(it));

  if (!isValidModel) {
    return 'Expected model [number, number]';
  }

  return props.error;
});

const position1 = computed(() => {
  return (localValue1.value - props.min) / range.value;
});

const position2 = computed(() => {
  return (localValue2.value - props.min) / range.value;
});

const leftRight = computed(() => getLeftAndRight());

const progressStyle = computed(() => ({
  right: leftRight.value[0] + '%',
  left: 100 - leftRight.value[1] + '%',
}));

const thumbStyle1 = computed(() => ({
  right: Math.ceil((1 - position1.value) * 100) + '%',
}));

const thumbStyle2 = computed(() => ({
  right: Math.ceil((1 - position2.value) * 100) + '%',
}));

watch(
  () => props.modelValue,
  (value: [number, number]) => {
    inputRange.value = value;
    leftDelta.value = +value[0];
    rightDelta.value = +value[1];
  },
  { immediate: true },
);

useMouseCapture(thumbRef1, (ev) => {
  tapIf(unref(barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;

    data.deltaValue1 = (dx / rect.width) * range.value;

    leftDelta.value = round(clamp((props.modelValue[0] ?? 0) + data.deltaValue1, props.min, props.max));

    inputRange.value = ([leftDelta.value, rightDelta.value] as [number, number]).sort((a, b) => a - b);

    if (ev.stop) {
      setModelValue([round(localValue1.value), round(localValue2.value)]);
      data.deltaValue1 = 0;
    }
  });
});

useMouseCapture(thumbRef2, (ev) => {
  tapIf(unref(barRef)?.getBoundingClientRect(), (rect) => {
    const { dx } = ev;

    data.deltaValue2 = (dx / rect.width) * range.value;

    rightDelta.value = round(clamp((props.modelValue[1] ?? 0) + data.deltaValue2, props.min, props.max));

    inputRange.value = ([leftDelta.value, rightDelta.value] as [number, number]).sort((a, b) => a - b);

    if (ev.stop) {
      setModelValue([round(localValue1.value), round(localValue2.value)]);
      data.deltaValue2 = 0;
    }
  });
});

function getLeftAndRight() {
  const point1 = Math.ceil((1 - position1.value) * 100);
  const point2 = Math.ceil((1 - position2.value) * 100);
  return [point1, point2].sort((a, b) => a - b);
}

function round(value: number) {
  const v = clamp(value, props.min, props.max);
  // This is the same as Math.round(v / props.step) * props.step but here we need this magic to avoid numbers like 3.00000000000000000004
  return Math.round((v + Number.EPSILON) * (1 / props.step)) / (1 / props.step);
}

function setModelValue(value: [number, number]) {
  emit('update:modelValue', value);
}

function handleKeyPress(e: { code: string; preventDefault(): void }, index: number) {
  if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  const nextStep
    = e.code === 'ArrowUp' || e.code === 'ArrowRight' ? props.step * 1 : e.code === 'ArrowDown' || e.code === 'ArrowLeft' ? props.step * -1 : 0;

  const arr: [number, number] = [...props.modelValue];
  arr[index] = clamp(arr[index] + nextStep, props.min, props.max);
  setModelValue(arr);
}
</script>

<template>
  <!-- {{ leftDelta }} {{ rightDelta }} -->
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
          <div v-if="props.mode === 'text'" class="ui-slider__value-static text-s">{{ textModelValue }}</div>
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
            <div ref="thumbRef1" :style="thumbStyle1" class="ui-slider__thumb" tabindex="0" @keydown="handleKeyPress($event, 0)">
              <div class="ui-slider__thumb-focused-contour" />
            </div>
            <div ref="thumbRef2" :style="thumbStyle2" class="ui-slider__thumb" tabindex="0" @keydown="handleKeyPress($event, 1)">
              <div class="ui-slider__thumb-focused-contour" />
            </div>
          </div>
        </div>
      </div>

      <div class="ui-slider__input-wrapper d-flex">
        <InputRange v-if="props.mode === 'input'" v-model="inputRange" class="ui-focused-border" @change="setModelValue" />
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
