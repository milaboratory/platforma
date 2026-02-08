<script lang="ts">
export default {
  name: "PlPureSlideModal",
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import "./pl-slide-modal.scss";
import { ref, useAttrs } from "vue";
import TransitionSlidePanel from "../TransitionSlidePanel.vue";
import { useClickOutside, useEventListener } from "../../index";
import type { Props } from "./props";
import { defaultProps } from "./props";

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const modal = ref();
const attrs = useAttrs();
const props = withDefaults(defineProps<Props>(), defaultProps);

useClickOutside(modal, () => {
  if (props.modelValue && props.closeOnOutsideClick) {
    emit("update:modelValue", false);
  }
});

useEventListener(document, "keydown", (evt: KeyboardEvent) => {
  if (evt.key === "Escape") {
    emit("update:modelValue", false);
  }
});
</script>

<template>
  <Teleport to="body">
    <TransitionSlidePanel>
      <div
        v-if="props.modelValue"
        ref="modal"
        class="pl-slide-modal"
        :style="{ width: props.width }"
        v-bind="attrs"
        @keyup.esc="emit('update:modelValue', false)"
      >
        <div class="close-dialog-btn" @click="emit('update:modelValue', false)" />
        <slot />
      </div>
    </TransitionSlidePanel>
    <div
      v-if="props.modelValue && props.shadow"
      class="pl-slide-modal__shadow"
      @keyup.esc="emit('update:modelValue', false)"
    />
  </Teleport>
</template>
