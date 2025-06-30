<template>
  <div :class="$style.textLabel">
    <div :class="$style.label">
      <div :class="$style.labelText">
        <slot />
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
.textLabel {
  padding: 0px 12px;
}

.label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--txt-03);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}

.labelText {
  display: inline-block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label::after {
  display: block;
  flex: 1;
  content: '';
  height: 1px;
  background-color: var(--border-color-div-grey);
  width: 100%;
}
</style>
