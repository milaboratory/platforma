<script setup lang="ts">
import type { StyleValue } from 'vue';
import { computed, nextTick, reactive, ref, toRef, watch } from 'vue';
import { deepEqual } from '@/lib/helpers/objects';
import { useClickOutside } from '@/lib/composition/useClickOuside';
import { useFilteredList } from '@/lib/composition/useFilteredList';
import ResizableInput from '@/lib/components/ResizableInput.vue';
import { tapIf, tap } from '@/lib/helpers/functions';
import { scrollIntoView } from '@/lib/helpers/dom';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';
import TabItem from '@/lib/components/TabItem.vue';
import type { Option } from '@/lib/types';

const emit = defineEmits(['update:modelValue']); // at the top always

const props = withDefaults(
  defineProps<{
    modelValue: unknown;
    disabled?: boolean;
    prefix?: string;
    options: Option[];
    placeholder?: string;
    mode?: 'list' | 'tabs';
    tabsContainerStyles?: StyleValue;
    inputMaxWidth?: string;
    inputWidth?: string;
    clearable?: boolean;
  }>(),
  {
    mode: 'list',
    placeholder: 'Select..',
    prefix: '',
    inputMaxWidth: '',
    inputWidth: '',
    tabsContainerStyles: undefined,
    clearable: false,
  },
);

const data = reactive({
  isOpen: false,
  activeOption: -1,
});

const container = ref<HTMLElement>();

const list = ref<HTMLElement>();

const classes = computed(() => {
  const classesResult = [];
  if (data.isOpen) {
    classesResult.push('open');
  }
  if (props.disabled) {
    classesResult.push('disabled');
  }
  return classesResult.join(' ');
});

const searchPhrase = ref<string>('');

const options = useFilteredList(toRef(props, 'options'), searchPhrase);

const canShowClearBtn = computed<boolean>(() => !!(props.clearable && data.isOpen && props.modelValue && modelText.value));

const modelText = computed<string>(() => {
  if (props.modelValue) {
    const index = getIndexForModelInItems();
    if (index !== -1) {
      const item = props.options[index];
      if (typeof item['text'] === 'object') {
        return item['text']['title'];
      } else {
        return item['text'];
      }
    }
  }
  return '';
});

const inputValue = computed<string>(() => {
  if (data.isOpen) {
    if (searchPhrase.value && searchPhrase.value.length >= inputValue.value.length - 1) {
      return searchPhrase.value;
    }
    return '';
  }

  return modelText.value;
});

const placeholder = computed(() => {
  if (data.isOpen) {
    if (searchPhrase.value && searchPhrase.value.length >= modelText.value.length - 1) {
      return searchPhrase.value;
    }
  }

  return modelText.value || '...';
});

useClickOutside(container, () => {
  if (props.mode === 'list') {
    data.isOpen = false;
  }
});

watch(
  () => data.isOpen,
  (value: boolean) => {
    if (value && container.value) {
      container.value.querySelector('input')?.focus();
      nextTick(() => scrollIntoActive());
    }
  },
);

watch(
  () => props.modelValue,
  () => updateSelected(),
  { immediate: true },
);

function getIndexForModelInItems(): number | -1 {
  return props.options.findIndex((o: Option) => {
    return deepEqual(o.value, props.modelValue);
  });
}

function updateSelected() {
  data.activeOption = tap(
    options.value.findIndex((o: Option) => {
      return deepEqual(o.value, props.modelValue);
    }),
    (v) => (v < 0 ? 0 : v),
  );
}

function setSearchPhrase(str: string) {
  searchPhrase.value = str;
  data.isOpen = true;
}

function resetSearchPhrase() {
  searchPhrase.value = '';
}

function toggleList(): void {
  if (props.disabled) {
    data.isOpen = false;
  } else {
    nextTick(() => {
      data.isOpen = !data.isOpen;
    });
  }
}

function closePopupIfNeeded() {
  if (props.mode === 'list') {
    data.isOpen = false;
  }
}

function selectItem(item?: Option): void {
  if (item) {
    emit('update:modelValue', item.value);
    closePopupIfNeeded();
    resetSearchPhrase();
  }
}

function isItemSelected(item: Option): boolean {
  return deepEqual(item.value, props.modelValue);
}

function onBlur(event: Event) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!container?.value?.contains((event as any).relatedTarget)) {
    data.isOpen = false;
    searchPhrase.value = '';
  }
}

function handleKeydown(e: { code: string; preventDefault(): void }) {
  const { activeOption } = data;

  if (!data.isOpen && e.code === 'Enter') {
    data.isOpen = true;
    return;
  }

  const { length } = options.value;

  if (!length) {
    return;
  }

  if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'Enter') {
    selectItem(options.value[activeOption]);
  }

  const d = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  data.activeOption = Math.abs(activeOption + d + length) % length;

  requestAnimationFrame(scrollIntoActive);
}

function scrollIntoActive() {
  const $list = list.value;
  if (!$list) {
    return;
  }
  tapIf($list.querySelector('.hovered-item'), (el: Element) => {
    if (props.mode === 'list') {
      scrollIntoView($list, el as HTMLElement);
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

function clearModel() {
  emit('update:modelValue', undefined);
}
</script>

<template>
  <div
    ref="container"
    tabindex="0"
    :class="classes"
    class="ui-line-dropdown uc-pointer"
    @keydown="handleKeydown"
    @focusout="onBlur"
    @click="toggleList"
  >
    <div class="ui-line-dropdown__prefix">{{ props?.prefix }}</div>

    <ResizableInput
      :value="inputValue"
      :placeholder="placeholder"
      :disabled="props.disabled"
      :max-width="props.inputMaxWidth"
      :width="props.inputWidth"
      class="ui-line-dropdown__input"
      @input="setSearchPhrase"
    />

    <div class="ui-line-dropdown__icon-wrapper">
      <div v-show="!canShowClearBtn" class="ui-line-dropdown__icon" />
      <div v-show="canShowClearBtn" class="ui-line-dropdown__icon-clear" @click="clearModel" />
    </div>
    <div v-if="props.mode === 'list'" v-show="data.isOpen" ref="list" class="ui-line-dropdown__items">
      <template v-for="(item, index) in options" :key="index">
        <slot
          name="item"
          :item="item"
          :text-item="'text'"
          :is-selected="isItemSelected(item)"
          :is-hovered="data.activeOption == index"
          @click.stop="selectItem(item)"
        >
          <DropdownListItem
            :item="item"
            :text-item="'text'"
            :is-selected="isItemSelected(item)"
            :is-hovered="data.activeOption == index"
            size="medium"
            @click.stop="selectItem(item)"
          />
        </slot>
      </template>

      <div v-if="options.length === 0" class="ui-line-dropdown__no-item">
        <div class="ui-line-dropdown__no-item-title text-s">Didn't find anything that matched</div>
      </div>
    </div>
    <div v-if="props.mode === 'tabs'" v-show="data.isOpen" ref="list" :style="props.tabsContainerStyles" class="ui-line-dropdown__items-tabs">
      <template v-for="(item, index) in options" :key="index">
        <slot name="item" :item="item" :is-selected="isItemSelected(item)" :is-hovered="data.activeOption == index" @click.stop="selectItem(item)">
          <TabItem :item="item" :is-selected="isItemSelected(item)" :is-hovered="data.activeOption == index" @click.stop="selectItem(item)" />
        </slot>
      </template>
      <div v-if="options.length === 0" class="ui-line-dropdown__no-item">
        <div class="ui-line-dropdown__no-item-title text-s">Didn't find anything that matched</div>
      </div>
    </div>
  </div>
</template>
