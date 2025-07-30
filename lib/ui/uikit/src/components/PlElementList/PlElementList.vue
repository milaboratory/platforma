<script generic="T extends unknown = unknown, K extends number | string = number | string" lang="ts" setup>
import { isFunction, shallowHash } from '@milaboratories/helpers';
import { useSortable } from '@vueuse/integrations/useSortable';
import { type SortableEvent } from 'sortablejs';
import type { ShallowRef } from 'vue';
import { computed, shallowRef, watch } from 'vue';
import PlElementListItem from './PlElementListItem.vue';
import { moveElements } from './utils.ts';

const itemsRef = defineModel<T[]>('items', { required: true });

const props = withDefaults(
  defineProps<{
    getItemKey?: (item: T, index: number) => K;

    itemClass?: string | string[] | ((item: T, index: number) => string | string[]);
    isActive?: (item: T, index: number) => boolean;

    disableDragging?: boolean;
    isDraggable?: (item: T, index: number) => boolean;
    onDragEnd?: (oldIndex: number, newIndex: number) => void | boolean;
    onSort?: (oldIndex: number, newIndex: number) => void | boolean;

    disableRemoving?: boolean;
    isRemovable?: (item: T, index: number) => boolean;
    onRemove?: (item: T, index: number) => void | boolean;

    disableExpanding?: boolean;
    isExpandable?: (item: T, index: number) => boolean;
    isExpanded?: (item: T, index: number) => boolean;
    onExpand?: (item: T, index: number) => unknown;

    disableToggling?: boolean;
    isToggable?: (item: T, index: number) => boolean;
    isToggled?: (item: T, index: number) => boolean;
    onToggle?: (item: T, index: number) => unknown;

    disablePinning?: boolean;
    isPinnable?: (item: T, index: number) => boolean;
    isPinned?: (item: T, index: number) => boolean;
    onPin?: (item: T, index: number) => void | boolean;
  }>(), {
    getItemKey: (item: T) => JSON.stringify(item) as K,

    itemClass: undefined,
    isActive: undefined,

    disableDragging: undefined,
    isDraggable: undefined,
    onDragEnd: undefined,
    onSort: undefined,

    disableRemoving: undefined,
    isRemovable: undefined,
    onRemove: undefined,

    disableExpanding: undefined,
    isExpandable: undefined,
    isExpanded: undefined,
    onExpand: undefined,

    disableToggling: undefined,
    isToggable: undefined,
    isToggled: undefined,
    onToggle: undefined,

    disablePinning: undefined,
    isPinnable: undefined,
    isPinned: undefined,
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
  return props.disableDragging !== true;
});

const pinnedItemsRef = computed(() => itemsRef.value.filter(isPinnedItem));
const hasPinnedItems = computed(() => pinnedItemsRef.value.length > 0);

const unpinnedItemsRef = computed(() => itemsRef.value.filter((item, index) => !isPinnedItem(item, index)));
const hasUnpinnedItems = computed(() => unpinnedItemsRef.value.length > 0);

const domProjectionItemsRef = shallowRef<undefined | T[]>();
const pinnedContainerRef = shallowRef<HTMLElement>();
const unpinnedContainerRef = shallowRef<HTMLElement>();

// version fix problem with sync between data and rendered values
const getKey = (item: T, index: number) => {
  return `${versionRef.value}-${props.getItemKey(item, index)}`;
};
const pinnedKeysRef = computed(() => pinnedItemsRef.value.map(getKey));
const unpinnedKeysRef = computed(() => unpinnedItemsRef.value.map(getKey));

// version fix problem with sync between data and rendered values when items have been changed
const versionRef = computed<number>((oldVersion) => {
  const currentKeys = itemsRef.value.map(props.getItemKey);

  if (domProjectionItemsRef.value === undefined) return oldVersion ?? shallowHash(...currentKeys);
  if (currentKeys.length !== domProjectionItemsRef.value.length) return shallowHash(...currentKeys);

  const domProjectionKeys = domProjectionItemsRef.value.map(props.getItemKey);
  const domProjectionKeysSet = new Set(domProjectionKeys);

  for (let i = 0; i < currentKeys.length; i++) {
    const hasInconsistentPosition = domProjectionKeysSet.has(currentKeys[i]) && domProjectionKeys[i] !== currentKeys[i];

    if (hasInconsistentPosition) {
      return shallowHash(...currentKeys);
    }
  }

  return oldVersion ?? shallowHash(...currentKeys);
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
  watch(
    [elRef, () => props.disableDragging, toggler],
    ([elRef, disabled, on]) => {
      if (!elRef || disabled || !on) {
        sortable.stop();
      } else {
        sortable.start();
      }
    },
    { immediate: true },
  );

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
  }
}

function isActiveItem(item: T, index: number): boolean {
  return props.isActive?.(item, index) ?? false;
}

function isDraggableItem(item: T, index: number): boolean {
  if (props.disableDragging === true) return false;
  return (props.isDraggable?.(item, index) ?? true);
}

function isRemovableItem(item: T, index: number): boolean {
  if (props.disableRemoving === true) return false;
  return (props.isRemovable?.(item, index) ?? true);
}

function isToggableItem(item: T, index: number): boolean {
  if (props.disableToggling === true) return false;
  return (props.isToggable?.(item, index) ?? (isFunction(props.isToggled) || isFunction(props.onToggle)));
}

function isToggledItem(item: T, index: number): boolean {
  return props.isToggled?.(item, index) ?? false;
}

function isPinnableItem(item: T, index: number): boolean {
  if (props.disablePinning === true) return false;
  return (props.isPinnable?.(item, index) ?? (isFunction(props.isPinned) || isFunction(props.onPin)));
}

function isPinnedItem(item: T, index: number): boolean {
  return props.isPinned?.(item, index) ?? false;
}

function isExpandableItem(item: T, index: number): boolean {
  if (props.disableExpanding === true) return false;
  return (props.isExpandable?.(item, index) ?? (isFunction(props.isExpanded) || isFunction(props.onExpand)));
}

function isExpandedItem(item: T, index: number): boolean {
  return props.isExpanded?.(item, index) ?? false;
}

function handleExpand(item: T, index: number) {
  props.onExpand?.(item, index);
}

function handleToggle(item: T, index: number) {
  props.onToggle?.(item, index);
}

function handlePin(item: T, index: number) {
  if (index === -1) {
    throw new Error('Pinnable item not found');
  }

  const alreadyPinned = pinnedItemsRef.value.includes(item);

  if (props.onPin?.(item, index) === false) return;

  moveItems(index, pinnedItemsRef.value.length + (alreadyPinned ? 0 : -1), false);
}

function handleRemove(item: T, index: number) {
  if (props.onRemove?.(item, index) === false) return;
  itemsRef.value.splice(index, 1);
}

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
        :isActive="isActiveItem(pinnedItem, pinnedIndex)"
        :isDraggable="isDraggableItem(pinnedItem, pinnedIndex)"
        :isRemovable="isRemovableItem(pinnedItem, pinnedIndex)"
        :isToggable="isToggableItem(pinnedItem, pinnedIndex)"
        :isToggled="isToggledItem(pinnedItem, pinnedIndex)"
        :isPinnable="isPinnableItem(pinnedItem, pinnedIndex)"
        :isPinned="true"
        :isExpandable="isExpandableItem(pinnedItem, pinnedIndex)"
        :isExpanded="isExpandedItem(pinnedItem, pinnedIndex)"

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

        :index="unpinnedIndex + (pinnedItemsRef?.length ?? 0)"
        :item="unpinnedItem"
        :showDragHandle="dndSortingEnabled"
        :isActive="isActiveItem(unpinnedItem, unpinnedIndex)"
        :isDraggable="isDraggableItem(unpinnedItem, unpinnedIndex)"
        :isRemovable="isRemovableItem(unpinnedItem, unpinnedIndex)"
        :isToggable="isToggableItem(unpinnedItem, unpinnedIndex)"
        :isToggled="isToggledItem(unpinnedItem, unpinnedIndex)"
        :isPinnable="isPinnableItem(unpinnedItem, unpinnedIndex)"
        :isPinned="false"
        :isExpandable="isExpandableItem(unpinnedItem, unpinnedIndex)"
        :isExpanded="isExpandedItem(unpinnedItem, unpinnedIndex)"

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
