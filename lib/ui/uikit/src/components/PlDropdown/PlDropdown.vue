<script lang="ts">
/**
 * A component for selecting one value from a list of options
 */
export default {
  name: 'PlDropdown',
};
</script>

<script lang="ts" setup generic="M = unknown">
import './pl-dropdown.scss';
import { computed, reactive, ref, unref, useTemplateRef, watch, watchPostEffect } from 'vue';
import { tap } from '../../helpers/functions';
import { PlTooltip } from '../PlTooltip';
import DoubleContour from '../../utils/DoubleContour.vue';
import { useLabelNotch } from '../../utils/useLabelNotch';
import type { ListOption, ListOptionNormalized } from '../../types';
import { deepEqual } from '../../helpers/objects';
import LongText from '../LongText.vue';
import { normalizeListOptions } from '../../helpers/utils';
import { PlIcon16 } from '../PlIcon16';
import { PlMaskIcon24 } from '../PlMaskIcon24';
import SvgRequired from '../../generated/components/svg/images/SvgRequired.vue';
import { getErrorMessage } from '../../helpers/error.ts';
import OptionList from './OptionList.vue';
import { useGroupBy } from './useGroupBy';
import type { LOption } from './types';

const emit = defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: M | undefined): void;
}>();

const props = withDefaults(
  defineProps<{
    /**
     * The current selected value of the dropdown.
     */
    modelValue: M;
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
     * A helper text displayed below the dropdown when there are no options yet or options is undefined (optional).
     */
    loadingOptionsHelper?: string;
    /**
     * Error message displayed below the dropdown (optional)
     */
    error?: unknown;
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
    options: undefined,
  },
);

const slots = defineSlots<{
  [key: string]: unknown;
}>();

const rootRef = ref<HTMLElement | undefined>();
const input = ref<HTMLInputElement | undefined>();

const optionListRef = useTemplateRef<InstanceType<typeof OptionList>>('optionListRef');

const data = reactive({
  search: '',
  activeIndex: -1,
  open: false,
  optionsHeight: 0,
});

const findActiveIndex = () =>
  tap(
    orderedRef.value.findIndex((o) => deepEqual(o.value, props.modelValue)),
    (v) => (v < 0 ? 0 : v),
  );

const updateActive = () => (data.activeIndex = findActiveIndex());

const isLoadingOptions = computed(() => {
  return props.options === undefined;
});

const isDisabled = computed(() => {
  if (isLoadingOptions.value) {
    return true;
  }

  return props.disabled;
});

const selectedIndex = computed(() => {
  return (props.options ?? []).findIndex((o) => deepEqual(o.value, props.modelValue));
});

const computedError = computed(() => {
  if (isLoadingOptions.value) {
    return undefined;
  }

  if (props.error) {
    return getErrorMessage(props.error);
  }

  if (props.modelValue !== undefined && selectedIndex.value === -1) {
    return 'The selected value is not one of the options';
  }

  return undefined;
});

const optionsRef = computed<LOption<M>[]>(() =>
  normalizeListOptions(props.options ?? []).map((opt, index) => ({
    ...opt,
    index,
    isSelected: index === selectedIndex.value,
    isActive: index === data.activeIndex,
  })),
);

const textValue = computed(() => {
  const options = unref(optionsRef);

  const item: ListOption | undefined = options.find((o) => deepEqual(o.value, props.modelValue));

  return item?.label || props.modelValue; // @todo show inner value?
});

const computedPlaceholder = computed(() => {
  if (!data.open && props.modelValue !== undefined) {
    return '';
  }

  return props.modelValue ? String(textValue.value) : props.placeholder;
});

const hasValue = computed(() => {
  return props.modelValue !== undefined && props.modelValue !== null;
});

const filteredRef = computed(() => {
  const options = optionsRef.value;

  if (data.search) {
    return options.filter((o: ListOptionNormalized) => {
      const search = data.search.toLowerCase();

      if (o.label.toLowerCase().includes(search)) {
        return true;
      }

      if (o.description && o.description.toLowerCase().includes(search)) {
        return true;
      }

      if (typeof o.value === 'string') {
        return o.value.toLowerCase().includes(search);
      }

      return o.value === data.search;
    });
  }

  return options;
});

const { orderedRef, groupsRef, restRef } = useGroupBy(filteredRef, 'group');

const tabindex = computed(() => (isDisabled.value ? undefined : '0'));

const selectOption = (v: M | undefined) => {
  emit('update:modelValue', v);
  data.search = '';
  data.open = false;
  rootRef?.value?.focus();
};

const selectOptionWrapper = (v: unknown) => {
  selectOption(v as M | undefined);
};

const clear = () => emit('update:modelValue', undefined);

const setFocusOnInput = () => input.value?.focus();

const toggleOpen = () => {
  data.open = !data.open;
  if (!data.open) {
    data.search = '';
  }
};

const onInputFocus = () => (data.open = true);

const onFocusOut = (event: FocusEvent) => {
  const relatedTarget = event.relatedTarget as Node | null;

  if (!rootRef.value?.contains(relatedTarget) && !optionListRef.value?.listRef?.contains(relatedTarget)) {
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

  const ordered = orderedRef.value;

  const { length } = ordered;

  if (!length) {
    return;
  }

  if (e.code === 'Enter') {
    selectOption(ordered.find((it) => it.index === activeIndex)?.value);
  }

  const localIndex = ordered.findIndex((it) => it.index === activeIndex) ?? -1;

  const delta = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  const newIndex = Math.abs(localIndex + delta + length) % length;

  data.activeIndex = ordered[newIndex].index ?? -1;
};

useLabelNotch(rootRef);

watch(() => props.modelValue, updateActive, { immediate: true });

watch(
  () => data.open,
  (open) => (open ? input.value?.focus() : ''),
);

watchPostEffect(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  data.search; // to watch

  if (data.activeIndex >= 0 && data.open) {
    optionListRef.value?.scrollIntoActive();
  }
});
</script>

<template>
  <div class="pl-dropdown__envelope" @click="setFocusOnInput">
    <div
      ref="rootRef"
      :tabindex="tabindex"
      class="pl-dropdown"
      :class="{ open: data.open, error, disabled: isDisabled }"
      @keydown="handleKeydown"
      @focusout="onFocusOut"
    >
      <div class="pl-dropdown__container">
        <div class="pl-dropdown__field">
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

          <div class="pl-dropdown__controls">
            <PlMaskIcon24 v-if="isLoadingOptions" name="loading" />
            <PlIcon16 v-if="clearable && hasValue" class="clear" name="delete-clear" @click.stop="clear" />
            <slot name="append" />
            <div class="pl-dropdown__arrow-wrapper" @click.stop="toggleOpen">
              <div v-if="arrowIconLarge" class="arrow-icon" :class="[`icon-24 ${arrowIconLarge}`]" />
              <div v-else-if="arrowIcon" class="arrow-icon" :class="[`icon-16 ${arrowIcon}`]" />
              <div v-else class="arrow-icon arrow-icon-default" />
            </div>
          </div>
        </div>
        <label v-if="label">
          <SvgRequired v-if="required" />
          <span>{{ label }}</span>
          <PlTooltip v-if="slots.tooltip" class="info" position="top">
            <template #tooltip>
              <slot name="tooltip" />
            </template>
          </PlTooltip>
        </label>
        <OptionList
          v-if="data.open"
          ref="optionListRef"
          :root-ref="rootRef!"
          :groups="groupsRef"
          :rest="restRef"
          :option-size="optionSize"
          :select-option="selectOptionWrapper"
        />
        <DoubleContour class="pl-dropdown__contour" />
      </div>
    </div>
    <div v-if="computedError" class="pl-dropdown__error">{{ computedError }}</div>
    <div v-else-if="isLoadingOptions && loadingOptionsHelper" class="pl-dropdown__helper">{{ loadingOptionsHelper }}</div>
    <div v-else-if="helper" class="pl-dropdown__helper">{{ helper }}</div>
  </div>
</template>
