<script lang="ts" setup>
import type { ContextOption } from './types';

const emit = defineEmits(['close']);

defineProps<{
  options: readonly ContextOption[];
}>();

const onClickOption = (opt: ContextOption) => {
  opt.cb();
  emit('close');
};
</script>

<template>
  <div class="context-menu">
    <div v-for="(opt, i) in options" :key="i" @click.stop="onClickOption(opt)">
      <span>{{ opt.text }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.context-menu {
  display: block;
  position: absolute;
  top: 50px;
  left: 50px;
  z-index: 1001;

  margin: 0;
  padding: 3px 0 4px;

  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0px 8px 15px rgba(0, 0, 0, 0.35);
  border-radius: 4px;

  font-family:
    Lucida Grande,
    sans-serif;
  font-size: 14px;
  line-height: 15px;

  &::before {
    display: block;
    position: absolute;
    content: '';
    top: -1px;
    left: -1px;
    bottom: -1px;
    right: -1px;

    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.125);
    z-index: -1;
  }

  hr {
    border: none;
    height: 1px;
    background: rgba(0, 0, 0, 0.1);
    margin: 6px 1px 5px;
    padding: 0;
  }

  > div {
    display: block;
    padding: 0 20px;
    border-top: 1px solid rgba(0, 0, 0, 0);
    border-bottom: 1px solid rgba(0, 0, 0, 0);

    span {
      vertical-align: 2px;
      user-select: none;
    }

    &:hover {
      background: -webkit-linear-gradient(top, #648bf5, #2866f2);
      background: linear-gradient(to bottom, #648bf5 0%, #2866f2 100%);
      border-top: 1px solid #5a82eb;
      border-bottom: 1px solid #1758e7;
    }

    &:hover::after {
      color: #fff;
    }
  }
}
</style>
