<script setup lang="ts">
import { PlSplash } from '@milaboratories/uikit';

defineProps<{
  params: {
    notReady: Readonly<boolean>;
    message?: Readonly<string>;
  };
}>();
</script>

<template>
  <div :class="$style.container">
    <div v-if="params.notReady" :class="$style.wrapper">
      <div :class="$style.iconCatInBag" />
      <h3 :class="$style.text">{{ params.message || 'No datasource' }}</h3>
    </div>
    <PlSplash v-else size="48" text="Loading" />
  </div>
</template>

<style module>
.container {
  height: calc(100% - 1px);
  margin-top: 1px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-base-light);
  color: var(--txt-mask);
}

.wrapper {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.iconCatInBag {
  background-image: url(./assets/loading-cat.png);
  background-repeat: no-repeat;
  height: 212px;
  width: 400px;
  background-size: contain;
}

.text {
  margin-top: 24px;
  white-space: pre;
}
</style>
