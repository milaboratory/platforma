<script lang="ts" setup>
import { useTheme } from '@/lib/composition/useTheme';
const [theme, toggleTheme] = useTheme();
</script>

<template>
  <div class="ui-theme-switcher" :class="theme" @click="toggleTheme">
    <div />
  </div>
</template>
