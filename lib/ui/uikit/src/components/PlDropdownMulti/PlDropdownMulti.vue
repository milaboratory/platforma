<script lang="ts">
/**
 * A component for selecting multiple values from a list of options
 */
export default {
  name: 'PlDropdownMulti',
};
</script>

<script lang="ts" setup generic="M = unknown">
import './pl-dropdown-multi.scss';
import { computed, reactive, ref, unref, useSlots, useTemplateRef, watch, watchPostEffect } from 'vue';
import { tap } from '@/helpers/functions';
import { PlTooltip } from '@/components/PlTooltip';
import { PlChip } from '@/components/PlChip';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import type { ListOption } from '@/types';
import DropdownListItem from '@/components/DropdownListItem.vue';
import { deepEqual, deepIncludes } from '@/helpers/objects';
import { normalizeListOptions } from '@/helpers/utils';
import DropdownOverlay from '@/utils/DropdownOverlay/DropdownOverlay.vue';
import { PlMaskIcon24 } from '../PlMaskIcon24';

const emit = defineEmits<{
  (e: 'update:modelValue', v: M[]): void;
}>();

const emitModel = (v: M[]) => emit('update:modelValue', v);

const slots = useSlots();

const props = withDefaults(
  defineProps<{
    /**
     * The current selected values.
     */
    modelValue: M[];
    /**
     * The label text for the dropdown field (optional)
     */
    label?: string;
    /**
     * List of available options for the dropdown
     */
    options?: Readonly<ListOption<M>[]>;
    /**
     * A helper text displayed below the dropdown when there are no errors (optional).
     */
    helper?: string;
    /**
     * Error message displayed below the dropdown (optional)
     */
    error?: string;
    /**
     * Placeholder text shown when no value is selected.
     */
    placeholder?: string;
    /**
     * If `true`, the dropdown component is marked as required.
     */
    required?: boolean;
    /**
     * If `true`, the dropdown component is disabled and cannot be interacted with.
     */
    disabled?: boolean;
  }>(),
  {
    modelValue: () => [],
    label: undefined,
    helper: undefined,
    error: undefined,
    placeholder: '...',
    required: false,
    disabled: false,
    options: undefined,
  },
);

const rootRef = ref<HTMLElement | undefined>();
const input = ref<HTMLInputElement | undefined>();

const overlay = useTemplateRef('overlay');

const data = reactive({
  search: '',
  activeOption: -1,
  open: false,
  optionsHeight: 0,
});

const selectedValuesRef = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

const placeholderRef = computed(() => {
  if (data.open && props.modelValue.length > 0) {
    return props.placeholder;
  }

  return props.modelValue.length > 0 ? '' : props.placeholder;
});

const normalizedOptionsRef = computed(() => normalizeListOptions(props.options ?? []));

const selectedOptionsRef = computed(() => {
  return selectedValuesRef.value.map((v) => normalizedOptionsRef.value.find((opt) => deepEqual(opt.value, v))).filter((v) => v !== undefined);
});

const filteredOptionsRef = computed(() => {
  const selectedValues = unref(selectedValuesRef);

  const options = unref(normalizedOptionsRef);

  return (
    data.search
      ? options.filter((opt) => {
        const search = data.search.toLowerCase();

        if (opt.label.toLowerCase().includes(search)) {
          return true;
        }

        if (typeof opt.value === 'string') {
          return opt.value.toLowerCase().includes(search);
        }

        return opt.value === data.search;
      })
      : [...options]
  ).map((opt) => ({
    ...opt,
    selected: deepIncludes(selectedValues, opt.value),
  }));
});

const isLoadingOptions = computed(() => {
  return props.options === undefined;
});

const isDisabled = computed(() => {
  if (isLoadingOptions.value) {
    return true;
  }

  return props.disabled;
});

const tabindex = computed(() => (isDisabled.value ? undefined : '0'));

const updateActiveOption = () => {
  data.activeOption = tap(
    filteredOptionsRef.value.findIndex((o) => deepEqual(o.value, props.modelValue)),
    (v) => (v < 0 ? 0 : v),
  );
};

const selectOption = (v: M) => {
  const values = unref(selectedValuesRef);
  emitModel(deepIncludes(values, v) ? values.filter((it) => !deepEqual(it, v)) : [...values, v]);
  data.search = '';
  rootRef?.value?.focus();
};

const unselectOption = (d: M) => emitModel(unref(selectedValuesRef).filter((v) => !deepEqual(v, d)));

const setFocusOnInput = () => input.value?.focus();

const toggleModel = () => {
  data.open = !data.open;
  if (!data.open) {
    data.search = '';
  }
};

const onFocusOut = (event: FocusEvent) => {
  const relatedTarget = event.relatedTarget as Node | null;

  if (!rootRef.value?.contains(relatedTarget) && !overlay.value?.listRef?.contains(relatedTarget)) {
    data.search = '';
    data.open = false;
  }
};

const handleKeydown = (e: { code: string; preventDefault(): void }) => {
  const { open, activeOption } = data;

  if (!open) {
    if (e.code === 'Enter') {
      data.open = true;
    }
    return;
  }

  if (e.code === 'Escape') {
    data.open = false;
    rootRef.value?.focus();
  }

  const filteredOptions = unref(filteredOptionsRef);

  const { length } = filteredOptions;

  if (!length) {
    return;
  }

  if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'Enter') {
    selectOption(filteredOptions[activeOption].value);
  }

  const d = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  data.activeOption = Math.abs(activeOption + d + length) % length;

  requestAnimationFrame(() => overlay.value?.scrollIntoActive());
};

useLabelNotch(rootRef);

watch(
  () => props.modelValue,
  () => updateActiveOption(),
  { immediate: true },
);

watchPostEffect(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  data.search;

  if (data.open) {
    overlay.value?.scrollIntoActive();
  }
});
</script>

<template>
  <div class="pl-dropdown-multi__envelope" @click="setFocusOnInput">
    <div
      ref="rootRef"
      :tabindex="tabindex"
      class="pl-dropdown-multi"
      :class="{ open: data.open, error, disabled: isDisabled }"
      @keydown="handleKeydown"
      @focusout="onFocusOut"
    >
      <div class="pl-dropdown-multi__container">
        <div class="pl-dropdown-multi__field">
          <input
            ref="input"
            v-model="data.search"
            type="text"
            tabindex="-1"
            :disabled="isDisabled"
            :placeholder="placeholderRef"
            spellcheck="false"
            autocomplete="chrome-off"
            @focus="data.open = true"
          />
          <div v-if="!data.open" class="chips-container">
            <PlChip v-for="(opt, i) in selectedOptionsRef" :key="i" closeable small @click.stop="data.open = true" @close="unselectOption(opt.value)">
              {{ opt.label || opt.value }}
            </PlChip>
          </div>
          <PlMaskIcon24 v-if="isLoadingOptions" name="loading" />
          <div v-if="!isLoadingOptions" class="arrow" @click.stop="toggleModel" />
          <div class="pl-dropdown-multi__append">
            <slot name="append" />
          </div>
        </div>
        <label v-if="label">
          <i v-if="required" class="required-icon" />
          <span>{{ label }}</span>
          <PlTooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip" />
            </template>
          </PlTooltip>
        </label>
        <DropdownOverlay
          v-if="data.open"
          ref="overlay"
          :root="rootRef"
          class="pl-dropdown-multi__options"
          :gap="5"
          tabindex="-1"
          @focusout="onFocusOut"
        >
          <div class="pl-dropdown-multi__open-chips-container">
            <PlChip v-for="(opt, i) in selectedOptionsRef" :key="i" closeable small @close="unselectOption(opt.value)">
              {{ opt.label || opt.value }}
            </PlChip>
          </div>
          <DropdownListItem
            v-for="(item, index) in filteredOptionsRef"
            :key="index"
            :option="item"
            :text-item="'text'"
            :is-selected="item.selected"
            :is-hovered="data.activeOption == index"
            size="medium"
            use-checkbox
            @click.stop="selectOption(item.value)"
          />
          <div v-if="!filteredOptionsRef.length" class="nothing-found">Nothing found</div>
        </DropdownOverlay>
        <DoubleContour class="pl-dropdown-multi__contour" />
      </div>
    </div>
    <div v-if="error" class="pl-dropdown-multi__error">{{ error }}</div>
    <div v-else-if="helper" class="pl-dropdown-multi__helper">{{ helper }}</div>
  </div>
</template>
