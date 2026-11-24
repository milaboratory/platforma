<script lang="ts" setup generic="V extends undefined | string, C extends V">
import { PlIcon16 } from "../PlIcon16";
import { PlIcon24 } from "../PlIcon24";
import { computed } from "vue";
import PlTooltip from "../PlTooltip/PlTooltip.vue";

const model = defineModel<V>({ required: true });

const props = defineProps<{
  modelValue?: string;
  clearable?: boolean | (() => C);
  placeholder?: string;
  disabled?: boolean;
  helper?: string;
}>();
const slots = defineSlots<{
  helper: () => unknown;
}>();

const nonEmpty = computed(() => model.value != null && model.value.length > 0);
const hasHelper = computed(() => props.helper != null || slots.helper != null);

const clear = () => {
  if (props.clearable) {
    model.value = (typeof props.clearable === "function" ? props.clearable() : "") as V;
  }
};
</script>

<template>
  <div ref="root" :class="$style.component" data-testid="pl-search-field">
    <PlIcon24 :class="$style.icon" name="search" data-testid="pl-search-field-icon" />
    <input
      ref="input"
      v-model="model"
      :disabled="props.disabled"
      :placeholder="props.placeholder || 'Find...'"
      type="text"
      spellcheck="false"
      data-testid="pl-search-field-input"
    />
    <PlIcon16
      v-if="props.clearable && nonEmpty"
      :class="$style.clear"
      name="delete-clear"
      data-testid="pl-search-field-clear"
      @click.stop="clear"
    />

    <PlTooltip v-if="hasHelper" class="info" position="bottom" data-testid="pl-search-field-helper">
      <template #tooltip>
        <slot name="helper">
          {{ props.helper }}
        </slot>
      </template>
    </PlTooltip>
  </div>
</template>

<style module>
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
}

.component:focus-within {
  --pl-search-field-border-bottom-color: var(--txt-focus);
  --pl-search-field-caret-color: var(--border-color-focus);
  --pl-search-field-clear-display: block;
}

.component:hover {
  --pl-search-field-clear-display: block;
}

.component input {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 8px;
  height: 20px;
  border: none;
  outline: none;
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  caret-color: var(--pl-search-field-caret-color);
}

.component .icon {
  flex-shrink: 0;
}

.component .clear {
  --icon-color: var(--ic-02);
  flex-shrink: 0;
  cursor: pointer;
  margin-left: auto;
  display: var(--pl-search-field-clear-display);
}
</style>
