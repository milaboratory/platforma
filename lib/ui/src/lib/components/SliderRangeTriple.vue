<script lang="ts" setup>
import { computed, onMounted, reactive, ref, unref, useSlots, watch } from 'vue';
import { useMouseCapture } from '@/lib/composition/useMouseCapture';
import { tapIf } from '@/lib/helpers/functions';
import { clamp } from '@/lib/helpers/math';
import Tooltip from '@/lib/components/Tooltip.vue';
import type { SliderMode } from '@/lib/types';

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
  }>(),
  {
    label: undefined,
    helper: undefined,
    error: undefined,
    min: 0,
    step: 1,
    mode: 'text',
    measure: '%',
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

const localValue1 = computed(() => clamp((props.modelValue[0] ?? 0) + data.deltaValue1, props.min, props.max));
const localValue2 = computed(() => clamp((props.modelValue[1] ?? 0) + data.deltaValue2, props.min, props.max));
const localValue3 = computed(() => clamp((props.modelValue[2] ?? 0) + data.deltaValue3, props.min, props.max));

const error = computed(() => {
  const v = props.modelValue;

  let isValidModel = true;
  v.forEach((val: number) => {
    if (!Number.isFinite(val)) {
      isValidModel = false;
    }
  });
  if (v.length > 3 || v.length < 3 || !isValidModel) {
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
getHint();
function updateDatasetForThumb(thumb: HTMLElement, modelVal: number, delta: number) {
  const value = round(clamp((modelVal ?? 0) + delta, props.min, props.max));
  thumb.dataset.percent = `${value}${props.measure}`;
  getHint();
}

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
  emit(
    'update:modelValue',
    //<!-- Step 2 uncomment -->
    value,
    // value.sort(function (a, b) {
    //   return a - b;
    // }),
  );
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

  console.log(arr);

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
</script>

<template>
  <div class="ui-slider__envelope ui-slider__triple">
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
        </div>
        <div class="ui-slider__base">
          <div class="ui-slider__container">
            <div ref="barRef" class="ui-slider__bar">
              <div class="ui-slider__progress" :style="progressStyle" />
            </div>
            <!-- Step 3 comment -->
            <!-- do not delete :data-percent="props.modelValue[0] + '%'" because when we update modelValue we sort model -->
            <div ref="thumbRef1" :style="thumbStyle1" class="ui-slider__thumb ui-slider__triple-thumb" r1 :data-percent="props.modelValue[0] + '%'" />
            <div ref="thumbRef2" :style="thumbStyle2" class="ui-slider__thumb ui-slider__triple-thumb" r2 :data-percent="props.modelValue[1] + '%'" />
            <div ref="thumbRef3" :style="thumbStyle3" class="ui-slider__thumb ui-slider__triple-thumb" r3 :data-percent="props.modelValue[2] + '%'" />

            <!-- Step 1 uncomment -->
            <!-- <div ref="thumbRef1" :style="thumbStyle1" class="ui-slider__thumb ui-slider__triple-thumb" r1 />
            <div ref="thumbRef2" :style="thumbStyle2" class="ui-slider__thumb ui-slider__triple-thumb" r2 />
            <div ref="thumbRef3" :style="thumbStyle3" class="ui-slider__thumb ui-slider__triple-thumb" r3 /> -->
          </div>
        </div>
      </div>

      <div class="ui-slider__input-wrapper d-flex">
        <!-- {{ props.modelValue }} -->
        <!-- <InputRange v-if="props.mode === 'input'" v-model="inputRange" class="ui-focused-border" /> -->
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

<style></style>
