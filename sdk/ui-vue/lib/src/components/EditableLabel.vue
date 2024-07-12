<template>
  <span class="editable-label">
    <span>
      <slot />
    </span>
    <span class="icon" />
  </span>
</template>

<style lang="scss" scoped>
.editable-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  .icon {
    opacity: 0;
    transition: opacity;
    transition-duration: 0.3s;
    width: 24px;
    height: 24px;
    background: url('./icons/24_edit.svg') no-repeat;
  }
  &:hover {
    .icon {
      opacity: 1;
    }
  }
}
</style>
