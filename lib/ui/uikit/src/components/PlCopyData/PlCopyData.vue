<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * @TODO nicolaygiman ask me!!!
 */

const emit = defineEmits(['copy']);
const isActive = ref(false);
const icon = computed(() => (isActive.value ? 'mask-clipboard-copied' : 'mask-clipboard'));

function copyData() {
  isActive.value = true;
  setTimeout(() => (isActive.value = false), 700);
  emit('copy');
}
</script>
<template>
  <div :class="icon" class="mask-24" @click="copyData" />
</template>
