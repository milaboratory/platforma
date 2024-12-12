<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="code-example border-default">
    <div v-if="!hideHeader" class="code-example__header d-flex justify-end">
      <div class="d-flex align-center text-subtitle-s">
        <slot name="name" />
      </div>
      <div class="flex-grow-1"/>
      <div class="code-example__icon cursor-pointer">
        <div :class="modeIcons" class="icon-24" @click="darkMode = !darkMode"/>
      </div>
      <div class="code-example__icon cursor-pointer">
        <div class="icon-24 icon-code" @click="showExampleCode = !showExampleCode"/>
      </div>
    </div>

    <div class="code-example__body">
      <div
        v-if="!hideHeader"
        :data-theme="darkMode ? 'dark' : 'light'"
        class="code-example__component pt-10"
      >
        <slot />
      </div>
      <div
        class="code-example__example theme-a11y-dark hljs"
        :class="showExampleCode ? 'border-top-default' : ''"
        :style="{
          maxHeight: showExampleCode ? '800vh' : 0,
          padding: showExampleCode ? '12px' : 0
        }"
      >
        <div class="code-example__copy-code cursor-pointer" @click="copyCode">
          <div class="mask-16" :class="copyIcon" />
        </div>
        <pre><code v-html="highlightedCode"/></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import hljs from 'highlight.js';
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('javascript', javascript);

const props = defineProps<{ code: string; hideHeader?: boolean }>();

const highlightedCode = hljs.highlight(props.code, {
  language: 'xml',
}).value;

const darkMode = ref(false);
const copy = ref(false);
const showExampleCode = ref(true);
const modeIcons = computed(() => (darkMode.value ? 'icon-light-mode' : 'icon-dark-mode'));
const copyIcon = computed(() => (copy.value ? 'mask-clipboard-copied' : 'mask-clipboard'));

function copyCode() {
  if (navigator.clipboard) {
    copy.value = true;
    setTimeout(() => (copy.value = false), 1500);
    navigator.clipboard.writeText(props.code);
  }
}
</script>
<style lang="scss">
.code-example {
  border-radius: 6px;
  overflow: hidden;
  &__header {
    background-color: var(--bg-base-light);
    border-radius: 6px;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    padding: 6px;
    border-bottom: 1px solid var(--border-color-default);
  }
  &__component {
    background-color: var(--bg-elevated-01);
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  &__component,
  &__example {
    padding: 12px;
    transition: all 0.2s;
  }
  &__example {
    overflow: hidden;
    position: relative;
    background-color: var(--bg-base-dark);
  }
  &__icon {
    padding: 5px;
  }
  &__icon:hover {
    background-color: var(--bg-elevated-02);
    border-radius: 6px;
  }

  &__copy-code:hover {
    background-color: var(--bg-elevated-02);
    border-radius: 6px;
  }
  &__copy-code {
    position: absolute;
    padding: 5px;
    right: 4px;
    top: 4px;

    .mask-16 {
      background-color: green;
    }
  }
}
</style>
