<script generic="T extends unknown = unknown, K extends number | string = number | string" lang="ts" setup>
import { computed, ShallowRef, shallowRef, toRaw, watch } from 'vue';
import { isNil, shallowHash } from '@milaboratories/helpers';
import { useSortable } from '@vueuse/integrations/useSortable';
import { SortableEvent } from 'sortablejs';
import { moveElements } from './utils.ts';
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
      onSort?: (sorted: T[], oldIndex: number, newIndex: number) => void | boolean;

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
      enablePinning: true
    }
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
  const currentItems = toRaw(itemsRef.value);
  const lastSortedItems = toRaw(domProjectionItemsRef.value) ?? [];
  if (currentItems === lastSortedItems) return oldVersion ?? 0;

  const currentVersion = shallowHash(...currentItems);
  const lastSortedVersion = shallowHash(...lastSortedItems);
  if (currentVersion === lastSortedVersion) return oldVersion ?? 0;

  return oldVersion !== currentVersion ? currentVersion : lastSortedVersion;
});

createSortable(hasPinnedItems, pinnedContainerRef, pinnedItemsRef, () => 0);
createSortable(hasUnpinnedItems, unpinnedContainerRef, unpinnedItemsRef, () => pinnedItemsRef.value.length);

function createSortable(toggler: ShallowRef<boolean>, elRef: ShallowRef<undefined | HTMLElement>, itemsRef: ShallowRef<T[]>, getOffset: () => number) {
  const sortable = useSortable(elRef, itemsRef, {
    handle: `[data-draggable="true"]`,
    onUpdate: (evt: SortableEvent) => {
      if (evt.oldIndex == null || evt.newIndex == null) {
        throw new Error('Sortable event has no index');
      }
      if (props.onDragEnd?.(evt.oldIndex, evt.newIndex) !== false) {
        moveItems(getOffset() + evt.oldIndex, getOffset() + evt.newIndex, true);
      }
    }
  });
  watch(toggler, (on) => on ? sortable.start() : sortable.stop());

  return sortable;
}

function moveItems(oldIndex: number, newIndex: number, afterUpdateDom: boolean) {
  if (oldIndex === newIndex) return;

  const sortedItems = moveElements(itemsRef.value?.map(toRaw), oldIndex, newIndex);

  if (afterUpdateDom) {
    domProjectionItemsRef.value = sortedItems;
  }

  const preventDefault = props.onSort?.(sortedItems, oldIndex, newIndex) === false;

  if (!preventDefault) {
    itemsRef.value = sortedItems;
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
  item = toRaw(item);
  index = toRaw(index);

  if (props.onToggle?.(item, index) === false || isNil(toggledSetRef.value)) return;

  const toggled = toRaw(toggledSetRef.value);
  if (toggled.has(item)) toggled.delete(item);
  else toggled.add(item);
  toggledSetRef.value = new Set(toggled);
}

function handlePin(item: T, oldIndex: number) {
  item = toRaw(item);
  oldIndex = toRaw(oldIndex);

  if (oldIndex === -1) {
    throw new Error('Pinnable item not found');
  }

  if (props.onPin?.(item, oldIndex) === false || isNil(pinnedSetRef.value)) return;

  const pinned = toRaw(pinnedSetRef.value);
  const alreadyPinned = pinned.has(item);
  if (alreadyPinned) pinned.delete(item);
  else pinned.add(item);

  pinnedSetRef.value = new Set(pinned);
  moveItems(oldIndex, pinned.size + (alreadyPinned ? 0 : -1), false);
}

function handleRemove(item: T, index: number) {
  item = toRaw(item);

  if (props.onRemove?.(item, index) !== false) {
    itemsRef.value = itemsRef.value.filter((i) => i !== item);
  }
}

function handleToggleContent(item: T) {
  item = toRaw(item);

  const opened = toRaw(openedSetRef.value) as Set<T>;
  if (opened.has(item)) opened.delete(item);
  else opened.add(item);
  openedSetRef.value = new Set(opened);
}

// version fix problem with sync between data and rendered values
const getKey = (item: T) => `${ versionRef.value }-${ props.getItemKey(item) }`;
const pinnedKeysRef = computed(() => pinnedItemsRef.value.map(getKey));
const unpinnedKeysRef = computed(() => unpinnedItemsRef.value.map(getKey));

</script>

<template>
  <div :class="$style.root">
    <div :class="$style.list" ref="pinnedContainerRef">
      <div v-for="(item, index) in pinnedItemsRef" :key="pinnedKeysRef[index]" :class="$style.item">
        <PlElementListItem
            :index="index"
            :item="item"
            :showDragHandle="props.enableDragging"
            :isDraggable="isDraggable(item)"
            :isRemovable="isRemovable(item)"
            :isToggable="isToggable(item)"
            :isToggled="isToggled(item)"
            :isPinnable="isPinnable(item)"
            :isPinned="isPinned(item)"
            :isOpened="isOpened(item)"

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
    <div :class="$style.list" ref="unpinnedContainerRef" v-if="hasUnpinnedItems">
      <div v-for="(item, index) in unpinnedItemsRef" :key="unpinnedKeysRef[index]" :class="$style.item">
        <PlElementListItem
            :index="index + (pinnedSetRef?.size ?? 0)"
            :item="item"
            :showDragHandle="props.enableDragging"
            :isDraggable="isDraggable(item)"
            :isRemovable="isRemovable(item)"
            :isToggable="isToggable(item)"
            :isToggled="isToggled(item)"
            :isPinnable="isPinnable(item)"
            :isPinned="isPinned(item)"
            :isOpened="isOpened(item)"

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
</style>
