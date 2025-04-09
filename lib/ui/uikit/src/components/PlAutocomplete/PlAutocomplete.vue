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
import { computed, onMounted, reactive, ref, unref, useSlots, useTemplateRef, watch, watchPostEffect } from 'vue';
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
import { watchDebounced } from '@vueuse/core';

/**
 * The current selected value.
 */
const model = defineModel<M>({ required: true });

const props = withDefaults(
  defineProps<{
    /**
     * Lambda for requesting of available options for the dropdown by search string
     */
    optionsSearch: (s: string) => Promise<ListOption[]>;
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
    formatValue?: (value: string) => string;
  }>(),
  {
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
    formatValue: (v: string) => v,
  },
);

const slots = useSlots();

const rootRef = ref<HTMLElement | undefined>();
const input = ref<HTMLInputElement | undefined>();

const overlayRef = useTemplateRef('overlay');

const data = reactive({
  search: '',
  activeIndex: -1,
  open: false,
});

const findActiveIndex = () =>
  tap(
    optionsRef.value.findIndex((o) => deepEqual(o.value, model.value)),
    (v) => (v < 0 ? 0 : v),
  );

const updateActive = () => (data.activeIndex = findActiveIndex());

const loadedOptionsRef = ref<ListOption[]>([]);
const selectedOptionsRef = ref<ListOptionNormalized[]>([]); // list of 1 option that is selected or empty, to keep selected label

const isLoadingOptions = ref<boolean>(true);
const isLoadingOptionsInitial = ref<boolean>(true);
const isLoadingError = ref<boolean>(false);

onMounted(async () => {
  if (model.value) {
    isLoadingOptions.value = true;
    isLoadingOptionsInitial.value = true;

    props.optionsSearch(String(model.value))
      .then((result) => {
        selectedOptionsRef.value = normalizeListOptions(result);
        loadedOptionsRef.value = selectedOptionsRef.value;
        isLoadingError.value = false;
      })
      .catch(() => {
        isLoadingError.value = true;
      })
      .finally(() => {
        isLoadingOptions.value = false;
        isLoadingOptionsInitial.value = false;
      });
  }
});

const isDisabled = computed(() => {
  if (isLoadingOptionsInitial.value) {
    return true;
  }

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

const optionsRef = computed(() =>
  normalizeListOptions(loadedOptionsRef.value).map((opt, index) => ({
    ...opt,
    index,
    isSelected: index === selectedIndex.value,
    isActive: index === data.activeIndex,
  })),
);

const textValue = computed(() => {
  const selectedOptions = unref(selectedOptionsRef);
  const options = unref(optionsRef);

  const item: ListOption | undefined = selectedOptions.find((o) => deepEqual(o.value, model.value)) ?? options.find((o) => deepEqual(o.value, model.value));

  return item?.label || (model.value ? props.formatValue(String(model.value)) : '');
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

const selectOption = (v: ListOptionNormalized | undefined) => {
  model.value = v?.value as M;
  selectedOptionsRef.value = v ? [v] : [];
  data.search = '';
  data.open = false;
  rootRef?.value?.focus();
};

const clear = () => {
  model.value = undefined as M;
  selectedOptionsRef.value = [];
};

const setFocusOnInput = () => input.value?.focus();

const toggleOpen = () => {
  data.open = !data.open;
  if (!data.open) {
    data.search = '';
  }
};

const onInputFocus = () => {
  data.open = true;
};

const onFocusOut = (event: FocusEvent) => {
  const relatedTarget = event.relatedTarget as Node | null;

  if (!rootRef.value?.contains(relatedTarget) && !overlayRef.value?.listRef?.contains(relatedTarget)) {
    data.search = '';
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
    }
    return;
  }

  if (e.code === 'Escape') {
    data.open = false;
    rootRef.value?.focus();
  }

  const options = unref(optionsRef);

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

  data.activeIndex = optionsRef.value[newIndex].index ?? -1;
};

useLabelNotch(rootRef);

watch(() => model.value, updateActive, { immediate: true });

watch(
  () => data.open,
  (open) => (open ? input.value?.focus() : ''),
);

watchPostEffect(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  data.search; // to watch

  if (data.activeIndex >= 0 && data.open) {
    overlayRef.value?.scrollIntoActive();
  }
});

watchDebounced(
  [() => data.search],
  async ([v]) => {
    if (v) {
      isLoadingOptions.value = true;
      props.optionsSearch(v)
        .then((result) => {
          loadedOptionsRef.value = result;
          isLoadingError.value = false;
        })
        .catch(() => {
          isLoadingError.value = true;
        })
        .finally(() => {
          isLoadingOptions.value = false;
        });
    } else if (model.value) {
      loadedOptionsRef.value = selectedOptionsRef.value;
    }
  },
  { debounce: 500, maxWait: 1000 },
);

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
            v-model="data.search"
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
            v-for="(item, index) in optionsRef"
            :key="index"
            :option="item"
            :is-selected="item.isSelected"
            :is-hovered="item.isActive"
            :size="optionSize"
            @click.stop="selectOption(item)"
          />
          <div v-if="!optionsRef.length" class="nothing-found">Nothing found</div>
        </DropdownOverlay>
        <DoubleContour class="pl-autocomplete__contour" />
      </div>
    </div>
    <div v-if="computedError" class="pl-autocomplete__error">{{ computedError }}</div>
    <div v-else-if="isLoadingOptions && loadingOptionsHelper" class="pl-autocomplete__helper">{{ loadingOptionsHelper }}</div>
    <div v-else-if="helper" class="pl-autocomplete__helper">{{ helper }}</div>
  </div>
</template>
