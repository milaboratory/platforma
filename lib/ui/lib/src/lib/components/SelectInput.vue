<script lang="ts" setup>
import { computed, reactive, ref, unref, useSlots, watch, watchPostEffect } from 'vue';
import { tap, tapIf } from '@/lib/helpers/functions';
import Tooltip from '@/lib/components/Tooltip.vue';
import DoubleContour from '@/lib/utils/DoubleContour.vue';
import { useLabelNotch } from '@/lib/composition/useLabelNotch';
import type { Option } from '@/lib/types';
import { scrollIntoView } from '@/lib/helpers/dom';
import { deepEqual } from '@/lib/helpers/objects';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';
import LongText from '@/lib/components/LongText.vue';

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
    //FIXME unused property
    required?: boolean;
    disabled?: boolean;
    arrowIcon?: string;
    //FIXME unused property
    checkOptions?: boolean;
  }>(),
  {
    label: '',
    helper: undefined,
    error: undefined,
    placeholder: '...',
    clearable: false,
    //FIXME unused property
    required: false,
    disabled: false,
    arrowIcon: undefined,
    //FIXME unused property
    checkOptions: false,
  },
);

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

const textValue = computed(() => {
  const item: Option | undefined = props.options.find((o) => deepEqual(o.value, props.modelValue));
  if (item) {
    if (item) {
      if (typeof item.text === 'object') {
        return item.text.title;
      }
    }
  }

  return item?.text || props.modelValue;
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
    return options.filter((o: Option) => {
      const search = data.search.toLowerCase();

      if (o.text) {
        if (typeof o.text === 'object') {
          return o.text.title.toLowerCase().includes(search);
        } else {
          return o.text.toLowerCase().includes(search);
        }
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

function selectOption(v: unknown) {
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
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.code)) {
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
}

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
          <!-- OLD VERSION -->
          <!-- <div v-if="!data.open" class="input-value" @click="setFocusOnInput">
            {{ textValue }}
            <div v-if="clearable" class="close" @click.stop="clear" />
          </div> -->

          <!-- NEW VERSION -->
          <div v-if="!data.open" @click="setFocusOnInput">
            <long-text class="input-value"> {{ textValue }} </long-text>
            <div v-if="clearable" class="close" @click.stop="clear" />
          </div>

          <div v-if="arrowIcon" class="arrow-altered icon" :class="[`icon--${arrowIcon}`]" @click.stop="toggle" />
          <div v-else class="arrow" @click.stop="toggle" />
          <div class="ui-select-input__append">
            <div v-if="clearable && hasValue" class="icon icon--clear" @click.stop="clear" />
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
            v-for="(item, index) in filteredRef"
            :key="index"
            :item="item"
            :text-item="'text'"
            :is-selected="item.isSelected"
            :is-hovered="item.isActive"
            size="medium"
            @click.stop="selectOption(item.value)"
          />
          <div v-if="!filteredRef.length" class="nothing-found">Nothing found</div>
        </div>
        <double-contour class="ui-select-input__contour" />
      </div>
    </div>
    <div v-if="helper" class="ui-select-input__helper">{{ helper }}</div>
    <div v-else-if="error" class="ui-select-input__error">{{ error }}</div>
  </div>
</template>
