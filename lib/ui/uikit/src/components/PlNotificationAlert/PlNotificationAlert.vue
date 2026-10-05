<script setup lang="ts">
import { PlBtnGhost } from "../PlBtnGhost";
import "./pl-notification-alert.scss";

const props = withDefaults(
  defineProps<{
    type?: "success" | "error" | "warning" | "neutral";
    width?: string;
    closable?: boolean;
  }>(),
  { type: "neutral", width: "256px" },
);

const model = defineModel({ type: Boolean, default: true });

function closeAlert() {
  if (props.closable) {
    model.value = false;
  }
}
</script>

<template>
  <div
    v-if="model"
    :class="type"
    :style="{ width: `${width}` }"
    data-testid="pl-notification-alert"
    class="pl-notification-alert d-flex flex-column gap-16"
  >
    <div class="pl-notification-alert__wrapper d-flex text-s">
      <div
        data-testid="pl-notification-alert-content"
        class="pl-notification-alert__content flex-grow-1"
      >
        <slot />
      </div>
      <div v-if="closable" class="pl-notification-alert__close">
        <PlBtnGhost
          data-testid="pl-notification-alert-close"
          icon="close"
          @click.stop="closeAlert"
        />
      </div>
    </div>

    <div
      v-if="!!$slots.actions"
      data-testid="pl-notification-alert-actions"
      class="pl-notification-alert__actions d-flex"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
