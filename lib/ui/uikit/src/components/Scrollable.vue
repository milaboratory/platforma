<script lang="ts" setup>
import VScroll from '../components/VScroll.vue';
import HScroll from '../components/HScroll.vue';
import { onMounted, onUnmounted, reactive, ref, unref } from 'vue';
import { tapIf, copyProps } from '../helpers/functions';
import { useResizeObserver } from '../composition/useResizeObserver';

const containerRef = ref<HTMLElement>();

const data = reactive({
  scrollTop: 0,
  scrollLeft: 0,
  clientHeight: 0,
  clientWidth: 0,
  scrollHeight: 0,
  scrollWidth: 0,
});

function updateState(container: HTMLElement) {
  copyProps(data, container, 'scrollTop', 'scrollLeft', 'clientHeight', 'clientWidth', 'scrollHeight', 'scrollWidth');
}

const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  const root = e.currentTarget as HTMLElement;
  root.scrollTop += e.deltaY;
  root.scrollLeft += e.deltaX;
  updateState(root);
};

function updateTop(v: number) {
  tapIf(unref(containerRef), (el) => {
    el.scrollTop = v;
    updateState(el);
  });
}

function updateLeft(v: number) {
  tapIf(unref(containerRef), (el) => {
    el.scrollLeft = v;
    updateState(el);
  });
}

useResizeObserver(containerRef, (el) => {
  tapIf(el, (el) => updateState(el));
});

onMounted(() => {
  tapIf(unref(containerRef), (root) => {
    updateState(root);
    root.addEventListener('wheel', onWheel);
  });
});

onUnmounted(() => {
  tapIf(unref(containerRef), (root) => root.removeEventListener('wheel', onWheel));
});
</script>

<template>
  <div class="ui-scrollable">
    <div ref="containerRef" class="ui-scrollable__container" @wheel="onWheel">
      <slot />
    </div>
    <VScroll
      :scroll-top="data.scrollTop"
      :client-height="data.clientHeight"
      :scroll-height="data.scrollHeight"
      @wheel.stop
      @update:scroll-top="updateTop"
    />
    <HScroll
      :scroll-left="data.scrollLeft"
      :client-width="data.clientWidth"
      :scroll-width="data.scrollWidth"
      @wheel.stop
      @update:scroll-left="updateLeft"
    />
  </div>
</template>
