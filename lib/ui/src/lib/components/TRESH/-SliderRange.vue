<script lang="ts" setup>
import { computed, reactive, ref, unref, useSlots, watch } from 'vue';
import { useMouseCapture } from '@/lib/composition/useMouseCapture';
import { tapIf } from '@/lib/helpers/functions';
import { clamp } from '@/lib/helpers/math';
import Tooltip from '@/lib/components/Tooltip.vue';
import type { SliderMode } from '@/lib/types';
import InputRange from '@/lib/components/InputRange.vue';

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
  deltaValue1: 0,
  deltaValue2: 0,
});

const barRef = ref<HTMLElement>();
const thumbRef1 = ref<HTMLElement>();
const thumbRef2 = ref<HTMLElement>();
const inputRange = reactive<{ arr: [number, number] }>({ arr: props.modelValue });
const leftDelta = ref(props.modelValue[0]);
const rightDelta = ref(props.modelValue[1]);

const textModelValue = computed(() => [leftDelta.value, rightDelta.value].sort((a, b) => a - b).join('-'));

const range = computed(() => props.max - props.min);

const localValue1 = computed(() => {
  return clamp((props.modelValue[0] ?? 0) + data.deltaValue1, props.min, props.max);
});
const localValue2 = computed(() => clamp((props.modelValue[1] ?? 0) + data.deltaValue2, props.min, props.max));

const error = computed(() => {
  const v = props.modelValue;

  let isValidModel = true;
  v.forEach((val: number) => {
    if (!Number.isFinite(val)) {
      isValidModel = false;
    }
  });
  if (v.length > 2 || v.length < 2 || !isValidModel) {
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
    inputRange.arr = value; //.sort((a, b) => a - b);
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

    inputRange.arr = ([leftDelta.value, rightDelta.value] as [number, number]).sort((a, b) => a - b);

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

    inputRange.arr = ([rightDelta.value, leftDelta.value] as [number, number]).sort((a, b) => a - b);

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
  emit(
    'update:modelValue',
    value,
    // value.sort(function (a, b) {
    //   return a - b;
    // }),
  );
}

function handleKeyPress(e: { code: string; preventDefault(): void }, index: number) {
  if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  const nextStep =
    e.code === 'ArrowUp' || e.code === 'ArrowRight' ? props.step * 1 : e.code === 'ArrowDown' || e.code === 'ArrowLeft' ? props.step * -1 : 0;

  // setModelValue(props.modelValue + nextStep);
}

function inputChanged(value: [number, number]) {
  debugger;
  setModelValue(value);
}
</script>

<template>
  {{ props.modelValue }}
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
          <div v-if="props.mode === 'text'" class="ui-slider__value-static text-s">{{ textModelValue }}</div>
        </div>
        <div class="ui-slider__base">
          <div class="ui-slider__container">
            <div ref="barRef" class="ui-slider__bar">
              <div class="ui-slider__progress" :style="progressStyle" />
            </div>
          </div>
          <div class="ui-slider__container ui-slider__container-thumb">
            <!-- <div ref="barRef" class="ui-slider__bar">
              <div class="ui-slider__progress" :style="progressStyle" />
            </div> -->
            <div ref="thumbRef1" r1 :style="thumbStyle1" class="ui-slider__thumb" tabindex="0" @keydown="handleKeyPress($event, 0)" />
            <div ref="thumbRef2" r2 :style="thumbStyle2" class="ui-slider__thumb" tabindex="0" />
          </div>
        </div>
      </div>

      <div class="ui-slider__input-wrapper d-flex">
        <InputRange v-if="props.mode === 'input'" v-model="inputRange.arr" class="ui-focused-border" @change="inputChanged" />
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
