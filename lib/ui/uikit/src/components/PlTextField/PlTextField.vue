<script lang="ts">
/**
 * Component for one-line string data manipulation
 */
export default {
  name: "PlTextField",
};
</script>

<script lang="ts" setup generic="V extends undefined | string, C extends V">
import { computed, ref, useSlots } from "vue";
import SvgRequired from "../../assets/images/required.svg?raw";
import { getErrorMessage } from "../../helpers/error.ts";
import DoubleContour from "../../utils/DoubleContour.vue";
import { useLabelNotch } from "../../utils/useLabelNotch";
import { PlIcon16 } from "../PlIcon16";
import { PlIcon24 } from "../PlIcon24";
import { PlSvg } from "../PlSvg";
import { PlTooltip } from "../PlTooltip";
import "./pl-text-field.scss";

const slots = useSlots();

/**
 * The current value of the input field.
 */
const model = defineModel<V>({
  required: true,
});

const props = defineProps<{
  /** The label to display above the input field. */
  label?: string;
  /**
   * If `true`, a clear icon will appear in the input field to clear the value (set it to empty string).
   * If a function, calls it to get the reset value.
   */
  clearable?: boolean | (() => C);
  /** If `true`, the input field is marked as required. */
  required?: boolean;
  /** An error message to display below the input field. */
  error?: unknown;
  /** A helper text to display below the input field when there are no errors. */
  helper?: string;
  /** A placeholder text to display inside the input field when it is empty. */
  placeholder?: string;
  /** If `true`, the input field is disabled and cannot be interacted with. */
  disabled?: boolean;
  /** If `true`, the input field has a dashed border. */
  dashed?: boolean;
  /** A prefix text to display inside the input field before the value. */
  prefix?: string;
  /** Additional validity check for input value that must return an error text if failed */
  validate?: (v: V) => string | undefined;
  /** The string specifies whether the field should be a password or not, value could be "password" or undefined. */
  type?: "password";
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
}>();

const rootRef = ref<HTMLInputElement | undefined>(undefined);

const inputRef = ref<HTMLInputElement | undefined>();

const showPassword = ref(false);

const fieldType = computed(() => {
  if (props.type && props.type === "password") {
    return showPassword.value ? "text" : props.type;
  } else {
    return "text";
  }
});

const passwordIcon = computed(() => (showPassword.value ? "view-show" : "view-hide"));

const clear = () => {
  if (props.clearable) {
    model.value = (typeof props.clearable === "function" ? props.clearable() : "") as V;
  }
};

const isEmpty = computed(() => model.value === "");

const nonEmpty = computed(() => !isEmpty.value);

const displayErrors = computed(() => {
  const errors: string[] = [];
  const propsError = getErrorMessage(props.error);
  if (propsError) {
    errors.push(propsError);
  }
  if (props.validate) {
    const error = props.validate(model.value as V);
    if (error) {
      errors.push(error);
    }
  }
  return errors;
});

const hasErrors = computed(() => displayErrors.value.length > 0);

const canShowClearable = computed(
  () => props.clearable && nonEmpty.value && props.type !== "password" && !props.disabled,
);

const togglePasswordVisibility = () => (showPassword.value = !showPassword.value);

const setFocusOnInput = () => inputRef.value?.focus();

useLabelNotch(rootRef);
</script>

<template>
  <div class="pl-text-field__envelope">
    <div
      ref="rootRef"
      class="pl-text-field"
      :class="{
        error: hasErrors,
        disabled,
        dashed,
        nonEmpty,
      }"
    >
      <label v-if="label" ref="label">
        <PlSvg v-if="required" :uri="SvgRequired" />
        <span>{{ label }}</span>
        <PlTooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </PlTooltip>
      </label>
      <div v-if="prefix" class="pl-text-field__prefix">
        {{ prefix }}
      </div>
      <input
        ref="inputRef"
        v-model="model"
        :disabled="disabled"
        :placeholder="placeholder || '...'"
        :type="fieldType"
        spellcheck="false"
      />
      <div class="pl-text-field__append" @click="setFocusOnInput">
        <PlIcon16
          v-if="canShowClearable"
          class="pl-text-field__clearable"
          name="delete-clear"
          @click.stop="clear"
        />
        <PlIcon24
          v-if="type === 'password'"
          :name="passwordIcon"
          style="cursor: pointer"
          @click.stop="togglePasswordVisibility"
        />
        <slot name="append" />
      </div>
      <DoubleContour class="pl-text-field__contour" :group-position="groupPosition" />
    </div>
    <div v-if="hasErrors" class="pl-text-field__error">
      {{ displayErrors.join(" ") }}
    </div>
    <div v-else-if="helper" class="pl-text-field__helper">{{ helper }}</div>
  </div>
</template>
