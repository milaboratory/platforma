<script lang="ts">
/** Component for multi-line string data manipulation */
export default {
  name: 'PlTextArea',
};
</script>

<script lang="ts" setup>
import './pl-textarea.scss';
import { computed, onMounted, ref, useSlots } from 'vue';
import { PlTooltip } from '@/components/PlTooltip';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import { useValidation } from '@/utils/useValidation';

const slots = useSlots();

const emit = defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: string): void;
}>();

const props = defineProps<{
  /**
   * The current value of the texarea.
   */
  modelValue?: string;
  /**
   * The label to display above the texarea.
   */
  label?: string;
  /**
   * If `true`, the textarea is marked as required.
   */
  required?: boolean;
  /**
   * An error message to display below the textarea.
   */
  error?: string;
  /**
   * A helper text to display below the textarea when there are no errors.
   */
  helper?: string;
  /**
   * A placeholder text to display inside the textarea when it is empty.
   */
  placeholder?: string;
  /**
   * If `true`, the textarea is disabled and cannot be interacted with.
   */
  disabled?: boolean;
  /**
   * If `true`, the textarea is in a read-only state and cannot be edited, but it can still be focused and text can be selected.
   */
  readonly?: boolean;
  /**
   * If `true`, applies a dashed border style to the textarea, likely used for stylistic purposes or to indicate a certain state.
   */
  dashed?: boolean;
  /**
   * The number of visible text lines for the textarea, which controls the height of the textarea.
   */
  rows?: number;
  /**
   * If `true`, the textarea automatically adjusts its height to fit the content as the user types.
   */
  autogrow?: boolean;
  /**
   * An array of validation rules that are applied to the textarea input. Each rule is a function that receives the input value and returns `true` for valid input or an error message string for invalid input.
   */
  rules?: ((v: string) => boolean | string)[];
}>();

const root = ref<HTMLInputElement>();
const input = ref<HTMLTextAreaElement>();

const value = computed({
  get() {
    return props.modelValue ?? '';
  },
  set(v) {
    emit('update:modelValue', v);
  },
});

const nonEmpty = computed(() => !!props.modelValue);
const validationData = useValidation(value, props.rules || []);

useLabelNotch(root);

const displayErrors = computed(() => {
  const errors: string[] = [];
  if (props.error) {
    errors.push(props.error);
  }
  errors.push(...validationData.value.errors);
  return errors;
});

const hasErrors = computed(() => displayErrors.value.length > 0);

const adjustHeight = () => {
  if (!props.autogrow) {
    return;
  }
  const el = input.value;
  if (el) {
    el.style.height = 'auto'; // it works, do not delete it
    el.style.height = `${el.scrollHeight}px`; // Set height based on scrollHeight
  }
};

onMounted(() => {
  adjustHeight();
});
</script>

<template>
  <div class="ui-text-area__envelope">
    <div ref="root" class="ui-text-area" :class="{ error: hasErrors, disabled, dashed, nonEmpty }">
      <label v-if="label" ref="label">
        <i v-if="required" class="required-icon" />
        <span>{{ label }}</span>
        <PlTooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </PlTooltip>
      </label>
      <textarea
        ref="input"
        v-model="value"
        :readonly="readonly"
        :rows="rows"
        :disabled="disabled"
        :placeholder="placeholder ?? '...'"
        spellcheck="false"
        @input="adjustHeight"
      />
      <div class="ui-text-area__append">
        <slot name="append" />
      </div>
      <DoubleContour class="ui-text-area__contour" />
    </div>
    <div v-if="hasErrors" class="ui-text-area__error">
      {{ displayErrors.join(' ') }}
    </div>
    <div v-else-if="helper" class="ui-text-area__helper">{{ helper }}</div>
  </div>
</template>
