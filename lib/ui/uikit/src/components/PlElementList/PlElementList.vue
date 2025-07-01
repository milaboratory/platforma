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

const expandableSetRef = defineModel<Set<T>>('expandableItems');
const expandedSetRef = defineModel<Set<T>>('expandedItems');

const pinnableSetRef = defineModel<Set<T>>('pinnableItems');
const pinnedSetRef = defineModel<Set<T>>('pinnedItems');

const toggableSetRef = defineModel<Set<T>>('toggableItems');
const toggledSetRef = defineModel<Set<T>>('toggledItems');

const props = withDefaults(
  defineProps<{
    itemClass?: string | string[] | ((item: T, index: number) => string | string[]);
    activeItems?: Set<T>;

    enableDragging?: boolean;
    getItemKey?: (item: T) => K;
    onDragEnd?: (oldIndex: number, newIndex: number) => void | boolean;
    onSort?: (oldIndex: number, newIndex: number) => void | boolean;

    enableExpanding?: boolean;
    onExpand?: (item: T, index: number) => void | boolean;

    enableRemoving?: boolean;
    onRemove?: (item: T, index: number) => void | boolean;

    enableToggling?: boolean;
    onToggle?: (item: T, index: number) => void | boolean;

    enablePinning?: boolean;
    onPin?: (item: T, index: number) => void | boolean;
  }>(), {
    itemClass: undefined,
    activeItems: undefined,

    enableDragging: undefined,
    enableRemoving: undefined,
    enableExpanding: undefined,
    enableToggling: undefined,
    enablePinning: undefined,

    getItemKey: undefined,
    onDragEnd: undefined,
    onSort: undefined,
    onRemove: undefined,
    onExpand: undefined,
    onToggle: undefined,
    onPin: undefined,
  },
);

const emits = defineEmits<{
  (e: 'itemClick', item: T): void;
}>();

const slots = defineSlots<{
  ['item-title']: (props: { item: T; index: number }) => unknown;
  ['item-content']?: (props: { item: T; index: number }) => unknown;
}>();

const dndSortingEnabled = computed((): boolean => {
  return props.enableDragging !== false && !isNil(props.getItemKey);
});

const pinnedItemsRef = computed(() => itemsRef.value.filter(isPinned));
const hasPinnedItems = computed(() => pinnedItemsRef.value.length > 0);

const unpinnedItemsRef = computed(() => itemsRef.value.filter((item) => !isPinned(item)));
const hasUnpinnedItems = computed(() => unpinnedItemsRef.value.length > 0);

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
    fallbackOnBody: true,
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

function isActive(item: T): boolean {
  return props.activeItems?.has(item) ?? false;
}

function isDraggable(item: T): boolean {
  if (props.enableDragging === false) return false;
  return (draggableSetRef.value?.has(item) ?? true);
}

function isToggable(item: T): boolean {
  if (props.enableToggling === false) return false;
  return !isNil(toggledSetRef.value) && (toggableSetRef.value?.has(item) ?? true);
}

function isToggled(item: T): boolean {
  return toggledSetRef.value?.has(item) ?? false;
}

function isPinnable(item: T): boolean {
  if (props.enablePinning === false) return false;
  return !isNil(pinnedSetRef.value) && (pinnableSetRef.value?.has(item) ?? true);
}

function isPinned(item: T): boolean {
  return pinnedSetRef.value?.has(item) ?? false;
}

function isExpandable(item: T): boolean {
  if (props.enableExpanding === false) return false;
  return !isNil(expandedSetRef.value) && (expandableSetRef.value?.has(item) ?? true);
}

function isExpanded(item: T): boolean {
  return expandedSetRef.value?.has(item) ?? false;
}

function isRemovable(item: T): boolean {
  if (props.enableRemoving === false) return false;
  if (removableSetRef.value?.has(item) === false) return false;
  return props.enableRemoving === true || typeof props.onRemove === 'function';
}

function handleExpand(item: T, index: number) {
  if (props.onExpand?.(item, index) === false || isNil(expandedSetRef.value)) return;

  const expanded = expandedSetRef.value;
  if (expanded.has(item)) expanded.delete(item);
  else expanded.add(item);
  optionalUpdateRef(expandedSetRef);
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

// version fix problem with sync between data and rendered values
const getKey = (item: T, index: number) => {
  if (isNil(props.getItemKey)) return `${versionRef.value}-${index}`;
  return `${versionRef.value}-${props.getItemKey(item)}`;
};
const pinnedKeysRef = computed(() => pinnedItemsRef.value.map(getKey));
const unpinnedKeysRef = computed(() => unpinnedItemsRef.value.map(getKey));

const getItemClass = (item: T, index: number): null | string | string[] => {
  if (typeof props.itemClass === 'function') {
    return props.itemClass(item, index);
  }
  return props.itemClass ?? null;
};

</script>

<template>
  <div :class="$style.root">
    <div ref="pinnedContainerRef" :class="$style.list">
      <PlElementListItem
        v-for="(pinnedItem, pinnedIndex) in pinnedItemsRef" :key="pinnedKeysRef[pinnedIndex]"
        :class="[$style.item, getItemClass(pinnedItem, pinnedIndex)]"

        :index="pinnedIndex"
        :item="pinnedItem"
        :showDragHandle="dndSortingEnabled"
        :isActive="isActive(pinnedItem)"
        :isDraggable="isDraggable(pinnedItem)"
        :isRemovable="isRemovable(pinnedItem)"
        :isToggable="isToggable(pinnedItem)"
        :isToggled="isToggled(pinnedItem)"
        :isPinnable="isPinnable(pinnedItem)"
        :isPinned="isPinned(pinnedItem)"
        :isExpandable="isExpandable(pinnedItem)"
        :isExpanded="isExpanded(pinnedItem)"

        @click="emits('itemClick', pinnedItem)"
        @remove="handleRemove"
        @toggle="handleToggle"
        @pin="handlePin"
        @expand="handleExpand"
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
        :class="[$style.item, getItemClass(unpinnedItem, unpinnedIndex)]"

        :index="unpinnedIndex + (pinnedSetRef?.size ?? 0)"
        :item="unpinnedItem"
        :showDragHandle="dndSortingEnabled"
        :isActive="isActive(unpinnedItem)"
        :isDraggable="isDraggable(unpinnedItem)"
        :isRemovable="isRemovable(unpinnedItem)"
        :isToggable="isToggable(unpinnedItem)"
        :isToggled="isToggled(unpinnedItem)"
        :isPinnable="isPinnable(unpinnedItem)"
        :isPinned="isPinned(unpinnedItem)"
        :isExpandable="isExpandable(unpinnedItem)"
        :isExpanded="isExpanded(unpinnedItem)"

        @click="emits('itemClick', unpinnedItem)"
        @remove="handleRemove"
        @toggle="handleToggle"
        @pin="handlePin"
        @expand="handleExpand"
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
  visibility: hidden;
}
:global(.sortable-drag) {
  opacity: 1;
}
</style>
