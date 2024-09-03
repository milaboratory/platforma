<script lang="ts" setup>
import { computed, ref, useSlots } from 'vue';
import { PlTooltip } from '@/components/PlTooltip';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import { useValidation } from '@/composition/useValidation';

const slots = useSlots();

const emit = defineEmits<{
  /**
   * Emitted when the model value is updated.
   *
   * @param value - The new value of the input, which can be a string or undefined if cleared.
   */
  (e: 'update:modelValue', value: string | undefined): void;
}>();

const props = defineProps<{
  /**
   * The current value of the input field.
   */
  modelValue?: string;
  /**
   * The label to display above the input field.
   */
  label?: string;
  /**
   * If `true`, a clear icon will appear in the input field to clear the value (set it to 'undefined').
   */
  clearable?: boolean;
  /**
   * If `true`, the input field is marked as required.
   */
  required?: boolean;
  /**
   * If `true`, the input field is marked as optional.
   * @deprecated (to discuss)
   */
  optional?: boolean;
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
   * @nicolaygiman This is a strange signature, let's discuss it (@TODO)
   */
  rules?: ((v: typeof props.modelValue) => boolean | string)[];
}>();

const rootRef = ref<HTMLInputElement | undefined>(undefined);

const inputRef = ref<HTMLInputElement | undefined>();

const value = computed({
  get() {
    return props.modelValue ?? '';
  },
  set(v) {
    emit('update:modelValue', v);
  },
});

const clear = () => emit('update:modelValue', undefined);

const validationData = useValidation(value, props.rules || []);

const nonEmpty = computed(() => !!props.modelValue);

const displayErrors = computed(() => {
  const allErrors: string[] = [];
  if (props.error) {
    allErrors.push(props.error);
  }
  if (validationData.value.errors.length > 0) {
    allErrors.push(...validationData.value.errors);
  }
  return allErrors.length > 0 ? allErrors.join(' ') : false;
});

useLabelNotch(rootRef);
</script>

<template>
  <div class="ui-text-field__envelope">
    <div
      ref="rootRef"
      class="ui-text-field"
      :class="{
        optional,
        error: displayErrors,
        disabled,
        dashed,
        nonEmpty,
      }"
    >
      <label v-if="label" ref="label">
        <i v-if="required" class="required-icon" />
        <span>{{ label }}</span>
        <span v-if="optional" style="opacity: 0.5">(optional)</span>
        <PlTooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </PlTooltip>
      </label>
      <div v-if="prefix" class="ui-text-field__prefix">
        {{ prefix }}
      </div>
      <input ref="inputRef" v-model="value" :disabled="disabled" :placeholder="placeholder || '...'" type="text" spellcheck="false" />
      <div class="ui-text-field__append">
        <div v-if="clearable && nonEmpty" class="icon icon--clear" @click="clear" />
        <slot name="append" />
      </div>
      <DoubleContour class="ui-text-field__contour" />
    </div>
    <div v-if="displayErrors" class="ui-text-field__error">
      {{ displayErrors }}
    </div>
    <div v-else-if="helper" class="ui-text-field__helper">{{ helper }}</div>
  </div>
</template>
