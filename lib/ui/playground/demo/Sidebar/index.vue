<script lang="ts" setup>
import { state } from '../state';
import ToggleMenu from '@/demo/Sidebar/ToggleMenu.vue';
import { routes } from '@/demo/router';

// eslint-disable-next-line no-undef
const appVersion = APP_VERSION;
</script>

<template>
  <div class="sidebar" :class="{ open: state.menuOpen }">
    <toggle-menu />
    <div class="version">{{ appVersion }}</div>
    <router-link v-for="(r, i) in routes" :key="i" :to="r.path">{{ r.name }}</router-link>
  </div>
</template>
