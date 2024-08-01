<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import { ref, useAttrs } from 'vue';

const emit = defineEmits(['update:modelValue']);

withDefaults(
  defineProps<{
    modelValue: boolean;
    width?: string;
    height?: string;
    minHeight?: string;
    type?: 'A' | 'B' | 'C';
    closable?: boolean;
  }>(),
  {
    width: '448px',
    minHeight: 'auto',
    height: 'auto',
    type: 'A',
    closable: true,
  },
);

const modal = ref<HTMLElement>();

const $attrs = useAttrs();

function onClickShadow(ev: Event) {
  if (modal.value && !modal.value.contains(ev.target as Node)) {
    emit('update:modelValue', false);
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="dialog-modal__shadow" @click="onClickShadow" @keyup.esc="emit('update:modelValue', false)">
        <div v-bind="$attrs" ref="modal" class="dialog-modal" :class="[type]" :style="{ width, height, minHeight }">
          <div v-if="closable" class="close-dialog-btn" @click.stop="emit('update:modelValue', false)" />
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss">
@import '../assets/mixins.scss';

.dialog-modal {
  --padding: 24px 20px;
  --border-radius: 12px;

  min-height: 400px;
  max-height: calc(100vh - 48px);

  position: absolute;
  top: 45%;
  left: 50%;
  transform: translateY(-50%) translateX(-50%);
  background-color: #fff;
  padding: var(--padding);
  display: flex;
  flex-direction: column;

  box-shadow: 0 2px 8px rgba(36, 34, 61, 0.12);
  border-radius: var(--border-radius);

  &.split {
    --padding: 24px 0;
    .form-modal {
      padding: 0 24px;
    }
    .form-modal__actions {
      padding-left: 24px;
      padding-right: 24px;
    }
  }

  &.C {
    background-color: #e1e3eb;
    max-height: 80vh;
  }

  h1 {
    font-size: 24px;
    margin: 0 0 24px 0;
  }

  &__title {
    color: var(--color-txt-01, #110529);
    font-size: 28px;
    font-weight: 500;
    line-height: 32px; /* 114.286% */
    letter-spacing: -0.56px;
  }

  button {
    padding: 0 12px;
    min-width: 70px;
  }

  .alert-error {
    background-color: var(--color-error);
    color: #fff;
    font-weight: 500;
    padding: 12px;
    border-radius: 6px;
  }

  .alert-warning {
    background-color: #fee0a3;
    font-weight: 500;
    padding: 12px;
    border-radius: 6px;
  }

  &__shadow {
    position: absolute;
    z-index: 2;
    top: var(--title-bar-height);
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.64);
    // transition: opacity 2s;
  }

  .close-dialog-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    cursor: pointer;
    background-color: #d3d7e0;
    @include mask(url(../assets/images/24_close.svg), 24px);
    transition: all 0.1s ease-in-out;
    &:hover {
      background-color: var(--main-dark-color);
    }
  }
}
</style>
