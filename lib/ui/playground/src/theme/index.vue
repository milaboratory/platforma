<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Heap from '@/theme/Heap.vue';
import { useTheme, ThemeSwitcher } from '@milaboratory/platforma-uikit.lib';

const [theme] = useTheme((theme) => {
  console.log('changed', theme);
});

useTheme((theme) => {
  console.log('second', theme);
});
</script>

<template>
  <Layout>
    <div class="panel" :data-theme="theme">
      <div class="split__header">
        Toggle theme (appearance)
        <ThemeSwitcher />
      </div>
      <div>
        <Heap />
      </div>
    </div>
  </Layout>
</template>

<style lang="scss">
.panel {
  background-color: #fff;
  min-height: 200px;
  display: flex;
  flex-direction: column;

  --bg-color: #fff;

  &[data-theme='dark'] {
    --bg-color: #1b1b1f;
  }

  > div:first-child {
    background-color: #333;
    color: #fff;
    padding: 24px;
    display: flex;
    .btn-theme {
      margin-left: auto;
    }
  }
  > div:nth-child(2) {
    padding: 36px 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    background-color: var(--bg-color);
  }
}
</style>
