<script generic="T extends unknown = unknown, K extends number | string = number | string" lang="ts" setup>
import type { ShallowRef } from 'vue';
import { computed, shallowRef, watch } from 'vue';
import { isNil, shallowHash } from '@milaboratories/helpers';
import { useSortable } from '@vueuse/integrations/useSortable';
import { type SortableEvent } from 'sortablejs';
import { moveElements, optionalUpdateRef } from './utils.ts';
import PlElementListItem from './PlElementListItem.vue';

const itemsRef = defineModel<T[]>('items', { required: true });
const draggableSetRef = defineModel<Set<K>>('draggableItems');
const removableSetRef = defineModel<Set<K>>('removableItems');

const expandableSetRef = defineModel<Set<K>>('expandableItems');
const expandedSetRef = defineModel<Set<K>>('expandedItems');

const pinnableSetRef = defineModel<Set<K>>('pinnableItems');
const pinnedSetRef = defineModel<Set<K>>('pinnedItems');

const toggableSetRef = defineModel<Set<K>>('toggableItems');
const toggledSetRef = defineModel<Set<K>>('toggledItems');

const props = withDefaults(
  defineProps<{
    getItemKey: (item: T, index: number) => K;

    itemClass?: string | string[] | ((item: T, index: number) => string | string[]);
    activeItems?: Set<K>;

    enableDragging?: boolean;
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
  return props.enableDragging !== false;
});

const pinnedItemsRef = computed(() => itemsRef.value.filter(isPinned));
const hasPinnedItems = computed(() => pinnedItemsRef.value.length > 0);

const unpinnedItemsRef = computed(() => itemsRef.value.filter((item, index) => !isPinned(item, index)));
const hasUnpinnedItems = computed(() => unpinnedItemsRef.value.length > 0);

const domProjectionItemsRef = shallowRef<undefined | T[]>();
const pinnedContainerRef = shallowRef<HTMLElement>();
const unpinnedContainerRef = shallowRef<HTMLElement>();

// version fix problem with sync between data and rendered values when items have been changed
const versionRef = computed<number>((oldVersion) => {
  const currentVersion = shallowHash(...itemsRef.value.map(props.getItemKey));

  if (domProjectionItemsRef.value === undefined) return oldVersion ?? currentVersion;

  const lastSortedVersion = shallowHash(...domProjectionItemsRef.value.map(props.getItemKey));

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

function isActive(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  return props.activeItems?.has(k) ?? false;
}

function isDraggable(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  if (props.enableDragging === false) return false;
  return (draggableSetRef.value?.has(k) ?? true);
}

function isToggable(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  if (props.enableToggling === false) return false;
  return !isNil(toggledSetRef.value) && (toggableSetRef.value?.has(k) ?? true);
}

function isToggled(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  return toggledSetRef.value?.has(k) ?? false;
}

function isPinnable(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  if (props.enablePinning === false) return false;
  return !isNil(pinnedSetRef.value) && (pinnableSetRef.value?.has(k) ?? true);
}

function isPinned(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  return pinnedSetRef.value?.has(k) ?? false;
}

function isExpandable(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  if (props.enableExpanding === false) return false;
  return !isNil(expandedSetRef.value) && (expandableSetRef.value?.has(k) ?? true);
}

function isExpanded(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  return expandedSetRef.value?.has(k) ?? false;
}

function isRemovable(item: T, index: number): boolean {
  const k = props.getItemKey(item, index);
  if (props.enableRemoving === false) return false;
  if (removableSetRef.value?.has(k) === false) return false;
  return props.enableRemoving === true || typeof props.onRemove === 'function';
}

function handleExpand(item: T, index: number) {
  if (props.onExpand?.(item, index) === false || isNil(expandedSetRef.value)) return;
  const k = props.getItemKey(item, index);
  const expanded = expandedSetRef.value;
  if (expanded.has(k)) expanded.delete(k);
  else expanded.add(k);
  optionalUpdateRef(expandedSetRef);
}

function handleToggle(item: T, index: number) {
  if (props.onToggle?.(item, index) === false || isNil(toggledSetRef.value)) return;
  const k = props.getItemKey(item, index);
  const toggled = toggledSetRef.value;
  if (toggled.has(k)) toggled.delete(k);
  else toggled.add(k);
  optionalUpdateRef(toggledSetRef);
}

function handlePin(item: T, index: number) {
  if (index === -1) {
    throw new Error('Pinnable item not found');
  }

  if (props.onPin?.(item, index) === false || isNil(pinnedSetRef.value)) return;

  const k = props.getItemKey(item, index);
  const pinned = pinnedSetRef.value;
  const alreadyPinned = pinned.has(k);
  if (alreadyPinned) pinned.delete(k);
  else pinned.add(k);
  optionalUpdateRef(pinnedSetRef);
  moveItems(index, pinned.size + (alreadyPinned ? 0 : -1), false);
}

function handleRemove(item: T, index: number) {
  if (props.onRemove?.(item, index) !== false) {
    const k = props.getItemKey(item, index);

    itemsRef.value.splice(index, 1);
    optionalUpdateRef(itemsRef);

    if (pinnedSetRef.value?.has(k)) {
      pinnedSetRef.value.delete(k);
      optionalUpdateRef(pinnedSetRef);
    }

    if (toggledSetRef.value?.has(k)) {
      toggledSetRef.value.delete(k);
      optionalUpdateRef(toggledSetRef);
    }
  }
}

// version fix problem with sync between data and rendered values
const getKey = (item: T, index: number) => {
  return `${versionRef.value}-${props.getItemKey(item, index)}`;
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
        :isActive="isActive(pinnedItem, pinnedIndex)"
        :isDraggable="isDraggable(pinnedItem, pinnedIndex)"
        :isRemovable="isRemovable(pinnedItem, pinnedIndex)"
        :isToggable="isToggable(pinnedItem, pinnedIndex)"
        :isToggled="isToggled(pinnedItem, pinnedIndex)"
        :isPinnable="isPinnable(pinnedItem, pinnedIndex)"
        :isPinned="isPinned(pinnedItem, pinnedIndex)"
        :isExpandable="isExpandable(pinnedItem, pinnedIndex)"
        :isExpanded="isExpanded(pinnedItem, pinnedIndex)"

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
        :isActive="isActive(unpinnedItem, unpinnedIndex)"
        :isDraggable="isDraggable(unpinnedItem, unpinnedIndex)"
        :isRemovable="isRemovable(unpinnedItem, unpinnedIndex)"
        :isToggable="isToggable(unpinnedItem, unpinnedIndex)"
        :isToggled="isToggled(unpinnedItem, unpinnedIndex)"
        :isPinnable="isPinnable(unpinnedItem, unpinnedIndex)"
        :isPinned="isPinned(unpinnedItem, unpinnedIndex)"
        :isExpandable="isExpandable(unpinnedItem, unpinnedIndex)"
        :isExpanded="isExpanded(unpinnedItem, unpinnedIndex)"

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
