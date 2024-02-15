<script setup lang="ts">
import type { Ref } from 'vue';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { SelectInputItem } from '@/lib/types';
import { deepEqual } from '@/lib/helpers/objects';
import { useClickOutside } from '@/lib/composition/useClickOuside';
import { useFilteredList } from '@/lib/composition/useFilteredList';
import ResizableInput from '@/lib/components/ResizableInput.vue';
import { tapIf, tap } from '@/lib/helpers/functions';
import { scrollIntoView } from '@/lib/helpers/dom';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';
import TabItem from '@/lib/components/TabItem.vue';

const props = withDefaults(
  defineProps<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modelValue: Record<string, any>[];
    disabled?: boolean;
    prefix?: string;
    items: SelectInputItem[];
    itemText?: string;
    itemValue?: string;
    placeholder?: string;
    mode?: 'list' | 'tabs';
    tabsContainerStyles?: Record<string, any>
  }>(),
  {
    mode: 'list',
    itemText: 'text',
    itemValue: 'value',
    placeholder: 'Select..',
    prefix: '',
    modelValue: () => [],
  },
);

const emit = defineEmits(['update:modelValue']);
const data = reactive({
  isOpen: false,
  activeOption: -1,
});
const container = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const classes = computed(() => {
  const classesResult = [];
  if (props.modelValue && props.modelValue.length > 0) {
    classesResult.push('active');
  }
  if (data.isOpen) {
    classesResult.push('open');
  }
  if (props.disabled) {
    classesResult.push('disabled');
  }
  return classesResult.join(' ');
});
const searchPhrase = ref<string>('');
const items = useFilteredList(props.items, searchPhrase, 'text');
const selectedValues = computed<string>(() => {
  if (searchPhrase.value) {
    return searchPhrase.value;
  }
  if (props.modelValue && props.modelValue?.length > 0) {
    return props.modelValue[0][props.itemText];
  }
  return '';
});

useClickOutside(container as Ref<HTMLElement>, () => {
  if (props.mode === 'list') {
    data.isOpen = false;
  }
});

watch(
  () => data.isOpen,
  (value: boolean) => {
    if (value) {
      nextTick(() => scrollIntoActive());
    }
  },
);

watch(
  () => props.modelValue,
  () => updateSelected(),
  { immediate: true },
);

function updateSelected() {
  data.activeOption = tap(
    items.value.findIndex((o) => {
      return deepEqual(o, props.modelValue[0]);
    }),
    (v) => (v < 0 ? 0 : v),
  );
}

function setSearchPhrase(str: string) {
  searchPhrase.value = str;
  data.isOpen = true;
  if (!searchPhrase.value) {
    selectItem();
  }
}

function toggleList(event: Event): void {
  if (props.disabled) {
    data.isOpen = false;
  } else {
    nextTick(() => {
      data.isOpen = !data.isOpen;
    });
  }
}

function resetSearchPhrase() {
  searchPhrase.value = '';
}

function closePopupIfNeeded() {
  if (props.mode === 'list') {
    data.isOpen = false;
  }
}

function selectItem(item?: SelectInputItem): void {
  if (item) {
    emit('update:modelValue', [item]);
    closePopupIfNeeded();
    resetSearchPhrase();
  } else {
    emit('update:modelValue', []);
  }
}

function isItemSelected(item: SelectInputItem): boolean {
  if (props.modelValue?.findIndex((el) => deepEqual(el[props.itemValue], item[props.itemValue])) !== -1) {
    return true;
  }
  return false;
}

function onBlur(event: Event) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!container?.value?.contains((event as any).relatedTarget)) {
    data.isOpen = false;
  }
}

function handleKeydown(e: { code: string; preventDefault(): void }) {

  const { activeOption } = data;

  if (!data.isOpen && e.code === 'Enter') {
    data.isOpen = true;
    return;
  }

  const { length } = items.value;

  if (!length) {
    return;
  }

  if (['ArrowDown', 'ArrowUp', 'Enter', 'ArrowRight', 'ArrowLeft'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'Enter') {
    selectItem(items.value[activeOption]);
  }

  let d = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  if (props.mode === 'tabs') {
    d = e.code === 'ArrowRight' ? 1 : e.code === 'ArrowLeft' ? -1 : 0;
  }

  data.activeOption = Math.abs(activeOption + d + length) % length;

  requestAnimationFrame(scrollIntoActive);
}

function scrollIntoActive() {
  const $list = list.value;
  if (!$list) {
    return;
  }
  const element = $list.querySelector('.hovered-item') as HTMLElement;
  tapIf(element, (opt) => {
    if (props.mode === 'list') {
      scrollIntoView($list, opt);
    } else {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}
</script>

<template>
  <div ref="container" tabindex="0" :class="classes" class="ui-select-input-line uc-pointer" @keydown="handleKeydown"
    @focusout="onBlur" @click="toggleList">
    <div class="ui-select-input-line__prefix">{{ props?.prefix }}</div>
    <ResizableInput :value="selectedValues" :placeholder="'...'" :disabled="props.disabled"
      class="ui-select-input-line__input" @input="setSearchPhrase" />
    <div class="ui-select-input-line__icon-wrapper">
      <div class="ui-select-input-line__icon" />
    </div>
    <div v-if="props.mode === 'list'" v-show="data.isOpen" ref="list" class="ui-select-input-line__items">
      <template v-for="(item, index) in items" :key="index">
        <slot name="item" :item="item" :text-item="props.itemText" :is-selected="isItemSelected(item)"
          :is-hovered="data.activeOption == index" @click.stop="selectItem(item)">
          <DropdownListItem :item="item" :text-item="props.itemText" :is-selected="isItemSelected(item)"
            :is-hovered="data.activeOption == index" size="medium" @click.stop="selectItem(item)" />
        </slot>
      </template>

      <div v-if="items.length === 0" class="ui-select-input-line__no-item">
        <div class="ui-select-input-line__no-item-title text-s">Didn't find anything that matched</div>
      </div>
    </div>
    <div v-if="props.mode === 'tabs'" v-show="data.isOpen" ref="list" :style="props.tabsContainerStyles"
      class="ui-select-input-line__items-tabs">
      <template v-for="(item, index) in items" :key="index">
        <slot name="item" :item="item" :text-item="props.itemText" :is-selected="isItemSelected(item)"
          :is-hovered="data.activeOption == index" @click.stop="selectItem(item)">
          <TabItem :item="item" :text-item="props.itemText" :is-selected="isItemSelected(item)"
            :is-hovered="data.activeOption == index" @click.stop="selectItem(item)" />
        </slot>
      </template>
      <div v-if="items.length === 0" class="ui-select-input-line__no-item">
        <div class="ui-select-input-line__no-item-title text-s">Didn't find anything that matched</div>
      </div>
    </div>
  </div>
</template>
