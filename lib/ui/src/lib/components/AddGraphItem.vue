<script setup lang="ts">
type Item = { image: string; title: string; id: string };
const props = defineProps<{ item: Item; group: string }>();
defineEmits<{
  (e: 'selected', id: string): void;
}>();
</script>
<template>
  <div class="add-graph-item" :data-graph-group="props.group" @click="$emit('selected', props.item.id)">
    <div class="add-graph-item__above">
      <div class="add-graph-item__image-wrapper">
        <img :src="props.item.image" :alt="props.item.title" />
      </div>
    </div>
    <div class="add-graph-item__below">
      <div class="add-graph-item__title">
        {{ props.item.title }}
      </div>
      <div class="add-graph-item__divider" />
      <div class="add-graph-item__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M14.0605 8.00006L8.53022 13.5304L7.46956 12.4697L11.1892 8.75006L1.99989 8.75006L1.99989 7.25006L11.1892 7.25006L7.46956 3.53039L8.53022 2.46973L14.0605 8.00006Z"
            fill="#110529"
          />
        </svg>
      </div>
    </div>
  </div>
</template>
