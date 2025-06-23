<script generic="T extends unknown = unknown" lang="ts" setup>
import { computed } from 'vue';
import { PlIcon16, PlIcon24 } from '@milaboratories/uikit';

const props = defineProps<{
  item: T;
  index: number;
  showDragHandle: boolean;
  isDraggable: boolean;
  isRemovable: boolean;
  isToggable: boolean;
  isToggled: boolean;
  isPinnable: boolean;
  isPinned: boolean;
  isOpened: boolean;
}>();

const slots = defineSlots<{
  title: (props: { item: T; index: number }) => unknown;
  content?: (props: { item: T; index: number }) => unknown;
}>();
const hasContentSlot = computed(() => slots['content'] !== undefined);

const emit = defineEmits<{
  (e: 'toggle', item: T, index: number): void;
  (e: 'pin', item: T, index: number): void;
  (e: 'remove', item: T, index: number): void;
  (e: 'toggleContent', item: T, index: number): void;
}>();
</script>

<template>
  <div
    :class="[$style.root, {
      [$style.pinned]: props.isPinned,
      [$style.disabled]: props.isToggled,
    }]"
  >
    <div
      :class="[$style.head, {
        [$style.clickable]: hasContentSlot,
      }]"
      @click="emit('toggleContent', props.item, props.index)"
    >
      <div
        v-if="props.showDragHandle"
        :class="[$style.action, $style.draggable, { [$style.disable]: !props.isDraggable } ]"
        :data-draggable="props.isDraggable"
      >
        <PlIcon16 name="drag-dots" />
      </div>
      <PlIcon16 :class="[$style.contentChevron, { [$style.opened]: props.isOpened }]" name="chevron-down" />

      <div :class="$style.title">
        <slot name="title" :item="props.item" :index="props.index" />
      </div>

      <div :class="[$style.actions, $style.showOnHover]">
        <div
          v-if="props.isToggable"
          :class="[$style.action, $style.clickable, { [$style.disable]: !props.isToggable }]"
          @click.stop="emit('toggle', props.item, props.index)"
        >
          <PlIcon24 :name="props.isToggled === true ? 'view-hide' : 'view-show'" size="16" />
        </div>
        <div
          v-if="props.isPinnable"
          :class="[$style.action, $style.clickable, {
            [$style.disable]: !props.isPinnable,
            [$style.activated]: props.isPinned,
          }]"
          @click.stop="emit('pin', props.item, props.index)"
        >
          <PlIcon24 name="pin" size="16" />
        </div>
        <div
          v-if="props.isRemovable"
          :class="[$style.action, $style.clickable]"
          @click.stop="emit('remove', props.item, props.index)"
        >
          <PlIcon16 name="close" />
        </div>
      </div>
    </div>
    <div v-if="hasContentSlot && isOpened" :class="$style.body">
      <slot name="content" :item="props.item" :index="props.index" />
    </div>
  </div>
</template>

<style module>
.root {
  --background: rgba(255, 255, 255, 0.8);
  --border-color: var(--color-div-grey);
  --head-background: unset;
  --box-shadow: none;
  --box-shadow-active: 0 0 0 4px color-mix(in srgb, var(--border-color-focus) 50%, transparent);

  &:global(.sortable-drag),
  &:global(.sortable-chosen) {
    --head-background: var(--gradient-light-lime);
    --border-color: var(--border-color-focus);
    --box-shadow: var(--box-shadow-active)
  }
}
.root {
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background-color: var(--background);
  transition: box-shadow 0.15s;
  box-shadow: var(--box-shadow);

  &:hover {
    --border-color: var(--border-color-focus);
  }

  &.disabled {
    opacity: 0.6;
    filter: grayscale(1);
  }

  &.pinned {
    --background: var(--bg-base-light);
  }
}

.head {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: var(--border-radius) var(--border-radius) 0 0;
  background: var(--head-background);

  &:hover, &.opened {
    --head-background: var(--gradient-light-lime);
  }
}

.contentChevron {
  display: block;
  width: 16px;
  height: 16px;
  margin-right: 4px;
  transform: rotate(-90deg);
  transition: transform 0.15s;

  &.opened {
    transform: rotate(0deg);
  }
}

.title {
  display: block;
  max-width: calc(100% - 50px);
  overflow: hidden;
  text-overflow: ellipsis;
}

.body {
  padding: 24px;
  border-radius: 0 0 var(--border-radius) var(--border-radius);
}

.actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  background-color: var(--background);
  border-radius: var(--border-radius);
}

.action {
  width: 24px;
  height: 24px;
  padding: 4px; /* use padding instead of gap on parent, for better accessibility */
  opacity: 0.6;
  border-radius: var(--border-radius);
  transition: all 0.15s;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    opacity: 1;
    background-color: var(--bg-elevated-02);
  }

  &.activated {
    opacity: 0.8;
  }

  &.disable {
    cursor: not-allowed;
    opacity: 0.4;
  }
}

.clickable {
  cursor: pointer;
}

.draggable {
  cursor: grab;
}

.showOnHover {
  opacity: 0;
  transition: opacity 0.15s;
}

.root:hover .showOnHover {
  opacity: 1;
}
</style>
