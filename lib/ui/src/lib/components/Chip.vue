<script lang="ts" setup>
defineEmits(['close']);

defineProps<{
  closeable?: boolean;
  small?: boolean;
}>();
</script>

<template>
  <div class="ui-chip" :class="{small}">
    <div class="ui-chip__text">
      <slot/>
    </div>
    <div v-if="closeable" tabindex="0" @keydown.enter="$emit('close')" class="ui-chip__close" @click.stop="$emit('close')">
      <div class="ui-chip__close--icon"/>
    </div>
  </div>
</template>
