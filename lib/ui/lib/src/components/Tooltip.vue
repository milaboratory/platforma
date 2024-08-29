<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';
import { useTooltipPosition } from '@/composition/useTooltipPosition';
import * as utils from '@/helpers/utils';
import { useClickOutside } from '@/composition/useClickOuside';

const emit = defineEmits(['tooltip:close']);

const props = withDefaults(
  defineProps<{
    /**
     * delay in milliseconds before the tooltip disappears
     */
    delay?: number;
    position?: 'top-left' | 'left' | 'right' | 'top';
    /**
     * external prop to hide tooltips
     */
    hide?: boolean;
    /**
     * The gap in pixels between the tooltip and the target element
     */
    gap?: number;
    /**
     * base html element for tooltip
     */
    element?: 'div' | 'span' | 'a' | 'p' | 'h1' | 'h2' | 'h3';
  }>(),
  {
    delay: 1000,
    gap: 8,
    position: 'top',
    element: 'div',
  },
);

const data = reactive({
  open: false,
  over: false,
});

let clearTimeout = () => {};

async function onOver() {
  if (props.hide) {
    return;
  }

  window.dispatchEvent(new CustomEvent('adjust'));

  data.over = true;
  clearTimeout();

  await utils.delay(100);

  if (data.over) {
    data.open = true;
  }
}

function closeTooltip() {
  data.open = false;
  emit('tooltip:close');
}

function onLeave() {
  data.over = false;
  clearTimeout = utils.timeout(() => {
    if (!data.over) {
      closeTooltip();
    }
  }, props.delay);
}

watch(
  () => props.hide,
  (hide) => {
    if (hide) {
      closeTooltip();
    }
  },
);

const root = ref<HTMLElement | undefined>();
const tooltip = ref<HTMLElement | undefined>();

const style = useTooltipPosition(root, props.position, props.gap);

useClickOutside([root, tooltip], () => closeTooltip());
</script>

<template>
  <component :is="element" ref="root" @click.stop="onOver" @mouseover="onOver" @mouseleave="onLeave">
    <slot />
    <Teleport v-if="$slots['tooltip'] && data.open" to="body">
      <Transition name="tooltip">
        <div v-if="data.open" class="ui-tooltip__container" :style="style">
          <div ref="tooltip" class="ui-tooltip" :class="position" @mouseover="onOver" @mouseleave="onLeave">
            <div>
              <slot name="tooltip" />
            </div>
            <svg class="beak" width="5" height="9" viewBox="0 0 3 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4.00222 8.00933L0 4.00711L4.00222 0.00488281L4.00222 8.00933Z" fill="#24223D" />
            </svg>
          </div>
        </div>
      </Transition>
    </Teleport>
  </component>
</template>
