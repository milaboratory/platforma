<script lang="ts">
/**
 * A multi-select autocomplete component that allows users to search and select multiple values from a list of options.
 * Supports async data fetching, keyboard navigation, and displays selected items as removable chips.
 *
 * @example
 * Basic usage:
 * <PlAutocompleteMulti
 *   v-model="selectedUsers"
 *   :options-search="searchUsers"
 *   :model-search="getUsersByIds"
 *   label="Select Users"
 *   placeholder="Search for users..."
 *   required
 *   :debounce="300"
 *   helper="Choose one or more users from the list"
 * />
 *
 * With async functions:
 * const selectedUsers = ref([])
 *
 * const searchUsers = async (searchTerm) => {
 *   const response = await fetch('/api/users/search?q=' + searchTerm)
 *   const users = await response.json()
 *   return users.map(user => ({ value: user.id, label: user.name }))
 * }
 *
 * const getUsersByIds = async (userIds) => {
 *   if (!userIds.length) return []
 *   const response = await fetch('/api/users?ids=' + userIds.join(','))
 *   const users = await response.json()
 *   return users.map(user => ({ value: user.id, label: user.name }))
 * }
 */
export default {
  name: 'PlAutocompleteMulti',
};
</script>

<script lang="ts" setup generic="M = unknown">
import './pl-autocomplete-multi.scss';

import type { ListOptionBase } from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import { computed, reactive, ref, toRef, unref, useSlots, useTemplateRef, watch } from 'vue';
import { useWatchFetch } from '../../composition/useWatchFetch.ts';
import { getErrorMessage } from '../../helpers/error.ts';
import { deepEqual, deepIncludes } from '../../helpers/objects';
import DoubleContour from '../../utils/DoubleContour.vue';
import DropdownOverlay from '../../utils/DropdownOverlay/DropdownOverlay.vue';
import { useLabelNotch } from '../../utils/useLabelNotch';
import DropdownListItem from '../DropdownListItem.vue';
import { PlChip } from '../PlChip';
import { PlMaskIcon24 } from '../PlMaskIcon24';
import { PlTooltip } from '../PlTooltip';

import SvgRequired from '../../assets/images/required.svg?raw';
import { PlSvg } from '../PlSvg';

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
     * Lambda for requesting of available options for the dropdown by search string.
     */
    optionsSearch: (s: string) => Promise<Readonly<ListOptionBase<M>[]>>;
    /**
     * Lambda for requesting options that correspond to the current model values.
     */
    modelSearch: (values: M[]) => Promise<Readonly<ListOptionBase<M>[]>>;
    /**
     * Unique identifier for the source of the options, changing it will invalidate the options cache.
     */
    sourceId?: string;
    /**
     * The label text for the dropdown field (optional)
     */
    label?: string;
    /**
     * A helper text displayed below the dropdown when there are no errors (optional).
     */
    helper?: string;
    /**
     * Error message displayed below the dropdown (optional)
     */
    error?: unknown;
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
    /**
     * Debounce time in ms for the options search.
     */
    debounce?: number;
    /**
     * If `true`, the search input is reset and focus is set on it when the new option is selected.
     */
    resetSearchOnSelect?: boolean;
    /**
     * The text to display when no options are found.
     */
    emptyOptionsText?: string;
    /**
     * Makes some of corners not rounded
     * */
    position?: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'middle';
  }>(),
  {
    modelValue: () => [],
    label: undefined,
    helper: undefined,
    error: undefined,
    placeholder: '...',
    required: false,
    disabled: false,
    debounce: 300,
    emptyOptionsText: 'Nothing found',
    sourceId: undefined,
    position: undefined,
  },
);

const rootRef = ref<HTMLElement | undefined>();
const inputRef = ref<HTMLInputElement | undefined>();

const overlay = useTemplateRef('overlay');

const data = reactive({
  search: '',
  activeOption: -1,
  open: false,
  optionsHeight: 0,
});

watch(() => data.open, (v) => {
  if (!v) {
    data.search = '';
  }
}, { flush: 'sync' });

const selectedValuesRef = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

const placeholderRef = computed(() => {
  if (data.open && props.modelValue.length > 0) {
    return props.placeholder;
  }

  return props.modelValue.length > 0 ? '' : props.placeholder;
});

const debounce = toRef(props, 'debounce');

const searchOptionsRef = useWatchFetch(() => [data.search, data.open, props.sourceId] as const, async ([search, _open]) => {
  return props.optionsSearch(search);
}, {
  filterWatchResult: ([_search, open]) => open,
  debounce,
});

const modelOptionsRef = useWatchFetch(() => [props.modelValue, props.sourceId] as const, async ([v]) => {
  return props.modelSearch(v);
}, {
  debounce,
});

const allOptionsRef = computed(() => {
  const modelOptions = modelOptionsRef.value ?? [];
  const searchOptions = searchOptionsRef.value ?? [];

  const seenValues = new Set<string | undefined>();
  const result = [] as ListOptionBase<M>[];

  const addOptions = (options: Readonly<ListOptionBase<M>[]>) => {
    for (const option of options) {
      const canonicalValue = canonicalize(option.value);
      if (!seenValues.has(canonicalValue)) {
        seenValues.add(canonicalValue);
        result.push(option);
      }
    }
  };

  addOptions(modelOptions);
  addOptions(searchOptions);

  return result;
});

const selectedOptionsRef = computed(() => {
  return selectedValuesRef.value.map((v) =>
    allOptionsRef.value.find((opt) => deepEqual(opt.value, v))).filter((v) => v !== undefined,
  );
});

const filteredOptionsRef = computed(() => {
  const selectedValues = unref(selectedValuesRef);

  const options = searchOptionsRef.value ?? [];

  return [...options].map((opt) => ({
    ...opt,
    selected: deepIncludes(selectedValues, opt.value),
  }));
});

const isOptionsLoading = computed(() => searchOptionsRef.loading || modelOptionsRef.loading);

const isDisabled = computed(() => {
  if (modelOptionsRef.value === undefined) {
    return true;
  }

  return props.disabled;
});

const tabindex = computed(() => (isDisabled.value ? undefined : '0'));

const updateActiveOption = () => {
  data.activeOption = 0;
};

const selectOption = (v: M) => {
  const values = unref(selectedValuesRef);
  emitModel(deepIncludes(values, v) ? values.filter((it) => !deepEqual(it, v)) : [...values, v]);
  if (props.resetSearchOnSelect) {
    data.search = '';
  }
  inputRef.value?.focus();
};

const unselectOption = (d: M) => emitModel(unref(selectedValuesRef).filter((v) => !deepEqual(v, d)));

const setFocusOnInput = () => inputRef.value?.focus();

const toggleOpen = () => data.open = !data.open;

const onFocusOut = (event: FocusEvent) => {
  const relatedTarget = event.relatedTarget as Node | null;

  if (!rootRef.value?.contains(relatedTarget) && !overlay.value?.listRef?.contains(relatedTarget)) {
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
    inputRef.value?.focus();
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

const computedError = computed(() => {
  if (isOptionsLoading.value) {
    return undefined;
  }

  if (searchOptionsRef.error) {
    return getErrorMessage(searchOptionsRef.error);
  }

  if (modelOptionsRef.error) {
    return getErrorMessage(modelOptionsRef.error);
  }

  if (props.error) {
    return getErrorMessage(props.error);
  }

  if (props.modelValue.length && selectedOptionsRef.value.length !== props.modelValue.length) {
    return 'The selected values are not one of the options';
  }

  return undefined;
});
</script>

<template>
  <div class="pl-autocomplete-multi__envelope" @click="setFocusOnInput">
    <div
      ref="rootRef"
      :tabindex="tabindex"
      class="pl-autocomplete-multi"
      :class="{ open: data.open, error: Boolean(computedError), disabled: isDisabled }"
      @keydown="handleKeydown"
      @focusout="onFocusOut"
    >
      <div class="pl-autocomplete-multi__container">
        <div class="pl-autocomplete-multi__field">
          <input
            ref="inputRef"
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

          <div class="pl-autocomplete-multi__controls">
            <PlMaskIcon24 v-if="isOptionsLoading" name="loading" />
            <slot name="append" />
            <div class="pl-autocomplete-multi__arrow-wrapper" @click.stop="toggleOpen">
              <div class="arrow-icon arrow-icon-default" />
            </div>
          </div>
        </div>
        <label v-if="label">
          <PlSvg v-if="required" :uri="SvgRequired" />
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
          class="pl-autocomplete-multi__options"
          :gap="5"
          tabindex="-1"
          @focusout="onFocusOut"
        >
          <div class="pl-autocomplete-multi__open-chips-container">
            <PlChip
              v-for="(opt, i) in selectedOptionsRef"
              :key="i"
              closeable
              small
              @close="unselectOption(opt.value)"
            >
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
          <div v-if="!filteredOptionsRef.length && !isOptionsLoading" class="nothing-found">{{ emptyOptionsText }}</div>
        </DropdownOverlay>
        <DoubleContour class="pl-autocomplete-multi__contour" :position="position" />
      </div>
    </div>
    <div v-if="computedError" class="pl-autocomplete-multi__error">{{ computedError }}</div>
    <div v-else-if="helper" class="pl-autocomplete-multi__helper">{{ helper }}</div>
  </div>
</template>
