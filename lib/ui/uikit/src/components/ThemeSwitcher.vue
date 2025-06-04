<script lang="ts" setup>
import { useTheme } from '../composition/useTheme';

const [theme, toggleTheme] = useTheme();
</script>

<template>
  <div :class="theme" class="ui-theme-switcher" @click="toggleTheme">
    <div />
  </div>
</template>
