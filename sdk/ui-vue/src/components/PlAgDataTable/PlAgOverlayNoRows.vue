<template>
  <div class="grid-overlay-container">
    <div class="grid-icon-sad-cat"></div>
    <span class="text-subtitle-m">Not calculated</span>
  </div>
</template>

<style lang="css">
.grid-overlay-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.grid-icon-sad-cat {
  background-image: url(./assets/no-data-cat.png);
  background-repeat: no-repeat;
}
.grid-overlay-container > div {
  height: 300px;
  width: 300px;
  background-size: contain;
  background-position: center;
}
.grid-overlay-container > span {
  color: var(--txt-mask);
}
</style>
