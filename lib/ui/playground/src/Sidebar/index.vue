<!-- eslint-disable vue/no-undef-components -->
<script lang="ts" setup>
import { state } from '../state';
import ToggleMenu from '@/Sidebar/ToggleMenu.vue';
import { routes } from '@/router';

// eslint-disable-next-line no-undef
const appVersion = APP_VERSION;
</script>

<template>
  <div class="sidebar" :class="{ open: state.menuOpen }">
    <ToggleMenu />
    <div class="version">{{ appVersion }}</div>
    <!-- eslint-disable -->
    <RouterLink v-for="(r, i) in routes" :key="i" :to="r.path">{{ r.name }}</RouterLink>
  </div>
</template>
