<script lang="ts" setup>
import "./pl-chip.scss";
import { onMounted, ref } from "vue";
import { PlTooltip } from "../PlTooltip";

defineEmits(["close"]);

defineProps<{
  closeable?: boolean;
  small?: boolean;
}>();

const chip = ref<HTMLElement>();
const canShowTooltip = ref(false);

onMounted(() => {
  if (chip.value) {
    canShowTooltip.value = chip.value?.clientWidth >= 256;
  }
});
</script>

<template>
  <PlTooltip data-testid="pl-chip" position="top" class="pl-chip-tooltip" :delay="500">
    <template v-if="canShowTooltip" #tooltip>
      <slot />
    </template>
    <div ref="chip" data-testid="pl-chip-body" class="pl-chip" :class="{ small }">
      <div data-testid="pl-chip-text" class="pl-chip__text">
        <slot />
      </div>
      <div
        v-if="closeable"
        tabindex="0"
        data-testid="pl-chip-close"
        class="pl-chip__close"
        @keydown.enter="$emit('close')"
        @click.stop="$emit('close')"
      >
        <div class="pl-chip__close--icon" />
      </div>
    </div>
  </PlTooltip>
</template>
