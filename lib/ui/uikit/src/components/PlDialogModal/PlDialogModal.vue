<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import { useEventListener } from '@/composition/useEventListener';
import './pl-dialog-modal.scss';
import { ref, useAttrs, useSlots } from 'vue';

const slots = useSlots();

const emit = defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    /**
     * Determines whether the modal is open
     */
    modelValue: boolean;
    width?: string;
    height?: string;
    minHeight?: string;
    type?: 'A' | 'B' | 'C';
    closable?: boolean;
    noContentGutters?: boolean;
  }>(),
  {
    width: '448px',
    minHeight: 'auto',
    height: 'auto',
    type: 'A',
    closable: true,
    noContentGutters: false,
  },
);

const modal = ref<HTMLElement>();

const $attrs = useAttrs();

function onClickShadow(ev: Event) {
  if (modal.value && document.contains(ev.target as Node) && !modal.value.contains(ev.target as Node)) {
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
          :class="[type, slots.title ? 'has-title' : '']"
          :style="{ width, height, minHeight }"
        >
          <div v-if="closable" class="close-dialog-btn" @click.stop="emit('update:modelValue', false)" />
          <div v-if="slots.title" class="pl-dialog-modal__title">
            <slot name="title" />
          </div>
          <div class="pl-dialog-modal__content" :class="{ 'no-content-gutters': noContentGutters }">
            <slot />
          </div>
          <div v-if="slots.actions" class="pl-dialog-modal__actions">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
