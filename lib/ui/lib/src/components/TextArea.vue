<script lang="ts" setup>
import { computed, ref, useSlots } from 'vue';
import Tooltip from '@/components/Tooltip.vue';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/composition/useLabelNotch';
import { useValidation } from '@/composition/useValidation';

const slots = useSlots();

const emit = defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue?: string;
  label?: string;
  optional?: boolean;
  error?: string;
  helper?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  dashed?: boolean;
  rows?: number;
  autogrow?: boolean;
  rules?: ((v: typeof props.modelValue) => boolean | string)[];
}>();

const root = ref<HTMLInputElement | undefined>(undefined);
const input = ref<HTMLTextAreaElement>();

const value = computed({
  get() {
    return props.modelValue || '';
  },
  set(v) {
    emit('update:modelValue', v);
  },
});

const nonEmpty = computed(() => !!props.modelValue);
const validationData = useValidation(value, props.rules || []);

useLabelNotch(root);

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

function adjustHeight() {
  if (!props.autogrow) {
    return;
  }
  const textarea = input.value;
  if (textarea) {
    textarea.style.height = 'auto'; // Reset height to auto
    textarea.style.height = `${textarea.scrollHeight}px`; // Set height based on scrollHeight
  }
}
</script>

<template>
  <div class="ui-text-area__envelope">
    <div ref="root" class="ui-text-area" :class="{ optional, error: displayErrors, disabled, dashed, nonEmpty }">
      <label v-if="label" ref="label">
        {{ label }}
        <span v-if="optional" style="opacity: 0.5">(optional)</span>
        <tooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </tooltip>
      </label>
      <textarea
        ref="input"
        v-model="value"
        :readonly="readonly"
        :rows="rows"
        :disabled="disabled"
        :placeholder="placeholder || '...'"
        spellcheck="false"
        @input="adjustHeight"
      />
      <div class="ui-text-area__append">
        <!-- clearable is not available for TextArea -->
        <!-- <div v-if="clearable && nonEmpty" class="icon icon--clear" @click="clear" /> -->
        <slot name="append" />
      </div>
      <double-contour class="ui-text-area__contour" />
    </div>
    <div v-if="displayErrors" class="ui-text-area__error">
      {{ displayErrors }}
    </div>
    <div v-else-if="helper" class="ui-text-area__helper">{{ helper }}</div>
  </div>
</template>
