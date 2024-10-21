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
     * @deprecated (do not use it)
     */
    type?: 'A' | 'B' | 'C';
    /**
     * Enables a button to close the modal (default: `true`)
     */
    closable?: boolean;
    /**
     * If `true` content gutters are removed
     */
    noContentGutters?: boolean;
    /**
     * Actions slot has a top border (default: `true`)
     */
    actionsHasTopBorder?: boolean;
  }>(),
  {
    width: '448px',
    minHeight: 'auto',
    height: 'auto',
    type: 'A',
    closable: true,
    noContentGutters: false,
    actionsHasTopBorder: true,
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
          <div v-if="slots.actions" class="pl-dialog-modal__actions" :class="{ 'has-top-border': actionsHasTopBorder }">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
