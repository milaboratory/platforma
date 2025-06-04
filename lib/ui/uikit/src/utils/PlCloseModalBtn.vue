<template>
  <div :class="$style.component">
    <div />
  </div>
</template>

<style lang="scss" module>
@use '../assets/mixins' as *;

.component {
  display: flex;
  place-content: center;
  place-items: center;
  width: 40px;
  height: 40px;
  cursor: pointer;
  border-radius: 12px; // slide-modal 6px
  &:hover {
    background-color: var(--btn-sec-hover-grey);
    transition: all 0.1s ease-in-out;
  }

  > div {
    background-color: var(--ic-01);
    @include mask(url(../assets/images/24_close.svg), 24px);
  }
}
</style>
