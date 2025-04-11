<script lang="ts">
/**
 * A component for selecting one value from a big list of options using string search request
 */
export default {
  name: 'PlAutocomplete',
};
</script>

<script lang="ts" setup generic="M = unknown">
import './pl-autocomplete.scss';
import { computed, reactive, ref, unref, useSlots, useTemplateRef, watch, watchPostEffect } from 'vue';
import { tap } from '@/helpers/functions';
import { PlTooltip } from '@/components/PlTooltip';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import type { ListOption, ListOptionNormalized } from '@/types';
import { deepEqual } from '@/helpers/objects';
import DropdownListItem from '@/components/DropdownListItem.vue';
import LongText from '@/components/LongText.vue';
import { normalizeListOptions } from '@/helpers/utils';
import { PlIcon16 } from '../PlIcon16';
import { PlMaskIcon24 } from '../PlMaskIcon24';
import { DropdownOverlay } from '@/utils/DropdownOverlay';
import { refDebounced } from '@vueuse/core';
import { useWatchFetch } from '@/composition/useWatchFetch.ts';

/**
 * The current selected value.
 */
const model = defineModel<M>({ required: true });

const props = withDefaults(
  defineProps<{
    /**
     * Lambda for requesting of available options for the dropdown by search string.
     */
    optionsSearch: (s: string) => Promise<ListOption<M>[]>;
    /**
     * Lambda for requesting of corresponding option for current model value. If empty, optionsSearch is used for this.
     */
    modelSearch?: (v: M) => Promise<ListOption<M>>;
    /**
     * The label text for the dropdown field (optional)
     */
    label?: string;
    /**
     * A helper text displayed below the dropdown when there are no errors (optional).
     */
    helper?: string;
    /**
     * A helper text displayed below the dropdown when there are no options yet or options is undefined (optional).
     */
    loadingOptionsHelper?: string;
    /**
     * Error message displayed below the dropdown (optional)
     */
    error?: string;
    /**
     * Placeholder text shown when no value is selected.
     */
    placeholder?: string;
    /**
     * Enables a button to clear the selected value (default: false)
     */
    clearable?: boolean;
    /**
     * If `true`, the dropdown component is marked as required.
     */
    required?: boolean;
    /**
     * If `true`, the dropdown component is disabled and cannot be interacted with.
     */
    disabled?: boolean;
    /**
     * Custom icon (16px) class for the dropdown arrow (optional)
     */
    arrowIcon?: string;
    /**
     * Custom icon (24px) class for the dropdown arrow (optional)
     */
    arrowIconLarge?: string;
    /**
     * Option list item size
     */
    optionSize?: 'small' | 'medium';
    /**
     * Formatter for the selected value if its label is absent
     */
    formatValue?: (value: M) => string;
  }>(),
  {
    modelSearch: undefined,
    label: '',
    helper: undefined,
    loadingOptionsHelper: undefined,
    error: undefined,
    placeholder: '...',
    clearable: false,
    required: false,
    disabled: false,
    arrowIcon: undefined,
    arrowIconLarge: undefined,
    optionSize: 'small',
    formatValue: (v: M) => String(v),
  },
);

const slots = useSlots();

const rootRef = ref<HTMLElement | undefined>();
const input = ref<HTMLInputElement | undefined>();

const overlayRef = useTemplateRef('overlay');

const search = ref<string | null>(null);
const data = reactive({
  activeIndex: -1,
  open: false,
});

const findActiveIndex = () =>
  tap(
    renderedOptionsRef.value.findIndex((o) => deepEqual(o.value, model.value)),
    (v) => (v < 0 ? 0 : v),
  );

const updateActive = () => (data.activeIndex = findActiveIndex());

const loadedOptionsRef = ref<ListOption<M>[]>([]);
const modelOptionRef = ref<ListOptionNormalized<M> | undefined>(); // list of 1 option that is selected or empty, to keep selected label

const renderedOptionsRef = computed(() => {
  if (model.value && !search.value) {
    return modelOptionRef.value
      ? [{
          ...modelOptionRef.value,
          index: 0,
          isSelected: true,
          isActive: true,
        }]
      : [];
  }
  return normalizeListOptions(loadedOptionsRef.value).map((opt, index) => ({
    ...opt,
    index,
    isSelected: index === selectedIndex.value,
    isActive: index === data.activeIndex,
  }));
});
const isLoadingOptions = ref<boolean>(true);
const isLoadingError = ref<boolean>(false);

const isDisabled = computed(() => {
  return props.disabled;
});

const selectedIndex = computed(() => {
  return loadedOptionsRef.value.findIndex((o) => deepEqual(o.value, model.value));
});

const computedError = computed(() => {
  if (isLoadingOptions.value) {
    return undefined;
  }

  if (props.error) {
    return props.error;
  }

  if (isLoadingError.value) {
    return 'Data loading error';
  }

  return undefined;
});

const textValue = computed(() => {
  const modelOption = unref(modelOptionRef);
  const options = unref(renderedOptionsRef);

  const item: ListOptionNormalized | undefined = modelOption ?? options.find((o) => deepEqual(o.value, model.value)) ?? options.find((o) => deepEqual(o.value, model.value));

  return item?.label || (model.value ? props.formatValue(model.value) : '');
});

const computedPlaceholder = computed(() => {
  if (!data.open && model.value) {
    return '';
  }

  return model.value ? String(textValue.value) : props.placeholder;
});

const hasValue = computed(() => {
  return model.value !== undefined && model.value !== null;
});

const tabindex = computed(() => (isDisabled.value ? undefined : '0'));

const selectOption = (v: ListOptionNormalized<M> | undefined) => {
  model.value = v?.value as M;
  modelOptionRef.value = v;
  search.value = null;
  data.open = false;
  rootRef?.value?.focus();
};

const clear = () => {
  model.value = undefined as M;
  modelOptionRef.value = undefined;
};

const setFocusOnInput = () => input.value?.focus();

const toggleOpen = () => {
  data.open = !data.open;
  if (!data.open) {
    search.value = null;
  }
  if (data.open) {
    search.value = '';
  }
};

const onInputFocus = () => {
  data.open = true;
};

const onFocusOut = (event: FocusEvent) => {
  const relatedTarget = event.relatedTarget as Node | null;

  if (!rootRef.value?.contains(relatedTarget) && !overlayRef.value?.listRef?.contains(relatedTarget)) {
    search.value = null;
    data.open = false;
  }
};

const handleKeydown = (e: { code: string; preventDefault(): void }) => {
  if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.code)) {
    return;
  } else {
    e.preventDefault();
  }

  const { open, activeIndex } = data;

  if (!open) {
    if (e.code === 'Enter') {
      data.open = true;
      search.value = '';
    }
    return;
  }

  if (e.code === 'Escape') {
    data.open = false;
    search.value = null;
    rootRef.value?.focus();
  }

  const options = unref(renderedOptionsRef);

  const { length } = options;

  if (!length) {
    return;
  }

  if (e.code === 'Enter') {
    selectOption(options.find((it) => it.index === activeIndex));
  }

  const localIndex = options.findIndex((it) => it.index === activeIndex) ?? -1;

  const delta = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  const newIndex = Math.abs(localIndex + delta + length) % length;

  data.activeIndex = renderedOptionsRef.value[newIndex].index ?? -1;
};

useLabelNotch(rootRef);

watch(() => model.value, updateActive, { immediate: true });

watch(
  () => data.open,
  (open) => (open ? input.value?.focus() : ''),
);

watchPostEffect(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  search.value; // to watch

  if (data.activeIndex >= 0 && data.open) {
    overlayRef.value?.scrollIntoActive();
  }
});

const searchDebounced = refDebounced(search, 500, { maxWait: 1000 });

const optionsRequest = useWatchFetch(() => searchDebounced.value, async (v) => {
  if (v !== null && !(v === '' && model.value)) { // search is null when dropdown is closed; when search is '' and model is not empty show single selected option in the list;
    return props.optionsSearch(v);
  }
  return [];
});
const modelOptionRequest = useWatchFetch(() => model.value, async (v) => {
  if (v && !deepEqual(modelOptionRef.value?.value, v)) { // load label for selected value if it was updated from outside the component
    if (props.modelSearch) {
      return props.modelSearch(v);
    }
    return (await props.optionsSearch(String(v)))?.[0];
  }
  return modelOptionRef.value;
});
watch(() => optionsRequest.value, (result) => {
  if (result) {
    loadedOptionsRef.value = result;
    if (search.value !== null) {
      isLoadingError.value = false;
    }
  }
});

watch(() => modelOptionRequest.value, (result) => {
  if (result) {
    modelOptionRef.value = normalizeListOptions([result])[0];
  }
});
watch(() => optionsRequest.error, (err) => {
  if (err) {
    isLoadingError.value = Boolean(err);
  }
});
watch(() => optionsRequest.loading || modelOptionRequest.loading, (loading) => {
  isLoadingOptions.value = loading;
});

</script>

<template>
  <div class="pl-autocomplete__envelope" @click.stop="setFocusOnInput">
    <div
      ref="rootRef"
      :tabindex="tabindex"
      class="pl-autocomplete"
      :class="{ open: data.open, error: Boolean(computedError), disabled: isDisabled }"
      @keydown="handleKeydown"
      @focusout="onFocusOut"
    >
      <div class="pl-autocomplete__container">
        <div class="pl-autocomplete__field">
          <input
            ref="input"
            v-model="search"
            type="text"
            tabindex="-1"
            :disabled="isDisabled"
            :placeholder="computedPlaceholder"
            spellcheck="false"
            autocomplete="chrome-off"
            @focus="onInputFocus"
          />

          <div v-if="!data.open" class="input-value">
            <LongText> {{ textValue }} </LongText>
          </div>

          <div class="pl-autocomplete__controls">
            <PlMaskIcon24 v-if="isLoadingOptions" name="loading" />
            <PlIcon16 v-if="clearable && hasValue" name="delete-clear" @click.stop="clear" />
            <slot name="append" />
            <div class="pl-autocomplete__arrow-wrapper" @click.stop="toggleOpen">
              <div v-if="arrowIconLarge" class="arrow-icon" :class="[`icon-24 ${arrowIconLarge}`]" />
              <div v-else-if="arrowIcon" class="arrow-icon" :class="[`icon-16 ${arrowIcon}`]" />
              <div v-else class="arrow-icon arrow-icon-default" />
            </div>
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
        <DropdownOverlay v-if="data.open" ref="overlay" :root="rootRef" class="pl-autocomplete__options" tabindex="-1" :gap="3">
          <DropdownListItem
            v-for="(item, index) in renderedOptionsRef"
            :key="index"
            :option="item"
            :is-selected="item.isSelected"
            :is-hovered="item.isActive"
            :size="optionSize"
            @click.stop="selectOption(item)"
          />
          <div v-if="!renderedOptionsRef.length" class="nothing-found">Nothing found</div>
        </DropdownOverlay>
        <DoubleContour class="pl-autocomplete__contour" />
      </div>
    </div>
    <div v-if="computedError" class="pl-autocomplete__error">{{ computedError }}</div>
    <div v-else-if="isLoadingOptions && loadingOptionsHelper" class="pl-autocomplete__helper">{{ loadingOptionsHelper }}</div>
    <div v-else-if="helper" class="pl-autocomplete__helper">{{ helper }}</div>
  </div>
</template>
