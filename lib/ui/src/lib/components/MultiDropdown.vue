<script lang="ts" setup>
import { computed, reactive, ref, unref, useSlots, watch, watchPostEffect } from 'vue';
import { tap, tapIf } from '@/lib/helpers/functions';
import Tooltip from '@/lib/components/Tooltip.vue';
import Chip from '@/lib/components/Chip.vue';
import DoubleContour from '@/lib/utils/DoubleContour.vue';
import { useLabelNotch } from '@/lib/composition/useLabelNotch';
import type { Option } from '@/lib/types';
import { scrollIntoView } from '@/lib/helpers/dom';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';

const emit = defineEmits(['update:modelValue']);
const emitModel = (v: unknown[]) => emit('update:modelValue', v);

const slots = useSlots();

const props = withDefaults(
  defineProps<{
    modelValue: unknown[];
    label?: string;
    options: Option[];
    error?: string;
    placeholder?: string;
    clearable?: boolean;
    required?: boolean;
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    error: undefined,
    modelValue: () => [],
    placeholder: '...',
    clearable: false,
    required: false,
    disabled: false,
  },
);

const rootRef = ref<HTMLElement | undefined>();
const list = ref<HTMLElement | undefined>();
const input = ref<HTMLInputElement | undefined>();

const data = reactive({
  search: '',
  activeOption: -1,
  open: false,
});

function updateSelected() {
  data.activeOption = tap(
    filteredOptionsRef.value.findIndex((o) => o.value === props.modelValue),
    (v) => (v < 0 ? 0 : v),
  );
}

const selectedValuesRef = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

const textValue = computed(() => {
  const selectedValues = unref(selectedValuesRef);
  return props.options
    .filter((o) => selectedValues.includes(o.value))
    .map((o) => o.text)
    .join(', ');
});

const placeholderRef = computed(() => {
  if (data.open && props.modelValue.length > 0) {
    return String(textValue.value);
  }

  return props.modelValue.length > 0 ? '' : props.placeholder;
});

const selectedOptionsRef = computed(() => {
  return props.options.filter((opt) => unref(selectedValuesRef).includes(opt.value));
});

const filteredOptionsRef = computed(() => {
  const selectedValues = unref(selectedValuesRef);

  return (
    data.search
      ? props.options.filter((opt) => {
          const _search = data.search.toLowerCase();

          if (opt.text) {
            return opt.text.toLowerCase().includes(_search);
          }

          if (typeof opt.value === 'string') {
            return opt.value.toLowerCase().includes(_search);
          }

          return opt.value === data.search;
        })
      : [...props.options]
  ).map((opt) => ({
    ...opt,
    selected: selectedValues.includes(opt.value),
  }));
});

const tabindex = computed(() => (props.disabled ? undefined : '0'));

function selectItem(v: unknown) {
  const values = unref(selectedValuesRef);
  emitModel(values.includes(v) ? values.filter((it) => it !== v) : [...values, v]);
  data.search = '';
  data.open = false;
  rootRef?.value?.focus();
}

function closeItem(d: unknown) {
  emitModel(unref(selectedValuesRef).filter((v) => v !== d));
}

function setFocusOnInput() {
  input.value?.focus();
}

function toggle() {
  data.open = !data.open;
}

function onInputFocus() {
  data.open = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onBlur(event: any) {
  if (!rootRef?.value?.contains(event.relatedTarget)) {
    data.search = '';
    data.open = false;
  }
}

function scrollIntoActive() {
  const $list = list.value;

  if (!$list) {
    return;
  }

  tapIf($list.querySelector('.hovered-item') as HTMLElement, (opt) => {
    scrollIntoView($list, opt);
  });
}

function handleKeydown(e: { code: string; preventDefault(): void }) {
  const { open, activeOption } = data;

  if (!open && e.code === 'Enter') {
    data.open = true;
    return;
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
    selectItem(filteredOptions[activeOption].value);
  }

  const d = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  data.activeOption = Math.abs(activeOption + d + length) % length;

  requestAnimationFrame(scrollIntoActive);
}

useLabelNotch(rootRef);

watch(
  () => props.modelValue,
  () => updateSelected(),
  { immediate: true },
);

watchPostEffect(() => {
  if (data.open) {
    scrollIntoActive();
  }
});
</script>

<template>
  <div
    ref="rootRef"
    :tabindex="tabindex"
    class="ui-multi-dropdown"
    :class="{ open: data.open, error, disabled }"
    @keydown="handleKeydown"
    @focusout="onBlur"
  >
    <div v-if="error" class="ui-multi-dropdown__error">{{ error }}</div>
    <div class="ui-multi-dropdown__container">
      <div class="ui-multi-dropdown__field">
        <input
          ref="input"
          v-model="data.search"
          type="text"
          tabindex="-1"
          :disabled="disabled"
          :placeholder="placeholderRef"
          spellcheck="false"
          autocomplete="chrome-off"
          @focus="onInputFocus"
        />
        <div v-if="!data.open" class="chips-container" @click="setFocusOnInput">
          <chip v-for="(opt, i) in selectedOptionsRef" :key="i" closeable small @click.stop @close="closeItem(opt.value)">
            {{ opt.text || opt.value }}</chip
          >
        </div>
        <div class="arrow" @click.stop="toggle" />
        <div class="ui-multi-dropdown__append">
          <slot name="append" />
        </div>
      </div>
      <label v-if="label">
        {{ label }}
        <tooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </tooltip>
      </label>
      <div v-if="data.open" ref="list" class="ui-multi-dropdown__options">
        <DropdownListItem
          v-for="(item, index) in filteredOptionsRef"
          :key="index"
          :item="item"
          :text-item="'text'"
          :is-selected="item.selected"
          :is-hovered="data.activeOption == index"
          size="medium"
          use-checkbox
          @click.stop="selectItem(item.value)"
        />
        <!-- <div
          v-for="(opt, i) in filteredOptionsRef"
          :key="i"
          class="option"
          :class="{
            active: i === data.activeOption,
            selected: opt.selected,
          }"
          @click="selectItem(opt.value)"
        >
          <div class="ui-multi-dropdown__checkmark" />
          <span>{{ opt.text }}</span>
        </div> -->
        <div v-if="!filteredOptionsRef.length" class="nothing-found">Nothing found</div>
      </div>
      <double-contour class="ui-multi-dropdown__contour" />
    </div>
  </div>
</template>
