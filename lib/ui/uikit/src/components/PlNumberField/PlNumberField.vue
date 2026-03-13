<script lang="ts">
/**
 * Number input field with increment/decrement buttons, validation, and min/max constraints.
 *
 * @example
 * <PlNumberField v-model="price" :step="0.01" :min-value="0" label="Price" />
 *
 * @example
 * <PlNumberField
 *   v-model="evenNumber"
 *   :validate="(v) => v % 2 !== 0 ? 'Number must be even' : undefined"
 *   label="Even Number"
 * />
 */
export default {
  name: "PlNumberField",
};
</script>

<script setup lang="ts" generic="V extends undefined | number, C extends V">
import "./pl-number-field.scss";
import DoubleContour from "../../utils/DoubleContour.vue";
import { useLabelNotch } from "../../utils/useLabelNotch";
import { computed, ref, useSlots, watch } from "vue";
import { PlTooltip } from "../PlTooltip";
import { PlIcon16 } from "../PlIcon16";
import { tryParseNumber, numberToDecimalString, validateNumber } from "./parseNumber";

const modelValue = defineModel<V>({ required: true });

const props = withDefaults(
  defineProps<{
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
    /** Input is disabled if true */
    disabled?: boolean;
    /** If true - remove buttons on the right */
    disableSteps?: boolean;
    /** Error message that shows always when it's provided, without other checks */
    errorMessage?: string;
    /** Additional validity check for input value that must return an error text if failed */
    validate?: (v: number) => string | undefined;
    /** If `true`, shows a clear button that resets value to `undefined`. If a function, calls it to get the reset value. */
    clearable?: boolean | (() => C);
    /** Makes some of corners not rounded */
    groupPosition?:
      | "top"
      | "bottom"
      | "left"
      | "right"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "middle";
  }>(),
  {
    step: 1,
    label: undefined,
    placeholder: undefined,
    minValue: undefined,
    maxValue: undefined,
    clearable: false,
    groupPosition: undefined,
    disableSteps: false,
    validate: undefined,
    errorMessage: undefined,
  },
);

const slots = useSlots();

const rootRef = ref<HTMLElement>();

useLabelNotch(rootRef);

const displayText = ref(numberToDecimalString(modelValue.value));

// Sync display when model changes externally (parent, increment/decrement).
// Skip if the current input already represents the same value.
watch(modelValue, (newVal) => {
  const parsed = tryParseNumber(displayText.value);
  if (parsed.value === newVal) return;
  displayText.value = numberToDecimalString(newVal);
});

function handleInput(event: Event) {
  const input = event.target as HTMLInputElement;
  displayText.value = input.value;

  const result = tryParseNumber(input.value);
  if (result.value !== undefined) {
    modelValue.value = result.value as V;
  } else if (input.value.trim() === "") {
    modelValue.value = undefined as V;
  }
}

// On Enter or blur: if parseable, replace display with canonical decimal string.
// Converts exponential (1e-5) to plain form (0.00001).
function commitValue() {
  const text = displayText.value.trim();
  const result = tryParseNumber(text);

  // Empty or partial (-, ., -.) → clear to undefined
  if (text === "" || (result.value === undefined && result.error === undefined)) {
    modelValue.value = undefined as V;
    displayText.value = "";
    return;
  }

  if (result.value !== undefined) {
    modelValue.value = result.value as V;
    displayText.value = numberToDecimalString(result.value);
  }
}

const error = computed(() => {
  if (props.errorMessage) return props.errorMessage;

  const result = tryParseNumber(displayText.value);
  if (result.error) return result.error;
  if (result.value !== undefined) {
    return validateNumber(result.value, props);
  }

  return undefined;
});

const canShowClearable = computed(
  () =>
    props.clearable &&
    (modelValue.value !== undefined || displayText.value.trim() !== "") &&
    !props.disabled,
);

function clear() {
  if (typeof props.clearable === "function") {
    modelValue.value = props.clearable() as V;
    displayText.value = numberToDecimalString(modelValue.value);
  } else {
    modelValue.value = undefined as V;
    displayText.value = "";
  }
}

const isIncrementDisabled = computed(() => {
  if (error.value) return true;
  return (
    props.maxValue !== undefined &&
    modelValue.value !== undefined &&
    modelValue.value >= props.maxValue
  );
});

const isDecrementDisabled = computed(() => {
  if (error.value) return true;
  return (
    props.minValue !== undefined &&
    modelValue.value !== undefined &&
    modelValue.value <= props.minValue
  );
});

const multiplier = computed(() => 10 ** (props.step.toString().split(".").at(1)?.length ?? 0));

function increment() {
  if (isIncrementDisabled.value) return;

  let nV: number;
  if (modelValue.value === undefined) {
    nV = props.minValue ?? 0;
  } else {
    nV =
      ((modelValue.value || 0) * multiplier.value + props.step * multiplier.value) /
      multiplier.value;
  }

  modelValue.value = (props.maxValue !== undefined ? Math.min(props.maxValue, nV) : nV) as V;
}

function decrement() {
  if (isDecrementDisabled.value) return;

  let nV: number;
  if (modelValue.value === undefined) {
    nV = 0;
  } else {
    nV =
      ((modelValue.value || 0) * multiplier.value - props.step * multiplier.value) /
      multiplier.value;
  }

  modelValue.value = (props.minValue !== undefined ? Math.max(props.minValue, nV) : nV) as V;
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.code === "Enter") {
    commitValue();
  }

  if (["ArrowDown", "ArrowUp"].includes(e.code)) {
    e.preventDefault();
  }

  if (!props.disableSteps && e.code === "ArrowUp") {
    increment();
  }

  if (!props.disableSteps && e.code === "ArrowDown") {
    decrement();
  }
}

// Prevent selecting beyond input content on triple-click etc.
function handleMousedown(ev: MouseEvent) {
  if (ev.detail > 1) {
    ev.preventDefault();
  }
}
</script>

<template>
  <div
    ref="rootRef"
    :class="{ error: !!error, disabled: disabled }"
    class="pl-number-field d-flex-column"
    @keydown="handleKeyDown"
  >
    <div class="pl-number-field__main-wrapper d-flex">
      <DoubleContour class="pl-number-field__contour" :group-position="groupPosition" />
      <div class="pl-number-field__wrapper flex-grow d-flex flex-align-center">
        <label v-if="label" class="text-description">
          {{ label }}
          <PlTooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip" />
            </template>
          </PlTooltip>
        </label>
        <input
          ref="inputRef"
          type="text"
          inputmode="numeric"
          :value="displayText"
          :disabled="disabled"
          :placeholder="placeholder"
          class="text-s flex-grow"
          @input="handleInput"
          @focusout="commitValue"
        />
        <PlIcon16
          v-if="canShowClearable"
          class="pl-number-field__clearable"
          name="delete-clear"
          @click.stop="clear"
        />
      </div>
      <div
        v-if="!props.disableSteps"
        class="pl-number-field__icons d-flex-column"
        @mousedown="handleMousedown"
      >
        <div
          :class="{ disabled: isIncrementDisabled }"
          class="pl-number-field__icon d-flex flex-justify-center uc-pointer flex-grow flex-align-center"
          @click="increment"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
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
    <div v-if="error" class="pl-number-field__error">
      {{ error }}
    </div>
  </div>
</template>
