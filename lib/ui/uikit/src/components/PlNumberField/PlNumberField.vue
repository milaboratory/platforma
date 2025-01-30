<script setup lang="ts">
import './pl-number-field.scss';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import {computed, ref, useSlots, watch} from 'vue';
import { PlTooltip } from '@/components/PlTooltip';

type NumberInputProps = {
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  /** 1 by default, step for increment/decrement buttons */
  step?: number;
  /** If defined - show an error if value lower  */
  minValue?: number;
  /** If defined - show an error if value higher */
  maxValue?: number;
  /** If false - remove buttons on the right */
  useIncrementButtons?: boolean;
  /** Error message that shows without inner checks */
  errorMessage?: string;
  validate?: (v: number) => string | undefined;
};

const props = withDefaults(defineProps<NumberInputProps>(), {
  step: 1,
  label: undefined,
  placeholder: undefined,
  minValue: undefined,
  maxValue: undefined,
  useIncrementButtons: true,
  errorMessage: undefined,
  validate: undefined,
});

const modelValue = defineModel<number | undefined>({required: true})

const root = ref<HTMLElement>();
const slots = useSlots();
const input = ref<HTMLInputElement>();

useLabelNotch(root);

function modelToString(v:number|undefined) {
  return v === undefined ? '' : String(+v); // (+v) to avoid staying in input non-number values if they are provided in model
}
function stringToModel(v:string) {
  if (v === '') {
    return undefined
  }
  if (v === '.' || v === ',') {
    return 0;
  }
  return parseFloat(v.replace(',', '.'));
}
const innerTextValue = ref(modelToString(modelValue.value));
watch(() => modelValue.value, (outerValue) => {
  if (parseFloat(innerTextValue.value) !== outerValue) {
    innerTextValue.value = modelToString(outerValue);
  }
})


const inputValue = computed({
  get() {
    return innerTextValue.value;
  },
  set(nextValue:string) {
    const parsedValue = stringToModel(nextValue);
    if (parsedValue === undefined) {
      innerTextValue.value = nextValue;
    } else if (isNaN(parsedValue)) {
      if (input.value) {
        input.value.value = innerTextValue.value;
      }
    } else if (nextValue.match(/^(\d+)?[\\.,]?(\d+)?$/)) { // parseFloat allows multiple dots
      innerTextValue.value = nextValue;
    } else if (input.value) {
      input.value.value = innerTextValue.value;
    }
  }
})
const focused = ref(false);

function onFocusOut() {
  if (innerTextValue.value === '') {
    modelValue.value = undefined;
    return;
  }
  modelValue.value = stringToModel(innerTextValue.value);
  innerTextValue.value = String(modelValue.value); // to make .1 => 0.1, 10.00 => 10, etc
}

const errors = computed(() => {
  let ers: string[] = [];
  if (props.errorMessage) {
    ers.push(props.errorMessage);
  }
  const parsedValue = stringToModel(innerTextValue.value);
  if (parsedValue !== undefined && isNaN(parsedValue)) {
    ers.push('Value is not a number');
  } else {
    if (props.minValue !== undefined && parsedValue !== undefined && parsedValue < props.minValue) {
      ers.push(`Value must be higher than ${props.minValue}`);
    }
    if (props.maxValue !== undefined && parsedValue !== undefined && parsedValue > props.maxValue) {
      ers.push(`Value must be less than ${props.maxValue}`);
    }
  }

  ers = [...ers];

  return ers.join(' ');
});

const isIncrementDisabled = computed(() => {
  const parsedValue = stringToModel(innerTextValue.value);
  if (props.maxValue !== undefined && parsedValue !== undefined) {
    return parsedValue >= props.maxValue;
  }
  return false;
});

const isDecrementDisabled = computed(() => {
  const parsedValue = stringToModel(innerTextValue.value);
  if (props.minValue !== undefined && parsedValue !== undefined) {
    return parsedValue <= props.minValue;
  }
  return false;
});

function increment() {
  const parsedValue = stringToModel(innerTextValue.value);
  if (!isIncrementDisabled.value) {
    let nV;
    if (parsedValue === undefined) {
      nV = props.minValue ? props.minValue : 0;
    } else {
      nV = (parsedValue || 0) + props.step;
    }
    modelValue.value = props.maxValue !== undefined ? Math.min(props.maxValue, nV) : nV;
  }
}

function decrement() {
  const parsedValue = stringToModel(innerTextValue.value);
  if (!isDecrementDisabled.value) {
    let nV;
    if (parsedValue === undefined) {
      nV = 0;
    } else {
      nV = +(parsedValue || 0) - props.step;
    }
    modelValue.value = props.minValue !== undefined ? Math.max(props.minValue, nV) : nV;
  }
}

function handleKeyPress(e: { code: string; preventDefault(): void }) {
  if (['ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'Escape') {
    innerTextValue.value = modelToString(modelValue.value);
    input.value?.blur();
  }
  if (e.code === 'Enter') {
    input.value?.blur();
  }

  if (props.useIncrementButtons && e.code === 'ArrowUp') {
    increment();
  }
  if (props.useIncrementButtons && e.code === 'ArrowDown') {
    decrement();
  }
}

// https://stackoverflow.com/questions/880512/prevent-text-selection-after-double-click#:~:text=If%20you%20encounter%20a%20situation,none%3B%20to%20the%20summary%20element.
const onMousedown = (ev: MouseEvent) => {
  // if (ev.detail > 1) {
  //   ev.preventDefault();
  // }
};
</script>

<template>
  <div
    ref="root"
    :class="{ error: !!errors.trim(), disabled: disabled }"
    class="mi-number-field d-flex-column"
    @mousedown="onMousedown"
    @keydown="handleKeyPress($event)"
  >
    <div class="mi-number-field__main-wrapper d-flex">
      <DoubleContour class="mi-number-field__contour" />
      <div class="mi-number-field__wrapper flex-grow d-flex flex-align-center" :class="{withoutArrows: !useIncrementButtons}">
        <label v-if="label" class="text-description">
          {{ label }}
          <PlTooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip" />
            </template>
          </PlTooltip>
        </label>
        <input
            ref="input"
            v-model="inputValue"
            :disabled="disabled"
            :placeholder="placeholder"
            class="text-s flex-grow"
            @focusin="focused = true"
            @focusout="focused = false; onFocusOut()"
        />
      </div>
      <div class="mi-number-field__icons d-flex-column" v-if="useIncrementButtons">
        <div
          :class="{ disabled: isIncrementDisabled }"
          class="mi-number-field__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center"
          @click="increment"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M8 4.93933L13.5303 10.4697L12.4697 11.5303L8 7.06065L3.53033 11.5303L2.46967 10.4697L8 4.93933Z"
              fill="#110529"
            />
          </svg>
        </div>
        <div
          :class="{ disabled: isDecrementDisabled }"
          class="mi-number-field__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center"
          @click="decrement"
        >
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
    <div v-if="errors.trim()" class="mi-number-field__hint text-description">
      {{ errors }}
    </div>
  </div>
</template>
