<script setup lang="ts" generic="M = unknown">
import { computed, reactive, ref, unref, watch } from 'vue';
import './pl-btn-split.scss';
import DropdownListItem from '../DropdownListItem.vue';
import type { ListOption } from '@/types';
import { useElementPosition } from '@/composition/usePosition';
import { normalizeListOptions } from '@/helpers/utils';
import { deepEqual } from '@milaboratories/helpers';

const props = defineProps<{
  /**
   * List of available options for the dropdown menu
   */
  options: Readonly<ListOption<M>[]>;

  /**
   * If `true`, the dropdown component is disabled and cannot be interacted with.
   */
  disabled?: boolean;
}>();
const emits = defineEmits(['click']);

const model = defineModel<M>({ required: true });

const root = ref<HTMLElement | undefined>();
const list = ref<HTMLElement | undefined>();
const menuActivator = ref<HTMLElement | undefined>();
const buttonAction = ref<HTMLElement | undefined>();

const data = reactive({
  open: false,
  optionsHeight: 0,
  activeIndex: -1,
});

defineExpose({
  data,
});

const optionsStyle = reactive({
  top: '0px',
  left: '0px',
  width: '0px',
});

watch(
  list,
  (el) => {
    if (el) {
      const rect = el.getBoundingClientRect();
      data.optionsHeight = rect.height;
      window.dispatchEvent(new CustomEvent('adjust'));
    }
  },
  { immediate: true },
);

const iconState = computed(() => (data.open ? 'mask-24 mask-chevron-up' : 'mask-24 mask-chevron-down'));

const selectedIndex = computed(() => {
  return (props.options ?? []).findIndex((o) => deepEqual(o.value, model.value));
});

const items = computed(() =>
  normalizeListOptions(props.options ?? []).map((opt, index) => ({
    ...opt,
    index,
    isSelected: index === selectedIndex.value,
    isActive: index === data.activeIndex,
  })),
);

const actionName = computed(() => items.value.find((o) => deepEqual(o.value, model.value))?.label || '');

useElementPosition(root, (pos) => {
  const focusWidth = 3;

  const downTopOffset = pos.top + pos.height + focusWidth;

  if (downTopOffset + data.optionsHeight > pos.clientHeight) {
    optionsStyle.top = pos.top - data.optionsHeight - focusWidth + 'px';
  } else {
    optionsStyle.top = downTopOffset + 'px';
  }

  optionsStyle.left = pos.left + 'px';
  optionsStyle.width = pos.width + 'px';

  console.log(pos.top, optionsStyle);
});

const selectOption = (v: M | undefined) => {
  model.value = v!;
  data.open = false;
  root?.value?.focus();
};

function emitEnter() {
  emits('click');
}

const handleKeydown = (e: { code: string; preventDefault(): void; stopPropagation(): void; target: EventTarget | null }) => {
  if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.code)) {
    return;
  } else {
    e.preventDefault();
  }

  if (e.target === buttonAction.value && e.code === 'Enter') {
    emitEnter();
    return;
  }

  const { open, activeIndex } = data;

  if (!open && e.target === menuActivator.value) {
    if (e.code === 'Enter') {
      data.open = true;
    }
    return;
  }

  if (e.code === 'Escape') {
    data.open = false;
    root.value?.focus();
  }

  const filtered = unref(items);

  const { length } = filtered;

  if (!length) {
    return;
  }

  if (e.code === 'Enter') {
    selectOption(filtered.find((it) => it.index === activeIndex)?.value);
  }

  const localIndex = filtered.findIndex((it) => it.index === activeIndex) ?? -1;

  const delta = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;

  const newIndex = Math.abs(localIndex + delta + length) % length;

  data.activeIndex = items.value[newIndex].index ?? -1;
};

const onFocusOut = (event: FocusEvent) => {
  const relatedTarget = event.relatedTarget as Node | null;

  if (!root.value?.contains(relatedTarget) && !list.value?.contains(relatedTarget)) {
    data.open = false;
  }
};
</script>
<template>
  <div ref="root" :class="{ disabled }" class="pl-btn-split d-flex" @focusout="onFocusOut" @keydown="handleKeydown">
    <div
      ref="buttonAction"
      class="pl-btn-split__title flex-grow-1 d-flex align-center text-s-btn"
      tabindex="0"
      @click="emitEnter"
      @keyup.stop.enter="emitEnter"
    >
      {{ actionName }}
    </div>
    <div ref="menuActivator" class="pl-btn-split__icon-container d-flex align-center justify-center" tabindex="0" @click="data.open = !data.open">
      <div :class="iconState" class="pl-btn-split__icon" />
    </div>

    <Teleport v-if="data.open" to="body">
      <div ref="list" class="pl-dropdown__options" :style="optionsStyle" tabindex="-1">
        <DropdownListItem
          v-for="(item, index) in items"
          :key="index"
          :option="item"
          :is-selected="item.isSelected"
          :is-hovered="item.isActive"
          :size="'medium'"
          @click.stop="selectOption(item.value)"
        />
      </div>
    </Teleport>
  </div>
</template>
