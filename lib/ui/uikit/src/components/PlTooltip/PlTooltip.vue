<script lang="ts">
/** Simple tooltip on mouseover */
export default {
  name: "PlTooltip",
};
</script>

<script lang="ts" setup>
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import * as utils from "../../helpers/utils";
import { useClickOutside } from "../../composition/useClickOutside";
import { tMap } from "./global";

const emit = defineEmits(["tooltip:close"]);

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
    position?: "top-left" | "left" | "right" | "top" | "southwest";
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
    element?: "div" | "span" | "a" | "p" | "h1" | "h2" | "h3";
    /**
     * Max width (css value) of the tooltip container (default is 300px)
     */
    maxWidth?: string;
  }>(),
  {
    openDelay: 100,
    closeDelay: 1000,
    gap: 8,
    position: "top",
    element: "div",
    maxWidth: "300px",
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
  emit("tooltip:close");
};

const onOver = async () => {
  if (props.hide) {
    return;
  }

  data.over = true;

  clearTimeout();

  await utils.delay(props.openDelay ?? 100);

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

useClickOutside([rootRef, tooltip], () => closeTooltip());

const tooltipStyle = computed(() => ({
  "--pl-tooltip-max-width": props.maxWidth,
}));

onUnmounted(() => {
  tMap.delete(tKey);
});
const anchorName = "--testtesttestanchorname";
</script>

<template>
  <component
    :class="$style.plTooltipAnchorWrapper"
    :is="element"
    v-bind="$attrs"
    ref="rootRef"
    @click="onOver"
    @mouseover="onOver"
    @mouseleave="onLeave"
  >
    <slot />
    <Teleport v-if="$slots['tooltip'] && data.open" to="body">
      <div v-if="data.tooltipOpen" :class="$style['plTooltip__container']" @click.stop>
        <div
          ref="tooltip"
          :class="[$style['plTooltip'], position]"
          :style="tooltipStyle"
          @mouseover="onOver"
          @mouseleave="onLeave"
        >
          <!-- should be one line -->
          <div><slot name="tooltip" /></div>
        </div>
      </div>
    </Teleport>
  </component>
</template>

<style module>
/* just to set anchor-name for the anchor */
.plTooltipAnchorWrapper > :first-child {
  --anchorName: v-bind("anchorName");
  anchor-name: var(--anchorName);
}

.plTooltip {
  --pl-tooltip-max-width: 300px;

  z-index: var(--z-tooltip);
  display: inline-block;
  padding: 8px 12px 9px 12px;
  background: var(--tooltip-bg);
  border-radius: 6px;
  width: max-content;
  word-break: normal;
  max-width: var(--pl-tooltip-max-width);
  color: #fff;
}

.plTooltip__container {
  --d: 8px;
  --s: 16px;
  --offset: calc(var(--s) - var(--d));
  --anchorName: v-bind("anchorName");
  position: absolute;
  position-area: top;
  bottom: var(--d);
  margin-top: var(--d);
  position-try-fallbacks: flip-block flip-inline;
  position-anchor: var(--anchorName);
  anchor-name: --tooltip;
  z-index: 1;
}

.plTooltip__container:before {
  content: "";
  position: fixed;
  z-index: -1;
  width: var(--s);
  background: var(--tooltip-bg);
  top: calc(anchor(--tooltip top) - var(--d));
  bottom: calc(anchor(--tooltip bottom) - var(--d));
  left: calc(anchor(var(--anchorName) center) - var(--s) / 2);
  margin: inherit;
  clip-path: polygon(
    50% 3px,
    100% var(--d),
    100% calc(100% - var(--d)),
    50% calc(100% - 3px),
    0 calc(100% - var(--d)),
    0 var(--d)
  );
}

.plTooltip a {
  color: var(--tooltip-link-color);
}

.plTooltip p {
  margin-bottom: 8px;
}

.plTooltip ul,
.plTooltip li {
  margin-left: 6px;
  padding-left: 6px;
}

.plTooltip li {
  margin-bottom: 4px;
}

.tooltip-transition-enter-active,
.tooltip-transition-leave-active {
  transition: all 0.1s ease-in-out;
}

.tooltip-transition-enter-from {
  opacity: 0;
}

.tooltip-transition-leave-to {
  opacity: 0;
}
</style>
