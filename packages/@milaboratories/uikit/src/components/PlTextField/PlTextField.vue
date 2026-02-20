<script lang="ts">
/**
 * Component for one-line string data manipulation
 */
export default {
  name: "PlTextField",
};
</script>

<script lang="ts" setup generic="M, E = string, C = E">
import type { Equal } from "@milaboratories/helpers";
import { computed, reactive, ref, useSlots } from "vue";
import SvgRequired from "../../assets/images/required.svg?raw";
import { getErrorMessage } from "../../helpers/error.ts";
import DoubleContour from "../../utils/DoubleContour.vue";
import { useLabelNotch } from "../../utils/useLabelNotch.ts";
import { useValidation } from "../../utils/useValidation.ts";
import { PlIcon16 } from "../PlIcon16/index.ts";
import { PlIcon24 } from "../PlIcon24/index.ts";
import { PlSvg } from "../PlSvg/index.ts";
import { PlTooltip } from "../PlTooltip/index.ts";
import "./pl-text-field.scss";

const slots = useSlots();

type Model = Equal<M, E | C> extends true ? M : never; // basically in === out

/**
 * The current value of the input field.
 */
const model = defineModel<Model>({
  required: true,
});

const props = defineProps<{
  /**
   * The label to display above the input field.
   */
  label?: string;
  /**
   * If `true`, a clear icon will appear in the input field to clear the value (set it to empty string).
   * Or you can pass a callback that returns a custom "empty" value (null | undefined | string)
   */
  clearable?: boolean | (() => C);
  /**
   * An optional callback to parse and/or cast the value, the return type overrides the model type.
   * The callback must throw an exception if the value is invalid
   */
  parse?: (v: string) => E;
  /**
   * If `true`, the input field is marked as required.
   */
  required?: boolean;
  /**
   * An error message to display below the input field.
   */
  error?: unknown;
  /**
   * A helper text to display below the input field when there are no errors.
   */
  helper?: string;
  /**
   * A placeholder text to display inside the input field when it is empty.
   */
  placeholder?: string;
  /**
   * If `true`, the input field is disabled and cannot be interacted with.
   */
  disabled?: boolean;
  /**
   * If `true`, the input field has a dashed border.
   */
  dashed?: boolean;
  /**
   * A prefix text to display inside the input field before the value.
   */
  prefix?: string;
  /**
   * An array of validation rules to apply to the input field. Each rule is a function that takes the current value and returns `true` if valid or an error message if invalid.
   */
  rules?: ((v: string) => boolean | string)[];
  /**
   * The string specifies whether the field should be a password or not, value could be "password" or undefined.
   */
  type?: "password";
  /**
   * Makes some of corners not rounded
   * */
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

const data = reactive({
  cached: undefined as { error: string; value: string } | undefined,
});

const valueRef = computed<string>({
  get() {
    if (data.cached) {
      return data.cached.value;
    }
    return model.value === undefined || model.value === null ? "" : String(model.value);
  },
  set(value) {
    data.cached = undefined;

    if (props.parse) {
      try {
        model.value = props.parse(value) as Model;
      } catch (err) {
        data.cached = {
          error: err instanceof Error ? err.message : String(err),
          value,
        };
      }
    } else {
      model.value = value as Model;
    }
  },
});

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
    data.cached = undefined;
    model.value = props.clearable === true ? ("" as Model) : (props.clearable() as Model);
  }
};

const validationData = useValidation(valueRef, props.rules || []);

const isEmpty = computed(() => {
  if (props.clearable) {
    return props.clearable === true ? model.value === "" : model.value === props.clearable();
  }

  return model.value === "";
});

const nonEmpty = computed(() => !isEmpty.value);

const displayErrors = computed(() => {
  const errors: string[] = [];
  const propsError = getErrorMessage(props.error);
  if (propsError) {
    errors.push(propsError);
  }
  if (data.cached) {
    errors.push(data.cached.error);
  }
  if (!validationData.value.isValid) {
    errors.push(...validationData.value.errors);
  }
  return errors;
});

const hasErrors = computed(() => displayErrors.value.length > 0);

const canShowClearable = computed(
  () => props.clearable && nonEmpty.value && props.type !== "password" && !props.disabled,
);

const togglePasswordVisibility = () => (showPassword.value = !showPassword.value);

const onFocusOut = () => {
  data.cached = undefined;
};

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
        v-model="valueRef"
        :disabled="disabled"
        :placeholder="placeholder || '...'"
        :type="fieldType"
        spellcheck="false"
        @focusout="onFocusOut"
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
