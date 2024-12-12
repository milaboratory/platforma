<script lang="ts">
/** Simple tooltip on mouseover */
export default {
  name: 'PlTooltip',
};
</script>

<script lang="ts" setup>
import './pl-tooltip.scss';
import { computed, onUnmounted, reactive, ref, toRef, watch } from 'vue';
import { useTooltipPosition } from './useTooltipPosition';
import * as utils from '@/helpers/utils';
import { useClickOutside } from '@/composition/useClickOutside';
import Beak from './Beak.vue';
import { tMap } from './global';

const emit = defineEmits(['tooltip:close']);

const tKey = Symbol();

const props = withDefaults(
  defineProps<{
    /**
     * delay in milliseconds before the tooltip opens
     */
    openDelay?: number;
    /**
     * delay in milliseconds before the tooltip disappears
     */
    closeDelay?: number;
    /**
     * Tooltip position
     */
    position?: 'top-left' | 'left' | 'right' | 'top' | 'southwest';
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
    /**
     * Max width (css value) of the tooltip container (default is 300px)
     */
    maxWidth?: string;
  }>(),
  {
    openDelay: 100,
    closeDelay: 1000,
    gap: 8,
    position: 'top',
    element: 'div',
    maxWidth: '300px',
  },
);

const data = reactive({
  open: false,
  over: false,
  tooltipOpen: false,
  key: Symbol(),
});

tMap.set(tKey, () => closeTooltip());

// Hook to avoid the need to immediately teleport into the body (better performance)
watch(
  () => data.open,
  (v) => {
    requestAnimationFrame(() => {
      data.tooltipOpen = v;
    });
  },
);

let clearTimeout = () => {};

const dispatchAdjust = utils.throttle(() => window.dispatchEvent(new CustomEvent('adjust')), 1000);

const showTooltip = () => {
  data.open = true;

  for (const [k, f] of tMap.entries()) {
    if (k !== tKey) {
      f();
    }
  }
};

const closeTooltip = () => {
  data.open = false;
  emit('tooltip:close');
};

const onOver = async () => {
  if (props.hide) {
    return;
  }

  dispatchAdjust();

  data.over = true;

  clearTimeout();

  await utils.delay(100);

  if (data.over) {
    showTooltip();
  }
};

const onLeave = () => {
  data.over = false;
  clearTimeout = utils.timeout(() => {
    if (!data.over) {
      closeTooltip();
    }
  }, props.closeDelay);
};

watch(
  () => props.hide,
  (hide) => {
    if (hide) {
      closeTooltip();
    }
  },
);

const rootRef = ref<HTMLElement | undefined>();
const tooltip = ref<HTMLElement | undefined>();

const style = useTooltipPosition(rootRef, toRef(props));

useClickOutside([rootRef, tooltip], () => closeTooltip());

const tooltipStyle = computed(() => ({
  '--pl-tooltip-max-width': props.maxWidth,
}));

onUnmounted(() => {
  tMap.delete(tKey);
});
</script>

<template>
  <component :is="element" v-bind="$attrs" ref="rootRef" @click="onOver" @mouseover="onOver" @mouseleave="onLeave">
    <slot />
    <Teleport v-if="$slots['tooltip'] && data.open" to="body">
      <Transition name="tooltip-transition">
        <div v-if="data.tooltipOpen" class="pl-tooltip__container" :style="style">
          <div ref="tooltip" class="pl-tooltip" :style="tooltipStyle" :class="position" @mouseover="onOver" @mouseleave="onLeave">
            <!-- should be one line -->
            <div><slot name="tooltip" /></div>
            <Beak />
          </div>
        </div>
      </Transition>
    </Teleport>
  </component>
</template>
