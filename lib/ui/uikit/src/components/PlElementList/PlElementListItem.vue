<script generic="T extends unknown = unknown" lang="ts" setup>
import { computed } from "vue";
import { PlIcon16 } from "../PlIcon16";
import { PlIcon24 } from "../PlIcon24";

const props = defineProps<{
  item: T;
  index: number;
  showDragHandle: boolean;
  isActive: boolean;
  isDraggable: boolean;
  isRemovable: boolean;
  isExpandable: boolean;
  isExpanded: boolean;
  isToggable: boolean;
  isToggled: boolean;
  isPinnable: boolean;
  isPinned: boolean;
  titleClass: string | string[] | null;
  contentClass: string | string[] | null;
  afterClass: string | string[] | null;
  beforeClass: string | string[] | null;
}>();
defineOptions({ inheritAttrs: false });

const slots = defineSlots<{
  title: (props: { item: T; index: number }) => unknown;
  content?: (props: { item: T; index: number }) => unknown;
  after?: (props: { item: T; index: number }) => unknown;
  before?: (props: { item: T; index: number }) => unknown;
}>();
const hasContentSlot = computed(() => slots["content"] !== undefined);
const hasAfterSlot = computed(() => slots["after"] !== undefined);
const hasBeforeSlot = computed(() => slots["before"] !== undefined);

const emit = defineEmits<{
  (e: "click", item: MouseEvent): void;
  (e: "expand", item: T, index: number): void;
  (e: "toggle", item: T, index: number): void;
  (e: "pin", item: T, index: number): void;
  (e: "remove", item: T, index: number): void;
}>();
</script>

<template>
  <div @click="(event) => emit('click', event)">
    <div v-if="hasBeforeSlot" :class="beforeClass">
      <slot name="before" :item="props.item" :index="props.index" />
    </div>
    <div
      :class="[
        $style.root,
        $attrs.class,
        {
          [$style.active]: props.isActive,
          [$style.pinned]: props.isPinned,
          [$style.opened]: props.isExpanded,
          [$style.disabled]: props.isToggled,
        },
      ]"
    >
      <div
        :class="[
          $style.head,
          titleClass,
          {
            [$style.clickable]: hasContentSlot,
          },
        ]"
        @click="isExpandable && emit('expand', props.item, props.index)"
      >
        <div
          v-if="props.showDragHandle"
          :class="[$style.action, $style.draggable, { [$style.disable]: !props.isDraggable }]"
          :data-draggable="props.isDraggable"
        >
          <PlIcon16 name="drag-dots" />
        </div>
        <PlIcon16
          v-if="isExpandable"
          :class="[$style.contentChevron, { [$style.opened]: props.isExpanded }]"
          name="chevron-down"
        />

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
            :class="[
              $style.action,
              $style.clickable,
              {
                [$style.disable]: !props.isPinnable,
                [$style.activated]: props.isPinned,
              },
            ]"
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
      <div
        v-if="hasContentSlot && props.isExpanded"
        :class="[$style.body, contentClass, { [$style.disabled]: props.isToggled }]"
      >
        <slot name="content" :item="props.item" :index="props.index" />
      </div>
    </div>
    <div v-if="hasAfterSlot" :class="afterClass">
      <slot name="after" :item="props.item" :index="props.index" />
    </div>
  </div>
</template>

<style module>
@use "../../assets/variables.scss" as *;

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
    --box-shadow: var(--box-shadow-active);
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
  overflow: hidden;

  &:hover {
    --border-color: var(--border-color-focus);
    --head-background: var(--gradient-light-lime);
  }

  &.opened {
    --head-background: var(--gradient-light-lime);
  }

  &.disabled {
    --icon-color: var(--ic-02);
    --border-color: var(--border-color-div-grey);
    color: var(--txt-03);
    filter: grayscale(1);
  }

  &.pinned {
    --background: var(--bg-base-light);
  }

  &.active {
    --border-color: var(--border-color-focus);
    --head-background: var(--btn-accent-positive-500);
  }
}

.head {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px;
  min-height: 40px;
  border-radius: var(--border-radius) var(--border-radius) 0 0;
  background: var(--head-background);
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
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 8px;
  text-overflow: ellipsis;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  border-radius: 0 0 var(--border-radius) var(--border-radius);

  &.disabled {
    pointer-events: none;
  }
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
