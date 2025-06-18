<script generic="T extends unknown = unknown" lang="ts" setup>
import { computed } from 'vue';
import { PlIcon, PlIcon16 } from '@milaboratories/uikit';
import SvgViewHide from '@milaboratories/uikit/svg/icons/24_view-hide.svg?raw';
import SvgViewShow from '@milaboratories/uikit/svg/icons/24_view-show.svg?raw';
import SvgPin from '@milaboratories/uikit/svg/icons/24_pin.svg?raw';
import SvgClose from '@milaboratories/uikit/svg/icons/16_close.svg?raw';
import SvgDragDots from '@milaboratories/uikit/svg/icons/16_drag-dots.svg?raw';

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
        <PlIcon :uri="SvgDragDots" />
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
          <PlIcon :uri="props.isToggled === true ? SvgViewHide : SvgViewShow" />
        </div>
        <div
          v-if="props.isPinnable"
          :class="[$style.action, $style.clickable, {
            [$style.disable]: !props.isPinnable,
            [$style.activated]: props.isPinned,
          }]"
          @click.stop="emit('pin', props.item, props.index)"
        >
          <PlIcon :uri="SvgPin" />
        </div>
        <div
          v-if="props.isRemovable"
          :class="[$style.action, $style.clickable]"
          @click.stop="emit('remove', props.item, props.index)"
        >
          <PlIcon :uri="SvgClose" />
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

  display: flex;
  flex-direction: column;
  justify-content: center;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-div-grey);
  background-color: var(--background);
  transition: box-shadow 0.15s;

  &:hover {
    border-color: var(--border-color-focus);
  }

  &[draggable="true"] {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--border-color-focus) 50%, transparent);
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

  &:hover, &.opened {
    background: var(--gradient-light-lime);
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
