<script setup lang="ts">

</script>

<template>
  <div :class="$style.root">
    <slot name="header">
      <div :class="$style.header">
        <slot name="header-content" />
      </div>
    </slot>
    <slot name="body">
      <div :class="$style.body">
        <slot name="body-content" />
      </div>
    </slot>
    <slot name="footer">
      <div :class="$style.footer">
        <slot name="footer-content" />
      </div>
    </slot>
  </div>
</template>

<style lang="scss" module>
@import '../../assets/variables.scss';

.root {
  position: relative;
  display: flex;
  flex-direction: column;
}
.close {
  cursor: pointer;
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 8px;
}
.header {
  padding: 24px;
}
.body {
  flex-grow: 1;
  padding: 24px;
  overflow-y: auto;
}
.footer {
  padding: 24px;
  border-top: 1px solid var(--border-color-div-grey);
}
</style>
