<script setup lang="ts">
import type { PropType, Ref } from 'vue';
import { computed, reactive, ref } from 'vue';
import type { SelectInputItem } from '@/lib/types';
import { deepEqual } from '@/lib/helpers/objects';
import { useClickOutside } from '@/lib/composition/useClickOuside';
import { useFilteredList } from '@/lib/composition/useFilteredList';
import ResizableInput from '@/lib/components/ResizableInput.vue';

const props = defineProps({
  modelValue: {
    type: Array as PropType<SelectInputItem[]>,
    required: true,
  },
  disabled: {
    type: Boolean as PropType<boolean>,
    default: false,
  },
  prefix: {
    type: String as PropType<string>,
    // required: true,
  },
  items: {
    type: Array as PropType<SelectInputItem[]>,
    default: () => [],
  },
  itemText: {
    type: String as PropType<string>,
    default: 'text',
  },
  itemValue: {
    type: String as PropType<string>,
    default: 'value',
  },
  placeholder: {
    type: String as PropType<string>,
    default: 'Select...',
  },
  mode: {
    type: String as PropType<'list' | 'tabs'>,
    default: 'list',
  },
});
const emit = defineEmits(['update:modelValue']);
const data = reactive({
  isOpen: false,
});
const container = ref<HTMLElement | null>(null);
const classes = computed(() => {
  const classesResult = [];
  if (props.modelValue.length > 0) {
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
  if (props.modelValue?.length > 0) {
    return props.modelValue[0][props.itemText];
  }
  return '';
});

useClickOutside(container as Ref<HTMLElement>, () => {
  data.isOpen = false;
});

function getClassForSelectedItem(item: SelectInputItem): string {
  const result = isItemSelected(item);
  if (result) {
    return 'ui-select-input-line__item-active';
  }
  return '';
}

function setSearchPhrase(str: string) {
  searchPhrase.value = str;
  data.isOpen = true;
  if (!searchPhrase.value) {
    selectItem();
  }
}

function toggleList(): void {
  if (props.disabled) {
    data.isOpen = false;
  } else {
    data.isOpen = true;
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
    resetSearchPhrase();
  } else {
    emit('update:modelValue', []);
  }

  closePopupIfNeeded();
}

function isItemSelected(item: SelectInputItem): boolean {
  if (props.modelValue?.findIndex((el) => deepEqual(el[props.itemValue], item[props.itemValue])) !== -1) {
    return true;
  }
  return false;
}
</script>

<template>
  <div ref="container" :class="classes" class="ui-select-input-line uc-pointer" @click="toggleList">
    <div class="ui-select-input-line__prefix">
      {{ props.prefix }}
    </div>
    <ResizableInput
      class="ui-select-input-line__input"
      :value="selectedValues"
      :placeholder="'...'"
      :disabled="props.disabled"
      @input="setSearchPhrase"
    />
    <div class="ui-select-input-line__icon-wrapper">
      <div class="ui-select-input-line__icon" @click="toggleList" />
    </div>
    <div v-if="props.mode === 'list'" v-show="data.isOpen" class="ui-select-input-line__items">
      <div
        v-for="(item, index) in items"
        :key="index"
        :class="getClassForSelectedItem(item)"
        class="ui-select-input-line__item"
        @click.stop="selectItem(item)"
      >
        <div class="ui-select-input-line__item-title">
          {{ item[props.itemText] }}
        </div>
        <div v-if="isItemSelected(item)" class="ui-select-input-line__item-icon"></div>
      </div>

      <div v-if="items.length === 0" class="ui-select-input-line__item">
        <div class="ui-select-input-line__item-title">No items...</div>
      </div>
    </div>
    <div v-if="props.mode === 'tabs'" v-show="data.isOpen" class="ui-select-input-line__items-tabs">
      <div
        v-for="(item, index) in items"
        :key="index"
        :class="getClassForSelectedItem(item)"
        class="ui-select-input-line__item-tab"
        @click.stop="selectItem(item)"
      >
        <div class="ui-select-input-line__item-title">
          {{ item[props.itemText] }}
        </div>
      </div>
    </div>
  </div>
</template>
