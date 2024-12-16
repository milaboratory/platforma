<script lang="ts" setup>
import { PlIcon16 } from '../PlIcon16';
import { PlIcon24 } from '../PlIcon24';
import { computed, ref } from 'vue';

const emit = defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue?: string;
  clearable?: boolean;
  placeholder?: string;
  disabled?: boolean;
}>();

const root = ref<HTMLInputElement | undefined>(undefined);
const input = ref<HTMLInputElement | undefined>();

const value = computed({
  get() {
    return props.modelValue ?? '';
  },
  set(v) {
    emit('update:modelValue', v);
  },
});

const nonEmpty = computed(() => !!props.modelValue);

const clear = () => emit('update:modelValue', '');
</script>

<template>
  <div ref="root" class="pl-search-field" :class="[$style.component]">
    <PlIcon24 name="search" />
    <input ref="input" v-model="value" :disabled="disabled" type="text" :placeholder="placeholder || 'Find...'" spellcheck="false" />
    <PlIcon16 v-if="clearable && nonEmpty" :class="$style.clear" name="delete-clear" @click.stop="clear" />
  </div>
</template>

<style lang="scss" module>
.component {
  --pl-search-field-border-bottom-color: var(--txt-01);
  --pl-search-field-bg: transparent;
  --pl-search-field-caret-color: auto;
  --pl-search-field-clear-display: none;

  position: relative;
  display: flex;
  align-items: center;
  min-height: calc(var(--control-height) - 2px);
  line-height: calc(var(--control-height) - 2px);
  background-color: var(--pl-search-field-bg);
  padding: 0 0 0 0;
  border-bottom: 1px solid var(--pl-search-field-border-bottom-color);

  input {
    margin-left: 8px;
    height: 20px;
    border: none;
    outline: none;
    background-color: transparent;
    caret-color: var(--txt-focus);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    caret-color: var(--pl-search-field-caret-color);
  }

  &:focus-within {
    --pl-search-field-border-bottom-color: var(--txt-focus);
    --pl-search-field-caret-color: var(--border-color-focus);
    --pl-search-field-clear-display: block;
  }

  &:hover {
    --pl-search-field-clear-display: block;
  }

  .clear {
    cursor: pointer;
    margin-left: auto;
    display: var(--pl-search-field-clear-display);
  }
}
</style>
