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
import { computed, reactive, ref, unref, useSlots, watch, watchPostEffect } from 'vue';
import { tap, tapIf } from '@/helpers/functions';
import { PlTooltip } from '@/components/PlTooltip';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import type { ListOption } from '@/types';
import { scrollIntoView } from '@/helpers/dom';
import { deepEqual } from '@/helpers/objects';
import DropdownListItem from '@/components/DropdownListItem.vue';
import LongText from '@/components/LongText.vue';

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
    options: Readonly<ListOption<M>[]>;
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
     * Custom icon class for the dropdown arrow (optional)
     */
    arrowIcon?: string;
    /**
     * Option list item size
     */
    optionSize?: 'small' | 'medium';
  }>(),
  {
    label: '',
    helper: undefined,
    error: undefined,
    placeholder: '...',
    clearable: false,
    required: false,
    disabled: false,
    arrowIcon: undefined,
    optionSize: 'small',
  },
);

const slots = useSlots();

const root = ref<HTMLElement | undefined>();
const list = ref<HTMLElement | undefined>();
const input = ref<HTMLInputElement | undefined>();

const data = reactive({
  search: '',
  activeIndex: -1,
  open: false,
});

const findActiveIndex = () =>
  tap(
    filteredRef.value.findIndex((o) => deepEqual(o.value, props.modelValue)),
    (v) => (v < 0 ? 0 : v),
  );

const updateActive = () => (data.activeIndex = findActiveIndex());

const selectedIndex = computed(() => {
  return props.options.findIndex((o) => deepEqual(o.value, props.modelValue));
});

const computedError = computed(() => {
  if (props.error) {
    return props.error;
  }

  if (props.modelValue !== undefined && selectedIndex.value === -1) {
    return 'The selected value is not one of the options';
  }

  return undefined;
});

const textValue = computed(() => {
  const item: ListOption | undefined = props.options.find((o) => deepEqual(o.value, props.modelValue));

  return item?.text || props.modelValue; // @todo show inner value?
});

const computedPlaceholder = computed(() => {
  if (!data.open && props.modelValue) {
    return '';
  }

  return props.modelValue ? String(textValue.value) : props.placeholder;
});

const hasValue = computed(() => {
  return props.modelValue !== undefined && props.modelValue !== null;
});

const optionsRef = computed(() =>
  props.options.map((opt, index) => ({
    ...opt,
    index,
    isSelected: index === selectedIndex.value,
    isActive: index === data.activeIndex,
  })),
);

const filteredRef = computed(() => {
  const options = optionsRef.value;

  if (data.search) {
    return options.filter((o: ListOption) => {
      const search = data.search.toLowerCase();

      if (o.text.toLowerCase().includes(search)) {
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

const tabindex = computed(() => (props.disabled ? undefined : '0'));

const selectOption = (v: M | undefined) => {
  emit('update:modelValue', v);
  data.search = '';
  data.open = false;
  root?.value?.focus();
};

const clear = () => emit('update:modelValue', undefined);

const setFocusOnInput = () => input.value?.focus();

const toggleOpen = () => (data.open = !data.open);

const onInputFocus = () => (data.open = true);

const onFocusOut = (event: FocusEvent) => {
  if (!root?.value?.contains(event.relatedTarget as Node | null)) {
    data.search = '';
    data.open = false;
  }
};

const scrollIntoActive = () => {
  const $list = list.value;

  if (!$list) {
    return;
  }

  tapIf($list.querySelector('.hovered-item') as HTMLElement, (opt) => {
    scrollIntoView($list, opt);
  });
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
    root.value?.focus();
  }

  const filtered = unref(filteredRef);

  const { length } = filtered;

  if (!length) {
    return;
  }

  if (e.code === 'Enter') {
    selectOption(filtered.find((it) => it.index === activeIndex)?.value);
  }

  const localIndex = filtered.findIndex((it) => it.index === activeIndex) ?? -1;

  const delta = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  const newIndex = Math.abs(localIndex + delta + length) % length;

  data.activeIndex = filteredRef.value[newIndex].index ?? -1;
};

useLabelNotch(root);

watch(() => props.modelValue, updateActive, { immediate: true });

watch(
  () => data.open,
  (open) => (open ? input.value?.focus() : ''),
);

watchPostEffect(() => {
  data.search; // to watch

  if (data.activeIndex >= 0 && data.open) {
    scrollIntoActive();
  }
});
</script>

<template>
  <div class="ui-dropdown__envelope">
    <div
      ref="root"
      :tabindex="tabindex"
      class="ui-dropdown"
      :class="{ open: data.open, error, disabled }"
      @keydown="handleKeydown"
      @focusout="onFocusOut"
    >
      <div class="ui-dropdown__container">
        <div class="ui-dropdown__field">
          <input
            ref="input"
            v-model="data.search"
            type="text"
            tabindex="-1"
            :disabled="disabled"
            :placeholder="computedPlaceholder"
            spellcheck="false"
            autocomplete="chrome-off"
            @focus="onInputFocus"
          />

          <div v-if="!data.open" @click="setFocusOnInput">
            <LongText class="input-value"> {{ textValue }} </LongText>
            <div v-if="clearable" class="close" @click.stop="clear" />
          </div>

          <div v-if="arrowIcon" class="arrow-altered icon" :class="[`icon--${arrowIcon}`]" @click.stop="toggleOpen" />
          <div v-else class="arrow" @click.stop="toggleOpen" />
          <div class="ui-dropdown__append">
            <div v-if="clearable && hasValue" class="icon icon--clear" @click.stop="clear" />
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
        <div v-if="data.open" ref="list" class="ui-dropdown__options">
          <DropdownListItem
            v-for="(item, index) in filteredRef"
            :key="index"
            :option="item"
            :is-selected="item.isSelected"
            :is-hovered="item.isActive"
            :size="optionSize"
            @click.stop="selectOption(item.value)"
          />
          <div v-if="!filteredRef.length" class="nothing-found">Nothing found</div>
        </div>
        <DoubleContour class="ui-dropdown__contour" />
      </div>
    </div>
    <div v-if="computedError" class="ui-dropdown__error">{{ computedError }}</div>
    <div v-else-if="helper" class="ui-dropdown__helper">{{ helper }}</div>
  </div>
</template>
