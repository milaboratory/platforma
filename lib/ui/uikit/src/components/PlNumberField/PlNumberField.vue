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
 *   :update-on-enter-or-click-outside="true"
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
import { parseNumber, normalizeNumberString } from "./parseNumber";

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
const inputRef = ref<HTMLInputElement>();

useLabelNotch(rootRef);

function modelToString(v: number | undefined) {
  return v === undefined ? "" : String(+v); // (+v) to avoid staying in input non-number values if they are provided in model
}

const parsedResult = computed(() => parseNumber(props, inputValue.value));

const cachedValue = ref<string | undefined>(undefined);

const resetCachedValue = () => (cachedValue.value = undefined);

watch(modelValue, (n) => {
  const r = parsedResult.value;
  if (r.error || n !== r.value) {
    resetCachedValue();
  }
});

const inputValue = computed({
  get() {
    return cachedValue.value ?? modelToString(modelValue.value);
  },
  set(nextValue: string) {
    const r = parseNumber(props, nextValue);

    cachedValue.value = r.cleanInput;

    if (r.error) {
      inputRef.value!.value = r.cleanInput;
    } else {
      modelValue.value = r.value as V;
    }
  },
});

const canShowClearable = computed(
  () => props.clearable && modelValue.value !== undefined && !props.disabled,
);

function clear() {
  if (typeof props.clearable === "function") {
    modelValue.value = props.clearable() as V;
  } else {
    modelValue.value = undefined as V;
  }
  resetCachedValue();
}

function applyChanges() {
  if (parsedResult.value.error === undefined) {
    modelValue.value = parsedResult.value.value as C;
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

  return ers.join(" ");
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

const multiplier = computed(() => 10 ** (props.step.toString().split(".").at(1)?.length ?? 0));

function increment() {
  const r = parsedResult.value;

  const parsedValue = r.value;

  if (!isIncrementDisabled.value) {
    let nV;
    if (parsedValue === undefined) {
      nV = props.minValue ? props.minValue : 0;
    } else {
      nV =
        ((parsedValue || 0) * multiplier.value + props.step * multiplier.value) / multiplier.value;
    }
    modelValue.value = (props.maxValue !== undefined ? Math.min(props.maxValue, nV) : nV) as V;
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
      nV =
        ((parsedValue || 0) * multiplier.value - props.step * multiplier.value) / multiplier.value;
    }
    modelValue.value = (props.minValue !== undefined ? Math.max(props.minValue, nV) : nV) as V;
  }
}

function handleKeyPress(e: { code: string; preventDefault(): void }) {
  if (e.code === "Enter") {
    inputValue.value = String(modelValue.value); // to make .1 => 0.1, 10.00 => 10, remove leading zeros etc
  }

  if (["ArrowDown", "ArrowUp"].includes(e.code)) {
    e.preventDefault();
  }

  if (props.disableSteps !== true && e.code === "ArrowUp") {
    increment();
  }

  if (props.disableSteps !== true && e.code === "ArrowDown") {
    decrement();
  }
}

function handlePaste(e: ClipboardEvent) {
  const pasted = e.clipboardData?.getData("text");
  if (pasted) {
    e.preventDefault();
    inputValue.value = normalizeNumberString(pasted);
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
          v-model="inputValue"
          :disabled="disabled"
          :placeholder="placeholder"
          class="text-s flex-grow"
          @focusout="applyChanges"
          @paste="handlePaste"
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
        @mousedown="onMousedown"
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
    <div v-if="errors.trim()" class="pl-number-field__error">
      {{ errors }}
    </div>
  </div>
</template>
