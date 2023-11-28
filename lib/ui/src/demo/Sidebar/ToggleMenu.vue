<script lang="ts" setup>
import {state} from '../state';
</script>

<template>
  <div class="sidebar__menu-btn" @click="state.toggleMenu">
    <div class="bar1"/>
    <div class="bar2"/>
    <div class="bar3"/>
  </div>
</template>
