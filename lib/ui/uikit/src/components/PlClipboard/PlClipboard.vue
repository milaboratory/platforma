<script lang="ts">
export default {
  name: 'PlClipboard',
};
</script>

<script lang="ts" setup>
import { PlMaskIcon16 } from '../PlMaskIcon16';
import type { Size } from '../../types.ts';
import { computed, onUnmounted, ref } from 'vue';

const props = defineProps<{
  size?: Size;
}>();

const emit = defineEmits(['copy']);

const copyEffect = ref<boolean>(false);

const iconName = computed(() => copyEffect.value ? 'clipboard-copied' : 'clipboard');

let timeoutId: undefined | number;

function onCopy() {
  clearTimeout(timeoutId);
  copyEffect.value = true;
  emit('copy');
  timeoutId = window.setTimeout(() => {
    copyEffect.value = false;
  }, 1000);
}

onUnmounted(() => {
  clearTimeout(timeoutId);
});
</script>

<template>
  <PlMaskIcon16 :name="iconName" :size="props.size" :class="$style.copy" @click="onCopy" />
</template>

<style module>
.copy {
  cursor: pointer;
  display: block;
}
</style>
