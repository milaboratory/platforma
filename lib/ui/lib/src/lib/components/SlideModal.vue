<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import { computed, ref, useAttrs } from 'vue';
import TransitionSlidePanel from '@/lib/components/TransitionSlidePanel.vue';
import { useClickOutside, useEventListener } from '@/lib';

const emit = defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    width?: string;
    shadow?: boolean;
  }>(),
  {
    modelValue: false,
    width: undefined,
    shadow: false,
  },
);

const width = computed(() => props.width ?? '100%');

const modal = ref();

const $attrs = useAttrs();

useClickOutside(modal, () => {
  if (props.modelValue) {
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
      <div v-if="modelValue" ref="modal" :style="{ width }" v-bind="$attrs" class="slide-modal" @keyup.esc="emit('update:modelValue', false)">
        <div class="close-dialog-btn" @click="emit('update:modelValue', false)" />
        <div class="slide-modal__content">
          <slot />
        </div>
      </div>
    </TransitionSlidePanel>
    <div v-if="modelValue && shadow" class="dialog-modal__shadow" @keyup.esc="emit('update:modelValue', false)" />
  </Teleport>
</template>

<style lang="scss" scoped>
@import '@/assets/mixins.scss';

.slide-modal {
  position: absolute;
  top: var(--title-bar-height);
  right: 0;
  bottom: 0;
  z-index: 3;
  padding: 24px;

  &.collapse-padding {
    padding: 0;
    border-radius: 0;
    border-top: 0;
  }

  will-change: transform;

  background-color: #fff;

  border-left: 1px solid var(--color-txt-01);
  border-top: 1px solid var(--color-txt-01);

  box-shadow: var(--shadow-l);
  border-radius: 24px 0 0 0;

  .close-dialog-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    cursor: pointer;
    background-color: #d3d7e0;
    @include mask(url('@/lib/assets/images/24_close.svg'), 24px);
    &:hover {
      background-color: var(--main-dark-color);
    }
  }

  &__content {
    height: 100%;
    overflow: auto;
  }
}
</style>
