<script setup lang="ts">
import { PlBlockPage } from '@platforma-sdk/ui-vue';

const tag = (tagName: string) => `<${tagName}>`;
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Typography</template>
    <h1>H1 // Headline</h1>
    <h2>H2 // Headline Example</h2>
    <h3>H3 // small headers in data visualization: graphics, diagrams etc. Used with “text M”</h3>
    <h4>
      H4/H5/H6 // small headers in data visualization: graphics, diagrams etc. Used with “text S”
    </h4>
    <p>
      {{ tag('p') }} : // small text with normal line spacing Most used in input labels, text
      blocks, tables etc.
    </p>
    <strong>
      {{ tag('strong') }} or {{ tag('bold') }} // small titles in blocks, tables etc.Most used in
      buttons
    </strong>
    <a href="#"> {{ tag('a') }}: // small text with underlineMost used in links</a>
    <code>
      {{ tag('code') }} // monospaced text with normal line spacing Used in code blocks and tables
      1234567890*{]”
    </code>
    <!-- eslint-disable-next-line vue/no-undef-components -->
    <caps> {{ tag('caps') }} // block titles maximum in two lines </caps>
    <!-- eslint-disable-next-line vue/no-undef-components -->
    <des> {{ tag('des') }} // text with normal line spacing Used in large text blocks</des>
    <mark> {{ tag('mark') }} // marked text</mark>
    <blockquote>
      The {{ tag('blockquote') }} HTML element indicates that the enclosed text is an extended
      quotation. Usually, this is rendered visually by indentation.
    </blockquote>
  </PlBlockPage>
</template>
