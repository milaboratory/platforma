<script lang="ts">
export default {
  name: 'PlSlideModal',
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import { computed, ref, useAttrs, useSlots } from 'vue';
import TransitionSlidePanel from '@/components/TransitionSlidePanel.vue';
import { useClickOutside, useEventListener } from '@/index';

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
     * If `true`, the modal window closes when clicking outside the modal area.
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

const width = computed(() => props.width ?? '100%');

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
        :class="{ 'has-title': slots.title }"
        @keyup.esc="emit('update:modelValue', false)"
      >
        <div class="close-dialog-btn" @click="emit('update:modelValue', false)" />
        <div v-if="slots.title" class="pl-slide-modal__title">
          <slot name="title" />
        </div>
        <div class="pl-slide-modal__content">
          <slot />
        </div>
        <div v-if="slots.actions" class="pl-slide-modal__actions">
          <slot name="actions" />
        </div>
      </div>
    </TransitionSlidePanel>
    <div v-if="modelValue && shadow" class="pl-dialog-modal__shadow" @keyup.esc="emit('update:modelValue', false)" />
  </Teleport>
</template>

<style lang="scss">
@import '@/assets/mixins.scss';

.pl-slide-modal {
  --padding-top: 24px;
  position: absolute;
  top: var(--title-bar-height);
  right: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  padding-top: var(--padding-top);

  will-change: transform;

  background-color: #fff;

  border-left: 1px solid var(--div-grey);
  /* Shadow L */
  box-shadow:
    0px 8px 16px -4px rgba(15, 36, 77, 0.16),
    0px 12px 32px -4px rgba(15, 36, 77, 0.16);

  .close-dialog-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    cursor: pointer;
    background-color: #d3d7e0;
    @include mask(url('@/assets/images/24_close.svg'), 24px);
    &:hover {
      background-color: var(--main-dark-color);
    }
  }

  &.has-title {
    --padding-top: 0;
  }

  &__title {
    display: flex;
    align-items: center;
    font-family: var(--font-family-base);
    font-size: 28px;
    font-style: normal;
    font-weight: 500;
    line-height: 32px; /* 114.286% */
    letter-spacing: -0.56px;
    padding: 24px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    min-height: 88px;
    padding: 0 24px;
    button {
      min-width: 160px;
    }
  }

  // Closes modal too

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px 0;
    margin: 0 24px;
  }
}
</style>
