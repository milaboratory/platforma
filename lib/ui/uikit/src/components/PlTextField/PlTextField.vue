<script lang="ts">
/** Component for one-line string data manipulation */
export default {
  name: 'PlTextField',
};
</script>

<script lang="ts" setup generic="M extends string | null | undefined = string, E extends M = M">
import './pl-text-field.scss';
import { computed, ref, useSlots } from 'vue';
import { PlTooltip } from '@/components/PlTooltip';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import { useValidation } from '@/utils/useValidation';

const slots = useSlots();

const emit = defineEmits<{
  /**
   * Emitted when the model value is updated.
   *
   * @param value - The new value of the input, which can be a string or undefined if cleared.
   */
  (e: 'update:modelValue', value: string | E): void;
}>();

const props = defineProps<{
  /**
   * The current value of the input field.
   */
  modelValue: M;
  /**
   * The label to display above the input field.
   */
  label?: string;
  /**
   * If `true`, a clear icon will appear in the input field to clear the value (set it to empty string).
   * Or you can pass a callback that returns a custom "empty" value (null | undefined | string)
   */
  clearable?: boolean | (() => E);
  /**
   * If `true`, the input field is marked as required.
   */
  required?: boolean;
  /**
   * An error message to display below the input field.
   */
  error?: string;
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
}>();

const rootRef = ref<HTMLInputElement | undefined>(undefined);

const inputRef = ref<HTMLInputElement | undefined>();

const valueRef = computed<string>({
  get() {
    return props.modelValue ?? '';
  },
  set(v) {
    emit('update:modelValue', v);
  },
});

const clear = () => {
  if (props.clearable) {
    emit('update:modelValue', props.clearable === true ? '' : props.clearable());
  }
};

const validationData = useValidation(valueRef, props.rules || []);

const isEmpty = computed(() => {
  if (props.clearable) {
    return props.clearable === true ? props.modelValue === '' : props.modelValue === props.clearable();
  }

  return props.modelValue === '';
});

const nonEmpty = computed(() => !isEmpty.value);

const displayErrors = computed(() => {
  const errors: string[] = [];
  if (props.error) {
    errors.push(props.error);
  }
  if (!validationData.value.isValid) {
    errors.push(...validationData.value.errors);
  }
  return errors;
});

const hasErrors = computed(() => displayErrors.value.length > 0);

useLabelNotch(rootRef);
</script>

<template>
  <div class="ui-text-field__envelope">
    <div
      ref="rootRef"
      class="ui-text-field"
      :class="{
        error: hasErrors,
        disabled,
        dashed,
        nonEmpty,
      }"
    >
      <label v-if="label" ref="label">
        <i v-if="required" class="required-icon" />
        <span>{{ label }}</span>
        <PlTooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </PlTooltip>
      </label>
      <div v-if="prefix" class="ui-text-field__prefix">
        {{ prefix }}
      </div>
      <input ref="inputRef" v-model="valueRef" :disabled="disabled" :placeholder="placeholder || '...'" type="text" spellcheck="false" />
      <div class="ui-text-field__append">
        <div v-if="clearable && nonEmpty" class="icon icon--clear" @click="clear" />
        <slot name="append" />
      </div>
      <DoubleContour class="ui-text-field__contour" />
    </div>
    <div v-if="hasErrors" class="ui-text-field__error">
      {{ displayErrors.join(' ') }}
    </div>
    <div v-else-if="helper" class="ui-text-field__helper">{{ helper }}</div>
  </div>
</template>
