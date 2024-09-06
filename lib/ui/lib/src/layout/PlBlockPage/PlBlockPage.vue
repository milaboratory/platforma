<script lang="ts">
/** Root block page component */
export default {
  name: 'PlBlockPage',
};
</script>

<script lang="ts" setup>
import { useSlots } from 'vue';
import './pl-block-page.scss';

const slots = useSlots();
</script>

<template>
  <div class="pl-layout-component pl-block-page">
    <div v-if="slots.title" class="pl-block-page__title">
      <h1><slot name="title" /></h1>
      <div class="pl-block-page__title__append">
        <slot name="append" />
      </div>
    </div>
    <div class="pl-block-page__body">
      <slot />
    </div>
  </div>
</template>
