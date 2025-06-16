<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import { useEventListener } from '../../composition/useEventListener';
import './pl-dialog-modal.scss';
import { computed, ref, useSlots } from 'vue';
import PlCloseModalBtn from '../../utils/PlCloseModalBtn.vue';
import type { Size } from '../../types';

const slots = useSlots();

const emit = defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    /**
     * Determines whether the modal is open
     */
    modelValue: boolean;
    /**
     * css width (default value is `448px`)
     */
    width?: string;
    /**
     * css height (default value is `auto`)
     */
    height?: string;
    /**
     * css min-height (default value is `auto`)
     */
    minHeight?: string;
    /**
     * css min-height (default value is `auto` but recommended is 440px)
     */
    maxHeight?: string;
    /**
     * Enables a button to close the modal (default: `true`)
     */
    closable?: boolean;
    /**
     * If `true` content gutters are removed
     */
    noContentGutters?: boolean;
    /**
     * If `true` top content gutter is removed
     */
    noTopContentGutter?: boolean;
    /**
     * Actions slot has a top border (default: `true`)
     */
    actionsHasTopBorder?: boolean;
    /**
     * If `true`, the modal window closes when clicking outside the modal area (default: `true`)
     */
    closeOnOutsideClick?: boolean;
    /**
     * Predefined size (standard small | medium | large). Takes precedence over (min|max)(width|height) properties. Not defined by default.
     */
    size?: Size | undefined;
  }>(),
  {
    width: '448px',
    minHeight: 'auto',
    maxHeight: 'auto',
    height: 'auto',
    closable: true,
    noContentGutters: false,
    actionsHasTopBorder: true,
    size: undefined,
  },
);

const modal = ref<HTMLElement>();

const style = computed(() => {
  const { width, height, minHeight, maxHeight, size } = props;

  if (size === 'small') {
    return {
      width: '448px',
      height: '440px',
      minHeight: 'auto',
      maxHeight: 'auto',
    };
  }

  if (size === 'medium') {
    return {
      width: '720px',
      height: '720px',
      minHeight: 'auto',
      maxHeight: 'auto',
    };
  }

  if (size === 'large') {
    return {
      width: '1080px',
      height: '880px',
      minHeight: 'auto',
      maxHeight: 'auto',
    };
  }

  return { width, height, minHeight, maxHeight };
});

function onClickShadow(ev: Event) {
  if (modal.value && props.closeOnOutsideClick && document.contains(ev.target as Node) && !modal.value.contains(ev.target as Node)) {
    emit('update:modelValue', false);
  }
}

useEventListener(document.body, 'keyup', (ev) => {
  if (props.modelValue && ev.code === 'Escape') {
    emit('update:modelValue', false);
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="pl-dialog-modal__shadow" @click="onClickShadow">
        <div
          v-bind="$attrs"
          ref="modal"
          class="pl-dialog-modal"
          :class="{ 'has-title': slots.title, 'has-content': slots.default }"
          :style="style"
        >
          <PlCloseModalBtn v-if="closable" class="close-modal-btn" @click.stop="emit('update:modelValue', false)" />
          <div v-if="slots.title" class="pl-dialog-modal__title">
            <slot name="title" />
          </div>
          <div class="pl-dialog-modal__content" :class="{ 'no-content-gutters': noContentGutters, 'no-top-content-gutter': noTopContentGutter }">
            <slot />
          </div>
          <div v-if="slots.actions" class="pl-dialog-modal__actions" :class="{ 'has-top-border': actionsHasTopBorder }">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
