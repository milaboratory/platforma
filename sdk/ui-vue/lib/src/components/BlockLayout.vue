<script lang="ts" setup>
import '@milaboratory/platforma-uikit/dist/style.css';
import '../assets/block.scss';
import { computed } from 'vue';

const errors = computed(() => []); // @TODO global errors

const errorMessages = computed(() =>
  errors.value.map((e) => {
    try {
      const structured = JSON.parse(e);

      if ('message' in structured) {
        return structured.message;
      }
    } catch {
      // do nothing
    }

    return String(e);
  }),
);
</script>

<template>
  <div class="block block__layout">
    <div v-if="errors.length" class="block__error">
      <pre v-for="(msg, i) in errorMessages" :key="i">{{ msg }}</pre>
    </div>
    <slot />
    <slot name="actions" />
  </div>
</template>
