<script lang="ts" setup>
import { PlIcon16 } from "../PlIcon16";
import { PlIcon24 } from "../PlIcon24";
import { computed } from "vue";
import PlTooltip from "../PlTooltip/PlTooltip.vue";

const model = defineModel<string>({ required: true });

const props = defineProps<{
  modelValue?: string;
  clearable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  helper?: string;
}>();
const slots = defineSlots<{
  helper: () => unknown;
}>();

const nonEmpty = computed(() => model.value != null && model.value.length > 0);
const hasHelper = computed(() => props.helper != null || slots.helper != null);

const clear = () => (model.value = "");
</script>

<template>
  <div ref="root" :class="$style.component">
    <PlIcon24 name="search" />
    <input
      ref="input"
      v-model="model"
      :disabled="props.disabled"
      :placeholder="props.placeholder || 'Find...'"
      type="text"
      spellcheck="false"
    />
    <PlIcon16
      v-if="props.clearable && nonEmpty"
      :class="$style.clear"
      name="delete-clear"
      @click.stop="clear"
    />

    <PlTooltip v-if="hasHelper" class="info" position="left-bottom">
      <template #tooltip>
        <slot name="helper">
          {{ props.helper }}
        </slot>
      </template>
    </PlTooltip>
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
    width: 100%;
    height: 20px;
    border: none;
    outline: none;
    background-color: transparent;
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
    --icon-color: var(--ic-02);
    cursor: pointer;
    margin-left: auto;
    display: var(--pl-search-field-clear-display);
  }
}
</style>
