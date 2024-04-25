<script setup lang="ts">
import DoubleContour from '../utils/DoubleContour.vue';
import { useLabelNotch } from '@/lib/composition/useLabelNotch';
import { computed, nextTick, ref, useSlots, watch } from 'vue';
import Tooltip from '@/lib/components/Tooltip.vue';

type NumberInputProps = {
  modelValue: number | undefined;
  label?: string;
  placeholder?: string;
  step?: number;
  minValue?: number;
  maxValue?: number;
  errorMessage?: string;
  validate?: (v: number) => string | undefined;
};
const props = withDefaults(defineProps<NumberInputProps>(), {
  step: 1,
});
const emit = defineEmits<{ (e: 'update:modelValue', number?: number): void }>();

const root = ref<HTMLElement>();
const slots = useSlots();
const input = ref<HTMLInputElement>();
const value = ref<string | undefined>(props.modelValue?.toString());

useLabelNotch(root);

const canRenderValue = ref(true);

const computedValue = computed({
  get() {
    // console.log('get');
    if (canRenderValue.value) {
      if (props.modelValue !== undefined) {
        // const r = new Intl.NumberFormat(navigator.languages, { minimumFractionDigits: 5 }).format(props.modelValue);
        const r = new Number(props.modelValue);
        console.log(r, 'get R');
        return r.toString();
      }
      return '';
    }
    return '';
  },
  set(val) {
    console.log('set', val);
    val = val.replace(/,/g, '');
    if (isNumeric(val)) {
      emit('update:modelValue', +val);
      //try press 123.12345678912345 and than 6
      if (val.toString() !== props.modelValue?.toString() && +val === props.modelValue && val[val.length - 1] !== '.') {
        console.log('123.45678902345679');
        canRenderValue.value = false;
        nextTick(() => {
          canRenderValue.value = true;
        });
      }
    } else {
      if (val.trim() === '') {
        emit('update:modelValue', undefined);
      }
      console.log('canRenderValue');
      canRenderValue.value = false;
      nextTick(() => {
        canRenderValue.value = true;
      });
    }
  },
});

const isIncrementDisable = computed(() => {
  return false;
});

const isDecrementDisable = computed(() => {
  return false;
});

function isNumeric(str: string) {
  if (typeof str != 'string') return false;
  return !isNaN(+str) && !isNaN(parseFloat(str));
}

function increment() {
  if (props.modelValue === undefined) {
    computedValue.value = (0).toString();
  } else {
    computedValue.value = ((props.modelValue || 0) + props.step).toString();
  }
}

function decrement() {
  if (props.modelValue === undefined) {
    computedValue.value = (0).toString();
  } else {
    computedValue.value = ((props.modelValue || 0) - props.step).toString();
  }
}
</script>

<template>
  <div ref="root" class="mi-number-input d-flex-column">
    <div class="mi-number-input__main-wrapper d-flex">
      <DoubleContour class="mi-number-input__contour" />
      <div class="mi-number-input__wrapper flex-grow d-flex flex-align-center">
        <label v-if="label" class="text-description">
          {{ label }} {{ value }}
          <Tooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip" />
            </template>
          </Tooltip>
        </label>

        <!-- <input ref="input" :value="computedValue" :placeholder="placeholder" class="text-s flex-grow" @input="handleInput" /> -->
        <input ref="input" v-model="computedValue" :placeholder="placeholder" class="text-s flex-grow" />
      </div>
      <div class="mi-number-input__icons d-flex-column">
        <div class="mi-number-input__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center" @click="increment">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M8 4.93933L13.5303 10.4697L12.4697 11.5303L8 7.06065L3.53033 11.5303L2.46967 10.4697L8 4.93933Z"
              fill="#110529"
            />
          </svg>
        </div>
        <div class="mi-number-input__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center" @click="decrement">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M2.46967 6.53033L3.53033 5.46967L8 9.93934L12.4697 5.46967L13.5303 6.53033L8 12.0607L2.46967 6.53033Z"
              fill="#110529"
            />
          </svg>
        </div>
      </div>
    </div>
    <div class="mi-number-input__hint text-description">Helper or error text</div>
  </div>
</template>
