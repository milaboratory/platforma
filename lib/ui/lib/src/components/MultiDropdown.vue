<script lang="ts" setup>
import { computed, reactive, ref, unref, useSlots, watch, watchPostEffect } from 'vue';
import { tap, tapIf } from '@/helpers/functions';
import Tooltip from '@/components/Tooltip.vue';
import Chip from '@/components/Chip.vue';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/composition/useLabelNotch';
import type { Option } from '@/types';
import { scrollIntoView } from '@/helpers/dom';
import DropdownListItem from '@/components/DropdownListItem.vue';
import { deepEqual, deepIncludes } from '../helpers/objects';

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
    filteredOptionsRef.value.findIndex((o) => deepEqual(o.value, props.modelValue)),
    (v) => (v < 0 ? 0 : v),
  );
}

const selectedValuesRef = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

const placeholderRef = computed(() => {
  if (data.open && props.modelValue.length > 0) {
    return props.placeholder;
  }

  return props.modelValue.length > 0 ? '' : props.placeholder;
});

const selectedOptionsRef = computed(() => {
  return props.options.filter((opt) => deepIncludes(selectedValuesRef.value, opt.value));
});

const filteredOptionsRef = computed(() => {
  const selectedValues = unref(selectedValuesRef);

  return (
    data.search
      ? props.options.filter((opt) => {
          const _search = data.search.toLowerCase();

          if (opt.text) {
            // return opt.text.toLowerCase().includes(_search);
            if (typeof opt.text === 'object') {
              return opt.text.title.toLowerCase().includes(_search);
            } else {
              return opt.text.toLowerCase().includes(_search);
            }
          }

          if (typeof opt.value === 'string') {
            return opt.value.toLowerCase().includes(_search);
          }

          return opt.value === data.search;
        })
      : [...props.options]
  ).map((opt) => ({
    ...opt,
    selected: deepIncludes(selectedValues, opt.value),
  }));
});

const tabindex = computed(() => (props.disabled ? undefined : '0'));

function selectItem(v: unknown) {
  const values = unref(selectedValuesRef);
  emitModel(deepIncludes(values, v) ? values.filter((it) => !deepEqual(it, v)) : [...values, v]);
  data.search = '';
  rootRef?.value?.focus();
}

function closeItem(d: unknown) {
  emitModel(unref(selectedValuesRef).filter((v) => !deepEqual(v, d)));
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
          <Chip v-for="(opt, i) in selectedOptionsRef" :key="i" closeable small @click.stop="data.open = true" @close="closeItem(opt.value)">
            {{ (typeof opt.text === 'object' ? opt.text.title : opt.text) || opt.value }}
          </Chip>
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
        <div class="ui-multi-dropdown__open-chips-conteiner">
          <Chip v-for="(opt, i) in selectedOptionsRef" :key="i" closeable small @click.stop @close="closeItem(opt.value)">
            {{ (typeof opt.text === 'object' ? opt.text.title : opt.text) || opt.value }}
          </Chip>
        </div>
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
        <div v-if="!filteredOptionsRef.length" class="nothing-found">Nothing found</div>
      </div>
      <double-contour class="ui-multi-dropdown__contour" />
    </div>
  </div>
</template>
