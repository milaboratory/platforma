<script lang="ts" setup>
import { useOpenBlock } from "../../composition/useOpenBlock";
import { logError } from "../../internal/utils";

/**
 * The name of another block of the same project. Clicking it opens that block when the app can
 * open blocks on a block's request; otherwise the name is plain text.
 */
const props = defineProps<{
  /** The block the name stands for. */
  blockId: string;
  /** The text shown for the block. */
  name: string;
  /** Called as the app is asked to open the block, leaving the page this name is shown on. */
  onOpen?: (blockId: string) => void;
}>();

const openBlock = useOpenBlock();

function open() {
  if (openBlock === undefined) return;
  const { blockId } = props;
  props.onOpen?.(blockId);
  openBlock(blockId).catch((err: unknown) => logError("cannot open block " + blockId, err));
}
</script>

<template>
  <button
    v-if="openBlock"
    type="button"
    :class="$style.link"
    :title="`Open ${name}`"
    data-testid="pl-block-name"
    @click.stop="open"
  >
    {{ name }}
  </button>
  <span v-else data-testid="pl-block-name">{{ name }}</span>
</template>

<style module>
.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--txt-link);
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}
.link:hover {
  text-decoration: underline;
}
.link:focus-visible {
  outline: 2px solid var(--border-color-focus);
  outline-offset: 2px;
}
</style>
