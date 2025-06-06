<script lang="ts" setup>
import { useElementPosition } from '../../composition/usePosition';
import { scrollIntoView } from '../../helpers/dom';
import { tapIf } from '@milaboratories/helpers';
import { reactive, ref, toRef, watch } from 'vue';

const props = defineProps<{
  root: HTMLElement | undefined; // element to "track"
  gap?: number; // additional gap between overlay and "root" component
}>();

const data = reactive({
  optionsHeight: 0,
});

const optionsStyle = reactive({
  top: '0px',
  left: '0px',
  width: '0px',
});

const rootRef = toRef(props, 'root');

const listRef = ref<HTMLElement>();

const scrollIntoActive = () => {
  const $list = listRef.value;

  if (!$list) {
    return;
  }

  tapIf($list.querySelector('.hovered-item') as HTMLElement, (opt) => {
    scrollIntoView($list, opt);
  });
};

defineExpose({
  scrollIntoActive,
  listRef,
});

watch(listRef, (el) => {
  if (el) {
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      data.optionsHeight = rect.height;
      window.dispatchEvent(new CustomEvent('adjust'));
    });
  }
});

useElementPosition(rootRef, (pos) => {
  const bodyRect = document.body.getBoundingClientRect();

  const top = pos.top - bodyRect.top;

  const left = pos.left - bodyRect.left;

  const gap = props.gap ?? 0;

  const downTopOffset = top + pos.height + gap;

  if (downTopOffset + data.optionsHeight > pos.clientHeight) {
    optionsStyle.top = top - data.optionsHeight - gap + 'px';
  } else {
    optionsStyle.top = downTopOffset + 'px';
  }

  optionsStyle.left = left + 'px';
  optionsStyle.width = pos.width + 'px';
});
</script>

<template>
  <Teleport to="body">
    <div ref="listRef" v-bind="$attrs" :style="optionsStyle" tabindex="-1">
      <slot ref="list" />
    </div>
  </Teleport>
</template>
