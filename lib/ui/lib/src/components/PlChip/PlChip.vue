<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { PlTooltip } from '@/components/PlTooltip';

defineEmits(['close']);

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
  <PlTooltip position="top" class="ui-chip-tooltip" :delay="500">
    <template v-if="canShowTooltip" #tooltip>
      <slot />
    </template>
    <div ref="chip" class="ui-chip" :class="{ small }">
      <div class="ui-chip__text">
        <slot />
      </div>
      <div v-if="closeable" tabindex="0" class="ui-chip__close" @keydown.enter="$emit('close')" @click.stop="$emit('close')">
        <div class="ui-chip__close--icon" />
      </div>
    </div>
  </PlTooltip>
</template>
