<script setup lang="ts">
import type { Ref, StyleValue } from 'vue';
import { computed, nextTick, reactive, ref, watch } from 'vue';
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
  }>(),
  {
    mode: 'list',
    placeholder: 'Select..',
    prefix: '',
    inputMaxWidth: '',
    inputWidth: '',
    tabsContainerStyles: undefined,
  },
);

const data = reactive({
  isOpen: false,
  activeOption: -1,
});

const container = ref<HTMLElement | null>(null);

const list = ref<HTMLElement | null>(null);

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

const options = useFilteredList(props.options, searchPhrase);

const modelText = computed(() => {
  if (props.modelValue) {
    const index = getIndexForModelInItems();
    if (index !== -1) {
      return props.options[index]['text'];
    }
  }
  return '';
});

const inputValue = computed(() => {
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

useClickOutside(container as Ref<HTMLElement>, () => {
  if (props.mode === 'list') {
    data.isOpen = false;
  }
});

watch(
  () => data.isOpen,
  (value: boolean) => {
    if (value) {
      if (container.value) {
        container.value.querySelector('input')?.focus();
      }
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
  const index = props.options.findIndex((o: Option) => {
    return deepEqual(o.value, props.modelValue);
  });
  return index;
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

function toggleList(): void {
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

  let d = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

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
  <div
    ref="container"
    tabindex="0"
    :class="classes"
    class="ui-select-input-line uc-pointer"
    @keydown="handleKeydown"
    @focusout="onBlur"
    @click="toggleList"
  >
    <div class="ui-select-input-line__prefix">{{ props?.prefix }}</div>

    <ResizableInput
      :value="inputValue"
      :placeholder="placeholder"
      :disabled="props.disabled"
      :max-width="props.inputMaxWidth"
      :width="props.inputWidth"
      class="ui-select-input-line__input"
      @input="setSearchPhrase"
    />

    <div class="ui-select-input-line__icon-wrapper">
      <div class="ui-select-input-line__icon" />
    </div>
    <div v-if="props.mode === 'list'" v-show="data.isOpen" ref="list" class="ui-select-input-line__items">
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

      <div v-if="options.length === 0" class="ui-select-input-line__no-item">
        <div class="ui-select-input-line__no-item-title text-s">Didn't find anything that matched</div>
      </div>
    </div>
    <div v-if="props.mode === 'tabs'" v-show="data.isOpen" ref="list" :style="props.tabsContainerStyles" class="ui-select-input-line__items-tabs">
      <template v-for="(item, index) in options" :key="index">
        <slot name="item" :item="item" :is-selected="isItemSelected(item)" :is-hovered="data.activeOption == index" @click.stop="selectItem(item)">
          <TabItem :item="item" :is-selected="isItemSelected(item)" :is-hovered="data.activeOption == index" @click.stop="selectItem(item)" />
        </slot>
      </template>
      <div v-if="options.length === 0" class="ui-select-input-line__no-item">
        <div class="ui-select-input-line__no-item-title text-s">Didn't find anything that matched</div>
      </div>
    </div>
  </div>
</template>
