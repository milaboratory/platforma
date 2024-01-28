<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Heap from '@/demo/theme/Heap.vue';
import { useTheme } from '@/lib/composition/useTheme';
import ThemeSwitcher from '@/lib/components/ThemeSwitcher.vue';

const [theme] = useTheme((theme) => {
  console.log('changed', theme);
});

useTheme((theme) => {
  console.log('second', theme);
});
</script>

<template>
  <layout>
    <div class="panel" :data-theme="theme">
      <div class="split__header">
        Toggle theme (appearance)
        <ThemeSwitcher />
      </div>
      <div>
        <Heap />
      </div>
    </div>
  </layout>
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
