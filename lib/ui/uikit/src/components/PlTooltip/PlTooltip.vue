<script lang="ts">
/** Simple tooltip on mouseover */
export default {
  name: "PlTooltip",
};
</script>

<script lang="ts" setup>
import { uniqueId } from "@milaboratories/helpers";
import { onUnmounted, reactive, ref, watch } from "vue";
import { tMap } from "./global";
import * as utils from "../../helpers/utils";
import { useClickOutside } from "../../composition/useClickOutside";

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
    data-testid="pl-tooltip"
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
          data-testid="pl-tooltip-popup"
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
            '--boxAnchorName': `${anchorName}-box`,
            '--gap': gap + 'px',
            '--offsetToTheEdge': offsetToTheEdge + 'px',
            '--plTooltipMaxWidth': maxWidth,
          }"
        >
          <div :class="$style.plTooltipBox" @click.stop>
            <div
              ref="tooltip"
              data-testid="pl-tooltip-content"
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
  --plTooltipMaxWidth: 300px;
  --gap: 8px;
  --tailWidth: 8px;
  /* how far the beak sticks out of the box; its tip stops 3px short of the target */
  --tailDepth: calc(var(--gap) - 3px);

  z-index: var(--z-tooltip);
}

.plTooltipContent {
  --txt-link: var(--tooltip-link-color);
  display: inline-block;
  padding: 8px 12px 9px 12px;
  background: var(--tooltip-bg);
  border-radius: 6px;
  width: max-content;
  word-break: normal;
  max-width: var(--plTooltipMaxWidth);
  color: #fff;
}

/*
 * Flipping: the box picks its side with position-try-fallbacks when the
 * requested one lacks room. The beak needs no flip of its own — it anchors to
 * both the target and the box and sits on whichever box edge faces the target:
 *   edge = min(box far edge, max(box near edge, target edge))
 * It is a diamond centred on that edge; the half inside the box is covered by
 * it, so the visible half always points at the target.
 *
 * Both elements keep the target as their default anchor (position-anchor):
 * the browser shifts an anchored element on scroll only for its default
 * anchor, so this keeps the beak moving together with the box.
 */
.plTooltipBox {
  position: absolute;
  position-anchor: var(--anchorName);
  anchor-name: var(--boxAnchorName);
  z-index: 1;
}

.plTooltipBeak {
  position: absolute;
  position-anchor: var(--anchorName);
  z-index: 0;
  background: var(--tooltip-bg);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
}

/* top / bottom / top-left: beak on the horizontal box edge */
.plTooltipContainer.top .plTooltipBeak,
.plTooltipContainer.bottom .plTooltipBeak,
.plTooltipContainer.topLeft .plTooltipBeak {
  width: var(--tailWidth);
  height: calc(var(--tailDepth) * 2);
  left: calc(anchor(var(--anchorName) center) - var(--tailWidth) / 2);
  top: calc(
    min(
        anchor(var(--boxAnchorName) bottom),
        max(anchor(var(--boxAnchorName) top), anchor(var(--anchorName) bottom))
      ) -
      var(--tailDepth)
  );
}

/* left / right: beak on the vertical box edge */
.plTooltipContainer.left .plTooltipBeak,
.plTooltipContainer.right .plTooltipBeak {
  width: calc(var(--tailDepth) * 2);
  height: var(--tailWidth);
  top: calc(anchor(var(--anchorName) center) - var(--tailWidth) / 2);
  left: calc(
    min(
        anchor(var(--boxAnchorName) right),
        max(anchor(var(--boxAnchorName) left), anchor(var(--anchorName) right))
      ) -
      var(--tailDepth)
  );
}

.plTooltipContainer.top .plTooltipBox {
  position-area: top;
  position-try-fallbacks: flip-block;
  bottom: var(--gap);
  left: var(--offsetToTheEdge);
  right: var(--offsetToTheEdge);
}

.plTooltipContainer.bottom .plTooltipBox {
  position-area: bottom;
  position-try-fallbacks: flip-block;
  top: var(--gap);
  left: var(--offsetToTheEdge);
  right: var(--offsetToTheEdge);
}

.plTooltipContainer.left .plTooltipBox {
  position-area: left;
  position-try-fallbacks: flip-inline;
  right: var(--gap);
  top: var(--offsetToTheEdge);
  bottom: var(--offsetToTheEdge);
}

.plTooltipContainer.right .plTooltipBox {
  position-area: right;
  position-try-fallbacks: flip-inline;
  left: var(--gap);
  top: var(--offsetToTheEdge);
  bottom: var(--offsetToTheEdge);
}

.plTooltipContainer.topLeft .plTooltipBox {
  position-area: top;
  position-try-fallbacks: flip-block;
  bottom: var(--gap);
  left: anchor(var(--anchorName) left);
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
