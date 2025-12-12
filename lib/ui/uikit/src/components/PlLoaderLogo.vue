<script setup lang="ts">
import { computed, useCssModule } from 'vue';

const props = defineProps<{
  size?: number | string;
  color?: string;
  backgroundColor?: string;
}>();

const styles = useCssModule();

const size = computed(() =>
  typeof props.size === 'number' ? CSS.px(props.size).toString() : props.size,
);

const color = props.color ?? 'currentColor';
const backgroundColor = props.backgroundColor ?? 'var(--color-div-bw)';
</script>

<template>
  <svg
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    :class="styles.root"
  >
    <path d="m32 3 26 15H6z" />
    <path d="M32 18h26v28H32z" />
    <path d="M32 45.5h26L32 61z" />
    <path d="M6 39h26v22L6 46z" />
    <path d="M6 30h26v8H6z" />
    <path d="M6 18h26v12H6z" />
    <path d="M28.816 1.834c.788-.423 1.357-.671 1.947-.796a6 6 0 0 1 2.474 0c.59.125 1.159.373 1.947.796.578.295 1.26.685 2.141 1.189l17.411 9.956a67 67 0 0 1 1.88 1.098c.853.511 1.397.896 1.83 1.375a6 6 0 0 1 1.258 2.167c.296.907.296 1.922.296 3.951v20.858c0 2.029 0 3.043-.296 3.95a6 6 0 0 1-1.258 2.168c-.433.479-.977.864-1.83 1.376-.504.31-1.116.66-1.88 1.097l-17.41 9.956c-.882.504-1.563.893-2.14 1.188-.79.424-1.358.672-1.949.796a6 6 0 0 1-2.474 0c-.59-.124-1.16-.372-1.948-.796-.578-.295-1.259-.684-2.14-1.188l-17.41-9.956a69 69 0 0 1-1.88-1.097c-.853-.512-1.397-.897-1.831-1.376a6 6 0 0 1-1.258-2.167C4 45.47 4 44.457 4 42.428V21.57c0-2.03 0-3.044.296-3.95a6 6 0 0 1 1.258-2.168c.434-.479.977-.864 1.83-1.375a68 68 0 0 1 1.88-1.098l17.411-9.956c.882-.504 1.563-.894 2.14-1.19M8 27.997V19.99h21.964v8.006zm0 8.005v-4.003h21.964v4.003zM29.964 58.33 8 45.722v-5.718h21.964zm22.051-10.32L34.037 58.33V48.01zM56 19.99v24.016H34.037V19.99zm-44.016-4L32 4.499l20.016 11.49z" />
  </svg>
</template>

<style module>
.root {
  min-block-size: v-bind(size);
  max-block-size: v-bind(size);
  min-inline-size: v-bind(size);
  max-inline-size: v-bind(size);
  fill-rule: evenodd;
  path {
    &:not(:last-of-type) {
      fill: v-bind(backgroundColor);
      animation-duration: 1s;
      animation-delay: calc(1s / 6 * (sibling-index() - 1));
      animation-iteration-count: infinite;
      animation-name: flash;
    }
    &:last-of-type {
      fill: v-bind(color);
    }
  }
}

@keyframes flash {
  from {
    fill: v-bind(color);
  }
}
</style>
