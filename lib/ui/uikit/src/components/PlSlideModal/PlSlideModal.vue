<script lang="ts">
export default {
  name: 'PlSlideModal',
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import './pl-slide-modal.scss';
import { ref, useAttrs, useSlots } from 'vue';
import TransitionSlidePanel from '../../components/TransitionSlidePanel.vue';
import { useClickOutside, useEventListener } from '../../index';

const slots = useSlots(); // title & actions

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const props = withDefaults(
  defineProps<{
    /**
     * Determines whether the modal is open
     */
    modelValue: boolean;
    /**
     * Css `width` value (px, %, em etc)
     */
    width?: string;
    /**
     * If `true`, then show shadow (default value `false`)
     */
    shadow?: boolean;
    /**
     * If `true`, the modal window closes when clicking outside the modal area (default: `true`)
     */
    closeOnOutsideClick?: boolean;
  }>(),
  {
    modelValue: false,
    width: '368px',
    shadow: false,
    closeOnOutsideClick: true,
  },
);

const modal = ref();

const $attrs = useAttrs();

useClickOutside(modal, () => {
  if (props.modelValue && props.closeOnOutsideClick) {
    emit('update:modelValue', false);
  }
});

useEventListener(document, 'keydown', (evt: KeyboardEvent) => {
  if (evt.key === 'Escape') {
    emit('update:modelValue', false);
  }
});
</script>

<template>
  <Teleport to="body">
    <TransitionSlidePanel>
      <div
        v-if="modelValue"
        ref="modal"
        :style="{ width }"
        v-bind="$attrs"
        class="pl-slide-modal"
        :class="{ 'has-title': slots.title, 'has-actions': slots.actions }"
        @keyup.esc="emit('update:modelValue', false)"
      >
        <div class="close-dialog-btn" @click="emit('update:modelValue', false)" />
        <div v-if="slots.title" class="pl-slide-modal__title">
          <span class="pl-slide-modal__title-content">
            <slot name="title" />
          </span>
        </div>
        <div class="pl-slide-modal__content">
          <slot />
        </div>
        <div v-if="slots.actions" class="pl-slide-modal__actions">
          <slot name="actions" />
        </div>
      </div>
    </TransitionSlidePanel>
    <div v-if="modelValue && shadow" class="pl-slide-modal__shadow" @keyup.esc="emit('update:modelValue', false)" />
  </Teleport>
</template>
