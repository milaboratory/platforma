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
  clearable?: boolean;
  required?: boolean;
  numeric?: boolean;
  optional?: boolean;
  error?: string;
  helper?: string;
  placeholder?: string;
  disabled?: boolean;
  dashed?: boolean;
  prefix?: string;
  rules?: ((v: typeof props.modelValue) => boolean | string)[];
}>();

const root = ref<HTMLInputElement | undefined>(undefined);
const input = ref<HTMLInputElement | undefined>();

const value = computed({
  get() {
    return props.modelValue || '';
  },
  set(v) {
    emit('update:modelValue', v);
  },
});

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

useLabelNotch(root);

function clear() {
  emit('update:modelValue', undefined);
}
</script>

<template>
  <div class="ui-text-field__envelope">
    <div
      ref="root"
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
        {{ label }}
        <span v-if="optional" style="opacity: 0.5">(optional)</span>
        <tooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </tooltip>
      </label>
      <div v-if="prefix" class="ui-text-field__prefix">
        {{ prefix }}
      </div>
      <input
        ref="input"
        v-model="value"
        :disabled="disabled"
        :placeholder="placeholder || '...'"
        type="text"
        spellcheck="false"
      />
      <div class="ui-text-field__append">
        <div
          v-if="clearable && nonEmpty"
          class="icon icon--clear"
          @click="clear"
        />
        <slot name="append" />
      </div>
      <double-contour class="ui-text-field__contour" />
    </div>
    <div v-if="displayErrors" class="ui-text-field__error">
      {{ displayErrors }}
    </div>
    <div v-else-if="helper" class="ui-text-field__helper">{{ helper }}</div>
  </div>
</template>
