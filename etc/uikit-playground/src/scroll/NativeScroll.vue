<script lang="ts" setup>
//
</script>

<template>
  <h3 class="text-color">Native scroll</h3>
  <div class="native-scroll">
    <div class="article">
      <div class="inner">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
        veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate
        velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
        anim id est laborum.
      </div>
      <div class="inner">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
        veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate
        velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
        anim id est laborum.
      </div>
      <div class="inner">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
        veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate
        velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
        anim id est laborum.
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.native-scroll {
  position: relative;
  border: 1px solid green;
  max-height: 300px;
  max-width: 300px;
  overflow: auto;

  .inner {
    min-height: 300px;
    min-width: 400px;
  }

  .article {
    background-color: red;
    position: relative;
    user-select: none;

    .v-scroll {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
    }
  }
}
</style>
