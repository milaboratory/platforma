<script setup lang="ts">
import style from './pl-ag-overlay-loading.module.scss';
import { PlSplash } from '@milaboratories/uikit';

defineProps<{
  params: {
    notReady: Readonly<boolean>;
    message?: Readonly<string>;
  };
}>();
</script>

<template>
  <div :class="style.container">
    <div v-if="params.notReady" :class="style.wrapper">
      <div :class="style.iconCatInBag" />
      <h3 :class="style.text">{{ params.message || 'No datasource' }}</h3>
    </div>
    <PlSplash v-else size="48" text="Loading" />
  </div>
</template>
