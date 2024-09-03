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
