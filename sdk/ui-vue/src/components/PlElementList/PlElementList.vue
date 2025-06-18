<script generic="T extends unknown = unknown, K extends number | string = number | string" lang="ts" setup>
import type { ShallowRef } from 'vue';
import { computed, shallowRef, watch } from 'vue';
import { isNil, shallowHash } from '@milaboratories/helpers';
import { useSortable } from '@vueuse/integrations/useSortable';
import { type SortableEvent } from 'sortablejs';
import { moveElements, optionalUpdateRef } from './utils.ts';
import PlElementListItem from './PlElementListItem.vue';

const itemsRef = defineModel<T[]>('items', { required: true });
const draggableSetRef = defineModel<Set<T>>('draggableItems');
const removableSetRef = defineModel<Set<T>>('removableItems');

const pinnableSetRef = defineModel<Set<T>>('pinnableItems');
const pinnedSetRef = defineModel<Set<T>>('pinnedItems');

const toggableSetRef = defineModel<Set<T>>('toggableItems');
const toggledSetRef = defineModel<Set<T>>('toggledItems');

const props = withDefaults(
  defineProps<{
    getItemKey: (item: T) => K;
    onSort?: (oldIndex: number, newIndex: number) => void | boolean;

    enableDragging?: boolean;
    onDragEnd?: (oldIndex: number, newIndex: number) => void | boolean;

    enableRemoving?: boolean;
    onRemove?: (item: T, index: number) => void | boolean;

    enableToggling?: boolean;
    onToggle?: (item: T, index: number) => void | boolean;

    enablePinning?: boolean;
    onPin?: (item: T, index: number) => void | boolean;
  }>(), {
    enableDragging: true,
    enableRemoving: undefined,
    enableToggling: true,
    enablePinning: true,
    onSort: undefined,
    onDragEnd: undefined,
    onRemove: undefined,
    onToggle: undefined,
    onPin: undefined,
  },
);

const slots = defineSlots<{
  ['item-title']: (props: { item: T; index: number }) => unknown;
  ['item-content']?: (props: { item: T; index: number }) => unknown;
}>();

const pinnedItemsRef = computed(() => itemsRef.value.filter(isPinned));
const hasPinnedItems = computed(() => pinnedItemsRef.value.length > 0);

const unpinnedItemsRef = computed(() => itemsRef.value.filter((item) => !isPinned(item)));
const hasUnpinnedItems = computed(() => unpinnedItemsRef.value.length > 0);

const openedSetRef = shallowRef(new Set<T>());

const domProjectionItemsRef = shallowRef<undefined | T[]>();
const pinnedContainerRef = shallowRef<HTMLElement>();
const unpinnedContainerRef = shallowRef<HTMLElement>();

// version fix problem with sync between data and rendered values when items have been changed
const versionRef = computed<number>((oldVersion) => {
  const currentVersion = shallowHash(...itemsRef.value);

  if (domProjectionItemsRef.value === undefined) return oldVersion ?? currentVersion;

  const lastSortedVersion = shallowHash(...domProjectionItemsRef.value);

  if (currentVersion === lastSortedVersion) return oldVersion ?? currentVersion;

  return oldVersion !== currentVersion ? currentVersion : lastSortedVersion;
});

createSortable(hasPinnedItems, pinnedContainerRef, pinnedItemsRef, () => 0);
createSortable(hasUnpinnedItems, unpinnedContainerRef, unpinnedItemsRef, () => pinnedItemsRef.value.length);

function createSortable(toggler: ShallowRef<boolean>, elRef: ShallowRef<undefined | HTMLElement>, itemsRef: ShallowRef<T[]>, getOffset: () => number) {
  const sortable = useSortable(elRef, itemsRef, {
    handle: `[data-draggable="true"]`,
    animation: 150,
    forceFallback: true,
    scrollSensitivity: 80,
    forceAutoScrollFallback: true,
    onUpdate: (evt: SortableEvent) => {
      if (evt.oldIndex == null || evt.newIndex == null) {
        throw new Error('Sortable event has no index');
      }
      if (props.onDragEnd?.(evt.oldIndex, evt.newIndex) !== false) {
        moveItems(getOffset() + evt.oldIndex, getOffset() + evt.newIndex, true);
      }
    },
  });
  watch(toggler, (on) => on ? sortable.start() : sortable.stop());

  return sortable;
}

function moveItems(oldIndex: number, newIndex: number, afterUpdateDom: boolean) {
  if (oldIndex === newIndex) return;

  if (afterUpdateDom) {
    domProjectionItemsRef.value = moveElements(itemsRef.value.slice(), oldIndex, newIndex);
  }

  const preventDefault = props.onSort?.(oldIndex, newIndex) === false;

  if (!preventDefault) {
    moveElements(itemsRef.value, oldIndex, newIndex);
    optionalUpdateRef(itemsRef);
  }
}

function isDraggable(item: T) {
  if (props.enableDragging === false) return false;
  return (draggableSetRef.value?.has(item) ?? true);
}

function isToggable(item: T) {
  if (props.enableToggling === false) return false;
  return !isNil(toggledSetRef.value) && (toggableSetRef.value?.has(item) ?? true);
}

function isToggled(item: T) {
  return toggledSetRef.value?.has(item) ?? false;
}

function isPinnable(item: T) {
  if (props.enablePinning === false) return false;
  return !isNil(pinnedSetRef.value) && (pinnableSetRef.value?.has(item) ?? true);
}

function isPinned(item: T) {
  return pinnedSetRef.value?.has(item) ?? false;
}

function isOpened(item: T) {
  return openedSetRef.value.has(item);
}

function isRemovable(item: T) {
  if (props.enableRemoving === false) return false;
  if (removableSetRef.value?.has(item) === false) return false;
  return props.enableRemoving === true || typeof props.onRemove === 'function';
}

function handleToggle(item: T, index: number) {
  if (props.onToggle?.(item, index) === false || isNil(toggledSetRef.value)) return;

  const toggled = toggledSetRef.value;
  if (toggled.has(item)) toggled.delete(item);
  else toggled.add(item);
  optionalUpdateRef(toggledSetRef);
}

function handlePin(item: T, oldIndex: number) {
  if (oldIndex === -1) {
    throw new Error('Pinnable item not found');
  }

  if (props.onPin?.(item, oldIndex) === false || isNil(pinnedSetRef.value)) return;

  const pinned = pinnedSetRef.value;
  const alreadyPinned = pinned.has(item);
  if (alreadyPinned) pinned.delete(item);
  else pinned.add(item);
  optionalUpdateRef(pinnedSetRef);
  moveItems(oldIndex, pinned.size + (alreadyPinned ? 0 : -1), false);
}

function handleRemove(item: T, index: number) {
  if (props.onRemove?.(item, index) !== false) {
    itemsRef.value.splice(index, 1);
    optionalUpdateRef(itemsRef);

    if (pinnedSetRef.value?.has(item)) {
      pinnedSetRef.value.delete(item);
      optionalUpdateRef(pinnedSetRef);
    }

    if (toggledSetRef.value?.has(item)) {
      toggledSetRef.value.delete(item);
      optionalUpdateRef(toggledSetRef);
    }
  }
}

function handleToggleContent(item: T) {
  const opened = openedSetRef.value;
  if (opened.has(item)) opened.delete(item);
  else opened.add(item);
  optionalUpdateRef(openedSetRef);
}

// version fix problem with sync between data and rendered values
const getKey = (item: T) => `${versionRef.value}-${props.getItemKey(item)}`;
const pinnedKeysRef = computed(() => pinnedItemsRef.value.map(getKey));
const unpinnedKeysRef = computed(() => unpinnedItemsRef.value.map(getKey));

</script>

<template>
  <div :class="$style.root">
    <div ref="pinnedContainerRef" :class="$style.list">
      <PlElementListItem
        v-for="(pinnedItem, pinnedIndex) in pinnedItemsRef" :key="pinnedKeysRef[pinnedIndex]"
        :class="$style.item"

        :index="pinnedIndex"
        :item="pinnedItem"
        :showDragHandle="props.enableDragging"
        :isDraggable="isDraggable(pinnedItem)"
        :isRemovable="isRemovable(pinnedItem)"
        :isToggable="isToggable(pinnedItem)"
        :isToggled="isToggled(pinnedItem)"
        :isPinnable="isPinnable(pinnedItem)"
        :isPinned="isPinned(pinnedItem)"
        :isOpened="isOpened(pinnedItem)"

        @remove="handleRemove"
        @toggle="handleToggle"
        @pin="handlePin"
        @toggleContent="handleToggleContent"
      >
        <template #title="{ item, index }">
          <slot :index="index" :item="item" name="item-title" />
        </template>
        <template v-if="slots['item-content']" #content="{ item, index }">
          <slot :index="index" :item="item" name="item-content" />
        </template>
      </PlElementListItem>
    </div>
    <div v-if="hasUnpinnedItems" ref="unpinnedContainerRef" :class="$style.list">
      <PlElementListItem
        v-for="(unpinnedItem, unpinnedIndex) in unpinnedItemsRef" :key="unpinnedKeysRef[unpinnedIndex]"
        :class="$style.item"

        :index="unpinnedIndex + (pinnedSetRef?.size ?? 0)"
        :item="unpinnedItem"
        :showDragHandle="props.enableDragging"
        :isDraggable="isDraggable(unpinnedItem)"
        :isRemovable="isRemovable(unpinnedItem)"
        :isToggable="isToggable(unpinnedItem)"
        :isToggled="isToggled(unpinnedItem)"
        :isPinnable="isPinnable(unpinnedItem)"
        :isPinned="isPinned(unpinnedItem)"
        :isOpened="isOpened(unpinnedItem)"

        @remove="handleRemove"
        @toggle="handleToggle"
        @pin="handlePin"
        @toggleContent="handleToggleContent"
      >
        <template #title="{ item, index }">
          <slot :index="index" :item="item" name="item-title" />
        </template>
        <template v-if="slots['item-content']" #content="{ item, index }">
          <slot :index="index" :item="item" name="item-content" />
        </template>
      </PlElementListItem>
    </div>
  </div>
</template>

<style module>
.root, .list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.item {
  width: 100%;
}

:global(.sortable-ghost) {
  opacity: 0;
}
:global(.sortable-drag) {
  opacity: 1;
}
</style>
