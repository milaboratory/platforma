<script lang="ts">
export default {
  name: "PlSlideModal",
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import "./pl-slide-modal.scss";
import { useAttrs, useSlots } from "vue";
import PlPureSlideModal from "./PlPureSlideModal.vue";
import type { Props } from "./props";
import { defaultProps } from "./props";

const slots = useSlots();
const attrs = useAttrs();
const props = withDefaults(defineProps<Props>(), defaultProps);
</script>

<template>
  <PlPureSlideModal
    data-testid="pl-slide-modal"
    v-bind="{ ...props, ...attrs }"
    :class="[$style.root, { 'has-title': slots.title, 'has-actions': slots.actions }]"
  >
    <div v-if="slots.title" data-testid="pl-slide-modal-title" class="pl-slide-modal__title">
      <span class="pl-slide-modal__title-content">
        <slot name="title" />
      </span>
    </div>
    <div data-testid="pl-slide-modal-content" class="pl-slide-modal__content">
      <slot />
    </div>
    <div v-if="slots.actions" data-testid="pl-slide-modal-actions" class="pl-slide-modal__actions">
      <slot name="actions" />
    </div>
  </PlPureSlideModal>
</template>

<style lang="css" module>
.root {
  --padding-top: 24px;
  --padding-bottom: 24px;
}
</style>
