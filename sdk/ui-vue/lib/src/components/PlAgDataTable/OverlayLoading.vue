<script setup lang="ts">
defineProps<{
  notReady: boolean;
}>();
</script>
<template>
  <div style="width: 100%; height: 100%; background-color: #f7f8fa; align-content: center; opacity: 50%">
    <div v-if="notReady">
      <img src="./assets/cat-in-bag.png" />
      <div>
        <span style="font-size: 28px; color: #cfd1db">Not calculated</span>
      </div>
    </div>
    <div v-else style="margin-left: auto; margin-right: auto">
      <div
        class="mask-24 mask-loading"
        style="mask-size: 60px; width: 80px; height: 80px; background-color: #cfd1db !important; margin-left: auto; margin-right: auto"
      ></div>
      <div>
        <span style="font-size: 28px; color: #cfd1db">Loading</span>
      </div>
    </div>
    <span></span>
  </div>
</template>
