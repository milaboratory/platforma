<script lang="ts">
/** Simple tooltip on mouseover */
export default {
  name: "PlTooltip",
};
</script>

<script lang="ts" setup>
import { onUnmounted, reactive, ref, watch } from "vue";
import * as utils from "../../helpers/utils";
import { useClickOutside } from "../../composition/useClickOutside";
import { tMap } from "./global";
import { uniqueId } from "@milaboratories/helpers";

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
    position?: "top" | "left" | "bottom" | "right" | "top-left";
    /**
     * external prop to hide tooltips
     */
    hide?: boolean;
    /**
     * The gap in pixels between the tooltip and the target element
     */
    gap?: number;

    /**
     * The minimum offset in pixels from the edge of the screen to the tooltip
     */
    offsetToTheEdge?: number;
    /**
     * base html element for tooltip
     */
    element?: "div" | "span" | "a" | "p" | "h1" | "h2" | "h3";
    /**
     * Max width (css value) of the tooltip container (default is 300px)
     */
    maxWidth?: string;
    /**
     * The container to insert the tooltip to (body by default)
     */
    container?: "body" | HTMLElement;
    /**
     * Whether the tooltip is shown on hover (default is true); otherwise, it is shown when hide is set to false
     */
    hoverable?: boolean;
  }>(),
  {
    openDelay: 100,
    closeDelay: 1000,
    gap: 8,
    offsetToTheEdge: 8,
    position: "top",
    element: "div",
    maxWidth: "300px",
    container: "body",
    hoverable: true,
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
  if (props.hide || !props.hoverable) {
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
  if (!props.hoverable) {
    return;
  }

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
    } else if (!props.hoverable) {
      showTooltip();
    }
  },
);

const rootRef = ref<HTMLElement | undefined>();
const tooltip = ref<HTMLElement | undefined>();

useClickOutside([rootRef, tooltip], () => closeTooltip());

onUnmounted(() => {
  tMap.delete(tKey);
});
const anchorName = `--anchor-${uniqueId()}`;
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
    <!-- anchor element here -->
    <slot />
    <Transition name="pl-tooltip-fade">
      <Teleport v-if="$slots['tooltip'] && data.tooltipOpen" :to="container">
        <div
          :class="[
            $style.plTooltipContainer,
            {
              [$style.top]: props.position === 'top',
              [$style.bottom]: props.position === 'bottom',
              [$style.left]: props.position === 'left',
              [$style.right]: props.position === 'right',
              [$style.topLeft]: props.position === 'top-left',
            },
          ]"
          :style="{
            '--anchorName': anchorName,
            '--gap': gap + 'px',
            '--offsetToTheEdge': offsetToTheEdge + 'px',
            '--pl-tooltip-max-width': maxWidth,
          }"
        >
          <div :class="$style.plTooltipBox" @click.stop>
            <div
              ref="tooltip"
              :class="[$style.plTooltipContent, position]"
              @mouseover="onOver"
              @mouseleave="onLeave"
            >
              <!-- should be one line -->
              <div><slot name="tooltip" /></div>
            </div>
          </div>
          <div :class="$style.plTooltipBeak" />
        </div>
      </Teleport>
    </Transition>
  </component>
</template>

<style module>
.plTooltipAnchorWrapper {
  display: inline-block;
}
/* just to set anchor-name for the anchor */
.plTooltipAnchorWrapper > :first-child {
  --anchorName: v-bind("anchorName");
  anchor-name: var(--anchorName);
}

.plTooltipAnchorWrapper:global(.info) {
  --anchorName: v-bind("anchorName");
  anchor-name: var(--anchorName);
}

.plTooltipContainer {
  --pl-tooltip-max-width: 300px;
  --gap: 8px;
  --tailWidth: 8px;
  --tailHeight: calc(var(--gap) + 2px);

  --tailClipTop: polygon(
    0 0,
    100% 0,
    100% calc(100% - var(--gap)),
    50% calc(100% - 3px),
    0 calc(100% - var(--gap))
  );
  --tailClipBottom: polygon(0 100%, 100% 100%, 100% var(--gap), 50% 3px, 0 var(--gap));
  --tailClipLeft: polygon(0 0, 0 100%, 2px 100%, calc(100% - 3px) 50%, 2px 0);
  --tailClipRight: polygon(100% 0, 100% 100%, calc(100% - 2px) 100%, 3px 50%, calc(100% - 2px) 0);

  z-index: var(--z-tooltip);
}

.plTooltipContent {
  display: inline-block;
  padding: 8px 12px 9px 12px;
  background: var(--tooltip-bg);
  border-radius: 6px;
  width: max-content;
  word-break: normal;
  max-width: var(--pl-tooltip-max-width);
  color: #fff;
}

.plTooltipBox {
  position: absolute;
  position-anchor: var(--anchorName);
  z-index: 1;
}

.plTooltipBeak {
  position: absolute;
  position-anchor: var(--anchorName);
  z-index: 0;
  background: var(--tooltip-bg);
  width: var(--tailWidth);
  height: var(--tailHeight);
}

/* top */
.plTooltipContainer.top .plTooltipBox {
  position-area: top;
  bottom: var(--gap);
  left: var(--offsetToTheEdge);
  right: var(--offsetToTheEdge);
}
.plTooltipContainer.top .plTooltipBeak {
  position-area: top;
  bottom: 0;
  left: calc(anchor(var(--anchorName) center) - var(--tailWidth) / 2);
  clip-path: var(--tailClipTop);
}

/* bottom */
.plTooltipContainer.bottom .plTooltipBox {
  position-area: bottom;
  top: var(--gap);
  left: var(--offsetToTheEdge);
  right: var(--offsetToTheEdge);
}
.plTooltipContainer.bottom .plTooltipBeak {
  position-area: bottom;
  top: 0;
  left: calc(anchor(var(--anchorName) center) - var(--tailWidth) / 2);
  clip-path: var(--tailClipBottom);
}

/* left */
.plTooltipContainer.left .plTooltipBox {
  position-area: left;
  right: var(--gap);
  top: var(--offsetToTheEdge);
  bottom: var(--offsetToTheEdge);
}

.plTooltipContainer.left .plTooltipBeak {
  position-area: left;
  right: 0;
  top: calc(anchor(var(--anchorName) center) - var(--tailWidth) / 2);
  width: var(--tailHeight);
  height: var(--tailWidth);
  clip-path: var(--tailClipLeft);
}

/* right */
.plTooltipContainer.right .plTooltipBox {
  position-area: right;
  left: var(--gap);
  top: var(--offsetToTheEdge);
  bottom: var(--offsetToTheEdge);
}

.plTooltipContainer.right .plTooltipBeak {
  position-area: right;
  left: 0;
  top: calc(anchor(var(--anchorName) center) - var(--tailWidth) / 2);
  width: var(--tailHeight);
  height: var(--tailWidth);
  clip-path: var(--tailClipRight);
}

/* top left */
.plTooltipContainer.topLeft .plTooltipBox {
  position-area: top;
  bottom: var(--gap);
  left: anchor(var(--anchorName) left);
}
.plTooltipContainer.topLeft .plTooltipBeak {
  position-area: top;
  bottom: 0;
  left: calc(anchor(var(--anchorName) center) - var(--tailWidth) / 2);
  clip-path: var(--tailClipTop);
}

:global(.pl-tooltip-fade-leave-active),
:global(.pl-tooltip-fade-enter-active) {
  z-index: var(--z-tooltip);
  transition: opacity 0.2s ease-in-out;
}
:global(.pl-tooltip-fade-enter-from),
:global(.pl-tooltip-fade-leave-to) {
  opacity: 0;
}

.plTooltipContent a {
  color: var(--tooltip-link-color);
}

.plTooltipContent p {
  margin-bottom: 8px;
}

.plTooltipContent ul,
.plTooltipContent li {
  margin-left: 6px;
  padding-left: 6px;
}

.plTooltipContent li {
  margin-bottom: 4px;
}
</style>
