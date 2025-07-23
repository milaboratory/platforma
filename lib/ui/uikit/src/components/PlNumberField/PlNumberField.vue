<script setup lang="ts">
import './pl-number-field.scss';
import DoubleContour from '../../utils/DoubleContour.vue';
import { useLabelNotch } from '../../utils/useLabelNotch';
import { computed, ref, useSlots, watch } from 'vue';
import { PlTooltip } from '../PlTooltip';
import { parseNumber, cleanInput } from './parseNumber';

const props = withDefaults(defineProps<{
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
  /** If true - changes do not apply immediately, they apply only by removing focus from the input (by click enter or by click outside)  */
  updateOnEnterOrClickOutside?: boolean;
  /** Error message that shows always when it's provided, without other checks */
  errorMessage?: string;
  /** Additional validity check for input value that must return an error text if failed */
  validate?: (v: number) => string | undefined;
}>(), {
  step: 1,
  label: undefined,
  placeholder: undefined,
  minValue: undefined,
  maxValue: undefined,
  useIncrementButtons: true,
  updateOnEnter: false,
  errorMessage: undefined,
  validate: undefined,
});

const modelValue = defineModel<number | undefined>({ required: true });

const slots = useSlots();

const rootRef = ref<HTMLElement>();
const inputRef = ref<HTMLInputElement>();

useLabelNotch(rootRef);

function modelToString(v: number | undefined) {
  return v === undefined ? '' : String(+v); // (+v) to avoid staying in input non-number values if they are provided in model
}

const parsedResult = computed(() => parseNumber(props, inputValue.value));

const cachedValue = ref<string | undefined>(undefined);

const resetCachedValue = () => cachedValue.value = undefined;

watch(modelValue, resetCachedValue);

const inputValue = computed({
  get() {
    return cachedValue.value ?? modelToString(modelValue.value);
  },
  set(nextValue: string) {
    resetCachedValue();

    const r = parseNumber(props, nextValue);

    if (r.error || props.updateOnEnterOrClickOutside) {
      const clean = cleanInput(nextValue);
      cachedValue.value = clean;
      inputRef.value!.value = clean;
    } else {
      modelValue.value = r.value;
    }
  },
});

const focused = ref(false);

function applyChanges() {
  if (parsedResult.value.error === undefined) {
    modelValue.value = parsedResult.value.value;
  }
}

const errors = computed(() => {
  let ers: string[] = [];

  if (props.errorMessage) {
    ers.push(props.errorMessage);
  }

  const r = parsedResult.value;

  if (r.error) {
    ers.push(r.error.message);
  } else if (props.validate && r.value !== undefined) {
    const error = props.validate(r.value);
    if (error) {
      ers.push(error);
    }
  }

  ers = [...ers];

  return ers.join(' ');
});

const isIncrementDisabled = computed(() => {
  const r = parsedResult.value;

  if (props.maxValue !== undefined && r.value !== undefined) {
    return r.value >= props.maxValue;
  }

  return false;
});

const isDecrementDisabled = computed(() => {
  const r = parsedResult.value;

  if (props.minValue !== undefined && r.value !== undefined) {
    return r.value <= props.minValue;
  }

  return false;
});

const multiplier = computed(() =>
  10 ** (props.step.toString().split('.').at(1)?.length ?? 0),
);

function increment() {
  const r = parsedResult.value;

  const parsedValue = r.value;

  if (!isIncrementDisabled.value) {
    let nV;
    if (parsedValue === undefined) {
      nV = props.minValue ? props.minValue : 0;
    } else {
      nV = ((parsedValue || 0) * multiplier.value
        + props.step * multiplier.value)
      / multiplier.value;
    }
    modelValue.value = props.maxValue !== undefined ? Math.min(props.maxValue, nV) : nV;
  }
}

function decrement() {
  const r = parsedResult.value;

  const parsedValue = r.value;

  if (!isDecrementDisabled.value) {
    let nV;
    if (parsedValue === undefined) {
      nV = 0;
    } else {
      nV = ((parsedValue || 0) * multiplier.value
        - props.step * multiplier.value)
      / multiplier.value;
    }
    modelValue.value = props.minValue !== undefined ? Math.max(props.minValue, nV) : nV;
  }
}

function handleKeyPress(e: { code: string; preventDefault(): void }) {
  if (props.updateOnEnterOrClickOutside) {
    if (e.code === 'Escape') {
      inputValue.value = modelToString(modelValue.value);
      inputRef.value?.blur();
    }
    if (e.code === 'Enter') {
      inputRef.value?.blur();
    }
  }

  if (e.code === 'Enter') {
    inputValue.value = String(modelValue.value); // to make .1 => 0.1, 10.00 => 10, remove leading zeros etc
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
const onMousedown = (ev: MouseEvent) => {
  if (ev.detail > 1) {
    ev.preventDefault();
  }
};
</script>

<template>
  <div
    ref="rootRef"
    :class="{ error: !!errors.trim(), disabled: disabled }"
    class="pl-number-field d-flex-column"
    @keydown="handleKeyPress($event)"
  >
    <div class="pl-number-field__main-wrapper d-flex">
      <DoubleContour class="pl-number-field__contour"/>
      <div
        class="pl-number-field__wrapper flex-grow d-flex flex-align-center"
        :class="{withoutArrows: !useIncrementButtons}"
      >
        <label v-if="label" class="text-description">
          {{ label }}
          <PlTooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip"/>
            </template>
          </PlTooltip>
        </label>
        <input
          ref="inputRef"
          v-model="inputValue"
          :disabled="disabled"
          :placeholder="placeholder"
          class="text-s flex-grow"
          @focusin="focused = true"
          @focusout="focused = false; applyChanges()"
        />
      </div>
      <div v-if="useIncrementButtons" class="pl-number-field__icons d-flex-column" @mousedown="onMousedown">
        <div
          :class="{ disabled: isIncrementDisabled }"
          class="pl-number-field__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center"
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
          class="pl-number-field__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center"
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
    <div v-if="errors.trim()" class="pl-number-field__error">
      {{ errors }}
    </div>
  </div>
</template>
