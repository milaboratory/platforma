<script lang="ts" setup>
import { computed, ref, useSlots } from 'vue';
import Tooltip from '@/lib/components/Tooltip.vue';
import DoubleContour from '@/lib/utils/DoubleContour.vue';
import { useLabelNotch } from '@/lib/composition/useLabelNotch';

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

const nonEmpty = computed(() => !!props.modelValue);

function clear() {
  emit('update:modelValue', undefined);
}

useLabelNotch(root);
</script>

<template>
  <div class="ui-text-field__envelope">
    <div ref="root" class="ui-text-field" :class="{ optional, error, disabled, dashed, nonEmpty }">
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
      <input ref="input" v-model="value" :disabled="disabled" type="text" :placeholder="placeholder || '...'" spellcheck="false" />
      <div class="ui-text-field__append">
        <div v-if="clearable && nonEmpty" class="icon icon--clear" @click="clear" />
        <slot name="append" />
      </div>
      <double-contour class="ui-text-field__contour" />
    </div>
    <div v-if="error" class="ui-text-field__error">{{ error }}</div>
    <div v-else-if="helper" class="ui-text-field__helper">{{ helper }}</div>
  </div>
</template>
