// https://vitepress.dev/guide/custom-theme
import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './override.scss';
import './style.css';
import 'highlight.js/styles/a11y-dark.css';
import '@platforma-sdk/ui-vue/styles';

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    });
  },
  async enhanceApp({ app }) {
    if (!import.meta.env.SSR) {
      const components = await import('../docs-components');
      for (const k in components) {
        app.component(k, components[k]);
      }
    }
  },
} satisfies Theme;
