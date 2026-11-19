<script setup lang="ts">
const slots = defineSlots<{
  header?: () => unknown;
  "header-content"?: () => unknown;
  body?: () => unknown;
  "body-content"?: () => unknown;
  footer?: () => unknown;
  "footer-content"?: () => unknown;
}>();
</script>

<template>
  <div data-testid="pl-sidebar-item" :class="$style.root">
    <slot name="header">
      <div
        v-if="slots['header-content']"
        data-testid="pl-sidebar-item-header"
        :class="$style.header"
      >
        <slot name="header-content" />
      </div>
    </slot>
    <slot name="body">
      <div v-if="slots['body-content']" data-testid="pl-sidebar-item-body" :class="$style.body">
        <slot name="body-content" />
      </div>
    </slot>
    <slot name="footer">
      <div
        v-if="slots['footer-content']"
        data-testid="pl-sidebar-item-footer"
        :class="$style.footer"
      >
        <slot name="footer-content" />
      </div>
    </slot>
  </div>
</template>

<style lang="scss" module>
@use "../../assets/variables.scss";

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
