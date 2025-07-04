<script setup lang="ts">
const slots = defineSlots<{
  [K in `item-${number}`]: () => unknown;
}>();
</script>

<template>
  <div :class="$style.root">
    <template v-for="name in Object.keys(slots) as `item-${number}`[]" :key="name" >
      <div :class="$style.item">
        <slot :name="name" />
      </div>
    </template>
  </div>
</template>

<style lang="scss" module>
@use '../../assets/variables.scss';

.root {
  position: relative;
  display: flex;
  flex-direction: row;
}

.item {
  width: 1000%;
  height: 100%;
  border-right: 1px solid var(--border-color-div-grey);

  &:last-child {
    border-right: none;
  }
}
</style>
