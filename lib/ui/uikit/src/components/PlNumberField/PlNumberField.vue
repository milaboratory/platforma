<script setup lang="ts">
import './pl-number-field.scss';
import DoubleContour from '@/utils/DoubleContour.vue';
import {useLabelNotch} from '@/utils/useLabelNotch';
import {computed, ref, useSlots, watch} from 'vue';
import {PlTooltip} from '@/components/PlTooltip';

type NumberInputProps = {
  /** Input is disabled if true */
  disabled?: boolean;
  /** Label on the top border of the field, empty by default */
  label?: string;
  /** Input placeholder, empty by default */
  placeholder?: string;
  /** Step for increment/decrement buttons, 1 by default */
  step?: number;
  /** If defined - show an error if value is lower  */
  minValue?: number;
  /** If defined - show an error if value is higher */
  maxValue?: number;
  /** If false - remove buttons on the right */
  useIncrementButtons?: boolean;
  /** Error message that shows always when it's provided, without other checks */
  errorMessage?: string;
  /** Additional validity check for input value that must return an error text if failed */
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

function modelToString(v: number | undefined) {
  return v === undefined ? '' : String(+v); // (+v) to avoid staying in input non-number values if they are provided in model
}

function stringToModel(v: string) {
  if (v === '') {
    return undefined
  }
  if (v === '.' || v === ',') {
    return 0;
  }
  return parseFloat(v.replace(',', '.'));
}

const innerTextValue = ref(modelToString(modelValue.value));
const innerNumberValue = computed(() => stringToModel(innerTextValue.value));
watch(() => modelValue.value, (outerValue) => { // update inner value if outer value is changed
  if (parseFloat(innerTextValue.value) !== outerValue) {
    innerTextValue.value = modelToString(outerValue);
  }
})

const NUMBER_REGEX = /^(\d+)?[\\.,]?(\d+)?$/;
const inputValue = computed({
  get() {
    return innerTextValue.value;
  },
  set(nextValue: string) {
    const parsedValue = stringToModel(nextValue);
    // we allow to set empty value or valid numeric value, otherwise reset input value to previous valid
    if (
        parsedValue === undefined ||
        nextValue.match(NUMBER_REGEX) && !isNaN(parsedValue)
    ) {
      innerTextValue.value = nextValue;
    } else if (input.value) {
      input.value.value = innerTextValue.value;
    }
  }
})
const focused = ref(false);

function applyChanges() {
  if (innerTextValue.value === '') {
    modelValue.value = undefined;
    return;
  }
  modelValue.value = innerNumberValue.value;
  innerTextValue.value = String(modelValue.value); // to make .1 => 0.1, 10.00 => 10, etc
}

const errors = computed(() => {
  let ers: string[] = [];
  if (props.errorMessage) {
    ers.push(props.errorMessage);
  }
  const parsedValue = innerNumberValue.value;
  if (parsedValue !== undefined && isNaN(parsedValue)) {
    ers.push('Value is not a number');
  } else if (props.validate && parsedValue !== undefined) {
    const error = props.validate(parsedValue);
    if (error) {
      ers.push(error);
    }
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
  const parsedValue = innerNumberValue.value;
  if (props.maxValue !== undefined && parsedValue !== undefined) {
    return parsedValue >= props.maxValue;
  }
  return false;
});

const isDecrementDisabled = computed(() => {
  const parsedValue = innerNumberValue.value;
  if (props.minValue !== undefined && parsedValue !== undefined) {
    return parsedValue <= props.minValue;
  }
  return false;
});

function increment() {
  const parsedValue = innerNumberValue.value;
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
  const parsedValue = innerNumberValue.value;
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
  if (e.code === 'Escape') {
    innerTextValue.value = modelToString(modelValue.value);
    input.value?.blur();
  }
  if (e.code === 'Enter') {
    input.value?.blur();
  }

  if (['ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
  }
  if (props.useIncrementButtons && e.code === 'ArrowUp') {
    increment();
  }
  if (props.useIncrementButtons && e.code === 'ArrowDown') {
    decrement();
  }
}

// https://stackoverflow.com/questions/880512/prevent-text-selection-after-double-click#:~:text=If%20you%20encounter%20a%20situation,none%3B%20to%20the%20summary%20element.
// this prevents selecting of more than input content in some cases,
// but also disable selecting input content by double-click (useful feature)
const onMousedown = (_ev: MouseEvent) => {
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
      <DoubleContour class="mi-number-field__contour"/>
      <div class="mi-number-field__wrapper flex-grow d-flex flex-align-center"
           :class="{withoutArrows: !useIncrementButtons}">
        <label v-if="label" class="text-description">
          {{ label }}
          <PlTooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip"/>
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
            @focusout="focused = false; applyChanges()"
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
