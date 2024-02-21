<script lang="ts" setup>
import { computed, reactive, ref, useSlots, watch, watchPostEffect } from 'vue';
import { tap, tapIf } from '@/lib/helpers/functions';
import Tooltip from '@/lib/components/Tooltip.vue';
import DoubleContour from '@/lib/utils/DoubleContour.vue';
import { useLabelNotch } from '@/lib/composition/useLabelNotch';
import type { Option } from '@/lib/types';
import { scrollIntoView } from '@/lib/helpers/dom';
import { deepEqual } from '@/lib/helpers/objects';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';

const emit = defineEmits(['update:modelValue']);
const emitModel = (v: unknown) => emit('update:modelValue', v);

const slots = useSlots();

const props = withDefaults(
  defineProps<{
    modelValue: unknown;
    label?: string;
    options: Option[];
    helper?: string;
    error?: string;
    placeholder?: string;
    clearable?: boolean;
    required?: boolean;
    disabled?: boolean;
    arrowIcon?: string;
    checkOptions?: boolean;
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
    checkOptions: false,
  },
);

const root = ref<HTMLElement | undefined>();
const list = ref<HTMLElement | undefined>();
const input = ref<HTMLInputElement | undefined>();

const data = reactive({
  search: '',
  activeOption: -1,
  open: false,
});

function updateSelected() {
  data.activeOption = tap(
    filtered.value.findIndex((o) => deepEqual(o.value, props.modelValue)),
    (v) => (v < 0 ? 0 : v),
  );
}

const selectedOption = computed(() => {
  return props.options.findIndex((o) => deepEqual(o.value, props.modelValue));
});

const textValue = computed(() => {
  return props.options.find((o) => deepEqual(o.value, props.modelValue))?.text || props.modelValue;
});

const computedPlaceholder = computed(() => {
  if (!data.open && props.modelValue) {
    return '';
  }

  return props.modelValue ? String(textValue.value) : props.placeholder;
});

const nonEmpty = computed(() => {
  return props.modelValue !== undefined && props.modelValue !== null;
});

const filtered = computed(() => {
  return data.search
    ? props.options.filter((o) => {
        const _search = data.search.toLowerCase();

        if (o.text) {
          return o.text.toLowerCase().includes(_search);
        }

        if (typeof o.value === 'string') {
          return o.value.toLowerCase().includes(_search);
        }

        return o.value === data.search;
      })
    : [...props.options];
});

const tabindex = computed(() => (props.disabled ? undefined : '0'));

function selectItem(v: unknown) {
  emitModel(v);
  data.search = '';
  data.open = false;
  root?.value?.focus();
}

function clear() {
  emit('update:modelValue', null);
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
  if (!root?.value?.contains(event.relatedTarget)) {
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

  const { length } = filtered.value;

  if (!length) {
    return;
  }

  if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'Enter') {
    selectItem(filtered.value[activeOption].value);
  }

  const d = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  data.activeOption = Math.abs(activeOption + d + length) % length;

  requestAnimationFrame(scrollIntoActive);
}

useLabelNotch(root);

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
  <div class="ui-select-input__envelope">
    <div
      ref="root"
      :tabindex="tabindex"
      class="ui-select-input"
      :class="{ open: data.open, error, disabled }"
      @keydown="handleKeydown"
      @focusout="onBlur"
    >
      <div class="ui-select-input__container">
        <div class="ui-select-input__field">
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
          <div v-if="!data.open" class="input-value" @click="setFocusOnInput">
            {{ textValue }}
            <div v-if="clearable" class="close" @click.stop="clear" />
          </div>
          <div v-if="arrowIcon" class="arrow-altered icon" :class="[`icon--${arrowIcon}`]" @click.stop="toggle" />
          <div v-else class="arrow" @click.stop="toggle" />
          <div class="ui-select-input__append">
            <div v-if="clearable && nonEmpty" class="icon icon--clear" @click.stop="clear" />
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
        <div v-if="data.open" ref="list" class="ui-select-input__options">
          <DropdownListItem
            v-for="(item, index) in filtered"
            :key="index"
            :item="item"
            :text-item="'text'"
            :is-selected="index === selectedOption"
            :is-hovered="data.activeOption == index"
            size="medium"
            @click.stop="selectItem(item.value)"
          />
          <!-- <div
            v-for="(opt, i) in filtered"
            :key="i"
            class="option"
            :class="{
              active: i === data.activeOption,
              selected: i === selectedOption,
            }"
            @click="selectItem(opt.value)"
          >
            <span>{{ opt.text }}</span>
            <div class="checkmark" />
          </div> -->
          <div v-if="!filtered.length" class="nothing-found">Nothing found</div>
        </div>
        <double-contour class="ui-select-input__contour" />
      </div>
    </div>
    <div v-if="helper" class="ui-select-input__helper">{{ helper }}</div>
    <div v-else-if="error" class="ui-select-input__error">{{ error }}</div>
  </div>
</template>
